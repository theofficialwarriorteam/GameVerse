-- Download details, separate ratings and feedback. Existing download rows are preserved.
ALTER TABLE downloads ADD COLUMN short_description TEXT NOT NULL DEFAULT '';
ALTER TABLE downloads ADD COLUMN developer TEXT NOT NULL DEFAULT '';
ALTER TABLE downloads ADD COLUMN release_date TEXT NOT NULL DEFAULT '';
ALTER TABLE downloads ADD COLUMN last_updated_date TEXT NOT NULL DEFAULT '';
ALTER TABLE downloads ADD COLUMN supported_devices TEXT NOT NULL DEFAULT '[]';
ALTER TABLE downloads ADD COLUMN requirements TEXT NOT NULL DEFAULT '{}';
ALTER TABLE downloads ADD COLUMN install_instructions TEXT NOT NULL DEFAULT '';
ALTER TABLE downloads ADD COLUMN notices TEXT NOT NULL DEFAULT '';
ALTER TABLE downloads ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS download_ratings (
  download_id TEXT NOT NULL,
  vid TEXT NOT NULL,
  stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(download_id, vid)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_download_ratings_item ON download_ratings(download_id, stars);

CREATE TABLE IF NOT EXISTS download_feedback (
  id TEXT PRIMARY KEY,
  download_id TEXT NOT NULL,
  vid TEXT NOT NULL,
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','reviewed')),
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_download_feedback_status ON download_feedback(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_download_feedback_item ON download_feedback(download_id, created_at DESC);
ALTER TABLE downloads ADD COLUMN feedback_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE downloads ADD COLUMN download_clicks INTEGER NOT NULL DEFAULT 0;
