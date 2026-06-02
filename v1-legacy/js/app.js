// Main app: wires UI <-> API <-> tree builder <-> visualization.

(function () {
  // ── DOM refs ─────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const topicInput = $("topicInput");
  const depthSelect = $("depthSelect");
  const fanoutSelect = $("fanoutSelect");
  const digBtn = $("digBtn");
  const cancelBtn = $("cancelBtn");

  const emptyEl = $("empty");
  const loadingEl = $("loading");
  const loadingTextEl = $("loadingText");
  const loadingBarEl = $("loadingBar");
  const loadingCountsEl = $("loadingCounts");
  const loadingLogEl = $("loadingLog");
  const treeSvg = $("tree");
  const legendEl = $("legend");
  const hintEl = $("hint");

  const panelEmpty = $("panelEmpty");
  const panelContent = $("panelContent");
  const panelGenEl = $("panelGen");
  const panelTitleEl = $("panelTitle");
  const panelYearEl = $("panelYear");
  const panelVenueEl = $("panelVenue");
  const panelCitesEl = $("panelCites");
  const panelAuthorsEl = $("panelAuthors");
  const panelAbstractEl = $("panelAbstract");
  const panelLinkEl = $("panelLink");
  const panelPathEl = $("panelPath");
  const expandBtn = $("expandBtn");

  const toastEl = $("toast");

  // ── State ────────────────────────────────────────────────────────────
  let tree = null;            // root TreeNode
  let currentSelection = null;
  let totalExpected = 1;
  let inProgress = false;

  // ── Init ─────────────────────────────────────────────────────────────
  Viz.init({
    selector: "#tree",
    onSelectNode: handleNodeSelected,
    onLoadMore: (nodeData) => expandNodeOnDemand(nodeData),
  });

  // Event bindings
  digBtn.addEventListener("click", startDig);
  topicInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") startDig();
  });
  cancelBtn.addEventListener("click", () => {
    API.cancel();
    log("warn", "cancelled by user");
  });

  // Example chips
  document.querySelectorAll(".examples li").forEach((li) => {
    li.addEventListener("click", () => {
      topicInput.value = li.dataset.topic;
      startDig();
    });
  });

  expandBtn.addEventListener("click", async () => {
    if (!currentSelection || !tree || inProgress) return;
    const node = TreeBuilder.findNode(tree, currentSelection.paper.id);
    if (!node) return;
    await expandNodeOnDemand(node);
  });

  // ── Main flow ────────────────────────────────────────────────────────
  async function startDig() {
    if (inProgress) return;
    const topic = topicInput.value.trim();
    if (!topic) {
      toast("type a topic first", "warn");
      topicInput.focus();
      return;
    }

    inProgress = true;
    API.reset();
    digBtn.disabled = true;
    emptyEl.classList.add("hidden");
    treeSvg.classList.add("hidden");
    legendEl.classList.add("hidden");
    hintEl.classList.add("hidden");
    loadingEl.classList.remove("hidden");
    loadingLogEl.innerHTML = "";
    loadingTextEl.textContent = "searching for the root paper…";
    loadingBarEl.style.width = "5%";
    loadingCountsEl.textContent = "0 papers";

    panelContent.classList.add("hidden");
    panelEmpty.classList.remove("hidden");

    Viz.clear();
    currentSelection = null;
    tree = null;

    const maxDepth = parseInt(depthSelect.value, 10);
    const maxChildren = parseInt(fanoutSelect.value, 10);
    totalExpected = expectedTotal(maxDepth, maxChildren);

    try {
      log("ok", `searching openalex: "${topic}"`);
      const results = await API.searchPapers(topic, 50);
      if (!results || results.length === 0) {
        throw new Error("no papers found, try a more specific topic");
      }
      log("ok", `got ${results.length} candidate papers`);
      const root = API.pickRootPaper(results, { topK: 8 });
      if (!root) {
        throw new Error("no seminal paper found among results");
      }
      loadingTextEl.textContent = `root: "${truncate(root.title, 60)}"`;
      log("ok", `picked root: ${root.title} (${root.year || "?"})`);

      tree = await TreeBuilder.buildTree(root, {
        maxDepth,
        maxChildren,
        onProgress: handleProgress,
      });

      if (!tree) throw new Error("tree construction failed");

      // Show!
      loadingEl.classList.add("hidden");
      treeSvg.classList.remove("hidden");
      legendEl.classList.remove("hidden");
      hintEl.classList.remove("hidden");
      Viz.render(tree);

      // Auto-select root for first details
      setTimeout(() => Viz.selectById(root.id), 100);
    } catch (err) {
      if (err.message === "cancelled") {
        log("warn", "dig cancelled");
        toast("dig cancelled", "warn");
      } else {
        log("err", err.message);
        toast(err.message, "error");
      }
      // If we got partial tree, still show it
      if (tree && tree.children && tree.children.length > 0) {
        loadingEl.classList.add("hidden");
        treeSvg.classList.remove("hidden");
        legendEl.classList.remove("hidden");
        hintEl.classList.remove("hidden");
        Viz.render(tree);
      } else {
        loadingEl.classList.add("hidden");
        emptyEl.classList.remove("hidden");
      }
    } finally {
      inProgress = false;
      digBtn.disabled = false;
    }
  }

  function handleProgress(ev) {
    if (ev.type === "log") {
      log(ev.kind, ev.msg);
      updateCounts(ev.totalNodes);
    } else if (ev.type === "tick") {
      if (ev.msg) loadingTextEl.textContent = ev.msg;
      updateCounts(ev.totalNodes);
    } else if (ev.type === "done") {
      loadingBarEl.style.width = "100%";
    }
  }

  function updateCounts(n) {
    loadingCountsEl.textContent = `${n} paper${n === 1 ? "" : "s"}`;
    const pct = Math.min(100, Math.round((n / Math.max(totalExpected, 1)) * 100));
    loadingBarEl.style.width = `${Math.max(5, pct)}%`;
  }

  function expectedTotal(depth, fanout) {
    // 1 + f + f^2 + … + f^depth
    let total = 1;
    let term = 1;
    for (let d = 1; d <= depth; d++) {
      term *= fanout;
      total += term;
    }
    return total;
  }

  // ── Side panel ───────────────────────────────────────────────────────
  function handleNodeSelected(nodeData) {
    currentSelection = nodeData;
    panelEmpty.classList.add("hidden");
    panelContent.classList.remove("hidden");

    const p = nodeData.paper;
    const gen = Math.min(nodeData.generation ?? 0, 3);
    panelGenEl.className = `panel-gen gen-${gen}`;
    panelGenEl.textContent =
      nodeData.generation === 0 ? "root" : `generation ${nodeData.generation}`;
    panelTitleEl.textContent = p.title || "(untitled)";
    panelYearEl.textContent = p.year || "—";
    panelVenueEl.textContent = p.venue || "—";
    panelCitesEl.textContent = `${(p.citationCount || 0).toLocaleString()} citations`;
    panelAuthorsEl.textContent = (p.authors || []).join(", ") || "—";
    panelAbstractEl.textContent =
      p.abstract && p.abstract.length > 0 ? p.abstract : "(no abstract available)";
    panelLinkEl.href = p.url || "#";

    // Show expand button only if this is a leaf and not the root
    const node = tree ? TreeBuilder.findNode(tree, p.id) : null;
    const canExpand =
      node && (!node.children || node.children.length === 0) && !node.dead;
    expandBtn.classList.toggle("hidden", !canExpand);

    // Path from root
    if (tree) {
      const path = TreeBuilder.pathFromRoot(tree, p.id);
      panelPathEl.innerHTML = "";
      for (const step of path) {
        const li = document.createElement("li");
        li.dataset.gen = String(Math.min(step.generation ?? 0, 3));
        li.dataset.pid = step.paper.id;
        if (step.paper.id === p.id) li.classList.add("current");
        const titleSpan = document.createElement("span");
        titleSpan.className = "path-title";
        titleSpan.textContent = step.paper.title;
        const metaSpan = document.createElement("span");
        metaSpan.className = "path-meta";
        const venue = step.paper.venue ? ` · ${step.paper.venue}` : "";
        metaSpan.textContent = `${step.paper.year || "?"}${venue} · ${(step.paper.citationCount || 0).toLocaleString()} cites`;
        li.appendChild(titleSpan);
        li.appendChild(metaSpan);
        li.addEventListener("click", () => Viz.selectById(step.paper.id));
        panelPathEl.appendChild(li);
      }
    }
  }

  // ── On-demand expansion of a leaf ─────────────────────────────────────
  async function expandNodeOnDemand(nodeData) {
    if (inProgress || !tree) return;
    const node = TreeBuilder.findNode(tree, nodeData.paper.id);
    if (!node) return;

    inProgress = true;
    expandBtn.disabled = true;
    const prevText = expandBtn.textContent;
    expandBtn.textContent = "loading…";
    API.reset();

    const maxChildren = parseInt(fanoutSelect.value, 10);
    try {
      const added = await TreeBuilder.expandNode(node, tree, {
        maxChildren,
        onProgress: () => {},
      });
      if (added === 0) {
        toast("no new descendants found (dead end)", "warn");
      } else {
        toast(`+${added} paper${added === 1 ? "" : "s"} added`);
      }
      Viz.refreshFromData();
      // re-render the panel with updated info (expand btn may hide)
      handleNodeSelected(node);
    } catch (err) {
      toast(err.message || "failed to load citations", "error");
    } finally {
      inProgress = false;
      expandBtn.disabled = false;
      expandBtn.textContent = prevText;
    }
  }

  // ── Logging / toast ──────────────────────────────────────────────────
  function log(kind, msg) {
    const line = document.createElement("div");
    line.className = `log-${kind}`;
    const ts = new Date().toLocaleTimeString([], { hour12: false });
    line.textContent = `[${ts}] ${msg}`;
    loadingLogEl.appendChild(line);
    loadingLogEl.scrollTop = loadingLogEl.scrollHeight;
  }

  let toastTimer = null;
  function toast(msg, kind = "ok") {
    toastEl.textContent = msg;
    toastEl.className = `toast ${kind === "error" ? "error" : kind === "warn" ? "warn" : ""}`;
    toastEl.classList.remove("hidden");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 3500);
  }

  function truncate(s, n) {
    if (!s) return "";
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }
})();
