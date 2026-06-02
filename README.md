# paper lineage

Trace the intellectual ancestry and descendancy of any research idea.
Type a topic, and paper lineage surfaces the seminal root paper, then
recursively uncovers the work that built on it — rendered as an
interactive, collapsible citation tree.

The current version is a **React + Vite + D3** app that uses a
Hugging Face chat model to discover papers. See [`web/`](./web/) for
the app, and [`web/README.md`](./web/README.md) for setup and usage.

The original OpenAlex-backed vanilla-JS prototype lives in
[`v1-legacy/`](./v1-legacy/) for reference; it is no longer maintained.

## Quick start

```sh
cd web
npm install
npm run dev      # http://localhost:5173
```

Then open the app, click **settings** in the top-right, and paste a
free Hugging Face **Read** token. A free token from
[huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
is enough.

## Repository layout

```
.
├── web/               # the v2 app (React + Vite + D3, LLM-backed)
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   └── utils/
│   ├── package.json
│   └── README.md
└── v1-legacy/         # the original prototype (OpenAlex + vanilla JS)
    ├── index.html
    ├── js/
    ├── css/
    └── README.md
```
