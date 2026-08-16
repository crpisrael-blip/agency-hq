-- דף נחיתה ציבורי שני (גרסה ב') — מאפשר להריץ שתי גרסאות במקביל ולהשוות מי מביא יותר לידים
ALTER TABLE systems ADD COLUMN lead_url_b TEXT;

-- מערכת הליבה מריצה שתי גרסאות של דף המכירה: /lp (א') ו-/lp2 (ב')
UPDATE systems
SET lead_url_b = 'https://agency-hq-1j1.pages.dev/lp2'
WHERE id = 'sys-agency-hq-core' AND (lead_url_b IS NULL OR lead_url_b = '');
