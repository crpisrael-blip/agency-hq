CREATE TABLE IF NOT EXISTS site_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  path TEXT NOT NULL,
  event_type TEXT NOT NULL,
  source TEXT NOT NULL,
  day TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_site_events_day_type ON site_events(day, event_type);
CREATE INDEX IF NOT EXISTS idx_site_events_day_session ON site_events(day, session_id);
CREATE TRIGGER IF NOT EXISTS prune_site_events AFTER INSERT ON site_events
BEGIN
  DELETE FROM site_events WHERE day < date(NEW.day, '-180 days');
END;
