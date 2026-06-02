// D3-based horizontal collapsible citation tree.
// Exposes a global `Viz` namespace.

(function () {
  const NODE_RADIUS_BASE = 6;
  const LABEL_OFFSET = 12;
  const LEVEL_WIDTH = 540;          // horizontal distance between generations
  const NODE_VERTICAL_GAP = 110;    // baseline vertical gap between siblings
  const ANIM_MS = 380;

  let svg, gRoot, gLinks, gLabels, gNodes;
  let zoomBehavior;
  let width = 800, height = 600;
  let layout;                       // d3.tree
  let hierarchy = null;             // d3.hierarchy root
  let onSelect = () => {};
  let onExpandRequest = () => {};   // user requested loading more
  let selectedId = null;
  let tooltipEl;

  // counter used to assign stable ids when d3 needs them
  let _idCounter = 0;

  function init({ selector, onSelectNode, onLoadMore }) {
    onSelect = onSelectNode || (() => {});
    onExpandRequest = onLoadMore || (() => {});

    svg = d3.select(selector);
    svg.selectAll("*").remove();

    // root group affected by zoom. Rendering order (bottom-up): links →
    // link labels → nodes, so node circles sit above their labels.
    gRoot = svg.append("g").attr("class", "viewport");
    gLinks = gRoot.append("g").attr("class", "links");
    gLabels = gRoot.append("g").attr("class", "link-labels");
    gNodes = gRoot.append("g").attr("class", "nodes");

    // tooltip element (singleton)
    if (!tooltipEl) {
      tooltipEl = document.createElement("div");
      tooltipEl.className = "tooltip";
      document.body.appendChild(tooltipEl);
    }

    zoomBehavior = d3
      .zoom()
      .scaleExtent([0.15, 3])
      .on("zoom", (ev) => gRoot.attr("transform", ev.transform));
    svg.call(zoomBehavior);

    // Double-click on empty area = reset zoom
    svg.on("dblclick.zoom", null); // disable default
    svg.on("dblclick", (ev) => {
      if (ev.target === svg.node()) resetView();
    });

    resize();
    window.addEventListener("resize", resize);
  }

  function resize() {
    if (!svg) return;
    const node = svg.node();
    if (!node) return;
    const rect = node.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    // (Re)create layout sized for current viewport. Actual size is virtual
    // because we let the SVG scale; we just need internal proportions.
    layout = d3.tree().nodeSize([NODE_VERTICAL_GAP, LEVEL_WIDTH]);
    if (hierarchy) update(hierarchy, /* center */ true);
  }

  function clear() {
    hierarchy = null;
    selectedId = null;
    if (gNodes) gNodes.selectAll("*").remove();
    if (gLinks) gLinks.selectAll("*").remove();
  }

  /**
   * Render a tree from our internal TreeNode shape.
   * Children at depth > 1 start collapsed so the initial view is readable.
   */
  function render(rootNode) {
    if (!svg) return;
    // Re-measure now that the SVG may have just become visible.
    resize();
    hierarchy = d3.hierarchy(rootNode, (d) => d.children);

    // Stable id per d3 node
    hierarchy.each((d) => {
      if (d.data && d.data.paper) d._id = d.data.paper.id;
      else d._id = `n${++_idCounter}`;
    });

    // initial collapse: keep root + gen 1 visible, collapse below
    hierarchy.descendants().forEach((d) => {
      if (d.depth >= 1 && d.children && d.children.length > 0) {
        d._children = d.children;
        d.children = null;
      }
    });
    // however, if gen 1 is small enough, also reveal gen 2 of the largest branches
    const gen1 = hierarchy.children || [];
    if (gen1.length <= 6) {
      for (const child of gen1) {
        if (child._children) {
          child.children = child._children;
          child._children = null;
        }
      }
    }

    // anchor previous positions for transitions
    hierarchy.x0 = 0;
    hierarchy.y0 = 0;

    update(hierarchy, /* center */ true);
  }

  function resetView() {
    if (!svg || !hierarchy) return;
    centerOnNode(hierarchy);
  }

  function centerOnNode(d, { instant = false } = {}) {
    if (!d) return;
    // d.x/d.y are pre-swap (we swap when drawing for horizontal layout)
    // Shift the root a little left of centre so the tree, which grows to
    // the right, uses the available canvas.
    const tx = width * 0.25 - (d.y || 0);
    const ty = height / 2 - (d.x || 0);
    const transform = d3.zoomIdentity.translate(tx, ty).scale(1);
    if (instant) {
      svg.call(zoomBehavior.transform, transform);
    } else {
      svg
        .transition()
        .duration(ANIM_MS)
        .call(zoomBehavior.transform, transform);
    }
  }

  /** External: select node by paper id. */
  function selectById(paperId) {
    if (!hierarchy) return;
    const target = hierarchy.descendants().find((d) => d._id === paperId);
    if (target) {
      handleSelect(target, /* center */ true);
    }
  }

  /** External: notify viz that the underlying tree was mutated (e.g. expand). */
  function refreshFromData() {
    if (!hierarchy) return;
    // Rebuild hierarchy preserving collapse state by id.
    const collapsedIds = new Set();
    hierarchy.descendants().forEach((d) => {
      if (d._children) collapsedIds.add(d._id);
    });
    const rootData = hierarchy.data;
    hierarchy = d3.hierarchy(rootData, (d) => d.children);
    hierarchy.each((d) => {
      d._id = d.data && d.data.paper ? d.data.paper.id : `n${++_idCounter}`;
    });
    hierarchy.descendants().forEach((d) => {
      if (collapsedIds.has(d._id) && d.children) {
        d._children = d.children;
        d.children = null;
      }
    });
    update(hierarchy, /* center */ false);
  }

  // ── Core update ──────────────────────────────────────────────────────
  function update(source, center) {
    if (!hierarchy) return;
    const treeData = layout(hierarchy);
    const nodes = treeData.descendants();
    const links = treeData.links();

    // store positions for next transition
    nodes.forEach((d) => {
      // we'll use d.y for horizontal (depth*LEVEL_WIDTH) and d.x for vertical
      d.y0 = d.y;
      d.x0 = d.x;
    });

    // ── nodes ───────────────────────────────────────────────────
    const nodeSel = gNodes
      .selectAll("g.node")
      .data(nodes, (d) => d._id);

    const nodeEnter = nodeSel
      .enter()
      .append("g")
      .attr("class", (d) => nodeClass(d))
      .attr("transform", () => `translate(${source.y0 || 0},${source.x0 || 0})`)
      .on("click", (ev, d) => {
        ev.stopPropagation();
        handleSelect(d, false);
      })
      .on("dblclick", (ev, d) => {
        ev.stopPropagation();
        toggleCollapse(d);
      })
      .on("mouseenter", (ev, d) => showTooltip(ev, d))
      .on("mousemove", (ev) => moveTooltip(ev))
      .on("mouseleave", () => hideTooltip());

    nodeEnter
      .append("circle")
      .attr("r", 1e-6)
      .attr("class", (d) => (d._children ? "has-collapsed" : ""));

    nodeEnter
      .append("text")
      .attr("dy", "0.32em")
      .attr("x", (d) => (d._children ? -LABEL_OFFSET : LABEL_OFFSET))
      .attr("text-anchor", (d) => (d._children ? "end" : "start"))
      .text((d) => labelFor(d));

    // Collapse indicator (small "+" inside node when collapsed)
    nodeEnter
      .append("text")
      .attr("class", "collapse-indicator")
      .attr("dy", "0.35em")
      .attr("text-anchor", "middle")
      .attr("fill", "#fff")
      .style("font-size", "10px")
      .style("font-weight", "700")
      .style("pointer-events", "none")
      .text((d) => (d._children ? "+" : ""));

    // Merge update
    const nodeUpdate = nodeEnter.merge(nodeSel);

    nodeUpdate
      .attr("class", (d) => nodeClass(d))
      .transition()
      .duration(ANIM_MS)
      .attr("transform", (d) => `translate(${d.y},${d.x})`);

    nodeUpdate
      .select("circle")
      .transition()
      .duration(ANIM_MS)
      .attr("r", (d) => radiusFor(d));

    nodeUpdate
      .select(".collapse-indicator")
      .text((d) => (d._children ? "+" : ""));

    nodeUpdate
      .select("text:not(.collapse-indicator)")
      .text((d) => labelFor(d))
      .transition()
      .duration(ANIM_MS)
      .attr("x", (d) => (d._children || (d.children && d.children.length > 0) ? -LABEL_OFFSET : LABEL_OFFSET))
      .attr("text-anchor", (d) =>
        d._children || (d.children && d.children.length > 0) ? "end" : "start"
      );

    // Exit
    const nodeExit = nodeSel
      .exit()
      .transition()
      .duration(ANIM_MS)
      .attr("transform", () => `translate(${source.y},${source.x})`)
      .remove();
    nodeExit.select("circle").attr("r", 1e-6);
    nodeExit.select("text").style("fill-opacity", 1e-6);

    // ── links ───────────────────────────────────────────────────
    const linkSel = gLinks
      .selectAll("path.link")
      .data(links, (d) => d.target._id);

    const linkEnter = linkSel
      .enter()
      .insert("path", "g")
      .attr("class", "link")
      .attr("d", () => {
        const o = { x: source.x0 || 0, y: source.y0 || 0 };
        return diagonal({ source: o, target: o });
      });

    linkEnter
      .merge(linkSel)
      .transition()
      .duration(ANIM_MS)
      .attr("d", (d) => diagonal({ source: d.source, target: d.target }));

    linkSel
      .exit()
      .transition()
      .duration(ANIM_MS)
      .attr("d", () => {
        const o = { x: source.x, y: source.y };
        return diagonal({ source: o, target: o });
      })
      .remove();

    // ── link labels (the "why this child cites the parent" snippet) ──
    // We render an SVG <text> at the midpoint of each link, sitting just
    // above the curve. Each label has up to two lines wrapped manually.
    const labelSel = gLabels
      .selectAll("text.link-label")
      .data(links, (d) => d.target._id);

    const labelEnter = labelSel
      .enter()
      .append("text")
      .attr("class", "link-label")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .each(function (d) {
        const node = d.target;
        const ctx = (node.data && node.data.edgeContext) || "";
        const lines = wrapLabel(ctx, 44, 2);
        d3.select(this).selectAll("tspan").remove();
        for (let i = 0; i < lines.length; i++) {
          d3.select(this)
            .append("tspan")
            .attr("x", 0)
            .attr("dy", i === 0 ? 0 : "1.1em")
            .text(lines[i]);
        }
      });

    labelEnter
      .merge(labelSel)
      .transition()
      .duration(ANIM_MS)
      .attr("transform", (d) => {
        // Sit the label at the link midpoint, above the curve. We push
        // up by ~10 units (link-radius) so the text doesn't overlap the
        // line itself.
        const mx = (d.source.y + d.target.y) / 2;
        const my = (d.source.x + d.target.x) / 2 - 10;
        return `translate(${mx},${my})`;
      });

    labelSel
      .exit()
      .transition()
      .duration(ANIM_MS)
      .style("opacity", 0)
      .remove();

    // Re-apply selected class
    if (selectedId) {
      const selNode = nodes.find((n) => n._id === selectedId);
      const ancestorIds = selNode
        ? new Set(selNode.ancestors().map((a) => a._id))
        : new Set();
      gNodes
        .selectAll("g.node")
        .classed("selected", (d) => d._id === selectedId);
      gLabels
        .selectAll("text.link-label")
        .classed(
          "highlighted",
          (l) => ancestorIds.has(l.target._id) && ancestorIds.has(l.source._id)
        );
    } else {
      gLabels.selectAll("text.link-label").classed("highlighted", false);
    }

    if (center) {
      // Instant centering on first render so growth animations start in
      // the right place; smooth pan when triggered later via selection.
      centerOnNode(hierarchy, { instant: true });
    }
  }

  function diagonal(linkData) {
    const s = linkData.source;
    const t = linkData.target;
    // Smooth cubic curve, horizontal
    const mx = (s.y + t.y) / 2;
    return `M${s.y},${s.x}
            C${mx},${s.x}
             ${mx},${t.x}
             ${t.y},${t.x}`;
  }

  /**
   * Word-wrap a label string into up to `maxLines` lines, each no longer
   * than ~`maxChars` characters. We don't have access to a real font
   * metrics call in headless Chrome, so this is a coarse approximation
   * tuned for the .link-label CSS (10–11px, narrow character box).
   */
  function wrapLabel(text, maxChars, maxLines) {
    if (!text) return [];
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = "";
    for (const w of words) {
      const tentative = line ? line + " " + w : w;
      if (tentative.length <= maxChars) {
        line = tentative;
      } else {
        if (line) lines.push(line);
        line = w;
        if (lines.length >= maxLines) break;
      }
    }
    if (line && lines.length < maxLines) lines.push(line);
    // If we truncated, add an ellipsis to the last line
    const used = lines.join(" ").length;
    if (used < text.trim().length && lines.length > 0) {
      const last = lines[lines.length - 1];
      lines[lines.length - 1] =
        last.length > maxChars - 1 ? last.slice(0, maxChars - 1) + "…" : last + "…";
    }
    return lines;
  }

  function radiusFor(d) {
    const cites = (d.data.paper && d.data.paper.citationCount) || 0;
    // log-scale: from base radius up to ~16
    const r = NODE_RADIUS_BASE + Math.min(10, Math.log10(Math.max(1, cites)) * 2.2);
    return Math.max(NODE_RADIUS_BASE, r);
  }

  function nodeClass(d) {
    const gen = d.data.generation ?? d.depth;
    const cls = ["node", `gen-${Math.min(gen, 6)}`];
    if (d.data.dead) cls.push("dead");
    if (d._children) cls.push("node--collapsed");
    if (d._id === selectedId) cls.push("selected");
    return cls.join(" ");
  }

  function labelFor(d) {
    const p = d.data.paper;
    if (!p) return "";
    let title = p.title || "(untitled)";
    if (title.length > 38) title = title.slice(0, 37) + "…";
    const year = p.year ? ` · ${p.year}` : "";
    return `${title}${year}`;
  }

  function toggleCollapse(d) {
    if (d.children) {
      d._children = d.children;
      d.children = null;
    } else if (d._children) {
      d.children = d._children;
      d._children = null;
    } else {
      // No children at all — emit a request to load more
      onExpandRequest(d.data);
      return;
    }
    update(d, false);
  }

  function handleSelect(d, center) {
    selectedId = d._id;
    gNodes
      .selectAll("g.node")
      .classed("selected", (n) => n._id === selectedId);

    // Highlight link path from root to this node
    const ancestorIds = new Set(d.ancestors().map((a) => a._id));
    gLinks
      .selectAll("path.link")
      .classed(
        "highlighted",
        (l) => ancestorIds.has(l.target._id) && ancestorIds.has(l.source._id)
      );
    // Same path's edge labels should brighten along with the link.
    gLabels
      .selectAll("text.link-label")
      .classed(
        "highlighted",
        (l) => ancestorIds.has(l.target._id) && ancestorIds.has(l.source._id)
      );

    onSelect(d.data);

    if (center) centerOnNode(d);
  }

  // ── tooltip ──────────────────────────────────────────────────────────
  function showTooltip(ev, d) {
    if (!tooltipEl) return;
    const p = d.data.paper;
    if (!p) return;
    const authors = (p.authors || []).slice(0, 3).join(", ") +
      ((p.authors || []).length > 3 ? `, +${p.authors.length - 3}` : "");
    tooltipEl.innerHTML = `
      <div class="tooltip-title">${escapeHtml(p.title)}</div>
      <div class="tooltip-meta">${escapeHtml(authors || "—")} · ${p.year || "?"}${p.venue ? " · " + escapeHtml(p.venue) : ""}</div>
      <div class="tooltip-cites">${(p.citationCount || 0).toLocaleString()} citations${d.data.dead ? " · dead end" : ""}</div>
    `;
    tooltipEl.classList.add("visible");
    moveTooltip(ev);
  }
  function moveTooltip(ev) {
    if (!tooltipEl) return;
    const pad = 14;
    const rect = tooltipEl.getBoundingClientRect();
    let x = ev.clientX + pad;
    let y = ev.clientY + pad;
    if (x + rect.width > window.innerWidth - 8) x = ev.clientX - rect.width - pad;
    if (y + rect.height > window.innerHeight - 8) y = ev.clientY - rect.height - pad;
    tooltipEl.style.left = `${x}px`;
    tooltipEl.style.top = `${y}px`;
  }
  function hideTooltip() {
    if (tooltipEl) tooltipEl.classList.remove("visible");
  }

  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  window.Viz = {
    init,
    render,
    clear,
    resize,
    resetView,
    selectById,
    refreshFromData,
  };
})();
