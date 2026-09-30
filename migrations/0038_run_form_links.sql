-- טופס בקישור — מילוי עצמי של הלקוח דרך דף ווב (ערוץ נוסף לאותו מהלך מתודולוגיה)
-- ---------------------------------------------------------------
-- מיגרציה לא-הרסנית: טבלה חדשה בלבד. כמו telegram_fill_sessions — הטבלה מחזיקה רק
-- את מצב הקישור; התשובות עצמן נכנסות ישירות ל-playbook_runs.answers["si-ii"].
CREATE TABLE IF NOT EXISTS run_form_links (
  id               TEXT PRIMARY KEY,
  run_id           TEXT NOT NULL,
  token            TEXT NOT NULL,                  -- טוקן בלתי-ניחוש לקישור /f/<token>
  status           TEXT NOT NULL DEFAULT 'sent',   -- sent | opened | in_progress | completed | cancelled
  sent_at          INTEGER,
  opened_at        INTEGER,
  last_activity_at INTEGER,
  completed_at     INTEGER,
  created_at       INTEGER NOT NULL
);
-- קישור אחד פעיל לכל מהלך (יצירה מחדש מאפסת את הטוקן)
CREATE UNIQUE INDEX IF NOT EXISTS idx_run_form_links_run ON run_form_links(run_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_run_form_links_token ON run_form_links(token);
