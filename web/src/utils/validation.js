// Lightweight sanity checks for papers returned by the LLM.
//
// The model occasionally invents things: a year in the future, an arXiv id
// that's not shaped like an arXiv id, a missing author list. These helpers
// flag the obvious cases so the UI can show a small "⚠" on the node. The
// user can then decide whether to trust the citation or look it up.
//
// Each function returns a list of warning codes (strings). Empty list = the
// paper looks fine.

const CURRENT_YEAR = new Date().getFullYear();
const ARXIV_RE = /^\d{4}\.\d{4,5}(v\d+)?$/i;
const DOI_RE = /^10\.\d{4,9}\//;
const URL_RE = /^https?:\/\//;

/**
 * @param {object} paper
 * @returns {string[]} list of warning codes
 */
export function validatePaper(paper) {
  if (!paper || typeof paper !== "object") return ["empty"];
  const warnings = [];

  // arXiv id should look like an arXiv id (or be a DOI / URL — both are fine
  // and we just trust them visually). Only flag a non-empty id that matches
  // neither shape.
  const ident = (paper.arxivOrDoi || "").trim();
  if (ident) {
    const looksArxiv = ARXIV_RE.test(ident) || /^arxiv:\d{4}\.\d{4,5}/i.test(ident);
    const looksDoi = DOI_RE.test(ident);
    const looksUrl = URL_RE.test(ident);
    if (!looksArxiv && !looksDoi && !looksUrl) {
      warnings.push("unrecognized-id");
    }
  }

  // Year sanity. Allow up to CURRENT_YEAR + 1 for "accepted but not yet
  // indexed" cases; anything earlier than 1800 is nonsense.
  const year = Number(paper.year);
  if (paper.year != null && paper.year !== "") {
    if (!Number.isFinite(year) || !Number.isInteger(year)) {
      warnings.push("bad-year");
    } else if (year > CURRENT_YEAR + 1) {
      warnings.push("future-year");
    } else if (year < 1800) {
      warnings.push("ancient-year");
    }
  }

  // No authors is rare for a real paper; the LLM sometimes returns an
  // empty list instead of admitting it doesn't know.
  if (Array.isArray(paper.authors) && paper.authors.length === 0) {
    warnings.push("no-authors");
  }

  return warnings;
}

export function hasWarnings(paper) {
  return validatePaper(paper).length > 0;
}

const WARNING_LABELS = {
  "empty": "no paper data",
  "unrecognized-id": "arXiv id / DOI doesn't match expected format",
  "bad-year": "year is not a valid number",
  "future-year": "year is in the future",
  "ancient-year": "year is implausibly old",
  "no-authors": "no authors listed",
};

export function warningLabel(code) {
  return WARNING_LABELS[code] || code;
}

export function warningLabelsFor(paper) {
  return validatePaper(paper).map(warningLabel);
}
