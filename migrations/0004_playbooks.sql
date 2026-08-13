-- מתודולוגיה: פורמטים לכל מסע המוצר (אפיון → פרודקשן → מסירה → ייעוץ)
-- playbooks    = ספריית תבניות ניתנת לעריכה (config-over-code)
-- playbook_runs= החלה של תבנית על לקוח/מערכת אמיתיים (צ'ק־ליסט חי)

CREATE TABLE IF NOT EXISTS playbooks (
  id         TEXT PRIMARY KEY,
  stage      TEXT NOT NULL DEFAULT 'discovery',
  title      TEXT NOT NULL,
  summary    TEXT,
  kind       TEXT NOT NULL DEFAULT 'checklist',
  sections   TEXT NOT NULL DEFAULT '[]',
  body       TEXT,
  tags       TEXT,
  sort       INTEGER NOT NULL DEFAULT 0,
  builtin    INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_playbooks_stage ON playbooks (stage);

CREATE TABLE IF NOT EXISTS playbook_runs (
  id           TEXT PRIMARY KEY,
  playbook_id  TEXT REFERENCES playbooks (id),
  title        TEXT NOT NULL,
  stage        TEXT,
  client_id    TEXT REFERENCES clients (id),
  system_id    TEXT REFERENCES systems (id),
  status       TEXT NOT NULL DEFAULT 'active',
  sections     TEXT NOT NULL DEFAULT '[]',
  checked      TEXT NOT NULL DEFAULT '{}',
  notes        TEXT,
  progress     INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER,
  completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_runs_status ON playbook_runs (status);
CREATE INDEX IF NOT EXISTS idx_runs_client ON playbook_runs (client_id);
