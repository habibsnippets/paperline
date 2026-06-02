import { useEffect } from "react";
import {
  arxivAbsUrl,
  arxivPdfUrl,
  looksLikeArxivId,
  semanticScholarUrl,
} from "../utils/hfApi";

function looksLikeDoi(s) {
  if (!s) return false;
  return /^10\.\d{4,9}\//.test(s);
}

function doiUrl(id) {
  return `https://doi.org/${id}`;
}

function truncate(s, n) {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";
}

function formatStarredAt(ms) {
  if (!ms) return "";
  try {
    const d = new Date(ms);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function ReadingListPanel({ open, list, onClose, onRemove, onClear }) {
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="reading-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="reading list"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <aside className="reading-panel" aria-label="saved papers">
        <header className="reading-head">
          <div className="reading-head-title">
            <span className="reading-head-glyph" aria-hidden="true">★</span>
            <h2>reading list</h2>
            <span className="reading-head-count">
              {list.length} {list.length === 1 ? "paper" : "papers"}
            </span>
          </div>
          <div className="reading-head-actions">
            {list.length > 0 ? (
              <button
                type="button"
                className="reading-clear"
                onClick={() => {
                  if (window.confirm("Clear the entire reading list?")) onClear?.();
                }}
              >
                clear all
              </button>
            ) : null}
            <button
              type="button"
              className="reading-close"
              onClick={onClose}
              aria-label="close reading list"
            >
              x
            </button>
          </div>
        </header>

        <div className="reading-body">
          {list.length === 0 ? (
            <div className="reading-empty">
              <p>Your reading list is empty.</p>
              <p className="reading-empty-hint">
                Star a paper from the tree to save it here. Entries persist
                across digs and reloads.
              </p>
            </div>
          ) : (
            <ol className="reading-list">
              {list.map((entry) => {
                const ident = entry.arxivOrDoi;
                const isArxiv = looksLikeArxivId(ident);
                const isDoi = looksLikeDoi(ident);
                const isUrl = /^https?:\/\//.test(ident);
                let identUrl = null;
                let identKind = null;
                if (isArxiv) {
                  identUrl = arxivAbsUrl(ident);
                  identKind = "arXiv";
                } else if (isDoi) {
                  identUrl = doiUrl(ident);
                  identKind = "DOI";
                } else if (isUrl) {
                  identUrl = ident;
                  identKind = "link";
                }
                return (
                  <li key={entry.id} className="reading-item">
                    <div className="reading-item-main">
                      <h3 className="reading-item-title">{entry.title}</h3>
                      <div className="reading-item-meta">
                        {entry.authors?.length ? (
                          <span>{truncate(entry.authors.join(", "), 80)}</span>
                        ) : (
                          <span className="reading-item-muted">unknown authors</span>
                        )}
                        {entry.year ? <span> · {entry.year}</span> : null}
                        {entry.venue ? <span> · {truncate(entry.venue, 36)}</span> : null}
                      </div>
                      {entry.topic ? (
                        <div
                          className="reading-item-topic"
                          title={`saved during dig: ${entry.topic}`}
                        >
                          <span className="reading-item-topic-label">dig:</span>{" "}
                          {truncate(entry.topic, 50)}
                        </div>
                      ) : null}
                      {entry.summary ? (
                        <p className="reading-item-summary">{truncate(entry.summary, 220)}</p>
                      ) : null}
                      <div className="reading-item-links">
                        {isArxiv ? (
                          <>
                            <a href={arxivAbsUrl(ident)} target="_blank" rel="noreferrer noopener">
                              arXiv
                            </a>
                            <a href={arxivPdfUrl(ident)} target="_blank" rel="noreferrer noopener">
                              PDF
                            </a>
                          </>
                        ) : identUrl ? (
                          <a href={identUrl} target="_blank" rel="noreferrer noopener">
                            {identKind}
                          </a>
                        ) : null}
                        <a
                          href={semanticScholarUrl(entry.title)}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          Semantic Scholar
                        </a>
                      </div>
                    </div>
                    <div className="reading-item-side">
                      <time
                        className="reading-item-time"
                        dateTime={new Date(entry.starredAt).toISOString()}
                      >
                        saved {formatStarredAt(entry.starredAt)}
                      </time>
                      <button
                        type="button"
                        className="reading-item-remove"
                        onClick={() => onRemove?.(entry)}
                        aria-label={`remove ${entry.title}`}
                        title="remove from reading list"
                      >
                        remove
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </aside>
    </div>
  );
}
