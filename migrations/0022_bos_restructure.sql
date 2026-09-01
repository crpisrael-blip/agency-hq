-- BOS — Business Operating System · ארגון מחדש (Phase 1: מודל נתונים)
-- ---------------------------------------------------------------
-- מיגרציה לא-הרסנית: מוסיפה ישויות חדשות וקישורים, ולא נוגעת בנתונים קיימים.
-- clients נשמר כמות שהוא (כולל clients.stage) ומשמש כשכבת התאמה ל-organizations.

-- הרחבת clients כדי לשמש כ-organizations (ללא שינוי נתונים קיימים)
ALTER TABLE clients ADD COLUMN website TEXT;
ALTER TABLE clients ADD COLUMN updated_at INTEGER;

-- אנשי קשר בארגון
CREATE TABLE IF NOT EXISTS contacts (
  id                TEXT PRIMARY KEY,
  organization_id   TEXT NOT NULL,
  name              TEXT NOT NULL,
  role              TEXT,
  phone             TEXT,
  whatsapp          TEXT,
  email             TEXT,
  is_decision_maker INTEGER NOT NULL DEFAULT 0,
  is_primary        INTEGER NOT NULL DEFAULT 0,
  notes             TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER
);
CREATE INDEX IF NOT EXISTS idx_contacts_org ON contacts (organization_id);

-- הזדמנות = עסקה / צורך / הזדמנות מסחרית (הצינור נמדד מכאן)
CREATE TABLE IF NOT EXISTS opportunities (
  id                        TEXT PRIMARY KEY,
  organization_id           TEXT NOT NULL,
  title                     TEXT NOT NULL,
  description               TEXT,
  stage                     TEXT NOT NULL DEFAULT 'discovery',
  service_type              TEXT,
  estimated_value           REAL NOT NULL DEFAULT 0,
  recurring_value           REAL NOT NULL DEFAULT 0,
  probability               INTEGER NOT NULL DEFAULT 20,
  expected_close_date       TEXT,
  urgency                   TEXT,
  fit                       TEXT,
  owner                     TEXT,
  decision_maker_contact_id TEXT,
  next_action               TEXT,
  next_action_date          TEXT,
  lost_reason               TEXT,
  lost_notes                TEXT,
  created_at                INTEGER NOT NULL,
  updated_at                INTEGER,
  won_at                    INTEGER,
  lost_at                   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_opportunities_org ON opportunities (organization_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON opportunities (stage);

-- בעיות/כאבים שזוהו אצל הלקוח
CREATE TABLE IF NOT EXISTS opportunity_pains (
  id             TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL,
  title          TEXT NOT NULL,
  description    TEXT,
  impact         TEXT,
  impact_type    TEXT,
  severity       TEXT,
  estimated_cost REAL NOT NULL DEFAULT 0,
  notes          TEXT,
  created_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pains_opp ON opportunity_pains (opportunity_id);

-- פתרונות מוצעים
CREATE TABLE IF NOT EXISTS opportunity_solutions (
  id               TEXT PRIMARY KEY,
  opportunity_id   TEXT NOT NULL,
  pain_id          TEXT,
  title            TEXT NOT NULL,
  description      TEXT,
  solution_type    TEXT,
  expected_outcome TEXT,
  notes            TEXT,
  created_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_solutions_opp ON opportunity_solutions (opportunity_id);

-- הצעות — מופרדות מהתקשרות, מגורסות (אין דריסה)
CREATE TABLE IF NOT EXISTS proposals (
  id             TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL,
  version        INTEGER NOT NULL DEFAULT 1,
  status         TEXT NOT NULL DEFAULT 'draft',
  one_time_value REAL NOT NULL DEFAULT 0,
  monthly_value  REAL NOT NULL DEFAULT 0,
  valid_until    TEXT,
  scope_included TEXT,
  scope_excluded TEXT,
  assumptions    TEXT,
  dependencies   TEXT,
  notes          TEXT,
  created_at     INTEGER NOT NULL,
  sent_at        INTEGER,
  accepted_at    INTEGER,
  rejected_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_proposals_opp ON proposals (opportunity_id);

-- פרויקט = ביצוע אמיתי
CREATE TABLE IF NOT EXISTS projects (
  id               TEXT PRIMARY KEY,
  organization_id  TEXT NOT NULL,
  opportunity_id   TEXT,
  title            TEXT NOT NULL,
  type             TEXT,
  status           TEXT NOT NULL DEFAULT 'kickoff',
  health           TEXT NOT NULL DEFAULT 'green',
  progress         INTEGER NOT NULL DEFAULT 0,
  start_date       TEXT,
  target_date      TEXT,
  completed_date   TEXT,
  next_action      TEXT,
  next_action_date TEXT,
  notes            TEXT,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER
);
CREATE INDEX IF NOT EXISTS idx_projects_org ON projects (organization_id);
CREATE INDEX IF NOT EXISTS idx_projects_opp ON projects (opportunity_id);

-- אבני דרך
CREATE TABLE IF NOT EXISTS milestones (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL,
  title       TEXT NOT NULL,
  owner       TEXT,
  due_date    TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',
  deliverable TEXT,
  notes       TEXT,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones (project_id);

-- בקשות שינוי (Scope)
CREATE TABLE IF NOT EXISTS change_requests (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  reason          TEXT,
  scope_impact    TEXT,
  cost_impact     REAL NOT NULL DEFAULT 0,
  timeline_impact TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  approved_at     INTEGER,
  implemented_at  INTEGER,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_change_requests_project ON change_requests (project_id);

-- פעילות — Timeline כללית + Audit Trail לכל הישויות
CREATE TABLE IF NOT EXISTS activities (
  id              TEXT PRIMARY KEY,
  entity_type     TEXT NOT NULL,   -- organization | opportunity | project | proposal | engagement | change_request ...
  entity_id       TEXT NOT NULL,
  organization_id TEXT,
  type            TEXT NOT NULL DEFAULT 'note', -- call|meeting|whatsapp|email|note|task|document|decision|status_change|automation
  title           TEXT NOT NULL,
  content         TEXT,
  metadata        TEXT,            -- JSON: { previous, new, ... }
  occurred_at     INTEGER NOT NULL,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activities_entity ON activities (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activities_org ON activities (organization_id);

-- קישורים חדשים לישויות קיימות (nullable — לא שובר קיים)
ALTER TABLE systems ADD COLUMN project_id TEXT;
ALTER TABLE processes ADD COLUMN project_id TEXT;
ALTER TABLE modules ADD COLUMN project_id TEXT;
ALTER TABLE engagements ADD COLUMN opportunity_id TEXT;
ALTER TABLE engagements ADD COLUMN project_id TEXT;
ALTER TABLE engagements ADD COLUMN proposal_id TEXT;

-- Backfill לא-הרסני: איש קשר ראשי מתוך שדות הלקוח הקיימים (אם מולאו)
INSERT OR IGNORE INTO contacts (id, organization_id, name, role, phone, email, is_primary, is_decision_maker, created_at)
SELECT 'primary-' || id, id, contact_name, contact_role, phone, email, 1, 1, created_at
FROM clients
WHERE contact_name IS NOT NULL AND TRIM(contact_name) <> '';
