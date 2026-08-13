-- מודולים מוטמעים בכל מערכת
CREATE TABLE IF NOT EXISTS modules (
  id          TEXT PRIMARY KEY,
  system_id   TEXT,
  client_id   TEXT,
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'active',
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_modules_system ON modules (system_id);
CREATE INDEX IF NOT EXISTS idx_modules_client ON modules (client_id);
