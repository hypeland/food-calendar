# Admin Runbook — Authentication, Secrets, Backup & Restore

## 1. Initial setup (one-time)

### Generate and set the admin password
```bash
cd food-calendar
npx tsx scripts/hash-password.ts
# Enter a password >= 16 chars. The plaintext is never written to disk or printed back.
# Copy the printed hash (format: pbkdf2$100000$<salt>$<hash>)

cd worker
npx wrangler secret put ADMIN_PASSWORD_HASH
# Paste the hash when prompted
```

### Generate and set the session signing secret
```bash
# Generate a random 32-byte secret
openssl rand -base64 32

cd worker
npx wrangler secret put SESSION_SECRET
# Paste the generated value when prompted
```

### Apply the D1 migration (admin entries schema)
```bash
cd worker
npx wrangler d1 execute food-calendar-db --remote --file=src/migrations/0002_admin_entries.sql -y
```
Safe to re-run: `ALTER TABLE ... ADD COLUMN` will error if the column already exists — in that case the migration has already been applied.

### GitHub Actions secrets required for the backup workflow
Set in repo settings → Secrets and variables → Actions:
- `CLOUDFLARE_API_TOKEN` — scoped to D1 read access for `food-calendar-db`
- `CLOUDFLARE_ACCOUNT_ID`

## 2. Logging in
Visit `https://hypeland.github.io/food-calendar/admin.html`, enter the admin password. A session token (24h validity) is issued and stored in the browser's `sessionStorage` — it is cleared when the tab closes.

Rate limiting: 5 failed attempts per IP within 15 minutes triggers a `429` response.

## 3. Changing the admin password
Re-run `hash-password.ts`, then `wrangler secret put ADMIN_PASSWORD_HASH` with the new hash. This immediately invalidates nothing else — existing session tokens remain valid until their 24h expiry (signed independently via `SESSION_SECRET`). To force-invalidate all sessions immediately, rotate `SESSION_SECRET` as well.

## 4. Backup & restore

### Automatic (nightly)
`.github/workflows/backup-d1.yml` runs daily at 03:00 UTC: exports the full D1 database via `wrangler d1 export`, uploads it as a 90-day GitHub Actions artifact, and commits a dated copy to the `backup/d1` branch under `backups/YYYY-MM-DD.sql`.

### Manual backup
```bash
cd worker
npx wrangler d1 export food-calendar-db --remote --output=../backup-manual.sql
```

### Restore from backup
```bash
cd worker
npx wrangler d1 execute food-calendar-db --remote --file=../backup-manual.sql -y
```
**Caution:** this replays `INSERT`/`CREATE` statements against the live database. If restoring after data loss, first confirm whether the target tables need to be dropped/recreated (the export includes `CREATE TABLE IF NOT EXISTS`, so it is safe to run against an empty database, but may produce `UNIQUE constraint` errors on a partially-intact one — in that case, execute against a fresh D1 database or manually truncate first).

### Verifying backup integrity
```bash
# Download the latest nightly artifact or checkout backup/d1, then:
sqlite3 :memory: ".read backups/2026-10-09.sql" "SELECT COUNT(*) FROM entries;"
```

## 5. Re-seeding curated data (safe for admin entries)
```bash
npx tsx scripts/seed-d1.ts --remote
```
This only deletes rows where `source_type = 'curated'` — admin-added entries (`source_type = 'admin'`) are never touched by the seed script.

## 6. Security checklist before go-live
- [ ] `ADMIN_PASSWORD_HASH` and `SESSION_SECRET` set as Worker secrets (never committed)
- [ ] Password is >= 16 characters, not reused from another service
- [ ] `CLOUDFLARE_API_TOKEN` in GitHub Actions is scoped minimally (D1 edit only, not account-wide)
- [ ] Confirm `grep -r "pbkdf2\$" frontend/dist/` returns nothing after a build (no secret leakage into client bundle)
- [ ] First nightly backup workflow run verified successful
