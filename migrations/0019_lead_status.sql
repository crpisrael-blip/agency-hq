-- ניהול לידים: סטטוס טיפול + חותמת זמן טיפול
-- status: new (חדש) | contacted (נוצר קשר) | qualified (רלוונטי) | won (נסגר) | lost (לא רלוונטי)
ALTER TABLE leads ADD COLUMN status TEXT DEFAULT 'new';
ALTER TABLE leads ADD COLUMN handled_at INTEGER;
