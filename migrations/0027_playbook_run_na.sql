-- סימון "לא רלוונטי" לפריטים במהלך מתודולוגיה (checklist).
-- מפה בפורמט JSON { "si-ii": true } — פריט מסומן לא נספר באחוז ההשלמה ולא מודפס.
ALTER TABLE playbook_runs ADD COLUMN na TEXT NOT NULL DEFAULT '{}';
