-- Migration: admin authentication + arbitrary admin-added calendar entries
-- Extends entries with range/recurrence/provenance support, adds rate-limit table.

ALTER TABLE entries ADD COLUMN date_end_month INTEGER;   -- NULL = single date, not a range
ALTER TABLE entries ADD COLUMN date_end_day   INTEGER;
ALTER TABLE entries ADD COLUMN recurrence     TEXT NOT NULL DEFAULT 'yearly'
  CHECK (recurrence IN ('yearly', 'none'));
ALTER TABLE entries ADD COLUMN entry_year     INTEGER;   -- NULL = recurring every year; set = one-off for that year
ALTER TABLE entries ADD COLUMN source_type    TEXT NOT NULL DEFAULT 'curated'
  CHECK (source_type IN ('curated', 'admin'));
ALTER TABLE entries ADD COLUMN created_by     TEXT;
ALTER TABLE entries ADD COLUMN movable_note   TEXT;      -- e.g. "2nd Friday of July"

CREATE INDEX IF NOT EXISTS idx_entries_source ON entries(source_type);
CREATE INDEX IF NOT EXISTS idx_entries_year ON entries(entry_year);

-- Login rate limiting (cross-isolate, no raw IPs stored)
CREATE TABLE IF NOT EXISTS login_attempts (
  ip_hash TEXT NOT NULL,
  ts      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts(ip_hash, ts);
