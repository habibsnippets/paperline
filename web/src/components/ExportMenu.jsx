import { useEffect, useRef, useState } from "react";

export default function ExportMenu({
  disabled,
  onExportJson,
  onExportPng,
  onCopyLink,
  busy = null,
  premium = false,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const jsonRef = useRef(onExportJson);
  const pngRef = useRef(onExportPng);
  const linkRef = useRef(onCopyLink);
  useEffect(() => { jsonRef.current = onExportJson; }, [onExportJson]);
  useEffect(() => { pngRef.current = onExportPng; }, [onExportPng]);
  useEffect(() => { linkRef.current = onCopyLink; }, [onCopyLink]);

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
            onClick={() => { jsonRef.current?.(); setOpen(false); }}
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
            onClick={() => { pngRef.current?.(); setOpen(false); }}
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
            onClick={() => { linkRef.current?.(); setOpen(false); }}
          >
            <span className="export-menu-item-glyph" aria-hidden="true">⧉</span>
            <span className="export-menu-item-label">copy shareable link</span>
            <span className="export-menu-item-hint">encode topic in URL</span>
          </button>
          <div className="export-menu-sep" />
          <button
            type="button"
            className={`export-menu-item${!premium ? " export-menu-item--locked" : ""}`}
            role="menuitem"
            disabled={!premium}
            onClick={() => { setOpen(false); }}
          >
            <span className="export-menu-item-glyph" aria-hidden="true">⎔</span>
            <span className="export-menu-item-label">
              export as PDF
              {!premium ? <span className="premium-badge">premium</span> : null}
            </span>
            <span className="export-menu-item-hint">print-ready layout</span>
          </button>
          <button
            type="button"
            className={`export-menu-item${!premium ? " export-menu-item--locked" : ""}`}
            role="menuitem"
            disabled={!premium}
            onClick={() => { setOpen(false); }}
          >
            <span className="export-menu-item-glyph" aria-hidden="true">⊞</span>
            <span className="export-menu-item-label">
              export as BibTeX
              {!premium ? <span className="premium-badge">premium</span> : null}
            </span>
            <span className="export-menu-item-hint">citation entries</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
