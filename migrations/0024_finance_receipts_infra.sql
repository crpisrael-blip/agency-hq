-- Finance — קבלות (R2) + תשתיות למעקב בלבד
-- ---------------------------------------------------------------
-- מיגרציה לא-הרסנית: טבלת קבלות חדשה + עמודת track_only ל-cashflow.
-- אין DROP, אין מחיקת נתונים, אין שינוי טיפוס של עמודות קיימות.

-- ============ קבלות להוצאה (idea 1) ============
-- כל הוצאה יכולה לשאת מספר קבצי קבלה. הקובץ עצמו נשמר ב-R2 (bucket פרטי),
-- כאן נשמרת רק מטא-דאטה + מפתח האובייקט. גישה מוגנת בטוקן מנהל (כמו כל /api).
CREATE TABLE IF NOT EXISTS expense_receipts (
  id           TEXT PRIMARY KEY,
  cashflow_id  TEXT NOT NULL,                 -- ההוצאה שאליה שייכת הקבלה
  r2_key       TEXT NOT NULL,                 -- מפתח האובייקט ב-R2
  filename     TEXT,                          -- שם הקובץ המקורי (לתצוגה/הורדה)
  content_type TEXT,                          -- MIME (image/jpeg, application/pdf ...)
  size         INTEGER,                       -- גודל בבתים
  uploaded_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_expense_receipts_cashflow ON expense_receipts(cashflow_id);

-- ============ תשתית למעקב בלבד (idea 4) ============
-- מנוי/תשתית שאני רוצה לרשום כדי לדעת שהוא קיים (למשל מנוי ב-0 ₪), אך אינו
-- הוצאה שנספרת ב-Burn/תחזית/KPI. track_only=1 → מוצג במדף "תשתיות" בלבד.
ALTER TABLE cashflow ADD COLUMN track_only INTEGER NOT NULL DEFAULT 0;
