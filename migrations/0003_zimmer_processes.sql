-- מפת תהליכים · צימר נווה זית
-- ---------------------------------------------------------------
-- נשמר בטבלת processes (המקום המיועד לתהליכי עבודה ומסעות לקוח).
-- מקור מלא (דיאגרמות): https://claude.ai/code/artifact/d421d4a9-b4a6-4d21-98fa-f7875285f568
-- אידמפוטנטי (INSERT OR IGNORE) — בטוח להרצה חוזרת.

INSERT OR IGNORE INTO processes (id, client_id, system_id, name, kind, status, steps, description, created_at)
VALUES ('proc-zimmer-journey', 'cl-zimmer-neve-zayit', 'sys-zimmer-neve-zayit',
        'מסע האורח — מגילוי ועד שימור', 'journey', 'active',
        '[{"title":"גילוי","owner":"אתר ציבורי","trigger":"חיפוש / אינסטגרם","notes":"האורח מגיע לאתר התדמית","done":true},{"title":"הצעת מחיר וזמינות","owner":"מנוע תמחור","trigger":"בחירת תאריכים","notes":"חישוב בזמן אמת מול לוח הזמינות","done":true},{"title":"פנייה","owner":"מודול פניות","trigger":"טופס או וואטסאפ","notes":"ליד נשמר במערכת","done":true},{"title":"התראה מיידית לבעלים","owner":"notifyLead()","trigger":"פנייה חדשה","notes":"פוש לנייד דרך webhook או וואטסאפ","done":true},{"title":"ניהול הפנייה","owner":"מודול פניות","trigger":"מענה של הבעלים","notes":"מעקב וסטטוס","done":true},{"title":"המרה להזמנה","owner":"מודול הזמנות","trigger":"סגירה מול האורח","notes":"נוצר כרטיס אורח ומשימות תפעול","done":true},{"title":"תשלומים","owner":"מודול כספים","trigger":"מקדמה ויתרה","notes":"עדכון יתרה חיה","done":true},{"title":"שהות וביקורת","owner":"תפעול ותגובות","trigger":"כניסת האורח","notes":"משימות כניסה ויציאה ואיסוף ביקורת","done":true}]',
        'התהליך העסקי המרכזי: כיצד מתעניין הופך לאורח משלם וללקוח חוזר. 8 שלבים, כל שלב במודול ייעודי. מפת תהליכים מלאה: https://claude.ai/code/artifact/d421d4a9-b4a6-4d21-98fa-f7875285f568',
        1787097600000);

INSERT OR IGNORE INTO processes (id, client_id, system_id, name, kind, status, steps, description, created_at)
VALUES ('proc-zimmer-booking', 'cl-zimmer-neve-zayit', 'sys-zimmer-neve-zayit',
        'מחזור חיי ההזמנה', 'process', 'active',
        '[{"title":"ממתין","owner":"סטטוס הזמנה","trigger":"יצירת הזמנה","notes":"טרם אושרה","done":true},{"title":"מאושר","owner":"סטטוס הזמנה","trigger":"אישור הבעלים","notes":"ההזמנה נסגרה","done":true},{"title":"בשהות","owner":"סטטוס הזמנה","trigger":"צ׳ק-אין","notes":"האורח במקום","done":true},{"title":"הסתיים","owner":"סטטוס הזמנה","trigger":"צ׳ק-אאוט","notes":"פותח את שלב הביקורת","done":true},{"title":"בוטל","owner":"סטטוס הזמנה","trigger":"ביטול בכל שלב","notes":"ענף צדדי","done":true},{"title":"ציר תשלום: לא שולם ← מקדמה ← שולם","owner":"מודול כספים","trigger":"כל תשלום","notes":"ציר מקביל שמעדכן יתרה ולוח בקרה","done":true}]',
        'מכונת מצבים דו-צירית: סטטוס ההזמנה וסטטוס התשלום, בלתי-תלויים. צבעים זהים למסך הניהול. מקור: https://claude.ai/code/artifact/d421d4a9-b4a6-4d21-98fa-f7875285f568',
        1787097600000);

INSERT OR IGNORE INTO processes (id, client_id, system_id, name, kind, status, steps, description, created_at)
VALUES ('proc-zimmer-collab', 'cl-zimmer-neve-zayit', 'sys-zimmer-neve-zayit',
        'הצעת ערך ושיתופי פעולה', 'process', 'active',
        '[{"title":"קטלוג חבילות ושותפים","owner":"מסך שת״פ","trigger":"הקמת חבילה","notes":"כולל בוחן כדאיות","done":true},{"title":"צירוף חוויה להזמנה","owner":"מודול הזמנות","trigger":"בחירת תוספת מהקטלוג","notes":"","done":true},{"title":"הצעת מחיר משולבת","owner":"מודול הזמנות","trigger":"בניית הצעה","notes":"לינה + תוספות","done":true},{"title":"אישור האורח","owner":"וואטסאפ","trigger":"שליחת ההצעה","notes":"","done":true},{"title":"רישום מכירה","owner":"addonSales","trigger":"אישור האורח","notes":"","done":true},{"title":"אספקה אוטומטית","owner":"runFulfillment()","trigger":"סימון סופק","notes":"ניכוי מלאי / משימת שותף / הרכבה","done":true},{"title":"רישום הכנסה","owner":"מודול כספים","trigger":"סיום אספקה","notes":"רווח = מחיר פחות עלות","done":true}]',
        'מנוע רווח נוסף מעבר ללינה: קטלוג חבילות ושותפים ההופך לחוויה מצורפת להזמנה, נארז כהצעה אחת ונרשם כהכנסה. מקור: https://claude.ai/code/artifact/d421d4a9-b4a6-4d21-98fa-f7875285f568',
        1787097600000);

INSERT OR IGNORE INTO processes (id, client_id, system_id, name, kind, status, steps, description, created_at)
VALUES ('proc-zimmer-architecture', 'cl-zimmer-neve-zayit', 'sys-zimmer-neve-zayit',
        'ארכיטקטורה, מודולים והרשאות', 'sop', 'active',
        '[{"title":"חזיתות משתמש","owner":"—","trigger":"—","notes":"אתר ציבורי · מסך ניהול · אזור אישי","done":true},{"title":"שכבת API","owner":"Cloudflare Worker + Hono","trigger":"—","notes":"‎/api/*‎ עם requireAuth ו-requireRole","done":true},{"title":"מסד נתונים","owner":"Cloudflare D1","trigger":"—","notes":"SQLite בקצה עם Drizzle ORM","done":true},{"title":"ערוצים חיצוניים","owner":"—","trigger":"—","notes":"WhatsApp · Webhook התראות · Agency HQ","done":true},{"title":"מודל הרשאות","owner":"—","trigger":"—","notes":"מנהל מערכת · מנהל בעלים · לקוח","done":true}]',
        'מבט-על טכני: שלוש חזיתות מעל שכבת API אחת, מסד D1 יחיד, ערוצים חיצוניים ומודל הרשאות מדורג. מקור: https://claude.ai/code/artifact/d421d4a9-b4a6-4d21-98fa-f7875285f568',
        1787097600000);
