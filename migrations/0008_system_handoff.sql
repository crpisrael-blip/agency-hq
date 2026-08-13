-- מסירה ללקוח: כתובת ממשק ניהול + פרטי כניסה ראשונית
ALTER TABLE systems ADD COLUMN admin_url TEXT;
ALTER TABLE systems ADD COLUMN credentials TEXT;
