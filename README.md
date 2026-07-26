# Team App

Hockey team management PWA for HC Leiden Heren 30-1. React 19 + Vite + TypeScript + Tailwind v4,
Supabase (Postgres/Auth/Edge Functions/Realtime) backend, deployed on Vercel.

- **Production:** https://team-app-zeta.vercel.app
- **Project context / architecture notes:** [CLAUDE.md](CLAUDE.md)
- **Feature progress:** [PROJECT_STATUS.md](PROJECT_STATUS.md)

## Development

```bash
npm install
npm run dev      # Vite dev server
npm run build    # production build
npm test         # Playwright E2E tests
```

Requires a `.env` with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (see `.env.example`).
