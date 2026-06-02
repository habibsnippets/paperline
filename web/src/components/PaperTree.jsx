import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { hasWarnings, warningLabelsFor } from "../utils/validation";
import { getRecommendedChildIds, getRecommendedPathEdges } from "../utils/treeHelpers";

const NODE_DIMS = {
  0: { w: 300, h: 110, r: 14 },
  1: { w: 250, h: 92, r: 12 },
  2: { w: 210, h: 76, r: 10 },
};

function dimsFor(gen) {
  return NODE_DIMS[gen] ?? NODE_DIMS[2];
}

function truncate(text, max) {
  if (!text) return "";
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

// Diagonal connector between two points for top-down tree.
function diagonal(s, t) {
  const my = (s.y + t.y) / 2;
  return `M${s.x},${s.y} C${s.x},${my} ${t.x},${my} ${t.x},${t.y}`;
}

export default function PaperTree({
  root,
  expanded,
  loadingChildId,
  maxDepth = 2,
  onExpand,
  onSelect,
  onToggleStar,
  isStarred,
  selectedId,
  svgRef,
  onExpandAll,
  onCollapseAll,
  onOpenToDepth,
  zoomLocked = false,
  onToggleZoomLock,
  showBestPath = true,
  onToggleBestPath,
}) {
  const containerRef = useRef(null);
  const gRef = useRef(null);
  const zoomRef = useRef(null);
  // per-node refs so keyboard nav can move focus programmatically
  const nodeRefs = useRef(new Map());

  const [hoverEdgeId, setHoverEdgeId] = useState(null);
  const [transform, setTransform] = useState(d3.zoomIdentity);
  const [size, setSize] = useState({ w: 1200, h: 700 });
  // which node's "how it extends" popover is open. Only one at a time.
  const [infoOpenId, setInfoOpenId] = useState(null);
  // which node's "validation warnings" popover is open. Only one at a time.
  const [warnOpenId, setWarnOpenId] = useState(null);
  // which node's "why is this on the recommended path" popover is open.
  const [bestPathOpenId, setBestPathOpenId] = useState(null);

  // observe container size
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const { width, height } = e.contentRect;
        if (width > 0 && height > 0) setSize({ w: width, h: height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // close popovers on Escape (in addition to whatever's in App-level handlers)
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") {
        setInfoOpenId(null);
        setWarnOpenId(null);
        setBestPathOpenId(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // build hierarchy + layout
  const { nodes, links, bounds, isRootAlone, nodeById, bestPathEdgeSet, recommendedChildIdSet } = useMemo(() => {
    if (!root) {
      return {
        nodes: [],
        links: [],
        bounds: null,
        isRootAlone: true,
        nodeById: new Map(),
        bestPathEdgeSet: new Set(),
        recommendedChildIdSet: new Set(),
      };
    }

    // D3 uses the children accessor to decide which subtree to lay out.
    // We hide subtrees whose parent is not in the `expanded` set.
    const h = d3.hierarchy(root, (d) => (expanded.has(d.id) ? d.children : null));

    // node spacing tuned so wide gen-2 fans don't overlap
    const horizGap = 50;
    const vertGap = 200;
    const tree = d3
      .tree()
      .nodeSize([
        Math.max(dimsFor(2).w, 0) + horizGap,
        vertGap,
      ])
      .separation((a, b) => (a.parent === b.parent ? 1 : 1.3));
    tree(h);

    const allNodes = h.descendants();
    const allLinks = h.links();
    const byId = new Map();
    for (const n of allNodes) byId.set(n.data.id, n);

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const n of allNodes) {
      const dims = dimsFor(n.depth);
      minX = Math.min(minX, n.x - dims.w / 2);
      maxX = Math.max(maxX, n.x + dims.w / 2);
      minY = Math.min(minY, n.y - dims.h / 2);
      maxY = Math.max(maxY, n.y + dims.h / 2);
    }
    if (!isFinite(minX)) {
      minX = 0;
      maxX = 0;
      minY = 0;
      maxY = 0;
    }

    // Best-path data: a Set of "sourceId>targetId" edge ids (matches the
    // regular edge-id format), and a Set of node ids that are the LLM's
    // recommended child of their parent. We compute the path edges from the
    // raw tree (not the d3 hierarchy) because getRecommendedPathEdges
    // walks via `recommendedChildId` which isn't on d3 nodes.
    const recEdges = getRecommendedPathEdges(root);
    const bestPathEdgeSet = new Set(
      recEdges.map((e) => `${e.sourceId}>${e.targetId}`)
    );
    const recommendedChildIdSet = getRecommendedChildIds(root);

    return {
      nodes: allNodes,
      links: allLinks,
      bounds: { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY },
      isRootAlone: allNodes.length === 1,
      nodeById: byId,
      bestPathEdgeSet,
      recommendedChildIdSet,
    };
  }, [root, expanded]);

  // attach zoom behaviour once
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const zoom = d3
      .zoom()
      .scaleExtent([0.15, 2.5])
      .filter((event) => {
        if (zoomLocked) return false;
        if (event.type === "wheel") return true;
        if (event.type === "dblclick") return true;
        if (event.type === "mousedown" || event.type === "touchstart") {
          const target = event.target;
          if (target.closest && target.closest("[data-node]")) return false;
          return true;
        }
        return true;
      })
      .on("zoom", (event) => setTransform(event.transform));
    zoom(svg);
    zoomRef.current = zoom;
    return () => {
      svg.on(".zoom", null);
    };
  }, [zoomLocked, svgRef]);

  // fit-to-content on first render of a new tree, or when the root is alone
  const lastFitKey = useRef(null);
  useEffect(() => {
    if (!bounds || !svgRef.current || !zoomRef.current) return;
    const key = root?.id;
    if (lastFitKey.current === key && !isRootAlone) return;
    if (lastFitKey.current === key && expanded.size > 0) return;
    lastFitKey.current = key;

    // If only the root is on screen, center it and don't shrink to fit
    if (isRootAlone) {
      const tx = size.w / 2;
      const ty = (size.h - dimsFor(0).h) / 2;
      const t = d3.zoomIdentity.translate(tx, ty);
      d3.select(svgRef.current).transition().duration(450).call(zoomRef.current.transform, t);
      return;
    }

    const pad = 70;
    const cx = (bounds.minX + bounds.maxX) / 2;
    const scale = Math.min(
      1,
      (size.w - pad * 2) / Math.max(bounds.width, 1),
      (size.h - pad * 2) / Math.max(bounds.height, 1)
    );
    const tx = size.w / 2 - cx * scale;
    const ty = pad - bounds.minY * scale;
    const t = d3.zoomIdentity.translate(tx, ty).scale(scale);
    d3.select(svgRef.current).transition().duration(450).call(zoomRef.current.transform, t);
  }, [bounds, root, size, expanded.size, isRootAlone, svgRef]);

  function resetView() {
    if (!svgRef.current || !zoomRef.current || !bounds) return;
    const pad = 70;
    const cx = (bounds.minX + bounds.maxX) / 2;
    const scale = Math.min(
      1,
      (size.w - pad * 2) / Math.max(bounds.width, 1),
      (size.h - pad * 2) / Math.max(bounds.height, 1)
    );
    const tx = size.w / 2 - cx * scale;
    const ty = pad - bounds.minY * scale;
    const t = d3.zoomIdentity.translate(tx, ty).scale(scale);
    d3.select(svgRef.current).transition().duration(450).call(zoomRef.current.transform, t);
  }

  function zoomBy(factor) {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).transition().duration(220).call(zoomRef.current.scaleBy, factor);
  }

  // Move keyboard focus to a given node by id, scrolling it into view if
  // needed. Used by the keyboard navigation handler below.
  function focusNode(id) {
    const el = nodeRefs.current.get(id);
    if (el) el.focus();
  }

  // Arrow-key / Enter / Space handler for tree nodes. Implements a small
  // subset of the WAI-ARIA tree pattern:
  //   ArrowDown  → next sibling-or-descendant (DFS)
  //   ArrowUp    → previous sibling-or-ancestor
  //   ArrowRight → expand if collapsed; otherwise first child
  //   ArrowLeft  → collapse if expanded; otherwise parent
  //   Home/End   → first / last node in DFS
  //   Enter/Space → select (delegated to the existing onClick handler via
  //                 a synthetic call to onSelect)
  function handleNodeKeyDown(e, data) {
    const node = nodeById.get(data.id);
    if (!node) return;

    // DFS ordering for ArrowUp / ArrowDown.
    const flat = nodes;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const idx = flat.indexOf(node);
      if (idx >= 0 && idx < flat.length - 1) focusNode(flat[idx + 1].data.id);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const idx = flat.indexOf(node);
      if (idx > 0) focusNode(flat[idx - 1].data.id);
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      if (flat.length) focusNode(flat[0].data.id);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      if (flat.length) focusNode(flat[flat.length - 1].data.id);
      return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const isExpanded = expanded.has(data.id);
      const hasChildren = data.children && data.children.length > 0;
      if (!isExpanded && hasChildren) {
        onExpand?.(data);
      } else if (isExpanded && node.children?.length) {
        focusNode(node.children[0].data.id);
      }
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      const isExpanded = expanded.has(data.id);
      if (isExpanded) {
        onExpand?.(data); // toggles to collapsed
      } else if (node.parent) {
        focusNode(node.parent.data.id);
      }
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect?.(data);
      return;
    }
  }

  // Click handler for the SVG background (empty canvas) — deselects.
  function handleBackgroundClick(e) {
    // Ignore clicks on nodes / controls (they stopPropagation already,
    // but defense in depth).
    if (e.target.closest && e.target.closest("[data-node]")) return;
    if (e.target.closest && e.target.closest("[data-tree-control]")) return;
    onSelect?.(null);
    setInfoOpenId(null);
    setWarnOpenId(null);
    setBestPathOpenId(null);
  }

  // Resolve the open popover nodes (null if the id isn't in the current
  // layout — e.g. the user collapsed the branch while the popover was open).
  const infoNode = infoOpenId ? nodeById.get(infoOpenId) : null;
  const warnNode = warnOpenId ? nodeById.get(warnOpenId) : null;
  const bestPathNode = bestPathOpenId ? nodeById.get(bestPathOpenId) : null;

  if (!root) return null;

  const transformStr = `translate(${transform.x},${transform.y}) scale(${transform.k})`;

  return (
    <div className={`paper-tree${zoomLocked ? " paper-tree--locked" : ""}`} ref={containerRef}>
      <svg
        ref={svgRef}
        className="paper-tree-svg"
        width={size.w}
        height={size.h}
        role="img"
        aria-label="paper lineage tree"
        data-paper-tree-svg="true"
        onClick={handleBackgroundClick}
      >
        <defs>
          <pattern id="paperGrid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path
              d="M32 0 L0 0 0 32"
              fill="none"
              stroke="rgba(180, 165, 130, 0.05)"
              strokeWidth="1"
            />
          </pattern>
          <filter id="rootGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="6" />
            <feOffset dy="2" result="off" />
            <feMerge>
              <feMergeNode in="off" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="bestPathGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
            <feFlood floodColor="#f0c878" floodOpacity="0.55" />
            <feComposite in2="SourceAlpha" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect x="0" y="0" width={size.w} height={size.h} fill="url(#paperGrid)" pointerEvents="none" />

        <g ref={gRef} transform={transformStr}>
          {/* edges first so nodes overlap them */}
          <g className="paper-tree-edges">
            {links.map((link) => {
              const srcDims = dimsFor(link.source.depth);
              const tgtDims = dimsFor(link.target.depth);
              const s = { x: link.source.x, y: link.source.y + srcDims.h / 2 };
              const t = { x: link.target.x, y: link.target.y - tgtDims.h / 2 };
              const id = `${link.source.data.id}->${link.target.data.id}`;
              const isHover = hoverEdgeId === id;
              const label = link.target.data.howExtends || "extends";
              const midX = (s.x + t.x) / 2;
              const midY = (s.y + t.y) / 2;
              return (
                <g
                  key={id}
                  className={`paper-tree-edge${isHover ? " paper-tree-edge--hover" : ""}`}
                  onMouseEnter={() => setHoverEdgeId(id)}
                  onMouseLeave={() => setHoverEdgeId((cur) => (cur === id ? null : cur))}
                >
                  <path className="paper-tree-edge-hit" d={diagonal(s, t)} />
                  <path className="paper-tree-edge-line" d={diagonal(s, t)} />
                  {isHover ? (
                    <g className="paper-tree-edge-label" transform={`translate(${midX},${midY})`}>
                      <rect
                        x={-Math.min(240, label.length * 3.6 + 20) / 2}
                        y={-16}
                        width={Math.min(240, label.length * 3.6 + 20)}
                        height={32}
                        rx={6}
                      />
                      <text textAnchor="middle" dy="0.34em">
                        {truncate(label, 64)}
                      </text>
                    </g>
                  ) : null}
                </g>
              );
            })}
          </g>

          {/* "best path" edges — a thin gold line that traces the LLM-picked
              recommended chain from root to leaf. Rendered after the regular
              edges (so it sits on top) but before the nodes (so the nodes
              cover the line's endpoints cleanly). */}
          {showBestPath ? (
            <g className="paper-tree-best-path-edges">
              {links
                .filter((link) => {
                  const id = `${link.source.data.id}>${link.target.data.id}`;
                  return bestPathEdgeSet.has(id);
                })
                .map((link) => {
                  const srcDims = dimsFor(link.source.depth);
                  const tgtDims = dimsFor(link.target.depth);
                  const s = { x: link.source.x, y: link.source.y + srcDims.h / 2 };
                  const t = { x: link.target.x, y: link.target.y - tgtDims.h / 2 };
                  const id = `${link.source.data.id}->${link.target.data.id}`;
                  return (
                    <path
                      key={id}
                      className="paper-tree-best-path-edge"
                      d={diagonal(s, t)}
                      filter="url(#bestPathGlow)"
                    />
                  );
                })}
            </g>
          ) : null}

          {/* nodes */}
          <g className="paper-tree-nodes">
            {nodes.map((node) => {
              const dims = dimsFor(node.depth);
              const data = node.data;
              const status = data._childStatus || "loaded";
              const isExpanded = expanded.has(data.id);
              const isMaxDepth = node.depth >= maxDepth;
              const isExpandable = !isMaxDepth;
              const isLoading = loadingChildId === data.id;
              // a node is a "leaf" visually if:
              //   - it has no children loaded (status pending or leaf)
              //   - OR it is at max depth
              const isLeaf = !isExpandable || status === "leaf";
              const isSelected = selectedId === data.id;
              // best path: is this node the LLM's recommended child of its
              // parent? (The root is on the path by default; the badge is
              // only shown for non-root nodes, since the root is implied.)
              const isOnBestPath =
                showBestPath &&
                node.depth > 0 &&
                recommendedChildIdSet.has(data.id);

              // Lines for body text (title wraps; meta stays single line)
              const titleLineHeight = node.depth === 0 ? 20 : 18;
              const titleMaxChars = node.depth === 0 ? 38 : node.depth === 1 ? 30 : 26;
              const title = truncate(data.title, titleMaxChars);

              const warnings = hasWarnings(data) ? warningLabelsFor(data) : [];
              const hasHowExtends = Boolean(data.howExtends || (node.depth === 0 && data.whyRoot));

              return (
                <g
                  key={data.id}
                  data-node="true"
                  className={
                    "paper-tree-node" +
                    ` paper-tree-node--gen${node.depth}` +
                    (isSelected ? " paper-tree-node--selected" : "") +
                    (isLeaf ? " paper-tree-node--leaf" : "") +
                    (isExpanded ? " paper-tree-node--expanded" : " paper-tree-node--collapsed") +
                    (isOnBestPath ? " paper-tree-node--best-path" : "")
                  }
                  transform={`translate(${node.x},${node.y})`}
                  ref={(el) => {
                    if (el) nodeRefs.current.set(data.id, el);
                    else nodeRefs.current.delete(data.id);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect?.(data);
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`${data.title}. ${data.authors?.[0] || "unknown"}, ${data.year || "n.d."}`}
                  onKeyDown={(e) => handleNodeKeyDown(e, data)}
                >
                  <rect
                    x={-dims.w / 2}
                    y={-dims.h / 2}
                    width={dims.w}
                    height={dims.h}
                    rx={dims.r}
                    className="paper-tree-node-bg"
                    filter={node.depth === 0 ? "url(#rootGlow)" : undefined}
                  />

                  {/* generation badge — top-left corner */}
                  <text
                    className="paper-tree-node-badge"
                    x={-dims.w / 2 + 12}
                    y={-dims.h / 2 + 14}
                    textAnchor="start"
                  >
                    {node.depth === 0 ? "ROOT" : `gen ${node.depth}`}
                  </text>

                  {/* best-path star — top-center. A small gold filled ★
                      marks this node as the LLM's recommended child of its
                      parent. Clicking opens the "why recommended" popover. */}
                  {isOnBestPath ? (
                    <g
                      className={`paper-tree-node-best-star${bestPathOpenId === data.id ? " paper-tree-node-best-star--open" : ""}`}
                      transform={`translate(0,${-dims.h / 2 + 6})`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setInfoOpenId(null);
                        setWarnOpenId(null);
                        setBestPathOpenId((cur) => (cur === data.id ? null : data.id));
                      }}
                      role="button"
                      tabIndex={-1}
                      aria-label="on the recommended path"
                      aria-expanded={bestPathOpenId === data.id}
                    >
                      <circle r={8} className="paper-tree-node-best-star-bg" />
                      <text textAnchor="middle" dy="0.36em" className="paper-tree-node-best-star-glyph">
                        ★
                      </text>
                    </g>
                  ) : null}

                  {/* star toggle — top-right corner */}
                  {onToggleStar ? (
                    <g
                      className={`paper-tree-node-star${isStarred?.(data) ? " paper-tree-node-star--on" : ""}`}
                      transform={`translate(${dims.w / 2 - 14},${-dims.h / 2 + 14})`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleStar?.(data);
                      }}
                      role="button"
                      tabIndex={-1}
                      aria-label={isStarred?.(data) ? "remove from reading list" : "save to reading list"}
                      aria-pressed={Boolean(isStarred?.(data))}
                    >
                      <circle r={10} className="paper-tree-node-star-bg" />
                      <text textAnchor="middle" dy="0.34em" className="paper-tree-node-star-glyph">
                        {isStarred?.(data) ? "★" : "☆"}
                      </text>
                    </g>
                  ) : null}

                  {/* info (how it extends the parent) — bottom-left corner */}
                  {hasHowExtends ? (
                    <g
                      className={`paper-tree-node-info${infoOpenId === data.id ? " paper-tree-node-info--open" : ""}`}
                      transform={`translate(${-dims.w / 2 + 14},${dims.h / 2 - 14})`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setWarnOpenId(null);
                        setBestPathOpenId(null);
                        setInfoOpenId((cur) => (cur === data.id ? null : data.id));
                      }}
                      role="button"
                      tabIndex={-1}
                      aria-label="how this paper extends its parent"
                      aria-expanded={infoOpenId === data.id}
                    >
                      <circle r={10} className="paper-tree-node-info-bg" />
                      <text textAnchor="middle" dy="0.36em" className="paper-tree-node-info-glyph">
                        i
                      </text>
                    </g>
                  ) : null}

                  {/* validation warning — bottom-right corner */}
                  {warnings.length > 0 ? (
                    <g
                      className={`paper-tree-node-warn${warnOpenId === data.id ? " paper-tree-node-warn--open" : ""}`}
                      transform={`translate(${dims.w / 2 - 14},${dims.h / 2 - 14})`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setInfoOpenId(null);
                        setBestPathOpenId(null);
                        setWarnOpenId((cur) => (cur === data.id ? null : data.id));
                      }}
                      role="button"
                      tabIndex={-1}
                      aria-label={`${warnings.length} potential issue${warnings.length === 1 ? "" : "s"} with this paper`}
                      aria-expanded={warnOpenId === data.id}
                    >
                      <circle r={10} className="paper-tree-node-warn-bg" />
                      <text textAnchor="middle" dy="0.36em" className="paper-tree-node-warn-glyph">
                        !
                      </text>
                    </g>
                  ) : null}

                  <text
                    className="paper-tree-node-title"
                    x={0}
                    y={-dims.h / 2 + (node.depth === 0 ? 50 : 42)}
                    textAnchor="middle"
                  >
                    {title.split("\n").map((line, i) => (
                      <tspan key={i} x={0} dy={i === 0 ? 0 : titleLineHeight}>
                        {line}
                      </tspan>
                    ))}
                  </text>

                  <text
                    className="paper-tree-node-meta"
                    x={0}
                    y={dims.h / 2 - 18}
                    textAnchor="middle"
                  >
                    {truncate(
                      `${data.authors?.[0] || "anon"}${data.authors?.length > 1 ? " et al." : ""}`,
                      34
                    )}
                    {data.year ? `  ·  ${data.year}` : ""}
                  </text>

                  {isLeaf && (isExpanded || node.depth === 0) ? (
                    <text
                      className="paper-tree-node-leaftag"
                      x={0}
                      y={dims.h / 2 - 4}
                      textAnchor="middle"
                    >
                      no direct descendants found
                    </text>
                  ) : null}

                  {/* toggle: loading / expand / collapse. If this node is
                      the LLM-picked recommended child of its parent and
                      best path is on, the toggle gets a gold accent to
                      signal "expand this for the recommended next step". */}
                  {isExpandable ? (
                    <g
                      className={
                        `paper-tree-node-toggle` +
                        (isLoading ? " paper-tree-node-toggle--loading" : "") +
                        (isExpanded ? " paper-tree-node-toggle--open" : "") +
                        (isOnBestPath && !isExpanded ? " paper-tree-node-toggle--best" : "")
                      }
                      transform={`translate(0,${dims.h / 2 + 14})`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onExpand?.(data);
                      }}
                      role="button"
                      aria-label={
                        isLoading
                          ? "loading descendants"
                          : isExpanded
                            ? "collapse branch"
                            : "reveal descendants"
                      }
                    >
                      {isLoading ? (
                        <>
                          <circle r={12} className="paper-tree-node-toggle-bg" />
                          <g className="paper-tree-node-toggle-spinner">
                            <circle r={7} className="paper-tree-node-toggle-spinner-arc" />
                          </g>
                        </>
                      ) : (
                        <>
                          <rect
                            x={-44}
                            y={-10}
                            width={88}
                            height={20}
                            rx={10}
                            className="paper-tree-node-toggle-bg"
                          />
                          <text textAnchor="middle" dy="0.34em">
                            {isExpanded ? "− collapse" : "+ reveal"}
                          </text>
                        </>
                      )}
                    </g>
                  ) : null}
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      {/* info / warn popovers (HTML overlays positioned via the SVG transform) */}
      <Popover
        open={Boolean(infoNode && infoNode.data.id === infoOpenId)}
        node={infoNode}
        transform={transform}
        onClose={() => setInfoOpenId(null)}
        kind="info"
      >
        <div className="tree-popover-title">
          {infoNode?.data.id === infoOpenId && infoNode?.depth === 0
            ? "why it's the root"
            : "how it extends the parent"}
        </div>
        <div className="tree-popover-body">
          {infoNode?.data.whyRoot || infoNode?.data.howExtends}
        </div>
      </Popover>
      <Popover
        open={Boolean(warnNode && warnNode.data.id === warnOpenId)}
        node={warnNode}
        transform={transform}
        onClose={() => setWarnOpenId(null)}
        kind="warn"
      >
        <div className="tree-popover-title">possible issues</div>
        <ul className="tree-popover-list">
          {warnNode && warningLabelsFor(warnNode.data).map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
        <div className="tree-popover-foot">
          the LLM may have hallucinated. verify before citing.
        </div>
      </Popover>
      <Popover
        open={Boolean(bestPathNode && bestPathNode.data.id === bestPathOpenId)}
        node={bestPathNode}
        transform={transform}
        onClose={() => setBestPathOpenId(null)}
        kind="best"
      >
        <div className="tree-popover-title">on the recommended path</div>
        <div className="tree-popover-body">
          {bestPathNode?.data.importanceReason ||
            "Picked by the LLM as the next step that gives the most complete understanding of the topic."}
        </div>
        {bestPathNode?.data.importance ? (
          <div className="tree-popover-foot">
            importance: {bestPathNode.data.importance} / 5
          </div>
        ) : null}
      </Popover>

      {/* empty-canvas hint when only the root is on screen */}
      {nodes.length <= 1 ? (
        <div className="paper-tree-hint" aria-hidden="true">
          click the <span className="paper-tree-hint-glyph">+ reveal</span> badge on the root to
          uncover its descendants
        </div>
      ) : null}

      <div className="paper-tree-controls" role="group" aria-label="tree controls">
        <button
          type="button"
          onClick={() => zoomBy(1.25)}
          aria-label="zoom in"
          data-tree-control="true"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => zoomBy(0.8)}
          aria-label="zoom out"
          data-tree-control="true"
        >
          −
        </button>
        <button
          type="button"
          onClick={resetView}
          aria-label="reset view"
          data-tree-control="true"
        >
          ⤢
        </button>
      </div>

      {onOpenToDepth ? (
        <div className="paper-tree-expand-controls" role="group" aria-label="expand controls">
          <button
            type="button"
            onClick={onExpandAll}
            disabled={!onExpandAll}
            data-tree-control="true"
            title="expand every loaded node"
          >
            ⊞ all
          </button>
          <button
            type="button"
            onClick={onCollapseAll}
            data-tree-control="true"
            title="collapse every node"
          >
            ⊟ none
          </button>
          {[1, 2, 3].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onOpenToDepth(d)}
              disabled={d > maxDepth + 1}
              data-tree-control="true"
              title={d > maxDepth + 1 ? `exceeds current depth (${maxDepth})` : `open to generation ${d}`}
            >
              gen {d}
            </button>
          ))}
        </div>
      ) : null}

      {onToggleBestPath ? (
        <button
          type="button"
          className={`paper-tree-best-toggle${showBestPath ? " paper-tree-best-toggle--on" : ""}`}
          onClick={onToggleBestPath}
          aria-label={showBestPath ? "hide recommended path" : "show recommended path"}
          aria-pressed={showBestPath}
          title={showBestPath ? "hide recommended path" : "show recommended path"}
          data-tree-control="true"
        >
          <span aria-hidden="true">★</span>
          <span className="paper-tree-best-toggle-label">best path</span>
        </button>
      ) : null}

      <button
        type="button"
        className={`paper-tree-zoom-lock${zoomLocked ? " paper-tree-zoom-lock--on" : ""}`}
        onClick={onToggleZoomLock}
        aria-label={zoomLocked ? "unlock pan and zoom" : "lock pan and zoom"}
        aria-pressed={zoomLocked}
        title={zoomLocked ? "pan & zoom locked — click to unlock" : "lock pan & zoom"}
        data-tree-control="true"
      >
        {zoomLocked ? "🔒" : "🔓"}
      </button>
    </div>
  );
}

// Small HTML overlay positioned over an SVG node. The popover is anchored
// below the node and clamped to the container so long text stays readable.
function Popover({ open, node, transform, onClose, kind, children }) {
  if (!open || !node) return null;
  const x = node.x * transform.k + transform.x;
  const y = node.y * transform.k + transform.y;
  return (
    <div
      className={`tree-popover tree-popover--${kind}`}
      style={{
        left: `${x}px`,
        top: `${y}px`,
      }}
      role="dialog"
      aria-label={kind === "info" ? "paper detail" : "validation warnings"}
    >
      <button
        type="button"
        className="tree-popover-close"
        onClick={onClose}
        aria-label="close"
      >
        ×
      </button>
      {children}
    </div>
  );
}
