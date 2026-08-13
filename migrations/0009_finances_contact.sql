-- מודול כספים: יום חיוב למנויים חוזרים · פרטי איש קשר: תפקיד
ALTER TABLE cashflow ADD COLUMN billing_day INTEGER;
ALTER TABLE clients ADD COLUMN contact_role TEXT;
