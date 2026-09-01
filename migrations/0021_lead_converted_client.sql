-- קישור ליד ללקוח שנוצר ממנו — מונע המרה כפולה ומאפשר "פתח לקוח" מהליד
ALTER TABLE leads ADD COLUMN converted_client_id TEXT;
