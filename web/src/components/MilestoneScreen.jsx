export default function MilestoneScreen({
  readCount,
  totalPapers,
  onPickPath,
  onDismiss,
}) {
  const pct = totalPapers > 0 ? Math.round((readCount / totalPapers) * 100) : 0;

  return (
    <div className="milestone-overlay" onClick={onDismiss}>
      <div className="milestone-card" onClick={(e) => e.stopPropagation()}>
        <div className="milestone-card__icon">🎯</div>
        <h2 className="milestone-card__title">
          You've read {pct}% of your learning path
        </h2>
        <p className="milestone-card__subtitle">
          {readCount} of {totalPapers} papers complete. Time to decide your
          next direction:
        </p>
        <div className="milestone-card__choices">
          <button
            className="milestone-card__choice milestone-card__choice--mle"
            onClick={() => onPickPath("mle")}
          >
            <span className="milestone-card__choice-icon">⚙️</span>
            <span className="milestone-card__choice-label">
              MLE — Ship something that works
            </span>
            <span className="milestone-card__choice-desc">
              Production-grade implementations. Benchmark numbers for your resume.
            </span>
          </button>
          <button
            className="milestone-card__choice milestone-card__choice--research"
            onClick={() => onPickPath("research")}
          >
            <span className="milestone-card__choice-icon">🔬</span>
            <span className="milestone-card__choice-label">
              Research — Find something that doesn't work yet
            </span>
            <span className="milestone-card__choice-desc">
              Experiments, ablations, novel combinations. Conference-submittable
              directions.
            </span>
          </button>
        </div>
        <button className="milestone-card__dismiss" onClick={onDismiss}>
          Not yet — keep reading
        </button>
      </div>
    </div>
  );
}
