# paperline — dig the grave of the paper *(v1, legacy)*

> **Note:** this is the v1 of paperline, built on OpenAlex + vanilla JS + D3.
> It has been superseded by the v2 React app at [`../web/`](../web/), which
> uses an LLM (Hugging Face Router) to discover papers and adds lazy
> expansion, pivot-to-subtree, export, and a reading list. The v1 files
> remain here for historical reference but are no longer maintained.

A web app that traces the academic lineage of a research topic. Given a
topic, paperline locates the seminal "root" paper and recursively maps every
descendant that builds on it, rendered as an interactive citation tree.

Powered by the public [OpenAlex API](https://docs.openalex.org/) and
[D3.js](https://d3js.org). No API key required.

---

## Quick start

No build step. Just serve the directory and open it in a browser.

```sh
# from the project root:
python3 -m http.server 8000
# → open http://localhost:8000
```

Use `localhost` (or `127.0.0.1`) — not `0.0.0.0` — because Chrome treats
pages loaded from `0.0.0.0` with extra restrictions.

Any other static server works too: `npx serve`, `caddy file-server`, etc.

---

## Usage

1. Type a research topic in the search bar — e.g. *vision language models*,
   *diffusion models*, *transformers attention*, *RLHF*.
2. Pick **depth** (how many generations to dig) and **fanout** (max children
   per node). Defaults give a quick, readable tree.
3. Hit **dig**. paperline:
   - searches OpenAlex for top papers on the topic,
   - heuristically picks the **root** (heavily-weighted by recency-aware
     citation count),
   - recursively fetches the most-cited papers that **cite** each parent,
   - renders the tree.
4. Interact:
   - **click** a node → details panel (abstract, authors, lineage from root)
   - **double-click** a node → collapse / expand its branch
   - **scroll** to zoom, **drag** to pan
   - **double-click** empty canvas → reset view
   - on a leaf, hit **load more citations** in the panel to dig deeper

---

## How root selection works

Among the top results for a query, paperline:

1. Filters to papers with at least 50 citations and a known year.
2. Takes the top 8 by citation count.
3. Scores each by `citationCount × (currentYear - year + 1)`.
4. Returns the highest scorer — favouring papers that have stood the test of
   time.

This is a deliberate heuristic, not a definitive answer. If the result feels
wrong, try a more specific query (e.g. *contrastive language image
pretraining* instead of *multimodal models*).

---

## Architecture

```
project-root/
├── index.html              # markup + layout
├── css/
│   └── styles.css          # full styling, dark theme
├── js/
│   ├── api.js              # OpenAlex wrapper: search, citations, normalize
│   ├── tree.js             # BFS construction of the citation tree
│   ├── visualization.js    # D3 horizontal collapsible tree
│   └── app.js              # UI wiring & state
└── README.md
```

- `api.js` exposes a small `window.API` namespace with `ping`, `searchPapers`,
  `getPaper`, `getCitations`, `pickRootPaper`, `normalizePaper`. It
  requests only the fields it needs, follows OpenAlex's `mailto=` polite-pool
  hint, and dedupes in-flight URLs. All responses are cached in memory for
  the session.
- `tree.js` builds the tree breadth-first up to `maxDepth`, deduplicates
  papers across the entire tree (so the graph stays a tree, not a DAG), and
  marks branches with zero new citations as **dead ends**.
- `visualization.js` renders a horizontal Reingold-Tilford layout with
  collapsible branches, smooth transitions, and zoom/pan. Node radius scales
  with `log10(citationCount)`; nodes are coloured by generation.
- `app.js` orchestrates the search → root-pick → recursion → render
  pipeline, manages the side panel, and handles on-demand sub-tree
  expansion.

To swap the backend (e.g. for a different API), only `api.js` needs to
change — keep the paper shape (`{id, title, authors, year, venue, abstract,
citationCount, url}`) and the rest of the app keeps working.

---

## v1 constraints

- **Max depth** is 3 (configurable in the UI). With fanout 8 and depth 3
  that's `1 + 8 + 64 + 512 = 585` papers worst case — already a lot of API
  calls, so start small.
- **Max children per node** is 20. The default of 8 is what generally fits
  on screen without overwhelming the tree.
- No persistent storage. Refresh = fresh dig.
- API failures on a single branch are tolerated: the branch is marked dead
  and the dig continues.

## Known caveats

- OpenAlex's search ranking is title-biased. For some topics, the
  single most "seminal" paper isn't in the top search results (or is on
  arXiv only with sparse metadata). Try rephrasing the query.
- The "citations of X" endpoint only returns papers that OpenAlex has
  indexed citations for; very new or obscure papers may appear as dead
  ends even when they shouldn't.
- OpenAlex abstract coverage is partial (depends on the source — Crossref,
  MAG, etc.). Some papers will show an empty abstract.
- No request queue/throttle is implemented: OpenAlex is generous without a
  key, but if you crank depth and fanout you'll hit polite-pool rate
  limits.
