-- מעקב שימוש בסקילז של ECC לפי מערכת/פרויקט
CREATE TABLE IF NOT EXISTS skill_usage (
  id TEXT PRIMARY KEY,
  skill_name TEXT NOT NULL,
  system_id TEXT,
  system_name TEXT NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_skill_usage_skill ON skill_usage(skill_name);

-- זריעה: הסקילז שכבר הותקנו/יושמו ב-agency-hq
INSERT INTO skill_usage (id, skill_name, system_name, created_at) VALUES
 ('seed-mifb', 'make-interfaces-feel-better', 'agency-hq', 0),
 ('seed-fdd',  'frontend-design-direction',   'agency-hq', 0),
 ('seed-e2e',  'e2e-testing',                 'agency-hq', 0),
 ('seed-ofd',  'orch-fix-defect',             'agency-hq', 0),
 ('seed-op',   'orch-pipeline',               'agency-hq', 0),
 ('seed-ds',   'design-system',               'agency-hq', 0),
 ('seed-fam',  'fal-ai-media',                'agency-hq', 0);
