import { useEffect, useRef, useState } from "react";

export default function ExportMenu({
  disabled,
  onExportJson,
  onExportPng,
  onCopyLink,
  busy = null, // "json" | "png" | "link" | null
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onMouse(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onMouse);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onMouse);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function handle(action) {
    setOpen(false);
    action?.();
  }

  return (
    <div className="export-menu" ref={rootRef}>
      <button
        type="button"
        className="topbar-btn"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        title="export / share"
      >
        <span aria-hidden="true">↗</span> export
      </button>
      {open ? (
        <div className="export-menu-pop" role="menu">
          <button
            type="button"
            className="export-menu-item"
            role="menuitem"
            disabled={disabled || busy === "json"}
            onClick={() => handle(onExportJson)}
          >
            <span className="export-menu-item-glyph" aria-hidden="true">⌗</span>
            <span className="export-menu-item-label">download as JSON</span>
            <span className="export-menu-item-hint">tree + history</span>
          </button>
          <button
            type="button"
            className="export-menu-item"
            role="menuitem"
            disabled={disabled || busy === "png"}
            onClick={() => handle(onExportPng)}
          >
            <span className="export-menu-item-glyph" aria-hidden="true">▣</span>
            <span className="export-menu-item-label">download as PNG</span>
            <span className="export-menu-item-hint">current view, 2×</span>
          </button>
          <button
            type="button"
            className="export-menu-item"
            role="menuitem"
            disabled={disabled || busy === "link"}
            onClick={() => handle(onCopyLink)}
          >
            <span className="export-menu-item-glyph" aria-hidden="true">⧉</span>
            <span className="export-menu-item-label">copy shareable link</span>
            <span className="export-menu-item-hint">encode topic in URL</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
