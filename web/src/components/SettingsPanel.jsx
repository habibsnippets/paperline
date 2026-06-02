import { useEffect, useRef, useState } from "react";
import {
  AVAILABLE_MODELS,
  getModel,
  getToken,
  setModel,
  setToken,
} from "../utils/hfApi";

export default function SettingsPanel({ open, onClose, onSaved }) {
  // these initializers run on mount; App.jsx remounts this panel via `key`
  // each time `open` toggles, so we always read fresh values from storage.
  const [token, setTokenState] = useState(() => getToken());
  const [model, setModelState] = useState(() => getModel());
  const [reveal, setReveal] = useState(false);
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
