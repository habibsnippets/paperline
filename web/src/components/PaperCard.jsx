import { useState } from "react";
import { arxivAbsUrl, arxivPdfUrl, looksLikeArxivId, semanticScholarUrl } from "../utils/hfApi";
import { importanceColor } from "../utils/treeHelpers";
import ResearchChallengesPanel from "./ResearchChallengesPanel";

function looksLikeDoi(s) {
  if (!s) return false;
  return /^10\.\d{4,9}\//.test(s);
}

function doiUrl(id) {
  return `https://doi.org/${id}`;
}

function generationLabel(gen) {
  if (gen === 0) return "root";
  if (gen === 1) return "gen 1";
  if (gen === 2) return "gen 2";
  if (typeof gen === "number") return `gen ${gen}`;
  return "node";
}

export default function PaperCard({ node, onClose, onFetchAbstract, abstractLoading, onPivot, canPivot, onToggleStar, starred, isRead, onToggleRead, onGenerateChallenges, challengesGenerating, onOpenStudyGuide }) {
  const [abstractExpanded, setAbstractExpanded] = useState(false);

  if (!node) return null;

  const ident = node.arxivOrDoi;
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

  const isRoot = node.generation === 0;
  const extendsText = isRoot ? node.whyRoot : node.howExtends;
  const hasAbstract = Boolean(node.abstract);
  const showAbstract = hasAbstract || abstractExpanded;

  function handleLoadAbstract() {
    if (hasAbstract) {
      setAbstractExpanded((v) => !v);
      return;
    }
    setAbstractExpanded(true);
    onFetchAbstract?.(node);
  }

  return (
    <aside className={`paper-card paper-card--gen${node.generation ?? 0}`} aria-label="paper details">
      <header className="paper-card-head">
        <span className="paper-card-tag">{generationLabel(node.generation)}</span>
        <div className="paper-card-head-actions">
          {onToggleRead ? (
            <button
              type="button"
              className={`paper-card-read${isRead ? " paper-card-read--done" : ""}`}
              onClick={() => onToggleRead(node)}
              title={isRead ? "mark as unread" : "mark as read"}
            >
              {isRead ? "✓ read" : "○ unread"}
            </button>
          ) : null}
          {onOpenStudyGuide ? (
            <button
              type="button"
              className="paper-card-study-guide"
              onClick={() => onOpenStudyGuide(node)}
              title="open study guide"
            >
              📖 guide
            </button>
          ) : null}
          {onToggleStar ? (
            <button
              type="button"
              className={`paper-card-star${starred ? " paper-card-star--on" : ""}`}
              onClick={() => onToggleStar(node)}
              title={starred ? "remove from reading list" : "save to reading list"}
              aria-pressed={Boolean(starred)}
            >
              <span aria-hidden="true">{starred ? "★" : "☆"}</span>
              <span>{starred ? "saved" : "save"}</span>
            </button>
          ) : null}
          {canPivot && onPivot ? (
            <button
              type="button"
              className="paper-card-pivot"
              onClick={() => onPivot(node)}
              title="make this the new root of the tree"
            >
              <span className="paper-card-pivot-glyph" aria-hidden="true">⤳</span>
              <span>pivot here</span>
            </button>
          ) : null}
          <button
            type="button"
            className="paper-card-close"
            onClick={onClose}
            aria-label="close paper details"
          >
            x
          </button>
        </div>
      </header>

      <h2 className="paper-card-title">{node.title}</h2>

      <div className="paper-card-meta">
        {node.authors?.length ? (
          <span className="paper-card-authors">{node.authors.join(", ")}</span>
        ) : (
          <span className="paper-card-authors paper-card-authors--unknown">unknown authors</span>
        )}
        <span className="paper-card-sep">·</span>
        <span className="paper-card-year">{node.year || "n.d."}</span>
        {node.venue ? (
          <>
            <span className="paper-card-sep">·</span>
            <span className="paper-card-venue">{node.venue}</span>
          </>
        ) : null}
        {Number.isFinite(node.importance) ? (
          <span
            className="paper-card-importance-pill"
            style={{ color: importanceColor(node.importance), borderColor: importanceColor(node.importance) }}
            title={`LLM-rated importance: ${node.importance} of 5`}
          >
            <span className="paper-card-importance-glyphs">
              {[1, 2, 3, 4, 5].map((i) => (
                <span key={i} className={`paper-card-importance-star${i <= node.importance ? " paper-card-importance-star--on" : ""}`}>
                  ★
                </span>
              ))}
            </span>
            <span className="paper-card-importance-label">importance</span>
          </span>
        ) : null}
      </div>

      {node.summary ? (
        <section className="paper-card-section">
          <h3 className="paper-card-section-title">summary</h3>
          <p className="paper-card-summary">{node.summary}</p>
        </section>
      ) : null}

      {extendsText ? (
        <section className="paper-card-section">
          <h3 className="paper-card-section-title">
            {isRoot ? "why it's the root" : "how it extends the parent"}
          </h3>
          <p className="paper-card-extends">{extendsText}</p>
        </section>
      ) : null}

      <section className="paper-card-section paper-card-abstract">
        <div className="paper-card-abstract-head">
          <h3 className="paper-card-section-title">abstract</h3>
          {isArxiv ? (
            <button
              type="button"
              className="paper-card-abstract-toggle"
              onClick={handleLoadAbstract}
              disabled={abstractLoading}
              aria-expanded={showAbstract}
            >
              {abstractLoading
                ? "loading..."
                : hasAbstract
                  ? abstractExpanded
                    ? "hide"
                    : "show"
                  : "load from arXiv"}
            </button>
          ) : null}
        </div>
        {!isArxiv ? (
          <p className="paper-card-abstract-empty">
            {ident
              ? `no arXiv id on this paper (${ident}) — can't fetch an abstract automatically.`
              : "no arXiv id on this paper — can't fetch an abstract automatically."}
          </p>
        ) : abstractLoading ? (
          <div className="paper-card-abstract-loading" role="status">
            <span className="paper-card-abstract-dot" />
            <span className="paper-card-abstract-dot" />
            <span className="paper-card-abstract-dot" />
            <span>fetching from export.arxiv.org...</span>
          </div>
        ) : showAbstract && hasAbstract ? (
          <p className="paper-card-abstract-body">{node.abstract}</p>
        ) : isArxiv ? (
          <p className="paper-card-abstract-empty">
            pulls the official abstract directly from arXiv so you can verify the paper is
            actually about what we said it is.
          </p>
        ) : null}
      </section>

      <section className="paper-card-section paper-card-links">
        <h3 className="paper-card-section-title">find it</h3>
        <ul className="paper-card-link-list">
          {isArxiv ? (
            <>
              <li>
                <a
                  className="paper-card-link"
                  href={arxivPdfUrl(ident)}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Open PDF on arXiv →
                </a>
              </li>
              <li>
                <a
                  className="paper-card-link"
                  href={arxivAbsUrl(ident)}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  arXiv abstract page <code>{ident.replace(/^arxiv:/i, "").replace(/v\d+$/i, "")}</code> →
                </a>
              </li>
            </>
          ) : identUrl ? (
            <li>
              <a
                className="paper-card-link"
                href={identUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                Open {identKind}: <code>{ident}</code> →
              </a>
            </li>
          ) : (
            <li className="paper-card-link paper-card-link--muted">
              no arXiv id or DOI on this paper
            </li>
          )}
          <li>
            <a
              className="paper-card-link"
              href={semanticScholarUrl(node.title)}
              target="_blank"
              rel="noreferrer noopener"
            >
              Search on Semantic Scholar →
            </a>
          </li>
          <li>
            <a
              className="paper-card-link"
              href={`https://scholar.google.com/scholar?q=${encodeURIComponent(node.title)}`}
              target="_blank"
              rel="noreferrer noopener"
            >
              Search on Google Scholar →
            </a>
          </li>
        </ul>
      </section>

      <section className="paper-card-section paper-card-build-it">
        <ResearchChallengesPanel
          paperId={node.id || node.title}
          challenges={node.challenges}
          onGenerate={onGenerateChallenges}
          generating={challengesGenerating}
        />
      </section>
    </aside>
  );
}
