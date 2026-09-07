-- קישור הצעת מחיר למהלך מתודולוגיה שהושלם (של אותו לקוח) — נספח מצורף.
ALTER TABLE quotes ADD COLUMN run_id TEXT;
ALTER TABLE quotes ADD COLUMN run_title TEXT;
