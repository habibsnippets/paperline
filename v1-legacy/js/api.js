// OpenAlex API wrapper (https://api.openalex.org).
// No auth required; CORS is permissive. We add the optional `mailto`
// query param to land in the "polite pool" (faster, friendlier limits).
// Exposes a global `API` namespace consumed by tree.js and app.js.

(function () {
  const BASE = "https://api.openalex.org";
  // Per OpenAlex docs: passing mailto puts you in the polite pool with
  // higher rate limits. The value is sent only in URL query params to
  // api.openalex.org. We don't actually collect or send a real email.
  const POLITE_MAILTO = "paperline@users.noreply.github.com";

  // Fields to request from each /works endpoint. Keep tight to minimise
  // response size — OpenAlex returns *a lot* by default.
  const WORK_SELECT = [
    "id",
    "doi",
    "title",
    "display_name",
    "publication_year",
    "cited_by_count",
    "relevance_score",
    "abstract_inverted_index",
    "authorships",
    "primary_location",
    "open_access",
    "ids",
    "type",
  ].join(",");

  // ── State ────────────────────────────────────────────────────────────
  const state = {
    cache: new Map(),
    inflight: new Map(),
    minDelayMs: 110,    // openalex is very generous; small gap is plenty
    lastRequestAt: 0,
    cancelled: false,
  };

  function cancel()       { state.cancelled = true; }
  function reset()        { state.cancelled = false; }
  function isCancelled()  { return state.cancelled; }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function throttle() {
    const now = Date.now();
    const gap = now - state.lastRequestAt;
    if (gap < state.minDelayMs) await sleep(state.minDelayMs - gap);
    state.lastRequestAt = Date.now();
  }

  // ── Core fetch with retry / dedupe / cache ───────────────────────────
  async function request(url, { retries = 3 } = {}) {
    if (state.cancelled) throw new Error("cancelled");
    if (state.cache.has(url)) return state.cache.get(url);
    if (state.inflight.has(url)) return state.inflight.get(url);

    const promise = (async () => {
      let attempt = 0;
      let backoff = 600;
      while (true) {
        if (state.cancelled) throw new Error("cancelled");
        await throttle();
        try {
          const res = await fetch(url, { headers: { Accept: "application/json" } });
          if (res.status === 429 || res.status === 503) {
            if (attempt >= retries) {
              const e = new Error(`openalex temporary throttling (HTTP ${res.status})`);
              e.code = "RATE_LIMIT";
              throw e;
            }
            const retryAfter = parseFloat(res.headers.get("retry-after") || "0");
            await sleep(retryAfter > 0 ? retryAfter * 1000 : backoff);
            backoff = Math.min(backoff * 2, 8000);
            attempt += 1;
            continue;
          }
          if (res.status === 404) {
            const e = new Error("not found on openalex");
            e.code = "NOT_FOUND";
            throw e;
          }
          if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new Error(`HTTP ${res.status}: ${body.slice(0, 140)}`);
          }
          const json = await res.json();
          state.cache.set(url, json);
          return json;
        } catch (err) {
          if (err.message === "cancelled") throw err;
          if (err.code === "NOT_FOUND") throw err;
          const isNet =
            err instanceof TypeError ||
            /failed to fetch|networkerror|load failed/i.test(err.message || "");
          if (isNet) console.warn("[paperline] fetch failed", url, err);
          if (attempt >= retries) {
            if (isNet) {
              const e = new Error(
                "could not reach api.openalex.org — check your internet " +
                "connection (or any extension / firewall blocking the request)."
              );
              e.code = "NETWORK";
              throw e;
            }
            throw err;
          }
          await sleep(backoff);
          backoff = Math.min(backoff * 2, 8000);
          attempt += 1;
        }
      }
    })().finally(() => state.inflight.delete(url));

    state.inflight.set(url, promise);
    return promise;
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  /** Strip the OpenAlex URL prefix so we just keep the W… id. */
  function shortId(idOrUrl) {
    if (!idOrUrl) return "";
    return String(idOrUrl).replace(/^https?:\/\/openalex\.org\//, "");
  }

  /** Rebuild a normal abstract string from OpenAlex's inverted index. */
  function reconstructAbstract(inv) {
    if (!inv || typeof inv !== "object") return "";
    const arr = [];
    let maxPos = -1;
    for (const word of Object.keys(inv)) {
      const positions = inv[word];
      if (!Array.isArray(positions)) continue;
      for (const p of positions) {
        arr[p] = word;
        if (p > maxPos) maxPos = p;
      }
    }
    return arr.slice(0, maxPos + 1).filter(Boolean).join(" ");
  }

  function buildUrl(path, params) {
    const u = new URL(BASE + path);
    for (const [k, v] of Object.entries(params || {})) {
      if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, v);
    }
    u.searchParams.set("mailto", POLITE_MAILTO);
    return u.toString();
  }

  // ── Endpoints ────────────────────────────────────────────────────────

  /** Lightweight reachability check; used to verify the API up front. */
  async function ping() {
    try {
      const r = await fetch(buildUrl("/works", { search: "test", "per-page": 1, select: "id" }));
      return r.ok ? { ok: true } : { ok: false, code: `HTTP_${r.status}`, reason: `HTTP ${r.status}` };
    } catch (err) {
      return {
        ok: false,
        code: "NETWORK",
        reason: (err && err.message) || "fetch failed",
      };
    }
  }

  /** Topic search → list of normalised papers. */
  async function searchPapers(query, limit = 50) {
    const url = buildUrl("/works", {
      search: query,
      "per-page": String(Math.min(Math.max(limit, 1), 50)),
      select: WORK_SELECT,
    });
    const json = await request(url);
    return (json.results || []).map(normalizePaper).filter(Boolean);
  }

  /** Fetch a single paper by OpenAlex id (or DOI URL). */
  async function getPaper(id) {
    const sid = shortId(id);
    const url = buildUrl(`/works/${encodeURIComponent(sid)}`, {
      select: WORK_SELECT,
    });
    const json = await request(url);
    return normalizePaper(json);
  }

  /**
   * Fetch papers that cite the given paper (descendants).
   * Sorted by cited_by_count desc so the most influential children land first.
   */
  async function getCitations(paperId, limit = 100) {
    const sid = shortId(paperId);
    const url = buildUrl("/works", {
      filter: `cites:${sid}`,
      "per-page": String(Math.min(Math.max(limit * 2, 25), 200)),
      sort: "cited_by_count:desc",
      select: WORK_SELECT,
    });
    const json = await request(url);
    return (json.results || []).map(normalizePaper).filter(Boolean);
  }

  // ── Root-paper heuristic ─────────────────────────────────────────────
  /**
   * Among the candidates returned by a topic search, pick the one most
   * likely to be the seminal / foundational paper.
   *
   * OpenAlex's default `search` is relevance-sorted, which means the top
   * results are the papers that *most literally match* the query term —
   * often recent application/survey papers. The actual seminal paper (e.g.
   * "Attention Is All You Need" for the query "large language models")
   * frequently isn't there at all because the term post-dates the work.
   *
   * We can't fix that with smarter picking, but we *can* avoid picking an
   * application paper over a method paper. We:
   *   1. Filter out obvious non-foundational patterns in the title
   *      (reviews, surveys, case studies, "ChatGPT for X", etc.)
   *   2. Reject OpenAlex `type` ∈ {review, editorial, letter, book-chapter}
   *   3. Among what's left, score by citation count with a mild
   *      `log10(cites) * (yearsSince + 1)` — favours both impact and
   *      longevity without letting one recent megacite dominate.
   */
  const NON_FOUNDATIONAL_TITLE = [
    /\breview\b/i,
    /\bsurvey\b/i,
    /\bcase stud/i,
    /\bsystematic review\b/i,
    /\bmeta[\s-]?analysis\b/i,
    /\bperformance of\b/i,
    /\bbenchmark(ing)?\b/i,
    /\bevaluat(e|ion|ing)\b/i,
    /\bassess(ment|ing)\b/i,
    /\bcompar(ative|ison)\b/i,
    /\bopportunities and challenges\b/i,
    /\bchallenges and (opportunities|future)\b/i,
    /\bperspectives?\b/i,
    /\bcommentary\b/i,
    /\beditorial\b/i,
    /\breflection\b/i,
    /\bposition paper\b/i,
    /\bapplying\b/i,
    /\bapplications?\s+of\b/i,
    /\bon the use\b/i,
    /\bimpact\s+of\b/i,
    /\badoption\b/i,
    /\bfor good\b/i,
    /\bin (education|medicine|healthcare|finance|business|classroom|teaching|schools?)\b/i,
  ];

  const NON_FOUNDATIONAL_TYPES = new Set([
    "review",
    "editorial",
    "letter",
    "book-chapter",
    "book",
  ]);

  function isLikelyFoundational(paper) {
    if (!paper) return false;
    if (paper.type && NON_FOUNDATIONAL_TYPES.has(paper.type)) return false;
    const title = paper.title || "";
    if (NON_FOUNDATIONAL_TITLE.some((re) => re.test(title))) return false;
    return true;
  }

  function pickRootPaper(papers, { topK = 8 } = {}) {
    if (!papers || papers.length === 0) return null;

    const current = new Date().getFullYear();

    const withYear = papers.filter(
      (p) => p && p.year && p.citationCount && p.citationCount > 50
    );

    // ── Era filter ────────────────────────────────────────────────────
    // Search terms like "diffusion models" or "RLHF" also match decades-
    // old papers that use the same English words in a totally different
    // sense (e.g. "diffusion model" in statistical mechanics). Their
    // giant absolute citation counts drown out the actually-on-topic
    // modern papers. Compute a "topic era" from the upper quartile year
    // of the candidate set, then drop anything more than 30 years older.
    const sortedByYear = withYear.slice().sort((a, b) => a.year - b.year);
    const q75 = sortedByYear[Math.floor(sortedByYear.length * 0.75)] || null;
    const eraYear = q75 ? q75.year : current;
    const eraCutoff = eraYear - 30;
    const inEra = withYear.filter((p) => p.year >= eraCutoff);

    // If the era filter is too aggressive, back off to the full set so
    // historical topics ("Plato's Republic") still get a real answer.
    const eraFiltered = inEra.length >= 2 ? inEra : withYear;

    const foundational = eraFiltered.filter(isLikelyFoundational);
    // If the strict filter leaves us with nothing, fall back to the wider
    // pool so the user still gets *some* answer.
    const pool = foundational.length >= 2 ? foundational : eraFiltered;
    if (pool.length === 0) {
      return papers.slice().sort(
        (a, b) => (b.citationCount || 0) - (a.citationCount || 0)
      )[0] || papers[0];
    }

    // Score: OpenAlex's relevance_score (only present for search results)
    // × log10(citations+1). This makes a paper need to be BOTH on-topic
    // (high relevance) AND impactful (high citations) to win — which is
    // the right shape for a "seminal paper" pick. Falls back to citation
    // count when relevance_score is absent.
    const scored = pool
      .slice()
      .sort((a, b) => (b.citationCount || 0) - (a.citationCount || 0))
      .slice(0, topK)
      .map((p) => {
        const rel = p.relevanceScore || 1;
        const logCites = Math.log10(p.citationCount + 1);
        const score = rel * logCites;
        return { paper: p, score };
      })
      .sort((a, b) => b.score - a.score);

    return scored[0].paper;
  }

  // ── Normalisation ────────────────────────────────────────────────────
  /**
   * Convert an OpenAlex work to our internal paper shape:
   *   { id, title, authors[], year, venue, abstract, citationCount,
   *     url, doi, arxivId }
   */
  function normalizePaper(work) {
    if (!work) return null;
    const id = shortId(work.id);
    if (!id) return null;

    const authors = (work.authorships || [])
      .map((a) => a && a.author && a.author.display_name)
      .filter(Boolean);

    const venue =
      (work.primary_location && work.primary_location.source &&
        work.primary_location.source.display_name) || null;

    const abstract = reconstructAbstract(work.abstract_inverted_index);

    // Prefer DOI link → primary_location landing page → openalex page
    const doi = work.doi
      ? String(work.doi).replace(/^https?:\/\/doi\.org\//, "")
      : null;

    let arxivId = null;
    const externalIds = work.ids || {};
    // OpenAlex sometimes exposes mag, doi, pmid, pmcid; arXiv is in
    // primary_location.landing_page_url for arXiv papers.
    const landing =
      (work.primary_location && work.primary_location.landing_page_url) || "";
    const pdfUrl =
      (work.primary_location && work.primary_location.pdf_url) || "";
    const arxivMatch =
      /arxiv\.org\/(?:abs|pdf)\/([\w.\-/]+?)(?:v\d+)?(?:\.pdf)?$/i.exec(
        landing || pdfUrl || ""
      );
    if (arxivMatch) arxivId = arxivMatch[1];

    let url =
      (doi && `https://doi.org/${doi}`) ||
      landing ||
      pdfUrl ||
      (arxivId && `https://arxiv.org/abs/${arxivId}`) ||
      `https://openalex.org/${id}`;

    return {
      id,
      title: work.title || work.display_name || "(untitled)",
      authors,
      year: work.publication_year || null,
      venue,
      abstract,
      citationCount: work.cited_by_count || 0,
      url,
      doi,
      arxivId,
      openalexId: id,
      // misc:
      type: work.type || null,
      pdfUrl: pdfUrl || null,
      // OpenAlex's relevance score for the most recent search query.
      // Only populated when this paper came from a search response.
      relevanceScore: typeof work.relevance_score === "number"
        ? work.relevance_score
        : null,
    };
  }

  // ── Export ───────────────────────────────────────────────────────────
  window.API = {
    cancel,
    reset,
    isCancelled,
    ping,
    searchPapers,
    getPaper,
    getCitations,
    pickRootPaper,
    normalizePaper,
    // legacy alias so older callers keep working:
    _provider: "openalex",
  };
})();
