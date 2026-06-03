import { useEffect, useRef, useState } from "react";
import {
  AVAILABLE_MODELS,
  getModel,
  getToken,
  setModel,
  setToken,
} from "../utils/hfApi";
import { isPremium, setPremium } from "../utils/premium";

export default function SettingsPanel({ open, onClose, onSaved }) {
  // these initializers run on mount; App.jsx remounts this panel via `key`
  // each time `open` toggles, so we always read fresh values from storage.
  const [token, setTokenState] = useState(() => getToken());
  const [model, setModelState] = useState(() => getModel());
  const [reveal, setReveal] = useState(false);
  const [premium, setPremiumState] = useState(() => isPremium());
  const tokenRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    // focus the token field shortly after opening
    const id = setTimeout(() => tokenRef.current?.focus(), 40);
    return () => clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function save(e) {
    e?.preventDefault?.();
    setToken(token.trim());
    setModel(model);
    onSaved?.({ token: token.trim(), model });
    onClose?.();
  }

  function clear() {
    setTokenState("");
    setToken("");
  }

  function togglePremium() {
    const next = !premium;
    setPremium(next);
    setPremiumState(next);
  }

  if (!open) return null;

  return (
    <div
      className="settings-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="settings"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <form className="settings-panel" onSubmit={save}>
        <header className="settings-head">
          <h2>settings</h2>
          <button
            type="button"
            className="settings-close"
            onClick={onClose}
            aria-label="close settings"
          >
            x
          </button>
        </header>

        <div className="settings-body">
          <label className="settings-field">
            <span className="settings-label">Hugging Face access token</span>
            <span className="settings-hint">
              We talk to HF Inference Providers (OpenAI-compatible) from your browser.
              Your token is stored in <code>localStorage</code> only — it never leaves this device
              except to call <code>router.huggingface.co</code>. Create a free token at{" "}
              <a
                href="https://huggingface.co/settings/tokens"
                target="_blank"
                rel="noopener noreferrer"
              >
                huggingface.co/settings/tokens
              </a>{" "}
              (a <em>Read</em> token is enough).
            </span>
            <div className="settings-token-row">
              <input
                ref={tokenRef}
                className="settings-input"
                type={reveal ? "text" : "password"}
                value={token}
                placeholder="hf_..."
                spellCheck="false"
                autoComplete="off"
                onChange={(e) => setTokenState(e.target.value)}
              />
              <button
                type="button"
                className="settings-mini-btn"
                onClick={() => setReveal((r) => !r)}
                aria-label={reveal ? "hide token" : "show token"}
              >
                {reveal ? "hide" : "show"}
              </button>
              <button
                type="button"
                className="settings-mini-btn"
                onClick={clear}
                disabled={!token}
              >
                clear
              </button>
            </div>
          </label>

          <label className="settings-field">
            <span className="settings-label">model</span>
            <span className="settings-hint">
              Bigger instruct models give better academic recall but cost more tokens.
            </span>
            <select
              className="settings-input"
              value={model}
              onChange={(e) => setModelState(e.target.value)}
            >
              {AVAILABLE_MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          <div className="settings-section">
            <span className="settings-label">plan</span>
            <div className="settings-plan">
              <div className="settings-plan-info">
                <span className={`settings-plan-badge${premium ? " settings-plan-badge--premium" : ""}`}>
                  {premium ? "premium" : "free"}
                </span>
                <div className="settings-plan-features">
                  {premium ? (
                    <>
                      <span>unlimited depth (up to 5 generations)</span>
                      <span>wider fan-out (up to 5 children per node)</span>
                      <span>PDF &amp; BibTeX export</span>
                      <span>cloud save coming soon</span>
                    </>
                  ) : (
                    <>
                      <span>depth up to 3 generations</span>
                      <span>up to 3 children per node</span>
                      <span>JSON, PNG &amp; link export</span>
                      <span>5 saved trees (cloud save — coming soon)</span>
                    </>
                  )}
                </div>
              </div>
              {!premium ? (
                <button type="button" className="settings-btn settings-btn--premium" onClick={togglePremium}>
                  upgrade to premium
                </button>
              ) : (
                <button type="button" className="settings-btn settings-btn--ghost" onClick={togglePremium}>
                  downgrade to free
                </button>
              )}
            </div>
          </div>
        </div>

        <footer className="settings-foot">
          <button type="button" className="settings-btn settings-btn--ghost" onClick={onClose}>
            cancel
          </button>
          <button type="submit" className="settings-btn">
            save
          </button>
        </footer>
      </form>
    </div>
  );
}
