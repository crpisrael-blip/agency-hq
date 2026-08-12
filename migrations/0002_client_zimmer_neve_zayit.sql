-- רישום לקוח חדש: צימר נווה זית (מערכת ניהול צימר)
-- ---------------------------------------------------------------

INSERT OR IGNORE INTO clients (id, name, industry, size, contact_name, phone, status, stage, health, tags, notes, created_at)
VALUES ('cl-zimmer-neve-zayit', 'צימר נווה זית', 'תיירות ואירוח', 'micro',
        'צימר נווה זית', '0526052582', 'active', 'live', 'green', 'צימר,תיירות,אירוח',
        'צימר לזוגות בכוכב השחר — בריכה פרטית, ג''קוזי, מטבח כשר. מקבלים שובר נופש מילואים.',
        1786555200000);

INSERT OR IGNORE INTO systems (id, client_id, name, kind, stack, status, url, repo_url, start_date, progress, description, created_at)
VALUES ('sys-zimmer-neve-zayit', 'cl-zimmer-neve-zayit', 'מערכת ניהול צימר נווה זית', 'web_app',
        'Cloudflare Workers + Static Assets + D1 + Hono + Drizzle', 'live',
        'https://zimmer-neve-zayit.menahemtzik1.workers.dev', 'https://github.com/crpisrael-blip/zimmer-neve-zayit',
        '2026-08-12', 100,
        'אתר תדמית ציבורי + מערכת ניהול הזמנות מלאה: יומן זמינות, מנוע תמחור, לידים, תשלומים ולוח בקרה.',
        1786555200000);

-- התקשרות התחלתית (טיוטה) — לעדכון מודל החיוב בפועל במחשבון החיוב
INSERT OR IGNORE INTO engagements (id, client_id, system_id, title, model, status, setup_fee, monthly_fee, start_date, billing_day, notes, created_at)
VALUES ('eng-zimmer-neve-zayit', 'cl-zimmer-neve-zayit', 'sys-zimmer-neve-zayit',
        'הקמת מערכת ניהול לצימר נווה זית', 'retainer', 'proposed', 0, 0,
        '2026-08-12', 1, 'טיוטה — יש להשלים מודל חיוב (הקמה חד-פעמית + ריטיינר חודשי) במחשבון החיוב.',
        1786555200000);
