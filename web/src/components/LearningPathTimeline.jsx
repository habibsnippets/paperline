export default function LearningPathTimeline({
  path,
  status,
  error,
  readIds,
  selectedPaper,
  onSelect,
  onGenerate,
  onOpenProjectPicker,
}) {
  if (status === "loading") {
    return (
      <div className="learning-path-bar loading-shimmer">
        <div className="learning-path-bar__inner">
          Generating learning path from tree...
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="learning-path-bar learning-path-bar--error">
        <div className="learning-path-bar__inner">
          <span>Failed to generate path: {error}</span>
          <button className="challenge-generate-btn" onClick={onGenerate}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!path || path.length === 0) {
    return (
      <div className="learning-path-bar learning-path-bar--idle">
        <div className="learning-path-bar__inner">
          <span>📖 Build your reading path from this tree</span>
          <button className="challenge-generate-btn" onClick={onGenerate}>
            Generate Learning Path
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="learning-path-bar learning-path-bar--active">
      <div className="learning-path-bar__scroll">
        {path.map((node, i) => {
          const isSelected = selectedPaper === node.paper_title;
          const isRead = readIds.has(node.paper_title);
          return (
            <div
              key={i}
              className={`learning-path-node ${isSelected ? "learning-path-node--selected" : ""} ${isRead ? "learning-path-node--read" : ""}`}
              onClick={() => onSelect(node.paper_title)}
            >
              <div className="learning-path-node__dot">
                {isRead ? "✓" : i + 1}
              </div>
              <div className="learning-path-node__label">
                {node.paper_title.length > 30
                  ? node.paper_title.slice(0, 28) + "…"
                  : node.paper_title}
              </div>
              <div className="learning-path-node__year">{node.paper_year}</div>
            </div>
          );
        })}
      </div>
      <div className="learning-path-bar__actions">
        <button
          type="button"
          className="learning-path-projects-btn"
          onClick={onOpenProjectPicker}
          title="generate MLE or Research projects"
        >
          🎯 Projects
        </button>
      </div>
    </div>
  );
}
