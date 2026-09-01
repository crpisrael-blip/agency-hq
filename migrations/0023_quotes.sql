-- שמירת הצעות מחיר שנוצרו — לצפייה, הדפסה חוזרת ומעקב
CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  quote_no TEXT,
  client_id TEXT,
  client_name TEXT,
  title TEXT,
  items TEXT,
  subtotal REAL,
  vat_pct REAL,
  total REAL,
  terms TEXT,
  notes TEXT,
  valid_until TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_quotes_created ON quotes(created_at);
