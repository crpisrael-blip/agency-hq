-- זריעת שלוש המערכות של פרויקט ה-HR (מערכת גיוס והשמה) תחת הלקוח URSA GROUP.
-- שלוש פריסות נפרדות מתוך המונורפו crpisrael-blip/hr:
--   apps/public-site  → אתר משרות ציבורי (hr.ort-tech.co.il)
--   apps/team-app     → ממשק צוות לניהול גיוס (hr-app.ort-tech.co.il)
--   apps/candidate-app → אזור אישי למועמדים (my.hr.ort-tech.co.il)
--
-- אידמפוטנטי: מזהים קבועים + NOT EXISTS, לא דורס עריכות ידניות.
-- מקושר ללקוח לפי שם (URSA GROUP). אם הלקוח לא קיים בזמן ההרצה — לא מוכנס דבר
-- ואין שגיאה; יש ליצור את הלקוח ואז להריץ שוב את הזריעה (ראו scripts/ או "+ מערכת" ידני).
-- פרטי כניסה/אדמין לא נכללים כאן — יש להשלים ידנית בכרטיס המערכת.

INSERT INTO systems (id, client_id, name, kind, stack, status, url, repo_url, idea_bubble, progress, description, created_at)
SELECT 'sys_ursa_hr_public', c.id,
  'HR — אתר משרות ציבורי',
  'website',
  'Astro · Cloudflare Pages (אתר סטטי)',
  'building',
  'https://hr.ort-tech.co.il',
  'https://github.com/crpisrael-blip/hr',
  0, 0,
  'האתר הציבורי של מערכת הגיוס: פרסום משרות והגשת מועמדות. HTML סטטי שנצרב בזמן בנייה. נבנה מ-apps/public-site.',
  unixepoch() * 1000
FROM clients c
WHERE upper(trim(c.name)) = 'URSA GROUP'
  AND NOT EXISTS (SELECT 1 FROM systems s WHERE s.id = 'sys_ursa_hr_public');

INSERT INTO systems (id, client_id, name, kind, stack, status, url, admin_url, auth_method, auth_score, repo_url, idea_bubble, progress, description, created_at)
SELECT 'sys_ursa_hr_team', c.id,
  'HR — ממשק צוות (ניהול גיוס)',
  'web_app',
  'React + Vite (SPA) · Supabase (Postgres, סכמת app) · Cloudflare Pages',
  'building',
  'https://hr-app.ort-tech.co.il',
  'https://hr-app.ort-tech.co.il',
  'Supabase Auth (אימייל OTP)',
  4,
  'https://github.com/crpisrael-blip/hr',
  0, 0,
  'ממשק פנימי לניהול גיוס, לקוחות, משימות וכספים. מודל עובדים + מטריצת הרשאות + RLS. נבנה מ-apps/team-app.',
  unixepoch() * 1000
FROM clients c
WHERE upper(trim(c.name)) = 'URSA GROUP'
  AND NOT EXISTS (SELECT 1 FROM systems s WHERE s.id = 'sys_ursa_hr_team');

INSERT INTO systems (id, client_id, name, kind, stack, status, url, auth_method, auth_score, repo_url, idea_bubble, progress, description, created_at)
SELECT 'sys_ursa_hr_candidate', c.id,
  'HR — אזור אישי למועמדים (my.hr)',
  'web_app',
  'React + Vite (SPA) · Supabase (Postgres) · Cloudflare Pages',
  'building',
  'https://my.hr.ort-tech.co.il',
  'Supabase Auth (אימייל OTP / SMS)',
  4,
  'https://github.com/crpisrael-blip/hr',
  0, 0,
  'אזור אישי למועמדים: מעקב סטטוס מועמדות, מסמכים וראיונות. נבנה מ-apps/candidate-app.',
  unixepoch() * 1000
FROM clients c
WHERE upper(trim(c.name)) = 'URSA GROUP'
  AND NOT EXISTS (SELECT 1 FROM systems s WHERE s.id = 'sys_ursa_hr_candidate');
