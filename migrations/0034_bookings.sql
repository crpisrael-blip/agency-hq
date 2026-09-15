-- קביעת שיחה מהאתר הציבורי — משבצות זמינות שאני פותח ידנית + פגישות שנקבעו.
--
-- booking_slots : משבצת זמן שאני פותח (תאריך+שעה+אורך). כל משבצת פנויה עד שנתפסת.
-- bookings      : פגישה שנקבעה על משבצת. slot_id ייחודי → אי אפשר לתפוס אותה משבצת פעמיים.
--
-- כל הזמנים ב-epoch ms (שעון ישראל בתצוגה, כמו שאר המערכת).

CREATE TABLE IF NOT EXISTS booking_slots (
  id          TEXT PRIMARY KEY,
  start_at    INTEGER NOT NULL,          -- מועד תחילת הפגישה
  duration_min INTEGER NOT NULL DEFAULT 30,
  note        TEXT,                      -- הערה פנימית אופציונלית (למשל "רק זום")
  status      TEXT NOT NULL DEFAULT 'open', -- open | booked | closed
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_slots_start ON booking_slots (start_at);
CREATE INDEX IF NOT EXISTS idx_slots_status ON booking_slots (status);

CREATE TABLE IF NOT EXISTS bookings (
  id               TEXT PRIMARY KEY,
  slot_id          TEXT NOT NULL UNIQUE REFERENCES booking_slots(id), -- ייחודי = מונע כפל-הזמנה
  lead_id          TEXT,                 -- הליד שנוצר מהקביעה (CRM)
  start_at         INTEGER NOT NULL,     -- צילום המועד (גם אם המשבצת תשתנה)
  duration_min     INTEGER NOT NULL DEFAULT 30,
  name             TEXT,
  phone            TEXT,
  meeting_type     TEXT NOT NULL DEFAULT 'phone', -- phone | zoom
  meeting_link     TEXT,                 -- קישור הזום (צילום מההגדרות בעת הקביעה)
  note             TEXT,                 -- מה הלקוח כתב על הפנייה
  status           TEXT NOT NULL DEFAULT 'booked', -- booked | cancelled | done | noshow
  whatsapp_status  TEXT,                 -- sent | failed | skipped | NULL — הודעת האישור
  whatsapp_error   TEXT,
  confirm_sent_at  INTEGER,
  remind24_sent_at INTEGER,              -- מתי נשלחה תזכורת 24 שעות
  remind1_sent_at  INTEGER,              -- מתי נשלחה תזכורת שעה
  created_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bookings_start ON bookings (start_at);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings (status);
