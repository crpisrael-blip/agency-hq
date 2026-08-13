-- מונה לידים: לידים שנכנסו דרך המערכות שבניתי (webhook ציבורי)
CREATE TABLE IF NOT EXISTS leads (
  id         TEXT PRIMARY KEY,
  system_id  TEXT,
  client_id  TEXT,
  source     TEXT,
  name       TEXT,
  note       TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leads_system ON leads (system_id);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads (created_at);
