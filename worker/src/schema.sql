-- D1 schema for food-calendar
CREATE TABLE IF NOT EXISTS entries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT NOT NULL UNIQUE,
  date_month    INTEGER NOT NULL CHECK (date_month BETWEEN 1 AND 12),
  date_day      INTEGER NOT NULL CHECK (date_day BETWEEN 1 AND 31),
  date_end_month INTEGER,
  date_end_day  INTEGER,
  date_type     TEXT NOT NULL DEFAULT 'fixed' CHECK (date_type IN ('fixed', 'movable')),
  movable_note  TEXT,
  recurrence    TEXT NOT NULL DEFAULT 'yearly' CHECK (recurrence IN ('yearly', 'none')),
  entry_year    INTEGER,
  name_pl       TEXT NOT NULL,
  name_en       TEXT NOT NULL,
  description_pl TEXT,
  region        TEXT NOT NULL CHECK (region IN ('global','europe','poland','americas','asia','oceania','africa')),
  category      TEXT NOT NULL CHECK (category IN ('sweet','savory','beverage','fruit','vegetable','dairy','meat','grain','seafood','dish','other')),
  popularity    INTEGER NOT NULL DEFAULT 50 CHECK (popularity BETWEEN 0 AND 100),
  image_key     TEXT,
  sources       TEXT,
  verified      INTEGER NOT NULL DEFAULT 0,
  source_type   TEXT NOT NULL DEFAULT 'curated' CHECK (source_type IN ('curated', 'admin')),
  created_by    TEXT,
  created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at    TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(date_month, date_day);
CREATE INDEX IF NOT EXISTS idx_entries_region ON entries(region);
CREATE INDEX IF NOT EXISTS idx_entries_category ON entries(category);
CREATE INDEX IF NOT EXISTS idx_entries_popularity ON entries(popularity DESC);
CREATE INDEX IF NOT EXISTS idx_entries_source ON entries(source_type);
CREATE INDEX IF NOT EXISTS idx_entries_year ON entries(entry_year);

CREATE TABLE IF NOT EXISTS popularity_events (
  entry_id INTEGER NOT NULL REFERENCES entries(id),
  event    TEXT NOT NULL CHECK (event IN ('view','detail_open','share')),
  ts       TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pop_events_entry ON popularity_events(entry_id, ts);

CREATE TABLE IF NOT EXISTS login_attempts (
  ip_hash TEXT NOT NULL,
  ts      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts(ip_hash, ts);
