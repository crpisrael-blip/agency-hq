-- Finance Control — מודול שליטה פיננסית (Phase 1: Foundation)
-- ---------------------------------------------------------------
-- מיגרציה לא-הרסנית בלבד: מוסיפה טבלאות חדשות ושדות nullable ל-cashflow.
-- אין DROP, אין מחיקת נתונים, אין שינוי טיפוס של עמודות קיימות.
-- Legacy (cashflow.status planned|confirmed|paid, recurring once|monthly|yearly) נשמר כמות שהוא.

-- ============ אירועי תשלום (Financial Occurrences / Payment Schedule) ============
-- מפריד בין מקור ההכנסה/הוצאה לבין אירוע התשלום בפועל. מקור אחד (למשל התקשרות
-- חודשית) מייצר occurrences חודשיים. משמש כ-source of truth לתשלומים ידניים/צפויים
-- ולתיעוד Actual מול Forecast, בלי לשכפל את מנועי החישוב הנגזרים (engagements/opportunities).
CREATE TABLE IF NOT EXISTS financial_occurrences (
  id            TEXT PRIMARY KEY,
  source_type   TEXT NOT NULL DEFAULT 'manual',  -- manual|opportunity|proposal|engagement|project|subscription|vendor|scenario|system
  source_id     TEXT,
  kind          TEXT NOT NULL DEFAULT 'income',   -- income|expense
  label         TEXT,
  amount        REAL NOT NULL DEFAULT 0,
  due_date      TEXT,                             -- מתי אמור לקרות (YYYY-MM-DD)
  expected_date TEXT,                             -- מתי צפוי בפועל
  actual_date   TEXT,                             -- מתי התקבל/שולם בפועל
  status        TEXT NOT NULL DEFAULT 'expected', -- expected|committed|received|paid|overdue|cancelled
  confidence    INTEGER NOT NULL DEFAULT 80,      -- 0-100
  client_id     TEXT,
  project_id    TEXT,
  engagement_id TEXT,
  vendor_id     TEXT,
  category_id   TEXT,
  cashflow_id   TEXT,
  notes         TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_occ_source ON financial_occurrences (source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_occ_kind ON financial_occurrences (kind);
CREATE INDEX IF NOT EXISTS idx_occ_status ON financial_occurrences (status);
CREATE INDEX IF NOT EXISTS idx_occ_due ON financial_occurrences (due_date);
CREATE INDEX IF NOT EXISTS idx_occ_client ON financial_occurrences (client_id);
CREATE INDEX IF NOT EXISTS idx_occ_project ON financial_occurrences (project_id);

-- ============ ספקים (Vendors) ============
CREATE TABLE IF NOT EXISTS vendors (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  category_id  TEXT,
  website      TEXT,
  contact_name TEXT,
  email        TEXT,
  phone        TEXT,
  notes        TEXT,
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_vendors_category ON vendors (category_id);

-- ============ קטגוריות הוצאה (Expense Categories) ============
CREATE TABLE IF NOT EXISTS expense_categories (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'expense',  -- expense|income (רוב הקטגוריות הוצאה)
  sort       INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1,
  builtin    INTEGER NOT NULL DEFAULT 0,       -- 1 = קטגוריית ברירת מחדל (ניתנת לעריכה)
  created_at INTEGER NOT NULL
);
-- Seed בסיסי (§7.3). idempotent — מזהים קבועים.
INSERT OR IGNORE INTO expense_categories (id, name, kind, sort, active, builtin, created_at) VALUES
  ('cat-software',   'תוכנה ומנויים',   'expense',  1, 1, 1, 0),
  ('cat-cloud',      'ענן ואחסון',       'expense',  2, 1, 1, 0),
  ('cat-ai',         'AI/API',           'expense',  3, 1, 1, 0),
  ('cat-marketing',  'שיווק ופרסום',     'expense',  4, 1, 1, 0),
  ('cat-subcontract','קבלני משנה',       'expense',  5, 1, 1, 0),
  ('cat-salary',     'שכר',              'expense',  6, 1, 1, 0),
  ('cat-accounting', 'הנהלת חשבונות',    'expense',  7, 1, 1, 0),
  ('cat-legal',      'משפטי',            'expense',  8, 1, 1, 0),
  ('cat-equipment',  'ציוד',             'expense',  9, 1, 1, 0),
  ('cat-comms',      'תקשורת',           'expense', 10, 1, 1, 0),
  ('cat-travel',     'נסיעות',           'expense', 11, 1, 1, 0),
  ('cat-office',     'משרד',             'expense', 12, 1, 1, 0),
  ('cat-clearing',   'עמלות סליקה',      'expense', 13, 1, 1, 0),
  ('cat-insurance',  'ביטוח',            'expense', 14, 1, 1, 0),
  ('cat-taxes',      'מסים',             'expense', 15, 1, 1, 0),
  ('cat-other',      'אחר',              'expense', 99, 1, 1, 0);

-- ============ התראות פיננסיות (Financial Alerts) ============
-- לא נמחקות לאחר טיפול — מסומנות resolved/dismissed (§21).
CREATE TABLE IF NOT EXISTS financial_alerts (
  id                 TEXT PRIMARY KEY,
  type               TEXT NOT NULL,   -- balance_below_threshold|overdue_income|overdue_expense|unusual_expense|subscription_renewal|contract_ending|unallocated_expense|revenue_concentration|low_project_margin|negative_forecast|mrr_decrease|pipeline_shortfall
  entity_type        TEXT,
  entity_id          TEXT,
  title              TEXT,
  message            TEXT,
  amount             REAL,
  due_date           TEXT,
  severity           TEXT NOT NULL DEFAULT 'warning', -- info|warning|critical
  recommended_action TEXT,
  status             TEXT NOT NULL DEFAULT 'open',    -- open|resolved|dismissed
  created_at         INTEGER NOT NULL,
  resolved_at        INTEGER
);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON financial_alerts (status);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON financial_alerts (type);
CREATE INDEX IF NOT EXISTS idx_alerts_entity ON financial_alerts (entity_type, entity_id);

-- ============ העדפות פיננסיות (Finance Preferences) ============
-- שורה יחידה (id='default'). ברמת העסק (§25).
CREATE TABLE IF NOT EXISTS finance_preferences (
  id                              TEXT PRIMARY KEY DEFAULT 'default',
  currency                        TEXT NOT NULL DEFAULT 'ILS',
  cash_threshold                  REAL NOT NULL DEFAULT 0,
  forecast_months                 INTEGER NOT NULL DEFAULT 12,
  default_scenario                TEXT NOT NULL DEFAULT 'realistic', -- committed|realistic|optimistic
  overdue_grace_days              INTEGER NOT NULL DEFAULT 0,
  alert_renewal_days              TEXT NOT NULL DEFAULT '30,14,7',    -- CSV
  margin_warning_threshold        INTEGER NOT NULL DEFAULT 20,        -- אחוז
  revenue_concentration_threshold INTEGER NOT NULL DEFAULT 40,        -- אחוז
  default_opportunity_forecast_mode TEXT NOT NULL DEFAULT 'weighted', -- weighted|full|none
  optimistic_min_probability      INTEGER NOT NULL DEFAULT 30,        -- אחוז לתרחיש אופטימי
  unusual_expense_factor          REAL NOT NULL DEFAULT 2.5,          -- פי כמה מהממוצע נחשב חריג
  updated_at                      INTEGER
);
INSERT OR IGNORE INTO finance_preferences (id, updated_at) VALUES ('default', 0);

-- ============ תמונות יתרה (Balance Snapshots) ============
-- מבדיל בין Opening Balance היסטורי לבין Current Confirmed Balance (§14).
CREATE TABLE IF NOT EXISTS finance_balance_snapshots (
  id         TEXT PRIMARY KEY,
  amount     REAL NOT NULL DEFAULT 0,
  as_of_date TEXT NOT NULL,   -- YYYY-MM-DD
  notes      TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_balance_asof ON finance_balance_snapshots (as_of_date);

-- ============ הרחבת cashflow (nullable — §24) ============
ALTER TABLE cashflow ADD COLUMN vendor_id TEXT;
ALTER TABLE cashflow ADD COLUMN project_id TEXT;
ALTER TABLE cashflow ADD COLUMN category_id TEXT;
ALTER TABLE cashflow ADD COLUMN subcategory TEXT;
ALTER TABLE cashflow ADD COLUMN cost_type TEXT;          -- fixed|variable|direct|overhead
ALTER TABLE cashflow ADD COLUMN payment_method TEXT;
ALTER TABLE cashflow ADD COLUMN renewal_date TEXT;
ALTER TABLE cashflow ADD COLUMN cancel_notice_days INTEGER;
ALTER TABLE cashflow ADD COLUMN essential INTEGER;       -- 1|0
ALTER TABLE cashflow ADD COLUMN cancellable INTEGER;     -- 1|0
ALTER TABLE cashflow ADD COLUMN due_date TEXT;
ALTER TABLE cashflow ADD COLUMN actual_date TEXT;
ALTER TABLE cashflow ADD COLUMN expected_date TEXT;
ALTER TABLE cashflow ADD COLUMN external_ref TEXT;
ALTER TABLE cashflow ADD COLUMN source_type TEXT;
ALTER TABLE cashflow ADD COLUMN source_id TEXT;
ALTER TABLE cashflow ADD COLUMN confidence INTEGER;
