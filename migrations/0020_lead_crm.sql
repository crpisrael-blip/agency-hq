-- CRM לידים: הבחנה בין הלידים שלי (ORT-TECH) ללידים של מערכות לקוחות,
-- מעקב חזרה (follow-up) ויומן פעילות (תיעוד שיחות/פגישות/הערות)

-- דגל "העסק שלי" על לקוח — לידים של מערכות תחת לקוח כזה מנוהלים כ-CRM מלא;
-- כל השאר במעקב/ספירה בלבד
ALTER TABLE clients ADD COLUMN is_self INTEGER DEFAULT 0;
UPDATE clients SET is_self = 1 WHERE id = 'cl-agency-hq-core';

-- תאריך חזרה ללקוח (follow-up) על ליד
ALTER TABLE leads ADD COLUMN follow_up_at INTEGER;

-- יומן פעילות לליד: שיחה / הודעה / פגישה / הערה / שינוי סטטוס
CREATE TABLE IF NOT EXISTS lead_activities (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  text TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON lead_activities(lead_id);
