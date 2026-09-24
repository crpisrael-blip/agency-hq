-- שלבי מכירה: הזמנה → הושלם → קבלה. sales_deals = מעטפת שמקשרת הצעת מחיר קיימת
-- (quotes) להזמנה (sales_orders) ולקבלות שהופקו לה (sales_receipts).
-- שמות עם קידומת sales_ בכוונה — כדי לא להתנגש עם expense_receipts (קבלות שהעסק
-- מקבל על הוצאותיו שלו, קובץ ב-R2, לא קשור).
-- מיגרציה לא-הרסנית: אין DROP, אין מחיקת נתונים, אין שינוי טיפוס של עמודות קיימות.

CREATE TABLE IF NOT EXISTS sales_deals (
  id              TEXT PRIMARY KEY,
  quote_id        TEXT NOT NULL,                  -- ההצעה שממנה נפתחה העסקה (quotes.id)
  client_id       TEXT,                            -- snapshot מ-quotes.client_id (אם קיים ברשימת הלקוחות)
  client_name     TEXT NOT NULL,                   -- snapshot מ-quotes.client_name
  title           TEXT,                             -- snapshot מ-quotes.title
  stage           TEXT NOT NULL DEFAULT 'order',    -- order | completed | receipt_issued
  total_amount    REAL NOT NULL DEFAULT 0,          -- snapshot מ-quotes.total
  order_opened_at INTEGER NOT NULL,
  completed_at    INTEGER,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sales_deals_stage ON sales_deals(stage);
-- מונע פתיחת שתי עסקאות לאותה הצעת מחיר (אידמפוטנטיות על "פתח הזמנה") ומשמש גם אינדקס חיפוש
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_deals_quote_unique ON sales_deals(quote_id);

CREATE TABLE IF NOT EXISTS sales_orders (
  id             TEXT PRIMARY KEY,
  deal_id        TEXT NOT NULL,
  order_no       TEXT NOT NULL,                    -- מספר רץ אטומי (src/api/doc-numbering.ts), לא timestamp
  client_name    TEXT,
  title          TEXT,
  items          TEXT NOT NULL DEFAULT '[]',        -- JSON snapshot מפריטי ההצעה
  subtotal       REAL NOT NULL DEFAULT 0,
  vat_pct        REAL NOT NULL DEFAULT 0,
  total          REAL NOT NULL DEFAULT 0,
  delivery_notes TEXT,
  created_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sales_orders_deal ON sales_orders(deal_id);

-- קבלות ללקוח (יוצאות) — לא לבלבל עם expense_receipts (קבלות שהעסק *מקבל* על
-- הוצאותיו שלו). Append-only במכוון: אין UPDATE/DELETE נחשפים ב-API אחרי יצירה.
-- תיקון/ביטול = שורת "קבלת זיכוי" חדשה (kind='credit'), לא עריכה של הקיימת.
CREATE TABLE IF NOT EXISTS sales_receipts (
  id                 TEXT PRIMARY KEY,
  deal_id            TEXT NOT NULL,
  receipt_no         INTEGER NOT NULL,              -- מספר רץ, סדרתי, ללא פערים (src/api/doc-numbering.ts)
  kind               TEXT NOT NULL DEFAULT 'receipt', -- receipt | credit
  credits_receipt_id TEXT,                          -- רק ב-kind='credit': ה-id של הקבלה המזוכה
  credit_reason      TEXT,                          -- רק ב-kind='credit': סיבת הזיכוי (חובה)
  issue_date         TEXT NOT NULL,                 -- YYYY-MM-DD, שעון ישראל (todayIL())
  business_name      TEXT NOT NULL,                 -- כל שדות ה-business_* הם SNAPSHOT מהגדרות
  business_tax_id    TEXT NOT NULL,                 -- העסק בזמן ההנפקה, לא הפניה חיה — כדי שקבלה
  business_address   TEXT NOT NULL,                 -- ישנה תמיד תשקף נכון את המצב כפי שהיה אז.
  customer_name      TEXT,                          -- לא חובה (לפי דרישת המשתמש)
  amount             REAL NOT NULL,
  payment_method     TEXT NOT NULL,                 -- cash | bank_transfer | credit_card | check | other
  description        TEXT NOT NULL,
  issuer_name        TEXT NOT NULL,                 -- שם המנפיק (= "חתימה" בהדפסה)
  created_at         INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_receipts_no ON sales_receipts(receipt_no);
CREATE INDEX IF NOT EXISTS idx_sales_receipts_deal ON sales_receipts(deal_id);
CREATE INDEX IF NOT EXISTS idx_sales_receipts_credits ON sales_receipts(credits_receipt_id);

-- שימור התנהגות קיימת: הפרטים שהיו קבועים בקוד תבנית ההצעה (index.html) עד כה,
-- כברירת מחדל בטבלת settings — כדי שהצעת מחיר לא תשתנה לפני שהמנהל ממלא את מסך
-- ההגדרות החדש. מספר עוסק/כתובת/שם מנפיק לא קיימים היום בשום מקום — במכוון לא
-- מוזנים כברירת מחדל; ה-API חוסם הנפקת קבלה עד שהם ימולאו.
INSERT OR IGNORE INTO settings (key, value) VALUES ('business_name', 'ORT-TECH');
INSERT OR IGNORE INTO settings (key, value) VALUES ('business_phone', '050-4860199');
INSERT OR IGNORE INTO settings (key, value) VALUES ('business_email', 'menahemtzik1@gmail.com');
INSERT OR IGNORE INTO settings (key, value) VALUES ('business_website', 'ort-tech.co.il');
INSERT OR IGNORE INTO settings (key, value) VALUES ('business_logo_url', '/ort-tech-logo.png');
