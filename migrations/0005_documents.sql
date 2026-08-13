-- מרכז מסמכים/תוצרים לכל פרויקט
CREATE TABLE IF NOT EXISTS documents (
  id         TEXT PRIMARY KEY,
  client_id  TEXT,
  system_id  TEXT,
  title      TEXT NOT NULL,
  category   TEXT NOT NULL DEFAULT 'doc',
  source     TEXT,
  url        TEXT,
  notes      TEXT,
  pinned     INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_client ON documents (client_id);
