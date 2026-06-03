export default function StudyGuidePanel({
  paper,
  guide,
  status,
  paperId,
  onGenerate,
  onClose,
}) {
  return (
    <div className="study-guide-overlay" onClick={onClose}>
      <div className="study-guide-panel" onClick={(e) => e.stopPropagation()}>
        <button className="study-guide-panel__close" onClick={onClose}>
          ✕
        </button>
        <h2 className="study-guide-panel__title">
          Study Guide: {paper?.title?.length > 60 ? paper.title.slice(0, 58) + "…" : paper?.title}
        </h2>
        {status === "loading" && (
          <div className="study-guide-panel__loading loading-shimmer">
            Generating study guide...
          </div>
        )}
        {status === "error" && (
          <div className="study-guide-panel__error">
            <p>Failed to generate study guide.</p>
            <button className="challenge-generate-btn" onClick={onGenerate}>
              Retry
            </button>
          </div>
        )}
        {!guide && status === "idle" && (
          <div className="study-guide-panel__empty">
            <p>No study guide yet. Generate one to get a reading brief.</p>
            <button className="challenge-generate-btn" onClick={onGenerate}>
              Generate Study Guide
            </button>
          </div>
        )}
        {guide && (
          <div className="study-guide-panel__content">
            <section className="study-guide-section">
              <h3>
                <span className="study-guide-section__icon">📌</span>
                Must Understand
              </h3>
              <ul>
                {(guide.must_understand || []).map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </section>
            <section className="study-guide-section">
              <h3>
                <span className="study-guide-section__icon">⏭️</span>
                Skip These
              </h3>
              <ul>
                {(guide.skip_these || []).map((item, i) => (
                  <li key={i}>
                    <strong>{item.section}</strong> — {item.reason}
                  </li>
                ))}
              </ul>
            </section>
            <section className="study-guide-section">
              <h3>
                <span className="study-guide-section__icon">🛠️</span>
                Implement This
              </h3>
              {guide.implement_this && (
                <div className="study-guide-implement">
                  <p>{guide.implement_this.description}</p>
                  <div className="study-guide-implement__meta">
                    <span>Why: {guide.implement_this.why}</span>
                    <span>
                      ~{guide.implement_this.estimated_lines || "?"} lines
                    </span>
                    {guide.implement_this.colab_feasible && (
                      <span className="study-guide-implement__colab">
                        ✓ Colab-friendly
                      </span>
                    )}
                  </div>
                </div>
              )}
            </section>
            <section className="study-guide-section">
              <h3>
                <span className="study-guide-section__icon">🧠</span>
                Mental Model
              </h3>
              <p className="study-guide-mental">{guide.mental_model}</p>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
