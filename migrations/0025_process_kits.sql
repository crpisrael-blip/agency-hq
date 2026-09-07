-- ערכות תהליך: בחירה שמורה של מספר פורמטים מהמתודולוגיה שמרכיבים יחד תהליך שלם
-- ללקוח מסוג מסוים (אתר תדמית / מערכת ניהול / חנות / אפליקציה…).
-- process_kits = תבנית של אוסף מזהי-פלייבוק, ניתנת לעריכה (config-over-code),
-- מוחלת על לקוח בקליק אחד → יוצרת מהלך חי לכל פורמט בערכה.

CREATE TABLE IF NOT EXISTS process_kits (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  project_type TEXT,                       -- סוג הפרויקט שהערכה מתאימה לו (תווית חופשית)
  summary      TEXT,                       -- שורה אחת: למי ומתי מתאימה הערכה
  playbook_ids TEXT NOT NULL DEFAULT '[]', -- JSON: ["pb_...","pb_..."] לפי סדר התהליך
  sort         INTEGER NOT NULL DEFAULT 0,
  builtin      INTEGER NOT NULL DEFAULT 0, -- 1 = ערכת ברירת מחדל (ניתנת לעריכה/מחיקה)
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER
);
