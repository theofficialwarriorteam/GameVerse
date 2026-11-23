-- GAMEVERSE API — Cloudflare D1 schema (migration 0001)
-- Apply with:  npx wrangler d1 migrations apply gameverse --remote

-- ---------- configuration ----------
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- ---------- visitor analytics ----------
-- Visitors are identified by a random id generated in the browser (no IP, no
-- fingerprinting, no personal data is stored).
CREATE TABLE IF NOT EXISTS counters (
  key   TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS visitors (
  vid        TEXT PRIMARY KEY,
  first_seen INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS visitor_days (
  day TEXT NOT NULL,
  vid TEXT NOT NULL,
  PRIMARY KEY (day, vid)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS daily_counts (
  day      TEXT PRIMARY KEY,
  visitors INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS online (
  vid       TEXT PRIMARY KEY,
  last_seen INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_online_last_seen ON online(last_seen);

-- ---------- game analytics + ratings ----------
CREATE TABLE IF NOT EXISTS game_stats (
  game_id      TEXT PRIMARY KEY,
  views        INTEGER NOT NULL DEFAULT 0,
  plays        INTEGER NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  rating_sum   INTEGER NOT NULL DEFAULT 0,
  c1 INTEGER NOT NULL DEFAULT 0,
  c2 INTEGER NOT NULL DEFAULT 0,
  c3 INTEGER NOT NULL DEFAULT 0,
  c4 INTEGER NOT NULL DEFAULT 0,
  c5 INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS ratings (
  game_id    TEXT NOT NULL,
  vid        TEXT NOT NULL,
  stars      INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (game_id, vid)
) WITHOUT ROWID;

-- ---------- abuse protection ----------
CREATE TABLE IF NOT EXISTS event_dedupe (
  k  TEXT PRIMARY KEY,
  ts INTEGER NOT NULL
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS rate_limits (
  k   TEXT PRIMARY KEY,
  win INTEGER NOT NULL,
  n   INTEGER NOT NULL,
  exp INTEGER NOT NULL
) WITHOUT ROWID;

-- ---------- feedback ----------
CREATE TABLE IF NOT EXISTS feedback (
  id          TEXT PRIMARY KEY,
  game_id     TEXT,
  category    TEXT NOT NULL,
  message     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewed')),
  created_at  INTEGER NOT NULL,
  reviewed_at INTEGER
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_feedback_status_created ON feedback(status, created_at DESC);

-- ---------- free downloads ----------
CREATE TABLE IF NOT EXISTS downloads (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  file_type      TEXT NOT NULL,
  version        TEXT NOT NULL DEFAULT '',
  size_bytes     INTEGER NOT NULL DEFAULT 0,
  storage        TEXT NOT NULL CHECK (storage IN ('r2','external')),
  file_key       TEXT,
  external_url   TEXT,
  original_name  TEXT,
  cover_key      TEXT,
  cover_url      TEXT,
  published      INTEGER NOT NULL DEFAULT 0,
  download_count INTEGER NOT NULL DEFAULT 0,
  last_download  INTEGER,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_downloads_pub ON downloads(published, created_at DESC);

-- ---------- tasks ----------
CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL DEFAULT 'custom',
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  url         TEXT NOT NULL DEFAULT '',
  enabled     INTEGER NOT NULL DEFAULT 1,
  reward      TEXT NOT NULL DEFAULT 'access' CHECK (reward IN ('none','access')),
  reset_mode  TEXT NOT NULL DEFAULT 'inherit',
  reset_hours INTEGER,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS task_opens (
  vid       TEXT NOT NULL,
  task_id   TEXT NOT NULL,
  opened_at INTEGER NOT NULL,
  PRIMARY KEY (vid, task_id)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS task_completions (
  vid          TEXT NOT NULL,
  task_id      TEXT NOT NULL,
  completed_at INTEGER NOT NULL,
  PRIMARY KEY (vid, task_id)
) WITHOUT ROWID;

-- ---------- temporary access (granted by tasks or rewarded ads) ----------
CREATE TABLE IF NOT EXISTS access_grants (
  vid        TEXT PRIMARY KEY,
  source     TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
) WITHOUT ROWID;

-- ---------- rewarded ads ledger ----------
CREATE TABLE IF NOT EXISTS ad_sessions (
  sid        TEXT PRIMARY KEY,
  vid        TEXT NOT NULL,
  required   INTEGER NOT NULL,
  completed  INTEGER NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','granted','expired')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_ad_sessions_vid ON ad_sessions(vid, created_at DESC);
CREATE TABLE IF NOT EXISTS ad_events (
  event_id   TEXT PRIMARY KEY,
  sid        TEXT NOT NULL,
  status     TEXT NOT NULL,
  created_at INTEGER NOT NULL
) WITHOUT ROWID;
