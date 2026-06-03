import { useState, useCallback, useEffect, useRef } from "react";

const ERA_OPTIONS = [
  {
    value: "origins",
    icon: "🏛️",
    title: "Origins",
    description: "The earliest foundational paper that introduced this concept, even if from decades ago.",
    yearRange: "~1950–2010",
  },
  {
    value: "inflection",
    icon: "⚡",
    title: "Inflection Point",
    description: "The paper that caused this field to transition from niche to widely-studied.",
    yearRange: "~2010–2020",
  },
  {
    value: "modern",
    icon: "🔥",
    title: "Modern",
    description: "The most important paper defining the current state of this research area.",
    yearRange: "2020+",
  },
];

export default function EraSelector({ topic, onSelect, onBack }) {
  const [selected, setSelected] = useState(null);
  const containerRef = useRef(null);

  const handleKeyDown = useCallback(
    (e) => {
      const idx = ERA_OPTIONS.findIndex((o) => o.value === selected);
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        const next = (idx + 1) % ERA_OPTIONS.length;
        setSelected(ERA_OPTIONS[next].value);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        const prev = (idx - 1 + ERA_OPTIONS.length) % ERA_OPTIONS.length;
        setSelected(ERA_OPTIONS[prev].value);
      } else if (e.key === "Enter" && selected) {
        e.preventDefault();
        onSelect(selected);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onBack();
      }
    },
    [selected, onSelect, onBack]
  );

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  return (
    <div className="idle">
      <div className="idle-inner">
        <h2 className="era-title">Where do you want to start digging?</h2>
        <p className="era-sub">
          For topic: <strong>{topic}</strong>
        </p>

        <div
          className="era-cards"
          ref={containerRef}
          tabIndex={0}
          role="radiogroup"
          aria-label="Era selection"
          onKeyDown={handleKeyDown}
        >
          {ERA_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`era-card${selected === opt.value ? " era-card--selected" : ""}`}
              role="radio"
              aria-checked={selected === opt.value}
              onClick={() => setSelected(opt.value)}
              onDoubleClick={() => onSelect(opt.value)}
            >
              <span className="era-card-icon" aria-hidden="true">{opt.icon}</span>
              <span className="era-card-title">{opt.title}</span>
              <span className="era-card-desc">{opt.description}</span>
              <span className="era-card-year">{opt.yearRange}</span>
            </button>
          ))}
        </div>

        <div className="era-actions">
          <button type="button" className="era-btn era-btn--ghost" onClick={onBack}>
            ← Back
          </button>
          <button
            type="button"
            className="era-btn era-btn--primary"
            disabled={!selected}
            onClick={() => onSelect(selected)}
          >
            Start Digging
          </button>
        </div>
      </div>
    </div>
  );
}
