# Admin Authentication & Date Management — Implementation Plan

**Project:** hypeland/food-calendar
**Stack context:** GitHub Pages (static frontend) + Cloudflare Worker API (Hono) + D1 (SQLite) + R2 (media, pending activation)
**Status:** Planning
**Last updated:** 2026-10-08

---

## 1. Functional Requirements

### FR-1 Admin authentication
- **FR-1.1** Single-admin login with password. The password hash is stored **only** as a Worker secret (`wrangler secret put ADMIN_PASSWORD_HASH`) — never in code, never client-side, never in D1.
- **FR-1.2** Hashing: PBKDF2-SHA256 (WebCrypto, available natively in Workers runtime), 100k iterations, 16-byte random salt. Hash format: `pbkdf2$100000$<salt-b64>$<hash-b64>`. (scrypt/bcrypt need native libs; PBKDF2 is the Workers-native choice.)
- **FR-1.3** Login flow: `POST /api/admin/login` with password in request body over HTTPS → server verifies hash with **constant-time comparison** → issues signed session token.
- **FR-1.4** Session token: HMAC-SHA256 signed payload `{sub:"admin", iat, exp}` (24h expiry), signed with a second Worker secret `SESSION_SECRET`. Returned in response body; frontend keeps it in `sessionStorage` (cleared per tab session, limits XSS persistence vs localStorage) and sends it as `Authorization: Bearer <token>` header.
  - *Cookie alternative rejected:* frontend (github.io) and API (workers.dev) are cross-origin; cookie-based sessions would require CORS credential plumbing and `SameSite=None`. Bearer header is simpler and equally secure for this single-admin case.
- **FR-1.5** Login rate limiting: max 5 failed attempts per IP per 15 min (in-memory map + D1-backed counter for cross-isolate accuracy); failures return generic `401 invalid_credentials` with identical timing to avoid user enumeration.
- **FR-1.6** Logout: client clears sessionStorage; server exposes `POST /api/admin/logout` (optional token revocation list in D1, see §2.1).

### FR-2 Date addition capabilities
- **FR-2.1** **Single dates**: one (month, day) entry — same shape as existing curated entries (name PL/EN, description, region, category, popularity).
- **FR-2.2** **Date ranges**: `date_start`–`date_end` (e.g. a week-long food festival). Stored with both bounds; rendered as a range on the card (reference UI already has `ed-range` styling).
- **FR-2.3** **Recurring entries**: `recurrence: "yearly"` (food observance days recur annually — the default for this domain) or `"none"` (one-off, tied to a specific year). Yearly recurrence re-appears every year automatically; no per-year duplication in storage.
- **FR-2.4** **Movable dates**: admin can flag `date_type: "movable"` with a note (e.g. "2nd Friday of July") — displayed with the current year's concrete date plus the rule text.
- **FR-2.5** Input validation: month 1–12, day valid for month (incl. Feb 29 leap-year rule), `date_end >= date_start`, name non-empty ≤200 chars, region/category from the existing enum whitelist, popularity 0–100.

### FR-3 Persistent storage
- **FR-3.1** All admin-added dates stored in **D1** (already provisioned, `food-calendar-db`) — survives browser sessions, Worker restarts/redeploys, and frontend redeploys by design (server-side durable storage).
- **FR-3.2** Admin entries coexist with curated entries: curated dataset (`data/food-days.json` in git) remains the source of truth for curated rows; admin rows are created/deleted only via the API. Merge happens at query time (`UNION`) — no destructive re-seed of admin rows.
- **FR-3.3** Backup: nightly GitHub Actions cron exports D1 (`wrangler d1 export`) and commits to a private backup branch / uploads as workflow artifact; restore procedure documented (§3 Phase 3).
- **FR-3.4** Every admin entry carries audit metadata: `created_by` ("admin"), `created_at` timestamp, optional `updated_at`.

---

## 2. Technical Architecture

### 2.1 Authentication layer

```
Browser (GitHub Pages)                Worker (API)                     D1
─────────────────────                ─────────────                    ───
POST /api/admin/login ──────────────▶ verify PBKDF2 hash ◀── ADMIN_PASSWORD_HASH (secret)
     {password}                        constant-time compare
                                      rate-limit check (D1 counter)
                                     ◀─ 200 {token, expiresAt}        login_attempts(ip, ts)
sessionStorage.setItem(token)
                                     ┌──────────────────────────┐
POST /api/admin/entries ────────────▶ │ auth middleware:          │
     Authorization: Bearer <token>    │  verify HMAC + exp       │
                                     │  (revocation list check) │──▶ INSERT admin_entry
                                     └──────────────────────────┘
GET /api/entries (public) ──────────▶ UNION curated + admin ──────▶ SELECT
```

**Access control middleware** (Hono): `app.use("/api/admin/*", adminAuth)` — verifies Bearer token signature + expiry before any admin route; returns `401` otherwise. Public routes untouched. Calendar **modification is impossible without the token** — there is no public write path at all (read-only API + write-only-admin API).

**Secrets (2):** `ADMIN_PASSWORD_HASH`, `SESSION_SECRET` — both via `wrangler secret put`, never in git. Token revocation (optional hardening): `revoked_tokens(jti, exp)` table checked by middleware.

### 2.2 Calendar data model (D1 migration)

```sql
-- Extend entries to support ranges, recurrence, and admin provenance
ALTER TABLE entries ADD COLUMN date_end_month INTEGER;   -- NULL = single date
ALTER TABLE entries ADD COLUMN date_end_day   INTEGER;
ALTER TABLE entries ADD COLUMN recurrence      TEXT NOT NULL DEFAULT 'yearly'
  CHECK (recurrence IN ('yearly', 'none'));
ALTER TABLE entries ADD COLUMN entry_year     INTEGER;   -- NULL = recurring; set = one-off
ALTER TABLE entries ADD COLUMN source_type    TEXT NOT NULL DEFAULT 'curated'
  CHECK (source_type IN ('curated', 'admin'));
ALTER TABLE entries ADD COLUMN created_by     TEXT;      -- 'admin' for admin rows
ALTER TABLE entries ADD COLUMN created_at      TEXT DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE entries ADD COLUMN updated_at      TEXT;

CREATE INDEX idx_entries_source ON entries(source_type);

-- Login rate limiting (cross-isolate)
CREATE TABLE IF NOT EXISTS login_attempts (
  ip_hash TEXT NOT NULL,          -- SHA-256 of IP (no raw PII)
  ts      INTEGER NOT NULL
);
CREATE INDEX idx_login_attempts ON login_attempts(ip_hash, ts);

-- Optional: token revocation
CREATE TABLE IF NOT EXISTS revoked_tokens (
  jti TEXT PRIMARY KEY,
  exp INTEGER NOT NULL
);
```

**Seed script change:** `scripts/seed-d1.ts` currently does `DELETE FROM entries` — must change to `DELETE FROM entries WHERE source_type = 'curated'` so admin rows survive re-seeds (critical persistence guarantee, FR-3.2).

**Query change:** public `GET /api/entries` gains a filter: entries where `entry_year IS NULL OR entry_year = <current year>` (so one-off admin dates expire correctly, recurring ones persist forever).

### 2.3 API surface (new/changed)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/admin/login` | none (rate-limited) | `{password}` → `{token, expiresAt}` |
| POST | `/api/admin/logout` | Bearer | revoke current token |
| GET | `/api/admin/entries` | Bearer | list admin entries (paginated) |
| POST | `/api/admin/entries` | Bearer | create single / range / recurring entry |
| PATCH | `/api/admin/entries/:id` | Bearer | edit admin entry |
| DELETE | `/api/admin/entries/:id` | Bearer | delete admin entry |
| GET | `/api/entries` (existing) | public | now UNIONs curated + admin rows |

### 2.4 Frontend (admin UI)

- New `/admin` view (client-side route in the SPA): login form → on success, date-entry form (single/range/recurring toggle, all fields, Polish labels consistent with existing UI) + admin entry list with edit/delete.
- Token in `sessionStorage` under key `fc_admin_token`; attached to fetch calls via `Authorization` header. Auto-logout on `401`.
- The admin UI ships in the same public bundle — **safe because it contains no secrets**, only renders forms; all enforcement is server-side.
- Reference design language: login card uses existing dark surface tokens; forms reuse `--surface2` inputs.

### 2.5 Persistence & durability strategy

| Threat | Guarantee |
|---|---|
| Browser refresh / session end | D1 is server-side; data unaffected. Token in sessionStorage may expire → re-login only. |
| Worker restart / redeploy | D1 is a managed service, independent of Worker versions. |
| Frontend redeploy (GitHub Pages) | No state in frontend. |
| Dataset re-seed (CI) | Seed script scoped to `source_type='curated'` (§2.2). |
| Accidental D1 loss | Nightly `wrangler d1 export` backup (GH Actions cron 03:00 UTC) → artifact + private branch; restore: `wrangler d1 execute --file=backup.sql`. |
| App updates / schema migrations | Additive `ALTER TABLE` migrations; `wrangler d1 migrations apply` in deploy pipeline. |

---

## 3. Implementation Roadmap

### Phase 1 — Core authentication
1. Add `worker/src/auth.ts`: PBKDF2 hash/verify (WebCrypto), HMAC token sign/verify, constant-time compare.
2. Add `POST /api/admin/login` + rate limiting (D1 `login_attempts` + periodic cleanup).
3. Set secrets: `wrangler secret put ADMIN_PASSWORD_HASH` + `SESSION_SECRET`; add `scripts/hash-password.ts` (local-only tool to generate the hash from a chosen password — password itself never touches the repo).
4. `adminAuth` middleware on `/api/admin/*`.
5. Unit tests: hash round-trip, token expiry rejection, tampered-token rejection, wrong-password 401, rate-limit block after 5 failures.

### Phase 2 — Date addition functionality
1. D1 migration (§2.2 schema) + update seed script scoping.
2. `POST/PATCH/DELETE /api/admin/entries` with full validation (FR-2.5), including leap-year Feb 29 and range-order checks.
3. Update public `GET /api/entries` UNION + year filtering; update `GET /api/entries/today` and `/feed.ics` to include admin entries.
4. Frontend `/admin` view: login form, entry form (single/range/recurring), admin list.
5. Unit tests: validation matrix (invalid month/day, Feb 29 non-leap, end<start, bad enums, oversize names); integration tests via `wrangler dev` + local D1.

### Phase 3 — Persistence & backup
1. Nightly backup workflow (`.github/workflows/backup-d1.yml`, cron `0 3 * * *`): `wrangler d1 export food-calendar-db --remote --output=backup.sql` → upload artifact (90-day retention) + commit to `backup/d1` branch.
2. Restore runbook in `docs/ADMIN-RUNBOOK.md`: `wrangler d1 execute food-calendar-db --remote --file=backup.sql`.
3. Verify re-seed safety: run seed twice, confirm admin rows untouched.
4. Optional: R2 as second backup destination once R2 is enabled on the account.

### Phase 4 — End-to-end testing
1. Playwright e2e: login → add single date → add range → add recurring → verify appears in public calendar → refresh → still present → delete → gone.
2. Security e2e: unauthenticated POST/PATCH/DELETE to admin routes → 401; tampered/expired token → 401; 6th failed login → 429.
3. Persistence e2e: `wrangler deploy` (new Worker version) mid-test → data intact.
4. Manual: password never appears in built JS bundle (`grep` CI check), never in Worker logs (redact login body from observability).

---

## 4. Testing & QA Criteria

| # | Criterion | Verification |
|---|---|---|
| QA-1 | Unauthenticated users cannot modify dates | All admin routes return 401 without valid Bearer token; no public write endpoint exists (code review + e2e) |
| QA-2 | Dates persist across restarts/refreshes | Playwright: add entry → hard refresh → entry present; `wrangler deploy` → entry present; re-seed → admin entries intact |
| QA-3 | Password never exposed | Hash only in Worker secrets; CI grep of `dist/` for password/hash strings; login request body excluded from logs; token never logged |
| QA-4 | Date edge cases | Unit tests: Feb 29 leap (2028 valid / 2027 invalid), Dec 31→Jan 2 cross-month ranges, day 31 on 30-day months rejected, year filtering of one-off entries |
| QA-5 | Time zones | Dates are calendar dates (no time component) — stored and compared as (month, day) integers; no TZ conversion in storage; "today" endpoint already uses Europe/Warsaw (existing behavior, tested) |
| QA-6 | Rate limiting | 5 failed logins → 429 for 15 min; successful login resets nothing (window-based) |
| QA-7 | Token security | HMAC tamper → 401; exp+1s → 401; logout → token unusable (if revocation enabled) |

---

## 5. Success Metrics

| Metric | Target | Measurement |
|---|---|---|
| Admin login completes | < 2 s | Playwright timing on login round-trip (PBKDF2 100k iters ≈ 100–200 ms in Workers) |
| Entry retention | 100% until explicit admin modification | QA-2 persistence suite, run in CI on every deploy |
| Unauthorized modification attempts succeed | 0 | QA-1/QA-3 security suite; additionally enable WAF rate-limit rule on `/api/admin/*` |
| Data intact across updates/infra changes | 100% | Phase 3 backup + restore drill executed once before launch; nightly backups verified |

---

## 6. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Password brute-force | Rate limit (FR-1.5) + WAF rule + strong password requirement in runbook (≥16 chars) |
| XSS steals sessionStorage token | Token scope limited (24h, admin-only); CSP header on Pages; token useless after expiry |
| Seed script wipes admin rows | Scoped DELETE (§2.2) + regression test in Phase 3 |
| D1 regional outage | Nightly backups; restore runbook; acceptable RPO ≤ 24 h for this use case |
| Single-admin bottleneck | By design (v1); schema `created_by` ready for multi-admin later |
