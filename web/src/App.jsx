import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SearchBar from "./components/SearchBar";
import PaperTree from "./components/PaperTree";
import PaperCard from "./components/PaperCard";
import SettingsPanel from "./components/SettingsPanel";
import ExportMenu from "./components/ExportMenu";
import ReadingListPanel from "./components/ReadingListPanel";
import {
  fetchArxivAbstract,
  findChildren,
  findRootPaper,
  getToken,
  looksLikeArxivId,
} from "./utils/hfApi";
import {
  findNode,
  patchNode,
  promoteToRoot,
  setChildren,
  setChildStatus,
  walk,
} from "./utils/treeHelpers";
import {
  isStarred,
  loadReadingList,
  saveReadingList,
  toggleReadingList,
} from "./utils/readingList";
import {
  buildJsonExport,
  copyToClipboard,
  downloadJson,
  downloadPng,
  getShareUrl,
  jsonFilename,
  pngFilename,
  readTopicFromUrl,
  writeTopicToUrl,
} from "./utils/exporters";

const CHILD_FANOUT = {
  0: 5, // root expands to 5 gen-1 papers
  1: 4, // gen-1 nodes expand to 4 gen-2 papers
  2: 3, // gen-2 nodes expand to 3 gen-3 papers (only used at maxDepth >= 3)
};
const DEPTH_CHOICES = [1, 2, 3];

function makeInitial() {
  return {
    topic: "",
    status: "idle",
    loadingMessage: "",
    tree: null,
    expanded: new Set(), // node IDs whose children are currently visible
    loadingChildId: null, // node currently having its children fetched
    abstractLoadingId: null, // node currently having its abstract fetched
    rootStack: [], // history of previous roots for the "back" button
    pivotTitle: null, // label of the most recent pivot, for breadcrumbs
    error: null,
    selectedId: null,
    toast: null, // { id, kind: "info", message } for transient confirmations
  };
}

const INITIAL_STATE = makeInitial();

export default function App() {
  const [state, setState] = useState(INITIAL_STATE);
  // auto-open settings on first run if no token yet
  const [settingsOpen, setSettingsOpen] = useState(() => !getToken());
  const [hasToken, setHasToken] = useState(() => Boolean(getToken()));
  const [exportBusy, setExportBusy] = useState(null);
  const [readingList, setReadingList] = useState(() => loadReadingList());
  const [readingListOpen, setReadingListOpen] = useState(false);
  // depth budget for the citation tree (root = 0, so maxDepth=2 = gen 0..2)
  const [maxDepth, setMaxDepth] = useState(2);
  // pan/zoom lock — when on, drag/scroll on the canvas is a no-op. Useful
  // for touchpads and trackballs where accidental pan is annoying.
  const [zoomLocked, setZoomLocked] = useState(false);
  // "best path" highlight — when on, PaperTree draws a gold line from the
  // root through the LLM-picked recommended child at each generation. The
  // toggle lives in the tree controls bar; the value is persisted so users
  // don't have to re-enable it on every visit.
  const [showBestPath, setShowBestPath] = useState(() => {
    try {
      const v = localStorage.getItem("paperline.showBestPath.v1");
      if (v === "false") return false;
    } catch { /* ignore */ }
    return true;
  });
  useEffect(() => {
    try { localStorage.setItem("paperline.showBestPath.v1", String(showBestPath)); }
    catch { /* ignore */ }
  }, [showBestPath]);
  const treeSvgRef = useRef(null);
  const abortRef = useRef(null);
  // tracks in-flight expand requests so we can cancel the previous one
  const expandCtrlRef = useRef(null);
  // transient info toasts (e.g. "copied — <url>"). The id lets us ignore
  // stale auto-dismiss timers; the timer ref is cleared on reset/unmount.
  const toastIdRef = useRef(0);
  const toastTimerRef = useRef(null);

  // Persist the reading list whenever it changes.
  useEffect(() => {
    saveReadingList(readingList);
  }, [readingList]);

  useEffect(() => () => {
    abortRef.current?.abort();
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  // Shareable URL sync: keep `?topic=` in the address bar in step with the
  // current dig so a user can copy the URL at any time.
  useEffect(() => {
    writeTopicToUrl(state.status === "done" || state.status === "loading" ? state.topic : "");
  }, [state.status, state.topic]);

  const update = useCallback((patch) => {
    setState((prev) => ({ ...prev, ...(typeof patch === "function" ? patch(prev) : patch) }));
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    expandCtrlRef.current?.abort();
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    abortRef.current = null;
    expandCtrlRef.current = null;
    toastTimerRef.current = null;
    setState(makeInitial());
    setZoomLocked(false);
  }, []);

  // Show a transient info toast (e.g. "copied"). Auto-dismisses after `ttl`
  // ms. Each call gets a fresh id so a fast second toast doesn't get
  // nuked by the previous toast's timer.
  const showToast = useCallback(
    (message, { kind = "info", ttl = 2400 } = {}) => {
      const id = ++toastIdRef.current;
      update({ toast: { id, kind, message } });
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        update((prev) => (prev.toast?.id === id ? { toast: null } : prev));
        toastTimerRef.current = null;
      }, ttl);
    },
    [update]
  );

  const clearToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = null;
    update({ toast: null });
  }, [update]);

  // dig() is a stable callback. The auto-dig effect uses digRef to call the
  // latest version, so this useCallback's identity is the source of truth.
  const dig = useCallback(async function dig(topic) {
    if (!getToken()) {
      setSettingsOpen(true);
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const { signal } = ctrl;

    setState({
      ...makeInitial(),
      topic,
      status: "loading",
      loadingMessage: `digging for "${topic}"...`,
    });

    try {
      // We only fetch the root in the initial dig. Descendants are loaded
      // lazily when the user clicks to expand a node.
      const root = await findRootPaper(topic, { signal });
      if (signal.aborted) return;

      // mark the root as "click to expand" so PaperTree shows a + affordance
      const seed = setChildStatus(root, root.id, "pending");
      update({
        tree: seed,
        status: "done",
        loadingMessage: "",
      });
    } catch (err) {
      if (err?.name === "AbortError" || signal.aborted) return;
      console.error("dig failed:", err);
      update({
        status: "error",
        error: { message: err?.message || "Something went wrong.", topic },
      });
    }
  }, []);

  // Always-current handle for the dig function so the auto-dig effect
  // doesn't need to depend on it.
  const digRef = useRef(dig);
  useEffect(() => {
    digRef.current = dig;
  }, [dig]);

  // Lazy expand: toggle a node's visibility. If children haven't been
  // fetched yet, fetch them now; otherwise just flip visibility.
  const expandNode = useCallback(
    async (node) => {
      if (!state.tree) return;
      if (node.generation >= maxDepth) return;

      const isExpanded = state.expanded.has(node.id);
      const status = node._childStatus || "loaded";

      // collapse: just remove from expanded set, keep data
      if (isExpanded) {
        const next = new Set(state.expanded);
        next.delete(node.id);
        update({ expanded: next });
        return;
      }

      // children already fetched and we know there are none → just expand
      // (visually expands to show the leaf state)
      if (status === "leaf") {
        const next = new Set(state.expanded);
        next.add(node.id);
        update({ expanded: next });
        return;
      }

      // need to fetch
      expandCtrlRef.current?.abort();
      const ctrl = new AbortController();
      expandCtrlRef.current = ctrl;
      const { signal } = ctrl;

      update({ loadingChildId: node.id, loadingMessage: `uncovering "${node.title}"...` });

      try {
        const limit = CHILD_FANOUT[node.generation] ?? 3;
        // findChildren now returns { children, recommendedIndex }; the
        // recommendation is attached onto `node` (the parent) in place
        // before this destructuring, so we just need the children array.
        const { children } = await findChildren(node, {
          limit,
          generation: (node.generation ?? 0) + 1,
          signal,
        });
        if (signal.aborted) return;

        const next = new Set(state.expanded);
        next.add(node.id);

        if (children.length === 0) {
          // mark as leaf and expand so the user sees the empty state
          const tree = setChildStatus(setChildren(state.tree, node.id, []), node.id, "leaf");
          update({ tree, expanded: next, loadingChildId: null, loadingMessage: "" });
        } else {
          let tree = setChildStatus(
            setChildren(state.tree, node.id, children),
            node.id,
            "loaded"
          );
          // any new grandchildren are now pending unless they're max-depth
          for (const c of children) {
            if ((c.generation ?? 0) >= maxDepth) {
              tree = setChildStatus(tree, c.id, "leaf");
            }
          }
          update({ tree, expanded: next, loadingChildId: null, loadingMessage: "" });
        }
      } catch (err) {
        if (err?.name === "AbortError" || signal.aborted) return;
        console.error("expand failed:", err);
        // mark the node as a leaf and surface the error as a toast
        const tree = setChildStatus(setChildren(state.tree, node.id, []), node.id, "leaf");
        const next = new Set(state.expanded);
        next.add(node.id);
        update({
          tree,
          expanded: next,
          loadingChildId: null,
          loadingMessage: "",
          error: { message: `Couldn't expand "${node.title}": ${err.message || "unknown error"}` },
        });
      }
    },
    [state.tree, state.expanded, maxDepth, update]
  );

  const retry = useCallback(() => {
    const t = state.error?.topic || state.topic;
    if (t) dig(t);
  }, [dig, state.error, state.topic]);

  const onSelect = useCallback(
    (node) => update({ selectedId: node ? node.id : null }),
    [update]
  );
  const onCloseCard = useCallback(() => update({ selectedId: null }), [update]);
  const onClearError = useCallback(() => update({ error: null }), [update]);

  // Bulk expand/collapse for the "expand all" / "collapse all" / "open to
  // depth N" controls. `onExpandAll` flags every node that already has
  // children attached as expanded (so the user just sees the tree widen
  // without triggering any new LLM calls). Children are loaded lazily on
  // click, so this can't widen beyond what's already been fetched.
  const onExpandAll = useCallback(() => {
    if (!state.tree) return;
    const ids = [];
    walk(state.tree, (n) => {
      if (n.children && n.children.length > 0) ids.push(n.id);
    });
    update({ expanded: new Set(ids) });
  }, [state.tree, update]);

  const onCollapseAll = useCallback(() => {
    update({ expanded: new Set() });
  }, [update]);

  const onOpenToDepth = useCallback(
    (targetDepth) => {
      if (!state.tree) return;
      const ids = [];
      walk(state.tree, (n, depth) => {
        // expand any non-leaf node that has children at a depth *below* the
        // target — opening up to the root (depth 0) collapses everything.
        if (depth < targetDepth && n.children && n.children.length > 0) {
          ids.push(n.id);
        }
      });
      update({ expanded: new Set(ids) });
    },
    [state.tree, update]
  );

  // Re-root the tree at the given node. Pushes the current tree onto a
  // history stack so "back" can restore it.
  const pivotTo = useCallback(
    (node) => {
      if (!state.tree || !node) return;
      if (node.id === state.tree.id) return; // already the root
      const promoted = promoteToRoot(node);
      const stack = [...state.rootStack, { tree: state.tree, title: state.tree.title }];
      update({
        tree: promoted,
        rootStack: stack,
        pivotTitle: state.tree.title,
        expanded: new Set(), // expanded IDs from the old tree are meaningless now
        selectedId: null,
      });
    },
    [state.tree, state.rootStack, update]
  );

  // Pop back to the previous root.
  const popRoot = useCallback(() => {
    if (state.rootStack.length === 0) return;
    const stack = state.rootStack.slice(0, -1);
    const last = state.rootStack[state.rootStack.length - 1];
    const prevTitle = stack.length > 0 ? stack[stack.length - 1].title : null;
    update({
      tree: last.tree,
      rootStack: stack,
      pivotTitle: prevTitle,
      expanded: new Set(),
      selectedId: null,
    });
  }, [state.rootStack, update]);

  // ---------- reading list ----------

  // Toggle a paper's "starred" state. Surfaces a transient toast so the
  // user knows the action landed even when the star is far from the
  // cursor. The actual `readingList` is persisted via the useEffect above.
  const toggleStar = useCallback(
    (paper) => {
      if (!paper) return;
      const { list: next, starred } = toggleReadingList(readingList, paper, {
        topic: state.topic,
      });
      setReadingList(next);
      showToast(starred ? `★ saved — ${paper.title}` : `removed — ${paper.title}`);
    },
    [readingList, state.topic, showToast]
  );

  // ---------- exports ----------

  const onExportJson = useCallback(() => {
    if (!state.tree) return;
    setExportBusy("json");
    try {
      const payload = buildJsonExport({
        topic: state.topic,
        tree: state.tree,
        rootStack: state.rootStack,
      });
      downloadJson(payload, jsonFilename(state.topic));
    } catch (err) {
      update({ error: { message: `JSON export failed: ${err.message || "unknown error"}` } });
    } finally {
      setExportBusy(null);
    }
  }, [state.tree, state.topic, state.rootStack, update]);

  const onExportPng = useCallback(async () => {
    if (!state.tree) return;
    const svg = treeSvgRef.current;
    if (!svg) {
      update({ error: { message: "tree isn't rendered yet — try again in a moment." } });
      return;
    }
    setExportBusy("png");
    try {
      await downloadPng(svg, pngFilename(state.topic));
    } catch (err) {
      update({ error: { message: `PNG export failed: ${err.message || "unknown error"}` } });
    } finally {
      setExportBusy(null);
    }
  }, [state.tree, state.topic, update]);

  const onCopyLink = useCallback(async () => {
    if (!state.topic) return;
    setExportBusy("link");
    try {
      const url = getShareUrl(state.topic);
      const ok = await copyToClipboard(url);
      if (ok) {
        showToast(`copied — ${url}`);
      } else {
        update({
          error: {
            message:
              "couldn't copy to clipboard. copy it manually from the address bar.",
          },
        });
      }
    } catch (err) {
      update({
        error: { message: `copy failed: ${err.message || "unknown error"}` },
      });
    } finally {
      setExportBusy(null);
    }
  }, [state.topic, showToast, update]);

  // Fetch the arXiv abstract for a node and cache it on the tree so it
  // sticks across card open/close cycles.
  const fetchAbstract = useCallback(
    async (node) => {
      if (!node || !node.arxivOrDoi || !looksLikeArxivId(node.arxivOrDoi)) return;
      if (node.abstract) return; // already loaded
      const ctrl = new AbortController();
      update({ abstractLoadingId: node.id });
      try {
        const data = await fetchArxivAbstract(node.arxivOrDoi, { signal: ctrl.signal });
        if (!data || !data.summary) {
          update({
            abstractLoadingId: null,
            error: { message: `No abstract found on arXiv for "${node.title}".` },
          });
          return;
        }
        const tree = patchNode(state.tree, node.id, {
          abstract: data.summary,
          abstractSource: "arxiv",
        });
        // also fix up the title/authors/year from arXiv if the LLM was fuzzy
        const enriched = { ...data };
        if (data.title) enriched.title = data.title;
        if (data.authors?.length) enriched.authors = data.authors;
        if (data.year) enriched.year = data.year;
        const finalTree = patchNode(tree, node.id, enriched);
        update({ tree: finalTree, abstractLoadingId: null });
      } catch (err) {
        if (err?.name === "AbortError") return;
        update({
          abstractLoadingId: null,
          error: { message: `Couldn't fetch abstract: ${err.message || "unknown error"}` },
        });
      }
    },
    [state.tree, update]
  );

  const selectedNode = useMemo(
    () => (state.tree && state.selectedId ? findNode(state.tree, state.selectedId) : null),
    [state.tree, state.selectedId]
  );

  const showInlineStrip = state.loadingChildId !== null || state.loadingMessage !== "";

  // Auto-dig from `?topic=` on first mount, if a token is already present.
  const initialAutoDig = useRef(false);
  useEffect(() => {
    if (initialAutoDig.current) return;
    initialAutoDig.current = true;
    const t = readTopicFromUrl();
    if (t && getToken()) {
      // small delay so layout settles before the user might want to export
      setTimeout(() => digRef.current?.(t), 0);
    }
  }, []);

  return (
    <div className={`app app--${state.status}`}>
      <TopBar
        topic={state.topic}
        pivotTitle={state.pivotTitle}
        status={state.status}
        canPop={state.rootStack.length > 0}
        canExport={Boolean(state.tree)}
        exportBusy={exportBusy}
        onPop={popRoot}
        onReset={reset}
        onExportJson={onExportJson}
        onExportPng={onExportPng}
        onCopyLink={onCopyLink}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenReadingList={() => setReadingListOpen(true)}
        hasToken={hasToken}
        readingListCount={readingList.length}
        maxDepth={maxDepth}
        depthChoices={DEPTH_CHOICES}
        onMaxDepthChange={setMaxDepth}
      />

      <main className="app-main">
        {state.status === "idle" ? (
          <IdleScreen
            onSubmit={dig}
            hasToken={hasToken}
            onOpenSettings={() => setSettingsOpen(true)}
            maxDepth={maxDepth}
            depthChoices={DEPTH_CHOICES}
            onMaxDepthChange={setMaxDepth}
            readingListCount={readingList.length}
            onOpenReadingList={() => setReadingListOpen(true)}
          />
        ) : null}

        {state.status === "loading" && !state.tree ? (
          <RootDigLoader message={state.loadingMessage} />
        ) : null}

        {state.tree ? (
          <div className="app-stage">
            {showInlineStrip ? (
              <div className="stage-loading-strip" role="status" aria-live="polite">
                <span className="stage-loading-dot" />
                <span>{state.loadingMessage || "working..."}</span>
              </div>
            ) : null}
            <PaperTree
              root={state.tree}
              expanded={state.expanded}
              loadingChildId={state.loadingChildId}
              maxDepth={maxDepth}
              onExpand={expandNode}
              onSelect={onSelect}
              onToggleStar={toggleStar}
              isStarred={(node) => isStarred(readingList, node)}
              selectedId={state.selectedId}
              svgRef={treeSvgRef}
              onExpandAll={onExpandAll}
              onCollapseAll={onCollapseAll}
              onOpenToDepth={onOpenToDepth}
              zoomLocked={zoomLocked}
              onToggleZoomLock={() => setZoomLocked((v) => !v)}
              showBestPath={showBestPath}
              onToggleBestPath={() => setShowBestPath((v) => !v)}
            />
            {selectedNode ? (
              <PaperCard
                node={selectedNode}
                onClose={onCloseCard}
                onFetchAbstract={fetchAbstract}
                abstractLoading={state.abstractLoadingId === selectedNode.id}
                onPivot={pivotTo}
                canPivot={selectedNode.id !== state.tree?.id}
                onToggleStar={toggleStar}
                starred={isStarred(readingList, selectedNode)}
              />
            ) : null}
            {state.error ? (
              <Toast
                kind="error"
                message={state.error.message}
                onDismiss={onClearError}
              />
            ) : null}
            {state.toast ? (
              <Toast
                kind={state.toast.kind}
                message={state.toast.message}
                onDismiss={clearToast}
              />
            ) : null}
          </div>
        ) : null}

        {state.status === "error" ? (
          <ErrorScreen
            error={state.error}
            onRetry={retry}
            onOpenSettings={() => setSettingsOpen(true)}
            onReset={reset}
          />
        ) : null}
      </main>

      <footer className="app-foot">
        <span>
          Paper relationships are AI-generated approximations. Always verify citations.
        </span>
      </footer>

      <SettingsPanel
        key={settingsOpen ? "open" : "closed"}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => setHasToken(Boolean(getToken()))}
      />

      <ReadingListPanel
        open={readingListOpen}
        list={readingList}
        onClose={() => setReadingListOpen(false)}
        onRemove={(entry) => setReadingList((prev) => prev.filter((e) => e.id !== entry.id))}
        onClear={() => setReadingList([])}
      />
    </div>
  );
}

function TopBar({
  topic,
  pivotTitle,
  status,
  canPop,
  canExport,
  exportBusy,
  onPop,
  onReset,
  onExportJson,
  onExportPng,
  onCopyLink,
  onOpenSettings,
  onOpenReadingList,
  hasToken,
  readingListCount = 0,
  maxDepth,
  depthChoices = [],
  onMaxDepthChange,
}) {
  return (
    <header className="topbar">
      <button
        type="button"
        className="topbar-brand"
        onClick={onReset}
        aria-label="paper lineage — back to start"
      >
        <span className="topbar-glyph" aria-hidden="true">🪦</span>
        <span className="topbar-title">paper lineage</span>
      </button>

      {status !== "idle" && topic ? (
        <div className="topbar-topic" title={topic}>
          <span className="topbar-topic-label">digging:</span>
          <span className="topbar-topic-value">{topic}</span>
        </div>
      ) : null}

      {canPop && pivotTitle ? (
        <button
          type="button"
          className="topbar-pivot-back"
          onClick={onPop}
          title={`back to "${pivotTitle}"`}
        >
          <span className="topbar-pivot-back-arrow" aria-hidden="true">←</span>
          <span className="topbar-pivot-back-label">back to</span>
          <span className="topbar-pivot-back-title">{pivotTitle}</span>
        </button>
      ) : null}

      <div className="topbar-actions">
        {onMaxDepthChange && depthChoices.length > 0 ? (
          <label
            className="topbar-depth"
            title="how many generations to dig past the root"
          >
            <span className="topbar-depth-label">depth</span>
            <select
              className="topbar-depth-select"
              value={maxDepth}
              onChange={(e) => onMaxDepthChange(Number(e.target.value))}
              aria-label="tree depth"
            >
              {depthChoices.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {status !== "idle" ? (
          <button type="button" className="topbar-btn" onClick={onReset}>
            new dig
          </button>
        ) : null}
        <ExportMenu
          disabled={!canExport}
          busy={exportBusy}
          onExportJson={onExportJson}
          onExportPng={onExportPng}
          onCopyLink={onCopyLink}
        />
        <button
          type="button"
          className="topbar-btn topbar-btn--reading"
          onClick={onOpenReadingList}
          title="reading list"
          aria-label={`reading list, ${readingListCount} saved`}
        >
          <span aria-hidden="true">★</span> reading list
          {readingListCount > 0 ? (
            <span className="topbar-btn-count">{readingListCount}</span>
          ) : null}
        </button>
        <button
          type="button"
          className={`topbar-btn${hasToken ? "" : " topbar-btn--warn"}`}
          onClick={onOpenSettings}
          aria-label="settings"
          title={hasToken ? "settings" : "set hugging face token"}
        >
          ⚙ settings
        </button>
      </div>
    </header>
  );
}

function IdleScreen({
  onSubmit,
  hasToken,
  onOpenSettings,
  maxDepth,
  depthChoices = [],
  onMaxDepthChange,
  readingListCount = 0,
  onOpenReadingList,
}) {
  return (
    <div className="idle">
      <div className="idle-inner">
        <h1 className="idle-title">
          dig the grave of <span className="idle-title-accent">the paper</span>
        </h1>
        <p className="idle-sub">
          Trace the intellectual ancestry and descendancy of any research idea.
          Enter a topic — we'll surface the seminal root paper, then the
          work that built on it, one click at a time.
        </p>

        {!hasToken ? (
          <div className="idle-warn">
            no hugging face token configured yet —{" "}
            <button type="button" className="idle-warn-link" onClick={onOpenSettings}>
              add one in settings
            </button>{" "}
            to start digging.
          </div>
        ) : null}

        <SearchBar onSubmit={onSubmit} disabled={!hasToken} />

        <div className="idle-options">
          {onMaxDepthChange && depthChoices.length > 0 ? (
            <label className="idle-option">
              <span className="idle-option-label">dig depth</span>
              <select
                className="idle-option-select"
                value={maxDepth}
                onChange={(e) => onMaxDepthChange(Number(e.target.value))}
                aria-label="tree depth"
                disabled={!hasToken}
              >
                {depthChoices.map((d) => (
                  <option key={d} value={d}>
                    {d} ({d === 1 ? "~5 papers" : d === 2 ? "~25 papers" : "~80 papers"})
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {onOpenReadingList ? (
            <button
              type="button"
              className="idle-option-link"
              onClick={onOpenReadingList}
            >
              <span aria-hidden="true">★</span>
              {readingListCount > 0
                ? `reading list (${readingListCount})`
                : "reading list"}
            </button>
          ) : null}
        </div>

        <p className="idle-disclaimer">
          Paper relationships are AI-generated approximations. Always verify citations.
        </p>
      </div>
    </div>
  );
}

function ErrorScreen({ error, onRetry, onOpenSettings, onReset }) {
  const msg = error?.message || "Unknown error.";
  const looksAuth = /401|403|token|unauthor/i.test(msg);
  return (
    <div className="error-screen" role="alert">
      <div className="error-card">
        <h2>The dig hit bedrock.</h2>
        <p className="error-msg">{msg}</p>
        <div className="error-actions">
          {looksAuth ? (
            <button type="button" className="error-btn" onClick={onOpenSettings}>
              open settings
            </button>
          ) : null}
          <button type="button" className="error-btn" onClick={onRetry}>
            try again
          </button>
          <button type="button" className="error-btn error-btn--ghost" onClick={onReset}>
            new topic
          </button>
        </div>
      </div>
    </div>
  );
}

function Toast({ kind = "info", message, onDismiss }) {
  return (
    <div className={`toast toast--${kind}`} role="status" aria-live="polite">
      <span className="toast-glyph" aria-hidden="true" />
      <span className="toast-message">{message}</span>
      <button type="button" onClick={onDismiss} aria-label="dismiss">
        x
      </button>
    </div>
  );
}

// Full-screen loader for the very first dig (root-finding). Once the root
// lands, the inline strip on the tree takes over for child expansions.
function RootDigLoader({ message }) {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <div className="loading-card">
        <div className="loading-glyph" aria-hidden="true">
          <svg viewBox="0 0 36 36">
            <circle
              cx="18"
              cy="18"
              r="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeDasharray="6 8"
            >
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="0 18 18"
                to="360 18 18"
                dur="3.6s"
                repeatCount="indefinite"
              />
            </circle>
            <circle cx="18" cy="18" r="3" fill="currentColor" />
          </svg>
        </div>
        <p className="loading-message">{message || "digging..."}</p>
      </div>
    </div>
  );
}
