# OpsPilot War Room

SPA Vite + React + TypeScript. Design tokens in `src/styles/tokens.css` (light/dark via `prefers-color-scheme` or `data-theme`).

## Run

```bash
# API (repo root)
npm run dev

# War room
npm install
npm run dev
```

Default API base: `http://127.0.0.1:3000` (engrenagem → `localStorage`). Paths always under `/opspilot`.

Optional CORS allowlist on the API: `OPSPILOT_CORS_ORIGINS=http://localhost:5173`.
