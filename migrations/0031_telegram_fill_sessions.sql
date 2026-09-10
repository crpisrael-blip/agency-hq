-- מילוי עצמי של הלקוח דרך בוט Telegram — ערוץ שני לאותו מהלך מתודולוגיה.
-- טבלה זו אינה מחזיקה תשובות (התשובות נכנסות ישירות ל-playbook_runs.answers,
-- אותם שדות שממלאים ידנית במערכת) — היא מחזיקה רק את *מצב* ההזמנה והמילוי:
-- האם ההזמנה נשלחה, האם הלקוח פתח, התחיל לענות, כמה נענו, מתי הפעילות האחרונה,
-- האם הושלם ובאיזו שאלה הלקוח נעצר.
--
--   run_id      : המהלך (playbook_runs) שאליו התשובות זורמות
--   token       : טוקן חד-פעמי לקישור העמוק (t.me/<bot>?start=<token>) — בלתי-ניחוש
--   chat_id     : מזהה הצ'אט של הלקוח בטלגרם (מתמלא כשהלקוח לוחץ Start)
--   status      : sent | opened | in_progress | completed | cancelled
--   current_key : "si-ii" של השאלה שממתינה לתשובה כרגע (איפה הלקוח נעצר)
CREATE TABLE IF NOT EXISTS telegram_fill_sessions (
  id               TEXT PRIMARY KEY,
  run_id           TEXT NOT NULL,
  token            TEXT NOT NULL,
  chat_id          TEXT,
  contact_name     TEXT,
  status           TEXT NOT NULL DEFAULT 'sent',
  current_key      TEXT,
  total            INTEGER NOT NULL DEFAULT 0,
  answered_count   INTEGER NOT NULL DEFAULT 0,
  sent_at          INTEGER,
  opened_at        INTEGER,
  started_at       INTEGER,
  last_activity_at INTEGER,
  completed_at     INTEGER,
  created_at       INTEGER NOT NULL
);

-- מהלך אחד = הזמנת מילוי אחת פעילה (upsert לפי run_id בעת "שליחה ללקוח")
CREATE UNIQUE INDEX IF NOT EXISTS idx_tg_fill_run ON telegram_fill_sessions(run_id);
-- חיפוש מהיר לפי הטוקן (בעת /start) ולפי הצ'אט (בעת קבלת תשובה)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tg_fill_token ON telegram_fill_sessions(token);
CREATE INDEX IF NOT EXISTS idx_tg_fill_chat ON telegram_fill_sessions(chat_id);
