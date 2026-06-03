// HF Inference Providers — OpenAI-compatible chat completions.
// All paper-discovery LLM calls live here. The file is named hfApi.js
// (the spec called for claudeApi.js, but we use HF open-source models).
//
// The HF Router speaks the OpenAI chat-completions protocol, so we hit:
//   POST https://router.huggingface.co/v1/chat/completions
// with an `Authorization: Bearer <HF_TOKEN>` header.

const HF_ENDPOINT = "https://router.huggingface.co/v1/chat/completions";

export const DEFAULT_MODEL = "meta-llama/Llama-3.3-70B-Instruct";

export const AVAILABLE_MODELS = [
  "meta-llama/Llama-3.3-70B-Instruct",
];

// ---------- token storage ----------

const TOKEN_KEY = "paperline.hf_token";
const MODEL_KEY = "paperline.hf_model";

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function getModel() {
  try {
    return localStorage.getItem(MODEL_KEY) || DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

export function setModel(model) {
  try {
    if (model) localStorage.setItem(MODEL_KEY, model);
    else localStorage.removeItem(MODEL_KEY);
  } catch {
    /* ignore */
  }
}

// ---------- low-level chat call ----------

export class HFError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = "HFError";
    this.status = status;
    this.body = body;
  }
}

async function chat({ messages, model, temperature = 0.2, maxTokens = 1800, signal }) {
  const token = getToken();
  if (!token) {
    throw new HFError("Missing Hugging Face access token. Open settings and paste one in.", { status: 401 });
  }

  let res;
  try {
    res = await fetch(HF_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        model: model || getModel(),
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: false,
      }),
      signal,
    });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new HFError(`Network error talking to Hugging Face: ${err.message}`);
  }

  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const j = JSON.parse(text);
      detail = j.error?.message || j.error || j.message || text;
    } catch {
      /* keep raw text */
    }
    throw new HFError(`HF API ${res.status}: ${detail}`, { status: res.status, body: text });
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new HFError("HF API returned non-JSON envelope.", { body: text });
  }

  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new HFError("HF API response missing message content.", { body: text });
  }
  return content;
}

// ---------- JSON extraction ----------

// Pull a JSON object or array out of an LLM reply. Tolerates ```json fences,
// extra prose around the payload, and trailing commas.
function extractJson(raw) {
  if (!raw || typeof raw !== "string") throw new Error("empty response");
  let s = raw.trim();

  // strip ```json ... ``` or ``` ... ``` fences
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) s = fence[1].trim();

  // find the first { or [ and walk to the matching close
  const startObj = s.indexOf("{");
  const startArr = s.indexOf("[");
  let start;
  if (startObj === -1) start = startArr;
  else if (startArr === -1) start = startObj;
  else start = Math.min(startObj, startArr);
  if (start < 0) throw new Error("no JSON payload found");

  const open = s[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let escape = false;
  let end = -1;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) throw new Error("unterminated JSON payload");

  let slice = s.slice(start, end);
  // permissive: trailing commas inside objects/arrays
  slice = slice.replace(/,(\s*[}\]])/g, "$1");

  return JSON.parse(slice);
}

async function chatJson({ messages, model, temperature, maxTokens, retries = 2, signal }) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const raw = await chat({
      messages: attempt === 0
        ? messages
        : [
            ...messages,
            {
              role: "user",
              content:
                "Your previous reply could not be parsed as JSON. Reply again with ONLY the JSON payload, no prose, no markdown fences.",
            },
          ],
      model,
      temperature: attempt === 0 ? temperature : Math.max(0, (temperature ?? 0.2) - 0.1),
      maxTokens,
      signal,
    });
    try {
      return extractJson(raw);
    } catch (err) {
      lastErr = new HFError(`Could not parse JSON from model: ${err.message}`, { body: raw });
    }
  }
  throw lastErr;
}

// ---------- normalization ----------

let _id = 0;
function nextId() {
  _id += 1;
  return `p${_id}`;
}

function asAuthors(value) {
  if (Array.isArray(value)) {
    return value.map((a) => (typeof a === "string" ? a : a?.name || "")).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/,|;| and /i)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizePaper(raw, extras = {}) {
  if (!raw || typeof raw !== "object") return null;
  const arxiv = raw.arxiv_id_or_doi ?? raw.arxiv_id ?? raw.doi ?? raw.identifier ?? "";
  // importance is clamped to 1..5; missing/invalid becomes 3 (neutral).
  let importance = 3;
  const impRaw = Number(raw.importance);
  if (Number.isFinite(impRaw) && impRaw >= 1 && impRaw <= 5) {
    importance = Math.round(impRaw);
  }
  return {
    id: nextId(),
    title: String(raw.title || "Untitled paper").trim(),
    authors: asAuthors(raw.authors),
    year: raw.year ? Number(raw.year) || raw.year : null,
    venue: raw.venue ? String(raw.venue).trim() : "",
    arxivOrDoi: String(arxiv || "").trim(),
    summary: String(raw.one_line_summary || raw.summary || "").trim(),
    whyRoot: String(raw.why_its_the_root || raw.why_root || "").trim(),
    howExtends: String(
      raw.how_it_extends_parent || raw.how_extends_parent || raw.contribution || ""
    ).trim(),
    importance,
    importanceReason: String(raw.importance_reason || "").trim(),
    recommendedChildId: null, // wired in attachRecommendations
    children: [],
    ...extras,
  };
}

// Wire the LLM-picked recommended child onto its parent. Mutates `parent` in
// place by setting `recommendedChildId`. Returns the recommended child (or
// null). The index is clamped into the children range; out-of-range / -1
// means no recommendation.
function attachRecommendations(parent, children, recommendedIndex) {
  if (!parent || !Array.isArray(children) || children.length === 0) return null;
  const idx = Number(recommendedIndex);
  if (!Number.isFinite(idx) || idx < 0 || idx >= children.length) return null;
  const rec = children[idx];
  parent.recommendedChildId = rec.id;
  return rec;
}

// ---------- prompts ----------

const SYSTEM_RULES =
  "You are a careful academic-citation assistant. You answer with rigorously formatted JSON and nothing else. " +
  "Never wrap the JSON in markdown fences. Never include prose before or after. " +
  "If you are uncertain about a field, give your best informed estimate but do not invent venue names or arXiv IDs you are not confident in — use an empty string instead.";

const ERA_INSTRUCTIONS = {
  origins:
    `Find the earliest foundational paper that first introduced the concept of "{topic}", even if from decades ago.`,
  inflection:
    `Find the paper that caused "{topic}" to transition from a niche research area to a widely-studied field — the paper that made subsequent work explode in volume. Ignore earlier theoretical foundations.`,
  modern:
    `Find the most important paper published after 2019 that defines the current state of "{topic}" research. Ignore all pre-2020 work.`,
};

function rootPrompt(topic, era = "inflection") {
  const instruction =
    ERA_INSTRUCTIONS[era] ||
    ERA_INSTRUCTIONS.inflection;
  return [
    { role: "system", content: SYSTEM_RULES },
    {
      role: "user",
      content:
        `${instruction.replace("{topic}", topic)} ` +
        `Return ONLY a JSON object with these exact keys: ` +
        `{ "title": string, "authors": string[], "year": number, "venue": string, ` +
        `"arxiv_id_or_doi": string, "one_line_summary": string, "why_its_the_root": string }.`,
    },
  ];
}

function childrenPrompt(parent, limit = 5) {
  const authors = parent.authors?.length ? parent.authors.join(", ") : "unknown authors";
  const year = parent.year || "unknown year";
  return [
    { role: "system", content: SYSTEM_RULES },
    {
      role: "user",
      content:
        `List the ${limit} most influential papers that directly built upon "${parent.title}" (${year}) by ${authors}. ` +
        `These should be papers that explicitly cite it and extended its core ideas. ` +
        `For each child, also rate its importance to the topic on a 1-5 scale (5 = foundational, 1 = tangential) ` +
        `and give a one-sentence reason. ` +
        `Then pick the single "recommended next paper" — the one whose subtree, if fully explored, would give the ` +
        `most complete understanding of the topic. You must always pick one (use the index in the array, 0-based). ` +
        `Return ONLY a JSON object: ` +
        `{ "recommendedIndex": number, "children": [ { "title": string, "authors": string[], "year": number, ` +
        `"venue": string, "arxiv_id_or_doi": string, "one_line_summary": string, "how_it_extends_parent": string, ` +
        `"importance": 1|2|3|4|5, "importance_reason": string } ] }. ` +
        `If you genuinely cannot find any direct descendants, return { "recommendedIndex": -1, "children": [] }.`,
    },
  ];
}

// ---------- public surface ----------

export async function findRootPaper(topic, { model, signal, era = "inflection" } = {}) {
  const data = await chatJson({
    messages: rootPrompt(topic, era),
    model,
    temperature: 0.2,
    maxTokens: 900,
    signal,
  });
  const paper = normalizePaper(data, { generation: 0 });
  if (!paper) throw new HFError("Model returned an empty root paper.");
  return paper;
}

export async function findChildren(parent, { model, signal, limit = 5, generation } = {}) {
  const data = await chatJson({
    messages: childrenPrompt(parent, limit),
    model,
    temperature: 0.3,
    maxTokens: 2400,
    signal,
  });
  // Response shape: { recommendedIndex, children: [...] }. Tolerate the
  // old bare-array shape for backwards compatibility with cached/stale
  // responses — in that case, no recommendation is attached.
  let rawChildren;
  let recommendedIndex = -1;
  if (Array.isArray(data)) {
    rawChildren = data;
  } else if (data && Array.isArray(data.children)) {
    rawChildren = data.children;
    recommendedIndex = Number(data.recommendedIndex ?? -1);
  } else if (data && Array.isArray(data.papers)) {
    rawChildren = data.papers;
  } else {
    rawChildren = [];
  }
  const children = rawChildren
    .map((p) => normalizePaper(p, { generation }))
    .filter(Boolean);
  // Wire the recommended child onto `parent` in place.
  attachRecommendations(parent, children, recommendedIndex);
  return { children, recommendedIndex };
}

// Convenience helper: parallel children fetch for many parents.
export async function findChildrenForMany(parents, options = {}) {
  const results = await Promise.allSettled(
    parents.map((p) => findChildren(p, options))
  );
  return results.map((r, i) => ({
    parent: parents[i],
    children: r.status === "fulfilled" ? r.value.children : [],
    error: r.status === "rejected" ? r.reason : null,
  }));
}

// ---------- challenges ("Build It") ----------

const CHALLENGES_SYSTEM =
  "You are a senior research engineer with 10+ years of ML systems experience. " +
  "You answer with rigorously formatted JSON and nothing else. " +
  "Never wrap the JSON in markdown fences. Never include prose before or after. " +
  "Your tone is direct, no hand-holding — like a code review comment.";

function challengesPrompt(paper) {
  return [
    { role: "system", content: CHALLENGES_SYSTEM },
    {
      role: "user",
      content:
        `You've just read "${paper.title}" (${paper.year || "n.d."}) by ${(paper.authors || []).join(", ") || "unknown"}.\n\n` +
        `Your job: give a junior engineer 2-3 concrete implementation challenges ` +
        `extracted from the critical engineering problems in this paper.\n\n` +
        `Constraints you MUST respect:\n` +
        `- All challenges runnable on a free Colab T4 (16GB VRAM, ~12hr session)\n` +
        `- No paid APIs, no private datasets\n` +
        `- Each challenge has: a clear deliverable, a success metric (a number), and an estimated time (hours)\n` +
        `- Tone: direct, no hand-holding, like a code review comment\n\n` +
        `Paper summary: ${paper.summary || "not available"}\n\n` +
        `Return ONLY a JSON object with this exact structure:\n` +
        `{ "challenges": [\n` +
        `  { "title": "...", "problem_statement": "...", "your_task": "...", ` +
        `"deliverable": "...", "success_metric": "...", "colab_feasible": true, ` +
        `"estimated_hours": 4, "difficulty": "medium", "hint": "..." }\n` +
        `] }`,
    },
  ];
}

export async function generateChallenges(paper, { signal } = {}) {
  if (!paper || !paper.title) throw new HFError("No paper data to generate challenges from.");
  const data = await chatJson({
    messages: challengesPrompt(paper),
    temperature: 0.3,
    maxTokens: 1600,
    signal,
  });
  if (data && Array.isArray(data.challenges)) return data.challenges;
  throw new HFError("Model returned invalid challenges format.");
}

// ---------- learning path ----------

const LEARNING_PATH_SYSTEM =
  "You are a careful academic-citation assistant who designs learning curricula. " +
  "You answer with rigorously formatted JSON and nothing else. " +
  "Never wrap the JSON in markdown fences. Never include prose before or after.";

function treeSummary(root, depth = 0) {
  if (!root) return "";
  const pad = "  ".repeat(depth);
  const authors = root.authors?.[0] || "unknown";
  let s = `${pad}- "${root.title}" (${root.year || "n.d."}) by ${authors}`;
  if (root.summary) s += ` — ${root.summary.slice(0, 120)}`;
  s += "\n";
  for (const c of root.children || []) s += treeSummary(c, depth + 1);
  return s;
}

function learningPathPrompt(topic, tree) {
  return [
    { role: "system", content: LEARNING_PATH_SYSTEM },
    {
      role: "user",
      content:
        `Given this paper lineage tree for the topic "${topic}", select 6-10 papers ` +
        `that form the clearest learning path from foundational concept to modern state of the art.\n\n` +
        `Rules:\n` +
        `- Each paper must build conceptually on the previous one\n` +
        `- No redundant papers (don't include two papers solving the same problem)\n` +
        `- Prefer papers with available arXiv PDFs\n` +
        `- The path should tell a story: "to understand modern X, you need to ` +
        `first understand A, then B showed that C, then D changed everything because of E..."\n\n` +
        `Tree:\n${treeSummary(tree)}\n\n` +
        `Return ONLY a JSON object:\n` +
        `{ "path": [ { "paper_title": string, "paper_year": number, "reason_in_path": string } ] }`,
    },
  ];
}

export async function generateLearningPath(topic, tree, { signal } = {}) {
  if (!topic || !tree) throw new HFError("Missing topic or tree.");
  const data = await chatJson({
    messages: learningPathPrompt(topic, tree),
    temperature: 0.25,
    maxTokens: 2400,
    signal,
  });
  if (data && Array.isArray(data.path)) return data.path;
  throw new HFError("Model returned invalid learning path format.");
}

// ---------- study guide ----------

const STUDY_GUIDE_SYSTEM =
  "You are a senior research engineer who has read this paper and is briefing a junior " +
  "before a paper reading session. You answer with rigorously formatted JSON and nothing else. " +
  "Never wrap the JSON in markdown fences. Never include prose before or after.";

function studyGuidePrompt(paper, topic) {
  return [
    { role: "system", content: STUDY_GUIDE_SYSTEM },
    {
      role: "user",
      content:
        `Brief a junior engineer on "${paper.title}" (${paper.year || "n.d."}) ` +
        `before their paper reading session. Context: they are studying ${topic || "this topic"}.\n\n` +
        `Paper summary: ${paper.summary || "not available"}\n` +
        `Authors: ${(paper.authors || []).join(", ") || "unknown"}\n` +
        `Venue: ${paper.venue || "unknown"}\n\n` +
        `Return ONLY a JSON object with this exact structure:\n` +
        `{\n` +
        `  "must_understand": [\n` +
        `    "The core problem being solved in 1 sentence",\n` +
        `    "The key architectural/algorithmic insight",\n` +
        `    "Why previous approaches failed at this"\n` +
        `  ],\n` +
        `  "skip_these": [\n` +
        `    { "section": "Appendix B", "reason": "Proof of convergence, not needed for implementation" }\n` +
        `  ],\n` +
        `  "implement_this": {\n` +
        `    "description": "The one thing worth coding from this paper",\n` +
        `    "why": "...",\n` +
        `    "estimated_lines": 50,\n` +
        `    "colab_feasible": true\n` +
        `  },\n` +
        `  "mental_model": "One paragraph that makes the paper's idea stick"\n` +
        `}`,
    },
  ];
}

export async function generateStudyGuide(paper, topic, { signal } = {}) {
  if (!paper || !paper.title) throw new HFError("No paper data to generate study guide from.");
  const data = await chatJson({
    messages: studyGuidePrompt(paper, topic),
    temperature: 0.2,
    maxTokens: 1600,
    signal,
  });
  if (data && data.must_understand) return data;
  throw new HFError("Model returned invalid study guide format.");
}

// ---------- project generation ----------

const PROJECTS_SYSTEM =
  "You are a senior research engineer designing project-based learning curricula. " +
  "You answer with rigorously formatted JSON and nothing else. " +
  "Never wrap the JSON in markdown fences. Never include prose before or after.";

function projectsPrompt(topic, pathPapers, projectType) {
  const paperList = pathPapers
    .map((p, i) => `${i + 1}. "${p.title}" (${p.year || "n.d."}) — ${p.summary?.slice(0, 150) || "no summary"}`)
    .join("\n");
  return [
    { role: "system", content: PROJECTS_SYSTEM },
    {
      role: "user",
      content:
        `The user has read these ${pathPapers.length} papers in sequence for the topic "${topic}":\n\n` +
        `${paperList}\n\n` +
        `Their hardware constraint: free Colab T4 (16GB VRAM, ~12hr session).\n` +
        `No paid APIs, no private datasets.\n\n` +
        (projectType === "mle"
          ? `Generate projects for the MLE Path — "Ship something that works":\n` +
            `Core engineering. Production-grade implementations. Benchmark numbers on your resume.\n\n`
          : `Generate projects for the Research Engineering Path — "Find something that doesn't work yet":\n` +
            `Experiments, ablations, novel combinations. Conference-submittable directions.\n\n`) +
        `Generate:\n` +
        `1. Two mini projects (1-2 days each) that each combine knowledge from at least 3 of these papers. ` +
        `These should be self-contained, have a clear benchmark to beat, and produce something shareable (GitHub repo + a result table or demo).\n` +
        `2. One capstone project (1-2 weeks) that synthesizes all the papers into a novel system. ` +
        `This should be resume-worthy.\n\n` +
        `Return ONLY a JSON object:\n` +
        `{ "projects": [\n` +
        `  {\n` +
        `    "title": "...",\n` +
        `    "tagline": "...",\n` +
        `    "papers_used": [...],\n` +
        `    "what_you_build": "...",\n` +
        `    "deliverable": "...",\n` +
        `    "success_metric": "...",\n` +
        `    "stretch_goal": "...",\n` +
        `    "colab_setup": "...",\n` +
        `    "estimated_days": 2,\n` +
        `    "resume_bullet": "..."\n` +
        `  }\n` +
        `] }`,
    },
  ];
}

export async function generateProjects(topic, pathPapers, projectType, { signal } = {}) {
  if (!topic || !pathPapers?.length) throw new HFError("Missing topic or path papers.");
  const data = await chatJson({
    messages: projectsPrompt(topic, pathPapers, projectType || "mle"),
    temperature: 0.3,
    maxTokens: 2800,
    signal,
  });
  if (data && Array.isArray(data.projects)) return data.projects;
  throw new HFError("Model returned invalid projects format.");
}

// Semantic Scholar deep-link for a paper title.
export function semanticScholarUrl(title) {
  const q = encodeURIComponent(title || "");
  return `https://www.semanticscholar.org/search?q=${q}`;
}

// ---------- arXiv helpers ----------

const ARXIV_ABS = "https://arxiv.org/abs/";
const ARXIV_PDF = "https://arxiv.org/pdf/";
const ARXIV_API = "https://export.arxiv.org/api/query";

// True if `s` looks like a bare arXiv id, with or without the "arxiv:" prefix.
export function looksLikeArxivId(s) {
  if (!s) return false;
  return /^\d{4}\.\d{4,5}(v\d+)?$/i.test(s) || /^arxiv:\d{4}\.\d{4,5}/i.test(s);
}

// Strip "arxiv:" prefix and any version suffix. "2106.09685v1" -> "2106.09685"
function stripArxivId(id) {
  return String(id)
    .replace(/^arxiv:/i, "")
    .replace(/v\d+$/i, "");
}

export function arxivAbsUrl(id) {
  return ARXIV_ABS + stripArxivId(id);
}

export function arxivPdfUrl(id) {
  return ARXIV_PDF + stripArxivId(id);
}

// Fetch a paper's abstract from the public arXiv API (Atom XML, CORS-enabled).
// Returns { title, summary, authors, year, doi } or null if not found.
export async function fetchArxivAbstract(rawId, { signal } = {}) {
  const id = stripArxivId(rawId);
  if (!/^\d{4}\.\d{4,5}$/.test(id)) {
    throw new Error("not an arxiv id");
  }
  const url = `${ARXIV_API}?id_list=${encodeURIComponent(id)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`arxiv ${res.status}`);
  const xml = await res.text();

  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const errNode = doc.querySelector("parsererror");
  if (errNode) throw new Error("arxiv xml parse error");
  const entry = doc.querySelector("entry");
  if (!entry) return null;

  const title = entry.querySelector("title")?.textContent?.trim().replace(/\s+/g, " ");
  const summary = entry.querySelector("summary")?.textContent?.trim().replace(/\s+/g, " ");

  const authors = Array.from(entry.querySelectorAll("author > name"))
    .map((n) => n.textContent?.trim())
    .filter(Boolean);

  const published = entry.querySelector("published")?.textContent || "";
  const yearMatch = published.match(/^(\d{4})/);
  const year = yearMatch ? Number(yearMatch[1]) : null;

  const doi = entry.querySelector("arxiv\\:doi, doi")?.textContent?.trim() || "";

  if (!title && !summary) return null;
  return { title: title || "", summary: summary || "", authors, year, doi };
}
