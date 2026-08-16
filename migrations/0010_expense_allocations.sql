-- שיוך הוצאה לפרויקטים + פיצול עלות בין כמה פרויקטים (client_id ריק = מערכת הניהול עצמה)
CREATE TABLE IF NOT EXISTS expense_allocations (
  id TEXT PRIMARY KEY,
  cashflow_id TEXT NOT NULL REFERENCES cashflow(id),
  client_id TEXT REFERENCES clients(id),
  weight REAL NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alloc_cashflow ON expense_allocations(cashflow_id);
CREATE INDEX IF NOT EXISTS idx_alloc_client ON expense_allocations(client_id);
