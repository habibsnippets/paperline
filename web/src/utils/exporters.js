// Export helpers: JSON, PNG, and a shareable URL.
// All client-side, no server required.

const SVG_NS = "http://www.w3.org/2000/svg";

// ---------- JSON ----------

// Strip the private _childStatus field; keep everything that's a paper attribute.
function cleanForExport(node) {
  if (!node) return null;
  const out = {
    id: node.id,
    title: node.title,
    authors: node.authors || [],
    year: node.year ?? null,
    venue: node.venue || "",
    arxivOrDoi: node.arxivOrDoi || "",
    summary: node.summary || "",
    whyRoot: node.whyRoot || "",
    howExtends: node.howExtends || "",
    abstract: node.abstract || "",
    importance: node.importance ?? null,
    importanceReason: node.importanceReason || "",
    recommendedChildId: node.recommendedChildId ?? null,
    generation: node.generation ?? 0,
  };
  if (node.children?.length) {
    out.children = node.children.map(cleanForExport);
  } else {
    out.children = [];
  }
  return out;
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60) || "tree";
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}`
  );
}

export function buildJsonExport({ topic, tree, rootStack = [] }) {
  return {
    topic: topic || "",
    exportedAt: new Date().toISOString(),
    root: cleanForExport(tree),
    pivotHistory: rootStack
      .map((r) => (r?.tree ? cleanForExport(r.tree) : null))
      .filter(Boolean),
  };
}

export function downloadJson(payload, filename) {
  const text = JSON.stringify(payload, null, 2);
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  triggerDownload(url, filename);
}

export function jsonFilename(topic) {
  return `paperlineage-${slugify(topic)}-${timestamp()}.json`;
}

// ---------- Shareable URL ----------

export function getShareUrl(topic) {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("topic", topic || "");
  return url.toString();
}

export function readTopicFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("topic") || "";
  } catch {
    return "";
  }
}

export function writeTopicToUrl(topic, { replace = true } = {}) {
  try {
    const url = new URL(window.location.href);
    if (topic) url.searchParams.set("topic", topic);
    else url.searchParams.delete("topic");
    if (replace) window.history.replaceState({}, "", url);
    else window.history.pushState({}, "", url);
  } catch {
    /* ignore */
  }
}

export async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through */
    }
  }
  // Fallback for non-secure contexts
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return true;
  } catch {
    return false;
  }
}

// ---------- PNG (rasterize the live SVG) ----------

const STYLE_PROPS = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-opacity",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "letter-spacing",
  "text-anchor",
  "text-transform",
  "dominant-baseline",
  "opacity",
  "filter",
  "paint-order",
];

function inlineComputedStyles(srcSvg, dstSvg) {
  const srcAll = srcSvg.querySelectorAll("*");
  const dstAll = dstSvg.querySelectorAll("*");
  // Walk trees in lockstep — querySelectorAll returns depth-first order
  // and both should match because we cloned the structure verbatim.
  for (let i = 0; i < srcAll.length && i < dstAll.length; i++) {
    const cs = getComputedStyle(srcAll[i]);
    for (const p of STYLE_PROPS) {
      const v = cs.getPropertyValue(p);
      if (v && v !== "none" && v !== "normal" && v !== "" && v !== "auto") {
        dstAll[i].setAttribute(p, v);
      }
    }
    // Remove class so the inlined attrs win; keep class name in data- for debug
    const cls = dstAll[i].getAttribute("class");
    if (cls) dstAll[i].setAttribute("data-cls", cls);
    dstAll[i].removeAttribute("class");
  }
}

function buildExportSvg(srcSvg) {
  // 1. Read the tree-bounds computed by PaperTree from a data attribute.
  //    These are the exact D3 layout bounds (no transform applied) so they
  //    give us the full extent of the tree at 1:1 scale.
  let bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 1, height: 1 };
  try {
    const raw = srcSvg.getAttribute("data-paper-tree-bounds");
    if (raw && raw !== "null") bounds = JSON.parse(raw);
  } catch { /* ignore */ }

  const PAD = 60;
  const bx = Math.max(0, bounds.minX - PAD);
  const by = Math.max(0, bounds.minY - PAD);
  const bw = Math.max(1, Math.ceil(bounds.width + PAD * 2));
  const bh = Math.max(1, Math.ceil(bounds.height + PAD * 2));

  // 2. Clone and set XML namespaces.
  const clone = srcSvg.cloneNode(true);
  clone.setAttribute("xmlns", SVG_NS);
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

  // 3. Inline computed styles so the clone is self-contained. Must happen
  //    BEFORE any structural changes so the lockstep walk stays in sync.
  inlineComputedStyles(srcSvg, clone);

  // 4. Strip the D3 zoom transform from the content group so nodes render
  //    at their natural coordinates (the viewBox below will frame them).
  const cloneG = clone.querySelector("g[transform]");
  if (cloneG) cloneG.removeAttribute("transform");

  // 5. Remove the full-container pattern background rect — it's sized to
  //    the viewport container, not the tree, and would throw off rendering.
  const allRects = clone.querySelectorAll("rect");
  for (const r of allRects) {
    const fill = r.getAttribute("fill") || "";
    if (fill.startsWith("url(#paperGrid") || fill === "url(#paperGrid)") {
      r.remove();
      break;
    }
  }

  // 6. Add a solid background rect covering the export area.
  const bg = document.createElementNS(SVG_NS, "rect");
  bg.setAttribute("x", String(bx));
  bg.setAttribute("y", String(by));
  bg.setAttribute("width", String(bw));
  bg.setAttribute("height", String(bh));
  bg.setAttribute("fill", "#0a0d14");
  clone.insertBefore(bg, clone.firstChild);

  // 7. Set explicit dimensions and viewBox from the tree bounds + padding.
  clone.setAttribute("width", String(bw));
  clone.setAttribute("height", String(bh));
  clone.setAttribute("viewBox", `${bx} ${by} ${bw} ${bh}`);

  return { svg: clone, width: bw, height: bh };
}

function svgToPng(svgEl) {
  return new Promise((resolve, reject) => {
    const { svg, width, height } = buildExportSvg(svgEl);
    const xml = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      // 2x for crisp output
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("no 2d context"));
        return;
      }
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("canvas.toBlob returned null"));
          return;
        }
        resolve(blob);
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("svg image load failed"));
    };
    img.src = url;
  });
}

export async function downloadPng(svgEl, filename) {
  if (!svgEl) throw new Error("no svg to export");
  const blob = await svgToPng(svgEl);
  await downloadBlob(blob, filename);
}

export function pngFilename(topic) {
  return `paperlineage-${slugify(topic)}-${timestamp()}.png`;
}

// ---------- common ----------

function triggerDownload(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 2000);
}

async function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
}
