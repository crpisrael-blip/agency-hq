-- מקור הסקיל ונתיב הגישה אליו — יש עכשיו כמה מקורות לסקילז (ECC + skills-il),
-- ולכל סימון "מותקן ב…" נשמר מאיפה הסקיל הגיע ואיך מגיעים אליו.
--   source     : 'ecc' (affaan-m/ecc) | 'skills-il' (github.com/skills-il)
--   source_ref : נתיב גישה קריא, למשל skills-il/localization/hebrew-i18n
--                או affaan-m/ecc/skills/tdd-workflow (NULL בשורות ישנות — הקטלוג משלים)
ALTER TABLE skill_usage ADD COLUMN source TEXT NOT NULL DEFAULT 'ecc';
ALTER TABLE skill_usage ADD COLUMN source_ref TEXT;
CREATE INDEX IF NOT EXISTS idx_skill_usage_source ON skill_usage(source, skill_name);

-- הסקילז העבריים שכבר מותקנים ב-agency-hq הגיעו מ-skills-il, לא מ-ECC
UPDATE skill_usage SET source='skills-il', source_ref='skills-il/localization/hebrew-document-generator'
 WHERE id='seed-hdg';
INSERT OR IGNORE INTO skill_usage (id, skill_name, system_name, source, source_ref, created_at) VALUES
 ('seed-hcw', 'hebrew-content-writer', 'agency-hq', 'skills-il', 'skills-il/localization/hebrew-content-writer', 0);
