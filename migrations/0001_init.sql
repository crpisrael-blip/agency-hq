-- מיגרציה ראשונה: מערכת-על לניהול בית התוכנה
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token      TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  industry     TEXT,
  size         TEXT DEFAULT 'solo',
  contact_name TEXT,
  phone        TEXT,
  email        TEXT,
  status       TEXT NOT NULL DEFAULT 'prospect',
  stage        TEXT NOT NULL DEFAULT 'lead',
  health       TEXT NOT NULL DEFAULT 'green',
  tags         TEXT,
  notes        TEXT,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients (status);

CREATE TABLE IF NOT EXISTS systems (
  id           TEXT PRIMARY KEY,
  client_id    TEXT NOT NULL,
  name         TEXT NOT NULL,
  kind         TEXT DEFAULT 'web_app',
  stack        TEXT,
  status       TEXT NOT NULL DEFAULT 'discovery',
  url          TEXT,
  repo_url     TEXT,
  start_date   TEXT,
  launch_date  TEXT,
  progress     INTEGER NOT NULL DEFAULT 0,
  description  TEXT,
  notes        TEXT,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_systems_client ON systems (client_id);

CREATE TABLE IF NOT EXISTS engagements (
  id               TEXT PRIMARY KEY,
  client_id        TEXT NOT NULL,
  system_id        TEXT,
  title            TEXT NOT NULL,
  model            TEXT NOT NULL DEFAULT 'retainer',
  status           TEXT NOT NULL DEFAULT 'proposed',
  setup_fee        REAL NOT NULL DEFAULT 0,
  monthly_fee      REAL NOT NULL DEFAULT 0,
  hourly_rate      REAL NOT NULL DEFAULT 0,
  monthly_hours    REAL NOT NULL DEFAULT 0,
  revshare_percent REAL NOT NULL DEFAULT 0,
  revshare_base    REAL NOT NULL DEFAULT 0,
  start_date       TEXT,
  end_date         TEXT,
  billing_day      INTEGER NOT NULL DEFAULT 1,
  notes            TEXT,
  created_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_engagements_client ON engagements (client_id);
CREATE INDEX IF NOT EXISTS idx_engagements_status ON engagements (status);

CREATE TABLE IF NOT EXISTS scenarios (
  id         TEXT PRIMARY KEY,
  client_id  TEXT,
  name       TEXT NOT NULL,
  model      TEXT NOT NULL DEFAULT 'retainer',
  inputs     TEXT NOT NULL DEFAULT '{}',
  results    TEXT NOT NULL DEFAULT '{}',
  notes      TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cashflow (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL DEFAULT 'income',
  label         TEXT NOT NULL,
  amount        REAL NOT NULL DEFAULT 0,
  client_id     TEXT,
  engagement_id TEXT,
  category      TEXT,
  recurring     TEXT NOT NULL DEFAULT 'once',
  start_date    TEXT NOT NULL,
  end_date      TEXT,
  status        TEXT NOT NULL DEFAULT 'planned',
  notes         TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cashflow_start ON cashflow (start_date);
CREATE INDEX IF NOT EXISTS idx_cashflow_kind ON cashflow (kind);

CREATE TABLE IF NOT EXISTS profit_centers (
  id                TEXT PRIMARY KEY,
  client_id         TEXT,
  title             TEXT NOT NULL,
  description       TEXT,
  model             TEXT,
  potential_monthly REAL NOT NULL DEFAULT 0,
  potential_one_time REAL NOT NULL DEFAULT 0,
  effort            TEXT NOT NULL DEFAULT 'medium',
  confidence        INTEGER NOT NULL DEFAULT 50,
  status            TEXT NOT NULL DEFAULT 'idea',
  notes             TEXT,
  created_at        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS processes (
  id          TEXT PRIMARY KEY,
  client_id   TEXT,
  system_id   TEXT,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'process',
  status      TEXT NOT NULL DEFAULT 'draft',
  steps       TEXT NOT NULL DEFAULT '[]',
  description TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  details     TEXT,
  status      TEXT NOT NULL DEFAULT 'todo',
  priority    TEXT NOT NULL DEFAULT 'normal',
  due_date    TEXT,
  entity_type TEXT,
  entity_id   TEXT,
  created_at  INTEGER NOT NULL,
  done_at     INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_entity ON tasks (entity_type, entity_id);
