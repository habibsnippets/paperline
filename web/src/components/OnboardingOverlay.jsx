import { useState } from "react";

const STEPS = [
  {
    title: "Welcome to paperline",
    body: "Trace the intellectual ancestry of any research idea. We find the seminal root paper, then let you explore the work that built on it — one click at a time.",
  },
  {
    title: "Enter a Topic",
    body: 'Type any research topic (e.g. "Diffusion Models") and click "Dig the Grave". We\'ll use AI to find the foundational paper and build a citation tree.',
  },
  {
    title: "Explore the Tree",
    body: "Each node is a paper. Click the + button on any node to expand it and see which papers built on it. Pan and zoom using your mouse or touchpad.",
  },
  {
    title: "Paper Details",
    body: "Click any paper to open a detail panel. Read the AI-generated summary, see how it extends its parent, check its importance, and find links to arXiv, DOI, and Semantic Scholar.",
  },
  {
    title: "Save & Export",
    body: 'Star papers to save them to your reading list (persisted across sessions). Export the tree as JSON or PNG, or share a link to your current dig with collaborators.',
  },
];

export default function OnboardingOverlay({ onClose, onLoadDemo, onDismissForever }) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;

  return (
    <div
      className="onboarding-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="onboarding tour"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="onboarding-card">
        <div className="onboarding-steps">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`onboarding-dot ${i === step ? "onboarding-dot--active" : ""} ${i < step ? "onboarding-dot--done" : ""}`}
            />
          ))}
        </div>

        <h2 className="onboarding-title">{STEPS[step].title}</h2>
        <p className="onboarding-body">{STEPS[step].body}</p>

        <div className="onboarding-actions">
          {step > 0 ? (
            <button
              type="button"
              className="onboarding-btn onboarding-btn--ghost"
              onClick={() => setStep((s) => s - 1)}
            >
              back
            </button>
          ) : <div />}

          {isLast ? (
            <button
              type="button"
              className="onboarding-btn onboarding-btn--primary"
              onClick={onClose}
            >
              get started
            </button>
          ) : (
            <button
              type="button"
              className="onboarding-btn onboarding-btn--primary"
              onClick={() => setStep((s) => s + 1)}
            >
              next
            </button>
          )}
        </div>

        <div className="onboarding-foot">
          {isLast ? (
            <button
              type="button"
              className="onboarding-foot-btn"
              onClick={onLoadDemo}
            >
              try the demo tree instead
            </button>
          ) : null}

          <button
            type="button"
            className="onboarding-foot-btn"
            onClick={onDismissForever}
          >
            skip tour
          </button>
        </div>
      </div>
    </div>
  );
}
