-- בועת רעיונות: לכידה מהירה של רעיונות/באגים/משימות
CREATE TABLE IF NOT EXISTS feedback_items (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL DEFAULT 'idea',
  content    TEXT NOT NULL,
  screen     TEXT,
  status     TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback_items (status);
