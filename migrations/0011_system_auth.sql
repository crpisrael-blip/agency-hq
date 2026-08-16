-- אופן כניסה/הזדהות לכל מערכת + ציון אבטחה 1–5 (5 = הכי מאובטח)
ALTER TABLE systems ADD COLUMN auth_method TEXT;
ALTER TABLE systems ADD COLUMN auth_score INTEGER;
