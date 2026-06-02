// Citation tree construction.
// Given a root paper, recursively fetch citations up to `maxDepth`, taking
// up to `maxChildren` top-cited papers per node, deduplicating across the
// whole tree, with progress callbacks.

(function () {
  // Common English words that don't carry topical meaning. Excluded from
  // keyword scoring so they don't drown out the real signal.
  const STOPWORDS = new Set(
    ("a an the and or of for to in on with by from as at is are was were be been being " +
     "this that these those it its their them they we us our you your he she his her " +
     "not no nor but if then so do does did has have had can will would could should " +
     "may might shall about into over under up down out off more less most least very " +
     "such only just also any all some one two three first second new show use used using " +
     "based paper study work approach method results proposed propose presents present")
      .split(/\s+/)
  );

  /**
   * Pick the most relevant sentence from a child's abstract to use as the
   * edge label — i.e. the sentence that most directly speaks to the parent's
   * contribution. We score each sentence by overlap (minus stopwords) with
   * the parent paper's title tokens. Ties broken by sentence order.
   *
   * @returns {string|null}  1-2 sentence snippet, or null if nothing fit.
   */
  function extractEdgeContext(parent, child) {
    if (!parent || !child) return null;
    const parentTitle = parent.title || "";
    const parentKeywords = new Set(
      parentTitle
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    );
    // If the parent title carries no useful keywords, fall back to the
    // first author surname — many "extending X" sentences name the author
    // rather than the full title.
    if (parentKeywords.size === 0 && parent.authors && parent.authors[0]) {
      const surname = String(parent.authors[0]).split(/\s+/).pop().toLowerCase();
      if (surname.length > 2) parentKeywords.add(surname);
    }
    if (parentKeywords.size === 0) return null;

    const abstract = (child.abstract || "").trim();
    if (!abstract) return null;

    // Split into sentences. Naive but fine — abstracts are well-formed.
    const sentences = abstract
      .replace(/\s+/g, " ")
      .match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g);
    if (!sentences || sentences.length === 0) return null;

    let best = null;
    let bestScore = 0;
    for (let i = 0; i < sentences.length; i++) {
      const sent = sentences[i].trim();
      const words = sent.toLowerCase().split(/[^a-z0-9]+/);
      let score = 0;
      for (const w of words) {
        if (parentKeywords.has(w)) score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        best = { text: sent, index: i };
      }
    }

    if (!best || bestScore === 0) return null;

    // Also include the sentence immediately after if it starts with a
    // coordinating conjunction and is short — makes "extends X to Y. We
    // show that..." read as a single fragment.
    const next = sentences[best.index + 1];
    let combined = best.text;
    if (
      next &&
      next.length < 200 &&
      /^(and|we|which|where|because|since|so|thus|therefore)\b/i.test(next.trim())
    ) {
      combined = best.text + " " + next.trim();
    }
    return truncate(combined.trim(), 180);
  }

  /**
   * Build the tree.
   *
   * @param {Object} root - Normalised root paper (from API.normalizePaper).
   * @param {Object} opts
   *   @param {number} opts.maxDepth      - 1,2,3...
   *   @param {number} opts.maxChildren   - cap of children at each node
   *   @param {(ev:Object)=>void} opts.onProgress - progress events
   * @returns {Promise<TreeNode>}
   *
   * TreeNode shape: {
   *   paper, generation, parentId, children: [],
   *   dead?: bool, error?: string, edgeContext?: string
   * }
   */
  async function buildTree(root, opts) {
    const { maxDepth = 2, maxChildren = 8, onProgress = () => {} } = opts || {};

    const seen = new Set([root.id]); // dedupe across the whole tree
    const rootNode = {
      paper: root,
      generation: 0,
      parentId: null,
      children: [],
      dead: false,
    };

    let totalNodes = 1;
    const log = (kind, msg) => onProgress({ type: "log", kind, msg, totalNodes });
    const tick = (msg) =>
      onProgress({ type: "tick", msg, totalNodes });

    log("ok", `root: "${truncate(root.title, 80)}" (${root.year || "?"}, ${root.citationCount} citations)`);

    // BFS so progress feels even and so a cancel mid-way still yields useful gens.
    let frontier = [rootNode];
    for (let depth = 1; depth <= maxDepth; depth++) {
      if (API.isCancelled()) break;
      const next = [];
      log("ok", `── generation ${depth} ── (${frontier.length} parents to query)`);

      for (let i = 0; i < frontier.length; i++) {
        if (API.isCancelled()) break;
        const parent = frontier[i];
        tick(`gen ${depth}: parent ${i + 1}/${frontier.length} — "${truncate(parent.paper.title, 50)}"`);

        let citations = [];
        try {
          const fetched = await API.getCitations(parent.paper.id, maxChildren);
          citations = fetched
            .filter(Boolean)
            // Drop self-loops and already-seen papers (keeps tree a tree).
            .filter((p) => p.id && p.id !== parent.paper.id && !seen.has(p.id));

          // Sort by citation count desc, then year asc as tiebreak
          citations.sort((a, b) => {
            const c = (b.citationCount || 0) - (a.citationCount || 0);
            if (c !== 0) return c;
            return (a.year || 9999) - (b.year || 9999);
          });
          citations = citations.slice(0, maxChildren);
        } catch (err) {
          if (err.message === "cancelled") break;
          parent.error = err.message;
          log("warn", `skip: ${truncate(parent.paper.title, 60)} — ${err.message}`);
          continue;
        }

        if (citations.length === 0) {
          parent.dead = true;
          log("warn", `dead end: "${truncate(parent.paper.title, 60)}"`);
          continue;
        }

        for (const c of citations) {
          seen.add(c.id);
          const child = {
            paper: c,
            generation: depth,
            parentId: parent.paper.id,
            children: [],
            dead: false,
            edgeContext: extractEdgeContext(parent.paper, c),
          };
          parent.children.push(child);
          next.push(child);
          totalNodes += 1;
        }
        tick(`gen ${depth}: +${citations.length} (total ${totalNodes} nodes)`);
      }
      frontier = next;
      if (frontier.length === 0) {
        log("warn", `no more descendants at generation ${depth + 1}, stopping`);
        break;
      }
    }

    log("ok", `done — ${totalNodes} papers across ${maxDepth} generations`);
    onProgress({ type: "done", totalNodes });
    return rootNode;
  }

  /**
   * Extend a single existing leaf node by fetching its citations.
   * Used by the "load more citations" button in the side panel.
   * Mutates the tree in place; returns number of children added.
   */
  async function expandNode(node, treeRoot, opts) {
    const { maxChildren = 8, onProgress = () => {} } = opts || {};
    const seen = collectAllIds(treeRoot);
    try {
      const fetched = await API.getCitations(node.paper.id, maxChildren);
      let children = fetched
        .filter(Boolean)
        .filter((p) => p.id !== node.paper.id && !seen.has(p.id));

      children.sort((a, b) => (b.citationCount || 0) - (a.citationCount || 0));
      children = children.slice(0, maxChildren);

      for (const c of children) {
        node.children.push({
          paper: c,
          generation: node.generation + 1,
          parentId: node.paper.id,
          children: [],
          dead: false,
          edgeContext: extractEdgeContext(node.paper, c),
        });
      }
      if (node.children.length === 0) {
        node.dead = true;
      }
      onProgress({ type: "done", added: children.length });
      return children.length;
    } catch (err) {
      onProgress({ type: "error", msg: err.message });
      throw err;
    }
  }

  /** Walk tree and collect every paper id present. */
  function collectAllIds(rootNode) {
    const ids = new Set();
    const stack = [rootNode];
    while (stack.length) {
      const n = stack.pop();
      ids.add(n.paper.id);
      for (const c of n.children) stack.push(c);
    }
    return ids;
  }

  /** Trace path from root → node (inclusive). */
  function pathFromRoot(rootNode, targetId) {
    // DFS storing path
    const path = [];
    function dfs(n) {
      path.push(n);
      if (n.paper.id === targetId) return true;
      for (const c of n.children) {
        if (dfs(c)) return true;
      }
      path.pop();
      return false;
    }
    if (dfs(rootNode)) return path.slice();
    return [];
  }

  /** Find node by id (or null). */
  function findNode(rootNode, id) {
    const stack = [rootNode];
    while (stack.length) {
      const n = stack.pop();
      if (n.paper.id === id) return n;
      for (const c of n.children) stack.push(c);
    }
    return null;
  }

  function truncate(s, n) {
    if (!s) return "";
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }

  window.TreeBuilder = {
    buildTree,
    expandNode,
    pathFromRoot,
    findNode,
    collectAllIds,
    // exposed for the visualization to re-derive context if it needs to
    extractEdgeContext,
  };
})();
