-- מהלך מסוג "תבנית מסמך" (One-Pager, SOW, ADR…) — צילום גוף המסמך לעריכה.
-- בלי זה, החלת פורמט מסוג template יצרה מהלך ריק: בלי פריטים ובלי מקום למלא.
ALTER TABLE playbook_runs ADD COLUMN kind TEXT NOT NULL DEFAULT 'checklist';
ALTER TABLE playbook_runs ADD COLUMN doc TEXT;

-- השלמה למהלכים קיימים: סוג הפורמט וגוף המסמך מהתבנית שממנה נוצרו
UPDATE playbook_runs
   SET kind = (SELECT p.kind FROM playbooks p WHERE p.id = playbook_runs.playbook_id)
 WHERE playbook_id IN (SELECT id FROM playbooks);

UPDATE playbook_runs
   SET doc = (SELECT p.body FROM playbooks p WHERE p.id = playbook_runs.playbook_id)
 WHERE doc IS NULL AND kind = 'template' AND playbook_id IN (SELECT id FROM playbooks);
