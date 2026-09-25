-- מסמכים — צירוף קובץ (R2) למסמך/תוצר
-- ---------------------------------------------------------------
-- מיגרציה לא-הרסנית: עמודות חדשות בלבד. הקובץ עצמו נשמר ב-R2 (אותו bucket פרטי
-- של הקבלות, תחת הקידומת documents/), כאן רק מטא-דאטה + מפתח. גישה מוגנת בטוקן מנהל.
ALTER TABLE documents ADD COLUMN file_key TEXT;    -- מפתח האובייקט ב-R2 (ריק = אין קובץ)
ALTER TABLE documents ADD COLUMN file_name TEXT;   -- שם הקובץ המקורי
ALTER TABLE documents ADD COLUMN file_type TEXT;   -- MIME
ALTER TABLE documents ADD COLUMN file_size INTEGER; -- גודל בבתים
