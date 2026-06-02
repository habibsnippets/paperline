# Paper Lineage (React)

Interactive tree that traces the academic ancestry and descendancy of a
research topic. React + Vite + D3, all LLM calls via the
Hugging Face Inference Providers (OpenAI-compatible) endpoint.

## Quick start

```sh
npm install
npm run dev      # http://localhost:5173 (or next free port)
npm run build    # production build into dist/
npm run preview  # preview the production build
npm run lint
```

## Configuring the model

Open the **settings** panel (gear, top-right) and paste a Hugging Face access
token. A free **Read** token from
[huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) is
enough.

The token is stored in `localStorage` and only sent to
`https://router.huggingface.co/v1/chat/completions`. No backend, no proxy.

Default model: `meta-llama/Llama-3.3-70B-Instruct`. You can switch to other
instruct models from the same panel.

## File structure

```
src/
  App.jsx                  — root, state machine, dig orchestration
  index.css                — dark academic theme + global styles
  main.jsx                 — React bootstrap
  components/
    SearchBar.jsx          — topic input + submit + example chips
    LoadingState.jsx       — staged loader (root → gen1 → gen2)
    PaperTree.jsx          — D3 collapsible top-down tree (SVG)
    PaperCard.jsx          — side-panel detail view
    SettingsPanel.jsx      — HF token + model picker
  utils/
    hfApi.js               — HF chat call, JSON extraction, prompts
    treeHelpers.js         — pure tree transforms
```

## The dig pipeline

1. `findRootPaper(topic)` — one chat call. Returns a single paper object.
2. `findChildren(root, limit=5)` — one chat call. Returns gen-1 list.
3. `findChildrenForMany(gen1, limit=4)` — `Promise.allSettled` over gen-1
   parents. Returns gen-2 list per parent.
4. The tree is updated incrementally as each stage completes, so the user
   sees the root appear immediately, then the branches, then the leaves.

The tree stops at depth 2 for v1. The `PaperNode` shape is recursive so
adding depth 3+ later is a matter of looping the third step.

## Caveats

- The model can hallucinate. The footer always reminds the user that
  relationships are AI-generated approximations.
- If a paper has no clear descendants the node renders as a leaf with the
  caption `no direct descendants found`.
- HF Router free tier has rate limits; a slow query can fail. The error
  screen offers a retry.
