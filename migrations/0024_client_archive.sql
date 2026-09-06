-- ארכוב ארגון/לקוח — הסתרה ממסך הלקוחות בלי מחיקה (0 = פעיל, 1 = בארכיון)
ALTER TABLE clients ADD COLUMN archived INTEGER DEFAULT 0;
