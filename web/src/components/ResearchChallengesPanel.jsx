import { useState } from "react";

const DIFFICULTY_MAP = {
  easy: { label: "easy", className: "challenge-badge--easy" },
  medium: { label: "medium", className: "challenge-badge--medium" },
  hard: { label: "hard", className: "challenge-badge--hard" },
};

function DifficultyBadge({ level }) {
  const d = DIFFICULTY_MAP[level] || DIFFICULTY_MAP.medium;
  return <span className={`challenge-badge ${d.className}`}>{d.label}</span>;
}

export default function ResearchChallengesPanel({
  paperId,
  challenges,
  onGenerate,
  generating,
  children,
}) {
  const [expandedIdx, setExpandedIdx] = useState(null);

  if (generating) {
    return (
      <div className="research-challenges loading-shimmer">
        <div className="research-challenges__header">
          <span className="research-challenges__icon">🔨</span>
          <span>Build It — generating challenges...</span>
        </div>
      </div>
    );
  }

  if (!challenges || challenges.length === 0) {
    return (
      <div className="research-challenges">
        <div className="research-challenges__header">
          <span className="research-challenges__icon">🔨</span>
          <span>Build It — implementation challenges</span>
        </div>
        <button
          className="challenge-generate-btn"
          onClick={() => onGenerate(paperId)}
        >
          + Generate Challenges
        </button>
      </div>
    );
  }

  return (
    <div className="research-challenges">
      <div className="research-challenges__header">
        <span className="research-challenges__icon">🔨</span>
        <span>Build It — implementation challenges</span>
      </div>
      <div className="research-challenges__list">
        {challenges.map((ch, i) => (
          <div
            key={i}
            className={`challenge-card ${expandedIdx === i ? "challenge-card--expanded" : ""}`}
            onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
          >
            <div className="challenge-card__head">
              <DifficultyBadge level={ch.difficulty} />
              <span className="challenge-card__title">{ch.title}</span>
              <span className="challenge-card__hours">~{ch.estimated_hours}h</span>
              {expandedIdx === i ? (
                <span className="challenge-card__toggle">▲</span>
              ) : (
                <span className="challenge-card__toggle">▼</span>
              )}
            </div>
            {expandedIdx === i && (
              <div className="challenge-card__body">
                <p className="challenge-card__problem">{ch.problem_statement}</p>
                <p className="challenge-card__task">
                  <strong>Your task:</strong> {ch.your_task}
                </p>
                <div className="challenge-card__meta">
                  <div className="challenge-card__deliverable">
                    <strong>Deliverable:</strong> {ch.deliverable}
                  </div>
                  <div className="challenge-card__metric">
                    <strong>Success metric:</strong> {ch.success_metric}
                  </div>
                  {ch.hint && (
                    <div className="challenge-card__hint">
                      <strong>Hint:</strong> {ch.hint}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      {children}
    </div>
  );
}
