// Pure helpers for the PaperNode tree.
//
// PaperNode shape (mirrors what hfApi.js produces):
//   { id, title, authors, year, venue, summary, whyRoot, howExtends,
//     arxivOrDoi, generation, children: PaperNode[] }
//
// Everything here is immutable: functions return new tree objects so React
// state updates trigger cleanly.

export function countNodes(node) {
  if (!node) return 0;
  let n = 1;
  for (const c of node.children || []) n += countNodes(c);
  return n;
}

export function countLeaves(node) {
  if (!node) return 0;
  if (!node.children || node.children.length === 0) return 1;
  return node.children.reduce((sum, c) => sum + countLeaves(c), 0);
}

export function maxDepth(node, depth = 0) {
  if (!node) return depth;
  if (!node.children || node.children.length === 0) return depth;
  let m = depth;
  for (const c of node.children) {
    const d = maxDepth(c, depth + 1);
    if (d > m) m = d;
  }
  return m;
}

export function findNode(root, id) {
  if (!root) return null;
  if (root.id === id) return root;
  for (const c of root.children || []) {
    const hit = findNode(c, id);
    if (hit) return hit;
  }
  return null;
}

// Find a node in the tree by its title.
export function findNodeByTitle(root, title) {
  if (!root || !title) return null;
  if (root.title === title) return root;
  for (const c of root.children || []) {
    const hit = findNodeByTitle(c, title);
    if (hit) return hit;
  }
  return null;
}

// Return a new tree with `children` attached to the node matching `id`.
export function setChildren(root, id, children) {
  if (!root) return root;
  if (root.id === id) {
    return { ...root, children: children || [] };
  }
  if (!root.children || root.children.length === 0) return root;
  return {
    ...root,
    children: root.children.map((c) => setChildren(c, id, children)),
  };
}

// Tag a node with its child-load status: 'pending' (never fetched),
// 'loaded' (children fetched, may be empty), or 'leaf' (fetched and empty).
// Lives in a private field on the node so it doesn't pollute the JSON.
export function setChildStatus(root, id, status) {
  if (!root) return root;
  if (root.id === id) {
    return { ...root, _childStatus: status };
  }
  if (!root.children || root.children.length === 0) return root;
  return {
    ...root,
    children: root.children.map((c) => setChildStatus(c, id, status)),
  };
}

// Merge `patch` into the node matching `id`. Returns a new tree.
export function patchNode(root, id, patch) {
  if (!root || !patch) return root;
  if (root.id === id) {
    return { ...root, ...patch };
  }
  if (!root.children || root.children.length === 0) return root;
  return {
    ...root,
    children: root.children.map((c) => patchNode(c, id, patch)),
  };
}

// Make `node` the new root of the tree: shift generation numbers down by
// node.generation, and reset _childStatus to "pending" on the new root's
// direct children so they can be re-expanded under the new depth budget.
// Their loaded descendants keep their existing status.
export function promoteToRoot(node) {
  if (!node) return null;
  const shift = node.generation ?? 0;

  function walk(n, isDirectChild) {
    const out = { ...n, generation: (n.generation ?? 0) - shift };
    if (isDirectChild) {
      out._childStatus = out.children?.length ? "loaded" : "pending";
    }
    if (n.children?.length) {
      out.children = n.children.map((c) => walk(c, false));
    } else if (n.children) {
      // keep an empty children array if the node had one (leaf state)
      out.children = [];
    }
    return out;
  }

  const promoted = walk(node, true);
  // the pivot itself is now the root
  promoted.generation = 0;
  delete promoted._childStatus; // root starts with no fetched descendants
  // re-mark its direct children as pending so the user can click them
  if (promoted.children?.length) {
    promoted.children = promoted.children.map((c) => {
      const c2 = { ...c, _childStatus: c.children?.length ? "loaded" : "pending" };
      return c2;
    });
  }
  return promoted;
}

// Walk the whole tree with a callback.
export function walk(root, fn, depth = 0, parent = null) {
  if (!root) return;
  fn(root, depth, parent);
  for (const c of root.children || []) walk(c, fn, depth + 1, root);
}

// All nodes at a given generation (0 = root).
export function nodesAtGeneration(root, gen) {
  const out = [];
  walk(root, (n, d) => {
    if (d === gen) out.push(n);
  });
  return out;
}

// Stable string for accessibility / debugging.
export function lineageLabel(node) {
  const a = node.authors?.[0] || "anon";
  const y = node.year || "n.d.";
  return `${a} (${y})`;
}

// ---------- recommended path ----------

// Walk the tree via `recommendedChildId` and return the chain of node ids
// from the root down to the deepest recommended paper. Returns an empty
// array if the root has no recommendation. Skips broken links (e.g. the
// recommended child was collapsed out of the current layout) defensively.
export function getRecommendedPath(root) {
  if (!root) return [];
  const path = [root.id];
  let cur = root;
  // safety cap: tree depth is bounded, but defend against cycles
  for (let i = 0; i < 64; i++) {
    if (!cur.recommendedChildId) break;
    const next = (cur.children || []).find((c) => c.id === cur.recommendedChildId);
    if (!next) break;
    path.push(next.id);
    cur = next;
  }
  return path;
}

// Same as getRecommendedPath, but returns the edge pairs `{ sourceId,
// targetId }[]` for fast lookup when rendering.
export function getRecommendedPathEdges(root) {
  const ids = getRecommendedPath(root);
  const edges = [];
  for (let i = 0; i < ids.length - 1; i++) {
    edges.push({ sourceId: ids[i], targetId: ids[i + 1] });
  }
  return edges;
}

// Lookup helper: is this node id on the recommended path?
export function isOnRecommendedPath(root, id) {
  return getRecommendedPath(root).includes(id);
}

// Map a 1-5 importance score to a CSS color (gold gradient). Used by the
// PaperCard importance pill. 5 = bright gold, 1 = faint olive.
export function importanceColor(importance) {
  const palette = {
    1: "#7a6a3f",
    2: "#9b844f",
    3: "#b89a64",
    4: "#d6a64f",
    5: "#f0c878",
  };
  return palette[importance] || palette[3];
}

// Set of ids that ARE the recommended child of their parent. Useful for
// marking the badge on the child node (not the parent).
export function getRecommendedChildIds(root) {
  const set = new Set();
  if (!root) return set;
  walk(root, (n) => {
    if (n.recommendedChildId) set.add(n.recommendedChildId);
  });
  return set;
}
