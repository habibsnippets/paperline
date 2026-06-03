export default function ProjectGenerationPanel({
  projects,
  status,
  projectPath,
  onDismiss,
}) {
  if (!projects && status === "idle") return null;

  return (
    <div className="projects-overlay" onClick={onDismiss}>
      <div className="projects-panel" onClick={(e) => e.stopPropagation()}>
        <button className="projects-panel__close" onClick={onDismiss}>
          ✕
        </button>
        <h2 className="projects-panel__title">
          {projectPath === "mle"
            ? "⚙️ MLE Path Projects"
            : "🔬 Research Path Projects"}
        </h2>
        <p className="projects-panel__subtitle">
          {projectPath === "mle"
            ? "Build production-grade implementations. Ship something that works."
            : "Run experiments and explore novel directions. Find something that doesn't work yet."}
        </p>
        {status === "loading" && (
          <div className="projects-panel__loading loading-shimmer">
            Generating project ideas from your reading path...
          </div>
        )}
        {status === "error" && (
          <div className="projects-panel__error">
            <p>Failed to generate projects. Try again.</p>
          </div>
        )}
        {projects && (
          <div className="projects-panel__list">
            {projects.map((proj, i) => (
              <div key={i} className="project-card">
                <div className="project-card__header">
                  <span className="project-card__badge">
                    {i < 2 ? "Mini Project" : "Capstone"}
                  </span>
                  <span className="project-card__time">
                    ~{proj.estimated_days} day{proj.estimated_days > 1 ? "s" : ""}
                  </span>
                </div>
                <h3 className="project-card__title">{proj.title}</h3>
                <p className="project-card__tagline">{proj.tagline}</p>
                <div className="project-card__papers">
                  <strong>Papers used:</strong>{" "}
                  {(proj.papers_used || []).join(", ")}
                </div>
                <div className="project-card__section">
                  <strong>What you build:</strong>
                  <p>{proj.what_you_build}</p>
                </div>
                <div className="project-card__section">
                  <strong>Deliverable:</strong>{" "}
                  <span>{proj.deliverable}</span>
                </div>
                <div className="project-card__section">
                  <strong>Success metric:</strong>{" "}
                  <span>{proj.success_metric}</span>
                </div>
                {proj.stretch_goal && (
                  <div className="project-card__section project-card__stretch">
                    <strong>Stretch goal:</strong>{" "}
                    <span>{proj.stretch_goal}</span>
                  </div>
                )}
                <div className="project-card__section">
                  <strong>Colab setup:</strong>{" "}
                  <span>{proj.colab_setup}</span>
                </div>
                <div className="project-card__resume">
                  <strong>Resume bullet:</strong>{" "}
                  <code>{proj.resume_bullet}</code>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
