import { useState } from "react";

const EXAMPLES = [
  "Vision Language Models",
  "Diffusion Models",
  "Transformers Attention",
  "RLHF",
  "Word Embeddings",
];

export default function SearchBar({ onSubmit, disabled, initialValue = "" }) {
  const [value, setValue] = useState(initialValue);

  function submit(e) {
    e?.preventDefault?.();
    const v = value.trim();
    if (!v || disabled) return;
    onSubmit?.(v);
  }

  return (
    <form className="searchbar" onSubmit={submit}>
      <label htmlFor="topic" className="visually-hidden">
        Research topic or paper title
      </label>
      <div className="searchbar-row">
        <input
          id="topic"
          className="searchbar-input"
          type="text"
          placeholder="Enter a research topic or paper title..."
          autoComplete="off"
          autoFocus
          spellCheck="false"
          value={value}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          type="submit"
          className="searchbar-button"
          disabled={disabled || !value.trim()}
        >
          <span>Dig the Grave</span>
          <span aria-hidden="true" className="searchbar-button-glyph">🪦</span>
        </button>
      </div>

      <div className="searchbar-examples">
        <span className="searchbar-examples-label">try —</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            className="searchbar-example"
            disabled={disabled}
            onClick={() => {
              setValue(ex);
              onSubmit?.(ex);
            }}
          >
            {ex}
          </button>
        ))}
      </div>
    </form>
  );
}
