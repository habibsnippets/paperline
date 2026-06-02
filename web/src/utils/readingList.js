// Reading list — a personal "save for later" of starred papers.
//
// Persisted in localStorage under READING_LIST_KEY. The shape is a list
// of `ReadingListEntry` objects (see below) — the *full* paper object so
// the list survives even if the tree is closed.
//
// We keep the entry as the paper itself plus a `starredAt` timestamp for
// stable ordering. Deduplication is on `arxivOrDoi` first (most reliable),
// then on a normalized title as a fallback for papers without an id.

const STORAGE_KEY = "paperline.reading_list.v1";

/**
 * @typedef {Object} ReadingListEntry
 * @property {string} id           // the paper's own id
 * @property {string} title
 * @property {string[]} authors
 * @property {number|null} year
 * @property {string} venue
 * @property {string} arxivOrDoi
 * @property {string} summary
 * @property {string} [abstract]
 * @property {string} [whyRoot]
 * @property {string} [howExtends]
 * @property {number} starredAt   // ms epoch
 * @property {string} [topic]     // the topic under which it was starred
 */

function safeRead() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeWrite(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* quota or disabled — ignore */
  }
}

function normTitle(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 120);
}

function samePaper(a, b) {
  if (a.arxivOrDoi && b.arxivOrDoi && a.arxivOrDoi === b.arxivOrDoi) return true;
  const ta = normTitle(a.title);
  const tb = normTitle(b.title);
  return ta && tb && ta === tb;
}

export function loadReadingList() {
  return safeRead();
}

export function saveReadingList(list) {
  safeWrite(list);
}

export function isStarred(list, paper) {
  if (!list || !paper) return false;
  return list.some((e) => samePaper(e, paper));
}

// Return a new list with `paper` added (or moved to the top) if not present.
export function addToReadingList(list, paper, { topic } = {}) {
  if (!paper) return list;
  const filtered = list.filter((e) => !samePaper(e, paper));
  const entry = {
    id: paper.id,
    title: paper.title,
    authors: paper.authors || [],
    year: paper.year ?? null,
    venue: paper.venue || "",
    arxivOrDoi: paper.arxivOrDoi || "",
    summary: paper.summary || "",
    abstract: paper.abstract || "",
    whyRoot: paper.whyRoot || "",
    howExtends: paper.howExtends || "",
    starredAt: Date.now(),
    topic: topic || "",
  };
  return [entry, ...filtered];
}

// Return a new list with `paper` removed.
export function removeFromReadingList(list, paper) {
  if (!paper) return list;
  return list.filter((e) => !samePaper(e, paper));
}

// Toggle helper: returns the next list and whether it ended up starred.
export function toggleReadingList(list, paper, { topic } = {}) {
  if (isStarred(list, paper)) {
    return { list: removeFromReadingList(list, paper), starred: false };
  }
  return { list: addToReadingList(list, paper, { topic }), starred: true };
}
