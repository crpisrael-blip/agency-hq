-- תיעוד שיחות עם לקוחות — מי יזם, מה דובר, מה סוכם, רעיונות ומשימות שנגזרו.
-- שיחה מקושרת אופציונלית ללקוח/מערכת. רעיונות ומשימות שנגזרו נשמרים כישויות
-- אמיתיות (profit_centers / tasks) והמזהים שלהם נשמרים כאן כ-snapshot (JSON).
CREATE TABLE IF NOT EXISTS calls (
  id           TEXT PRIMARY KEY,
  client_id    TEXT,                              -- לקוח מקושר (אופציונלי)
  client_name  TEXT,                              -- שם לתצוגה / שיחה ללא לקוח משויך
  system_id    TEXT,                              -- מערכת מקושרת (אופציונלי)
  initiator    TEXT NOT NULL DEFAULT 'me',        -- מי יזם: me | client | other
  contact_name TEXT,                              -- עם מי דיברתי
  channel      TEXT NOT NULL DEFAULT 'phone',     -- phone | whatsapp | video | meeting | other
  occurred_at  INTEGER NOT NULL,                  -- מתי בוצעה השיחה (ms)
  duration_min INTEGER,                           -- משך בדקות (אופציונלי)
  discussed    TEXT,                              -- מה דובר
  agreed       TEXT,                              -- מה סוכם
  ideas        TEXT,                              -- רעיונות (טקסט חופשי — גיבוי)
  notes        TEXT,                              -- הערות נוספות
  task_ids     TEXT NOT NULL DEFAULT '[]',        -- JSON: מזהי המשימות שנגזרו מהשיחה
  idea_ids     TEXT NOT NULL DEFAULT '[]',        -- JSON: מזהי הרעיונות (מרכזי רווח) שנוצרו
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_calls_client ON calls (client_id);
CREATE INDEX IF NOT EXISTS idx_calls_occurred ON calls (occurred_at);
