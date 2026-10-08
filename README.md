# Food Calendar — Kalendarz Dni Jedzenia

Aggregated calendar of food observance days from around the globe, with a dedicated Poland track. Filter by date, region, category, and popularity.

- **Frontend:** Cloudflare Pages (Vite + TypeScript, vanilla — no framework)
- **API:** Cloudflare Workers + D1 (SQLite)
- **Media:** Cloudflare R2
- **Design:** dark, mobile-first, Polish UI (reference: crossfit-calendar-2026)

## Development

```bash
# frontend
cd frontend && npm install && npm run dev

# worker (local, with D1 + R2 bindings via Miniflare)
cd worker && npm install && npx wrangler dev

# seed local D1
cd worker && npx wrangler d1 execute food-calendar-db --local --file=src/schema.sql
npx tsx ../scripts/seed-d1.ts --local
```

## Deploy

Merges to `main` deploy automatically via GitHub Actions (`.github/workflows/deploy.yml`). Never deploy manually from the dashboard.

## Data

Source of truth: `data/food-days.json`. Changes go through `data:` PRs; CI re-seeds D1.

See `docs/DATA-CURATION.md` for editorial guidelines and `PROJECT_PLAN.md` (in the private planning repo) for the full project plan.
