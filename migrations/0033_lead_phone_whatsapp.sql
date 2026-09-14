-- ווטסאפ אוטומטי לליד: הודעת אישור מיידית למבקר שהשאיר פרטים באתר.
--
--   phone            : הטלפון של הליד כשדה נפרד (עד עכשיו נבלע בתוך note) — נדרש כדי לשלוח הודעה
--   whatsapp_status  : NULL (לא נשלח / לא מוגדר) | sent | failed | skipped (טלפון לא תקין / ווטסאפ כבוי)
--   whatsapp_sent_at : מועד השליחה בפועל
--   whatsapp_error   : סיבת כשל קצרה (לתצוגה בכרטיס הליד)
ALTER TABLE leads ADD COLUMN phone TEXT;
ALTER TABLE leads ADD COLUMN whatsapp_status TEXT;
ALTER TABLE leads ADD COLUMN whatsapp_sent_at INTEGER;
ALTER TABLE leads ADD COLUMN whatsapp_error TEXT;
