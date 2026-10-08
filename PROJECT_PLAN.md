# Food Calendar Website — Comprehensive Project Plan

**Project:** Global & Polish Food Observance Days Calendar
**Reference design:** [PeaklabEngine/crossfit-calendar-2026](https://github.com/PeaklabEngine/crossfit-calendar-2026) (visual language + UX structure)
**Target platform:** Cloudflare (Pages, Workers, R2, CDN)
**Status:** Planning
**Last updated:** 2026-10-08

---

## 1. Project Overview

### 1.1 Vision
A production-grade web application that aggregates food-related observance days from around the globe, with a dedicated, curated track for Poland. Users can browse a full-year calendar, and filter/sort/search entries by **date, region, food category, and popularity**.

### 1.2 Goals
1. **Comprehensive dataset** — 300+ curated entries covering worldwide observances (UN/FAO days, US "national food days", EU campaigns) and Polish-specific days (e.g. Dzień Pizzy, Światowy Dzień Pieroga, Dzień Polskiego Jedzenia).
2. **Reference-grade UX** — replicate the visual design language and interaction structure of the crossfit-calendar-2026 reference: dark theme, sticky header with search, sidebar filters, month sections, color-coded event cards, bottom-sheet detail modal, mobile bottom navigation, Polish-language UI.
3. **Cloudflare-native architecture** — Pages for hosting, Workers for serverless API functions, R2 for media assets, Cloudflare CDN for global performance.
4. **Production-ready repository** — standard GitHub workflow (protected branches, PR reviews, conventional commits, CI/CD via GitHub Actions + Wrangler).

### 1.3 Non-Goals (v1)
- User accounts / authentication
- User-submitted entries (v2 candidate — would need Turnstile + moderation)
- Multi-language UI beyond Polish (English dataset fields are stored for future i18n)
- Native mobile apps

---

## 2. Reference Design Analysis (crossfit-calendar-2026)

The reference is a single-file static HTML app. We replicate its **design language and UX structure**, not its single-file architecture.

### 2.1 Visual Design Language (to replicate)
| Element | Reference implementation |
|---|---|
| Theme | Dark: `--bg: #0a0a0f`, layered surfaces `#13131c`/`#1c1c28`/`#252535`, border `#2a2a3d` |
| Accent | Red `#e63946` (swap to a food-appropriate accent, e.g. warm orange `#f39c12` or keep red) |
| Category colors | Blue/green/orange/gray/purple/teal with 12–15% alpha "dim" variants for badges and card tints |
| Typography | System font stack (`-apple-system, 'Segoe UI'`), heavy weights (800–900) for numbers/logo, uppercase micro-labels with 2–3px letter-spacing |
| Radii & shadows | 12px cards, 8px small, pill badges (20px), soft shadow `0 4px 24px rgba(0,0,0,0.4)` |
| Motion | Subtle: card hover `translateX(2px)`, modal slide-up with spring cubic-bezier, pulsing "today" border, blinking today-chip |

### 2.2 UX Structure (to replicate)
1. **Sticky header (72px)** — logo, full-width pill search input with clear button, "Today" button.
2. **Sidebar (desktop, 220px)** — filter groups with colored dots + counts, month navigation list with per-month event counts.
3. **Next-event banner** — gradient card with countdown ("za X dni").
4. **Month sections** — sticky month header (badge + divider line + count), vertical list of event cards.
5. **Event cards** — grid: date block (day number + month abbrev) / info (name, location, duration pill) / type badge; 3px colored left border per category; hover tint overlay.
6. **Detail modal** — mobile bottom-sheet / desktop centered, with color bar, info grid boxes, notes, category pills, full countdown.
7. **Mobile bottom nav (64px)** — replaces sidebar below breakpoint; filter chips row.
8. **Empty states, "today" highlighting, upcoming dimming** for TBA entries.

### 2.3 What we change vs. reference
- Multi-file, typed, component-based codebase instead of one HTML file.
- Data served from a Workers API (with static prerender fallback) instead of hardcoded JS array.
- Real images per entry (R2) instead of emoji icons.
- Popularity sorting/filtering (new capability).
- Region dimension (Global / Europe / Poland / Americas / Asia...) instead of CrossFit event types.

---

## 3. Architecture

### 3.1 High-Level Diagram

```
                    ┌────────────────────────────┐
                    │      Cloudflare CDN         │
                    │  (anycast edge, cache rules)│
                    └──────┬──────────────┬──────┘
                           │              │
              static assets│              │/api/*
                           ▼              ▼
                 ┌──────────────┐   ┌──────────────────┐
                 │ Cloudflare   │   │ Worker (API)     │
                 │ Pages        │   │ /api/entries     │
                 │ (frontend:   │   │ /api/search      │
                 │  HTML/CSS/JS)│   │ /api/stats       │
                 └──────────────┘   └───┬───────┬──────┘
                                        │       │
                          D1 (SQLite) ──┘       └── R2 (images)
                          entries + metadata     food-day media
```

### 3.2 Component Responsibilities

| Layer | Cloudflare product | Responsibility |
|---|---|---|
| Frontend hosting | **Pages** (user-requested) | Static SPA: HTML/CSS/JS bundle, preview deployments per PR. *Note: Cloudflare now recommends Workers + Static Assets for new projects; decision point in §3.6.* |
| Serverless functions | **Workers** | REST API: query/filter/sort entries; popularity aggregation; ics feed generation; health endpoint. |
| Relational data | **D1** | Entries table (dates, names PL/EN, region, category, popularity, sources, slug), categories, regions. SQL filtering is a natural fit for the 4-dimension query model. |
| Media assets | **R2** | Food-day images (hero + thumbnails), served via custom domain `media.foodcalendar.pl` (or `/cdn-cgi/...` route) with long-lived cache headers; zero egress fees. |
| Caching | **Cloudflare CDN + Workers Cache** | Cache API responses at edge (`Cache-Control: public, s-maxage=86400, stale-while-revalidate`); static assets immutable with content-hash filenames. |
| Observability | Workers Logs + Web Analytics | Error tracking, RUM performance, traffic by region. |
| CI/CD | GitHub Actions + Wrangler | Test → build → deploy (Pages + Worker + D1 migrations) on merge to `main`; preview deployments on PRs. |

### 3.3 Data Model (D1)

```sql
CREATE TABLE entries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT NOT NULL UNIQUE,          -- 'swiatowy-dzien-pizzy'
  date_month    INTEGER NOT NULL,              -- 1..12
  date_day      INTEGER NOT NULL,              -- 1..31
  date_type     TEXT NOT NULL DEFAULT 'fixed', -- fixed | movable (easter-relative etc.)
  name_pl       TEXT NOT NULL,
  name_en       TEXT NOT NULL,
  description_pl TEXT,
  region        TEXT NOT NULL,                 -- global | europe | poland | americas | asia | oceania | africa
  category      TEXT NOT NULL,                 -- sweet | savory | beverage | fruit | vegetable | dairy | meat | grain | seafood | dish | other
  popularity    INTEGER NOT NULL DEFAULT 50,   -- 0..100 composite score
  image_key     TEXT,                          -- R2 object key
  sources       TEXT,                          -- JSON array of source URLs
  verified      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at    TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_entries_date ON entries(date_month, date_day);
CREATE INDEX idx_entries_region ON entries(region);
CREATE INDEX idx_entries_category ON entries(category);
CREATE INDEX idx_entries_popularity ON entries(popularity DESC);

CREATE TABLE popularity_events (  -- feeds popularity score
  entry_id INTEGER NOT NULL REFERENCES entries(id),
  event    TEXT NOT NULL,         -- 'view' | 'detail_open' | 'share'
  ts       TEXT DEFAULT CURRENT_TIMESTAMP
);
```

**Popularity score (v1):** editorial base score (0–100, assigned during curation from source prominence: UN/FAO days 90+, widely-covered national days 70–89, niche 40–69) blended with anonymous view/detail-open counts from `popularity_events` (aggregated nightly via Cron Trigger). No cookies, no personal data (GDPR-friendly).

### 3.4 API Design (Worker)

```
GET /api/entries?month=&day=&region=&category=&minPopularity=&sort=(date|popularity)&q=&page=&limit=
GET /api/entries/:slug
GET /api/entries/today                -- today + next upcoming (banner)
GET /api/stats                        -- counts per region/category/month (sidebar)
GET /feed.ics                         -- ICS calendar feed (global + ?region=poland)
GET /health
```
- All responses `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400` + `Cache API` put at edge.
- Input validation at boundary (month/day ranges, enum whitelists, limit ≤ 100).
- CORS: same-origin only (frontend and API on one domain via Pages Functions-style routing or a single Worker route).

### 3.5 Frontend Stack

Following the "Claude official projects" development pattern (as used in anthropics/claude-code and Cloudflare's own templates): **TypeScript-first, minimal dependencies, Vitest for tests, conventional commits, strict linting**.

| Concern | Choice | Rationale |
|---|---|---|
| Framework | **Astro 5** (static output) or vanilla TS + Vite | Content site = mostly static; Astro gives islands for the interactive calendar/filter UI with near-zero JS shipped. Fallback: Vite + vanilla TS keeps the reference's zero-framework feel. |
| Styling | Hand-written CSS with CSS custom properties | The reference design is pure CSS with design tokens in `:root` — replicate directly, no Tailwind needed. |
| State | URL-driven filter state (`?region=poland&cat=sweet`) | Shareable/bookmarkable filtered views; matches reference's filter UX. |
| Search | Client-side fuzzy over a prefetched JSON snapshot + server `/api/search` for deep search | Instant UX like the reference. |
| Images | `<img>` with `loading="lazy"`, width/height set, WebP/AVIF in R2 | CLS-free, fast. |
| Icons | Inline SVG (no icon-font dependency) | Matches reference's lightweight approach. |

### 3.6 Decision Point: Pages vs Workers Static Assets
Cloudflare's current guidance recommends **Workers + Static Assets** for all new projects (Pages remains fully supported). The user requirement names Pages. **Recommendation:** start with **Pages + a separate API Worker** (honors the stated requirement, simplest mental model), and note the migration path (Cloudflare publishes a Pages→Workers migration guide) if/when Pages feature development slows. Both options are documented here so the decision is reversible.

---

## 4. Repository & Workflow Setup

### 4.1 Repository
- **GitHub org:** `hypeland` (https://github.com/hypeland).
- **Name:** `food-calendar` (public).
- **Structure:**

```
food-calendar/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml              # lint + test + build (PR + main)
│   │   └── deploy.yml          # deploy on merge to main
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── CODEOWNERS
├── frontend/                   # Pages project
│   ├── public/
│   ├── src/
│   │   ├── components/         # header, sidebar, event-card, modal, banner...
│   │   ├── styles/             # tokens.css, base.css, components.css
│   │   ├── lib/                # api client, filter state, date utils
│   │   └── data/               # seed snapshot JSON (prerender fallback)
│   └── package.json
├── worker/                     # API Worker
│   ├── src/
│   │   ├── index.ts            # router
│   │   ├── routes/             # entries.ts, stats.ts, feed.ts
│   │   ├── db/                 # queries
│   │   └── schema.sql          # D1 migrations
│   ├── wrangler.toml
│   └── package.json
├── scripts/
│   ├── seed-d1.ts              # load dataset into D1
│   └── sync-images-r2.ts       # upload media to R2
├── data/
│   └── food-days.json          # source-of-truth dataset (versioned in git)
├── docs/
│   ├── DESIGN.md               # design tokens extracted from reference
│   └── DATA-CURATION.md        # editorial guidelines + source list
└── README.md
```

### 4.2 Branch & PR Workflow
- `main` — protected: require PR, 1 approval, status checks green, no direct push.
- Feature branches: `feat/...`, `fix/...`, `chore/...`, `data/...` (dataset updates).
- Conventional Commits (`feat:`, `fix:`, `data:`, `chore:`) — matches Claude/Anthropic project conventions.
- Every PR gets a **Pages preview deployment** (automatic) + Worker preview via `wrangler versions upload`.
- Dataset changes (`data/` path) trigger a D1 re-seed in CI against preview DB.

### 4.3 CI/CD Pipeline (GitHub Actions)
1. **PR:** install → lint (eslint + `tsc --noEmit`) → unit tests (Vitest) → build → Pages preview deploy → Playwright smoke against preview URL.
2. **main:** same + `wrangler d1 migrations apply` → `wrangler deploy` (Worker) → `wrangler pages deploy` (Pages) → post-deploy smoke test against production URL.
3. Secrets via GitHub Actions secrets: `CLOUDFLARE_API_TOKEN` (scoped: Pages edit, Workers edit, D1 edit, R2 edit), `CLOUDFLARE_ACCOUNT_ID`. No secrets in code — enforced by gitleaks pre-commit hook (consistent with existing memory-bank security posture).

---

## 5. Data Plan

### 5.1 Sources
- **Global:** UN International Days (un.org), FAO observances, widely-documented "national food days" (US/UK origin but globally observed).
- **Poland:** Polish food industry calendars, PR agency campaigns (Dzień Pizzy, Dzień Pieroga, Światowy Dzień Chleba, Dzień Polskiego Jedzenia, Barbórka-related food traditions, Dzień Ziemiaków...), culinary media (smaczne.it, uwielbiamgotowac press coverage).
- Each entry requires ≥1 source URL; `verified=1` only when confirmed by an authoritative source (UN/FAO/government/industry body).

### 5.2 Curation Workflow
1. Collect candidate days into `data/food-days.json` (schema mirrors D1 `entries` minus ids).
2. Assign editorial popularity base score + category + region.
3. Source or generate images (licensed/CC0 only; AI-generated placeholders acceptable if licensed for commercial use) → upload to R2 via `scripts/sync-images-r2.ts`.
4. PR with `data:` prefix; reviewer spot-checks 10% sample.
5. CI seeds preview D1; merge auto-seeds production.

### 5.3 Scale Targets
- v1 launch: **300+ entries** (≥120 Polish-relevant, ≥180 global).
- Ongoing: monthly data PR adding newly-announced days; Q4 sweep for next year's movable dates.

---

## 6. Timeline & Milestones

| Phase | Milestone | Deliverables | Exit criteria |
|---|---|---|---|
| **P0 — Setup** (Week 1) | Repo + infra skeleton | GitHub repo, branch protection, CI skeleton, Cloudflare resources created (Pages project, Worker, D1, R2 bucket) via Wrangler/Terraform, `wrangler.toml` configs | CI green on hello-world; preview deploy works |
| **P1 — Design system** (Week 2) | `docs/DESIGN.md` + component library | Design tokens extracted from reference, base CSS, header/sidebar/card/modal components with static mock data | Visual parity review vs. reference screenshots (desktop + mobile) |
| **P2 — Dataset v1** (Weeks 2–3, parallel) | 300+ curated entries | `data/food-days.json`, curation guide, R2 images for top-100 popularity entries | Schema validation passes; 10% sample review approved |
| **P3 — API** (Week 3) | Worker + D1 live (staging) | Schema + migrations, all endpoints, seed script, edge caching, ICS feed | Endpoint tests pass; p95 < 50ms edge; staging URL serving filtered queries |
| **P4 — Frontend integration** (Week 4) | Full app on staging | Filter/search/sort UI wired to API, URL state, modal, banner, mobile nav, empty states | All 4 filter dimensions work combined; Lighthouse mobile ≥ 90 |
| **P5 — Hardening** (Week 5) | Production-ready | Playwright e2e suite, accessibility pass (keyboard nav, ARIA, contrast), SEO (meta, OG images, sitemap, structured data `Event`/`Holiday`), Web Analytics, error alerting | 0 critical a11y issues; e2e green; SEO audit pass |
| **P6 — Launch** (Week 6) | Public launch | Custom domain + DNS + SSL, production deploy, cache rules, post-launch monitoring, announcement | Production smoke checklist (§10) fully green |
| **P7 — Post-launch** (Weeks 7–8) | v1.1 | Popularity telemetry blending, English UI toggle (i18n groundwork), "add a missing day" intake form (Turnstile-protected) | Telemetry dashboard live; intake PRs flowing |

---

## 7. Resource Allocation

| Role | Allocation | Notes |
|---|---|---|
| Project lead / architect | 1 person, ~50% for 6 weeks | Architecture, Cloudflare setup, reviews |
| Frontend engineer | 1 person, ~75% Weeks 2–5 | Design system, components, integration |
| Backend / Cloudflare engineer | 1 person, ~50% Weeks 1–5 | Worker, D1, R2, CI/CD (can be same as lead) |
| Data curator (editorial) | 1 person, ~50% Weeks 2–3, then ~5%/mo | Dataset research, Polish sources, popularity scoring |
| QA / review | Shared, ~10% Weeks 4–6 | Visual parity, a11y, e2e review |

**Cloudflare cost estimate (free/low tier):** Pages (free, 500 builds/mo), Workers (free tier: 100k req/day — sufficient at launch; $5/mo paid if traffic grows), D1 (free tier: 5GB), R2 (10GB free storage, zero egress). Expected run-rate at launch: **$0–5/month**.

---

## 8. Technical Requirements

### 8.1 Functional
- FR-1: Browse full-year calendar grouped by month (reference UX).
- FR-2: Filter by region (multi-select), category (multi-select), date (month/day), min-popularity.
- FR-3: Sort by date (default) or popularity.
- FR-4: Free-text search across name PL/EN + description, with clear button (reference header search).
- FR-5: "Today" view: today's entries + next-upcoming banner with countdown.
- FR-6: Entry detail modal: description, region, category, popularity, sources, image, share link.
- FR-7: Filter state encoded in URL; deep links work (`/?region=poland&category=sweet&month=10`).
- FR-8: ICS feed subscription (all / filtered).
- FR-9: Polish UI language; dataset carries PL + EN names.
- FR-10: Responsive: desktop sidebar ≥ 900px; mobile bottom nav + filter chips below.

### 8.2 Non-Functional
- NFR-1: Performance — LCP < 2.0s on 4G mobile; API p95 < 50ms at edge (cached), < 200ms cold.
- NFR-2: Availability — static frontend survives Worker outage (prerendered snapshot fallback).
- NFR-3: Accessibility — WCAG 2.1 AA: keyboard navigation, focus traps in modal, contrast ≥ 4.5:1 (verify reference's muted colors against dark bg; adjust `--text-muted` if needed).
- NFR-4: SEO — SSR/prerendered HTML per month (`/miesiac/pazdziernik`), sitemap.xml, JSON-LD.
- NFR-5: Privacy — no cookies, no PII; anonymous popularity counters only; Web Analytics (cookieless).
- NFR-6: Security — API input validation, rate limiting (WAF managed rules + per-IP Worker limit), secrets only via `wrangler secret`, gitleaks in CI.
- NFR-7: Maintainability — TypeScript strict mode, 100% typed public APIs, ≤ 200-line components, design tokens single source of truth.

---

## 9. Testing Protocols

| Level | Tool | Scope | Gate |
|---|---|---|---|
| Unit | Vitest | Date utils, filter/sort logic, popularity scoring, API query builders | ≥ 90% lines on `lib/` + `worker/src`; PR-blocking |
| Contract | Vitest + `@cloudflare/workers-test` (Miniflare) | Every API endpoint: happy path, invalid params, empty results, caching headers | All endpoints covered; PR-blocking |
| Integration | `wrangler dev` + local D1/R2 (Miniflare bindings) | Seed → query round-trip, ICS generation | PR-blocking |
| E2E | Playwright against Pages preview URL | Core journeys: browse, each filter dimension, combined filters, search, modal open/close, today banner, mobile viewport nav | Green on PR; full suite on main |
| Visual regression | Playwright screenshots | Header, sidebar, event card, modal vs. approved design snapshots | Diff review in PR |
| Accessibility | axe-core (in Playwright) + manual keyboard pass | All pages/modal | 0 critical; PR-blocking |
| Performance | Lighthouse CI | Mobile + desktop budgets (LCP < 2.0s, CLS < 0.1, TBT < 200ms) | Budget regression blocks merge |
| Load | `wrangler dev` + k6 (or vegeta) against staging | 500 rps mixed filter queries | No 5xx; p95 within NFR-1 |
| Post-deploy smoke | GitHub Actions step | Hit `/health`, `/api/entries?limit=1`, homepage 200 + key selectors | Auto-rollback guidance on failure |

---

## 10. Deployment Checklist

### 10.1 Pre-launch (one-time)
- [ ] Cloudflare account: API token created with scoped permissions (Pages/Workers/D1/R2 edit) — stored in GitHub secrets only
- [ ] D1 database created; migrations applied; production seeded from `data/food-days.json`
- [ ] R2 bucket created; images synced; public access via custom domain or Worker route; `Cache-Control: public, max-age=31536000, immutable`
- [ ] Worker deployed; `/health` returns 200; secrets bound (`wrangler secret put`)
- [ ] Pages project connected to GitHub repo; production branch = `main`
- [ ] Custom domain added (e.g. `foodcalendar.pl` / `kalendarz-jedzenia.pl`); DNS records proxied (orange cloud); SSL/TLS mode = Full (strict); Universal SSL active
- [ ] Cache rules: `/api/*` → respect origin headers; `/_astro/*` & hashed assets → Edge TTL 1 year; HTML → respect origin (short)
- [ ] WAF: managed ruleset ON; rate limiting rule on `/api/*` (e.g. 300 req/10s per IP)
- [ ] Workers Logs enabled; alert on error-rate > 1% (email/webhook)
- [ ] Web Analytics enabled on Pages (cookieless)
- [ ] `robots.txt`, `sitemap.xml`, canonical URLs, OG images verified
- [ ] ICS feed URL published and validated (import test in Google/Apple Calendar)
- [ ] 301 redirect plan for any preview/staging URLs
- [ ] Rollback plan documented: `wrangler pages deployment rollback` + `wrangler rollback`; D1 backup via `wrangler d1 export` before each data deploy

### 10.2 Per-release (recurring)
- [ ] CI green (lint, unit, contract, e2e, a11y, Lighthouse budgets)
- [ ] D1 migration dry-run against preview DB
- [ ] `wrangler d1 export` backup taken
- [ ] Deploy via GitHub Actions (merge to `main`) — never manual dashboard deploys
- [ ] Post-deploy smoke suite green against production URL
- [ ] Version tag: `git tag v1.x.x` + GitHub Release with changelog

---

## 11. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Dataset accuracy (fake "national days") | High | High (credibility) | Source-URL requirement; `verified` flag; editorial review sample |
| Movable dates (Easter-linked, e.g. Śmigus-Dyngus food traditions) | Medium | Medium | `date_type=movable` + yearly offset table; Q4 sweep |
| Image licensing | Medium | High | CC0/licensed-only policy; AI-generated with commercial license; audit in data PR |
| Pages vs Workers platform drift | Low | Medium | Migration guide documented (§3.6); keep frontend build portable |
| Popularity gaming | Low | Low | Rate-limited counters; cap per-IP per-day; editorial score dominates at launch |
| Scope creep (accounts, submissions) | High | Medium | Explicit non-goals §1.3; v2 backlog |

---

## 12. Definition of Done (v1 Launch)

- 300+ verified-sourced entries live, ≥ 120 Polish
- All 4 filter dimensions + search + sort working, URL-encoded
- Visual parity with reference approved (desktop + mobile)
- Lighthouse mobile ≥ 90 perf / 100 a11y; axe 0 critical
- E2E suite green in CI on every PR
- Production deployed via CI only; smoke checklist green
- ICS feed live; SEO/OG validated; Web Analytics dashboards populated
- Rollback tested at least once in staging
