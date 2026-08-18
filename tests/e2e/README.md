# בדיקות E2E (Playwright)

חבילת בדיקות מקצה-לקצה ל-Agency HQ — מדמה משתמש אמיתי מול האפליקציה החיה
(שרת פיתוח מקומי + D1 מקומי).

## הרצה מהירה

```bash
npm run test:e2e            # כל החבילה (chromium + mobile-chrome)
npm run test:e2e -- --project=setup --project=chromium   # דפדפן אחד
npm run test:e2e:ui        # מצב UI אינטראקטיבי
npm run test:e2e:report    # פתיחת דוח ה-HTML האחרון
```

ה-`webServer` שבתצורה מריץ אוטומטית `npm run e2e:serve` (מיגרציות מקומיות +
`wrangler pages dev` על פורט 8790) לפני הבדיקות, וסוגר אותו בסיום.

## מבנה

```
tests/e2e/
├── auth.setup.ts      # מריץ פעם אחת: כניסה/הגדרת PIN ושמירת מצב-התחברות
├── pages/             # Page Object Model
│   ├── LoginPage.ts
│   ├── AppShell.ts    # סרגל עליון + ניווט
│   └── ClientsPage.ts
└── specs/
    ├── auth.spec.ts        # כניסה, קוד שגוי, יציאה
    ├── navigation.spec.ts  # מעבר בין מסכים
    ├── dashboard.spec.ts   # רצועת הכנסה + "טעון טיפול"
    ├── skills.spec.ts      # מאגר הסקילז (חיפוש, סינון, העתקה)
    └── clients.spec.ts     # יצירת לקוח מקצה-לקצה
```

## הגדרות סביבה

| משתנה | ברירת מחדל | הסבר |
|-------|-----------|------|
| `E2E_PIN` | `4321` | קוד הכניסה לבדיקות. בהרצה ראשונה על DB מקומי ריק — מגדיר אותו. |
| `BASE_URL` | `http://localhost:8790` | כתובת האפליקציה (אפשר לכוון לסביבת staging). |
| `PW_CHROMIUM_PATH` | — | נתיב ל-Chromium מותקן-מראש (למשל `/opt/pw-browsers/chromium`). ב-CI משתמשים ב-`npx playwright install` במקום. |

> הבדיקות מניחות D1 **מקומי** משלהן. אם כבר הוגדר PIN אחר מקומית — הרץ עם
> `E2E_PIN` תואם, או אפס את המצב המקומי (מחיקת `.wrangler/state`).
