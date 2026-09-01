# BOS — Business Operating System (ארגון מחדש)

מסמך זה מתאר את המעבר של Agency HQ מ"אוסף מודולים" ל־BOS: מערכת שמנהלת את כל מחזור החיים העסקי סביב **תהליך**, לא סביב מודול.

## הזרימה העסקית

```
ליד → הזדמנות → לקוח → פרויקט → מסירה → תמיכה → צמיחה → הזדמנות חדשה
```

## המודל

```
Organization (ארגון)
 ├── Contacts (אנשי קשר)
 ├── Opportunities (הזדמנויות)  ← שלב המכירה חי כאן, לא בארגון
 │    ├── Pains (כאבים)
 │    ├── Solutions (פתרונות)
 │    └── Proposals (הצעות, מגורסות)
 ├── Projects (פרויקטים)
 │    ├── Milestones (אבני דרך)
 │    └── Change Requests (בקשות שינוי)
 ├── Engagements (התקשרויות — התחייבות מסחרית מאושרת בלבד)
 └── Activities (Timeline + Audit Trail)
```

## החלטות ארכיטקטורה מרכזיות

1. **Organizations = שכבת התאמה מעל `clients`.** לא שוכפלו נתונים ולא נמחק דבר. ה־API של
   `/organizations` קורא/כותב לטבלת `clients` (מקור אמת יחיד) אך **אינו חושף/כותב `stage`**.
   הסטטוסים ממופים לתצוגה: `active→customer`, `churned→former_customer`.

2. **`clients.stage` הוא legacy בלבד.** נשאר בסכמה ובנתונים, ואינו בשימוש במודל/UI החדש
   (שלב המכירה עבר ל־`opportunities.stage`). יש להסירו רק כשאף חלק אינו תלוי בו.

3. **Pipeline מחושב מהזדמנויות פעילות** (`estimatedValue`), לא מ־`engagements.status='proposed'`.
   Weighted = `estimatedValue × probability`.

4. **הצעות אינן נדרסות.** שינוי מהותי יוצר `version+1` (endpoint `revise`). שינוי סטטוס מתעד
   חותמות זמן (`sentAt/acceptedAt/rejectedAt`) ורושם `activity` מסוג `status_change`.

5. **Audit Trail** נרשם אוטומטית בכל שינוי סטטוס מהותי (הזדמנות/פרויקט/הצעה/בקשת שינוי)
   דרך `logStatusChange` → טבלת `activities` (`type=status_change`, `metadata={previous,new}`).

6. **קישורים אופציונליים** נוספו כ־nullable ולא שוברים קיים:
   `systems.projectId`, `processes.projectId`, `modules.projectId`,
   `engagements.opportunityId/projectId/proposalId`.

## מיגרציה (0019_bos_restructure.sql) — לא הרסני

- שלב א׳: יצירת כל הטבלאות החדשות + עמודות FK חדשות (nullable) + `clients.website/updated_at`.
- Backfill: איש קשר ראשי נגזר מ־`clients.contact_name/role/phone/email` (רק אם מולאו, `INSERT OR IGNORE`).
- אין `DROP` ואין שינוי ערכי נתונים קיימים.

### מיפוי רשומות בעייתיות
אם לא ברור כיצד למפות רשומה קיימת — **לא מנחשים ולא מוחקים**: משאירים `NULL`/Legacy ומתעדים כאן.

## אוטומציות (מיושמות)

| טריגר | תוצאה |
|-------|-------|
| Opportunity → Won | כפתור "צור פרויקט" (`convert-to-project`) |
| Proposal → Accepted | כפתור "→ התקשרות" (`create-engagement`) |
| Profit Center (מקושר לארגון) | "המר להזדמנות" (`from-profit-center`) |
| כל שינוי סטטוס מהותי | רישום `activity` מסוג `status_change` |
| Opportunity → Discovery/Diagnosis/Proposal | Autolaunch פלייבוק (שיחת גילוי / אפיון / SOW) |
| Project → Specification/Build/Internal Test/Live/Completed | Autolaunch פלייבוק (מודל נתונים / DoD / QA / Go-Live / מסירה) |

**Autolaunch** (`src/api/autolaunch.ts`) רץ בצד השרת בתוך ה-PATCH של הזדמנות/פרויקט, אידמפוטנטי
(לא פותח שוב מהלך פעיל מאותה תבנית), זורע את התבנית מ-DEFAULT_PLAYBOOKS אם חסרה, ורושם `activity`
מסוג `automation`. כך הפלייבוק הופך למנוע העבודה של המערכת.

### להוספה הדרגתית (follow-up)
אוטומציות מבוססות-זמן שדורשות מתזמן: "30 יום אחרי סיום → QBR", "Project Completed → Follow-up task".

## Frontend

- ניווט ראשי בעברית: **היום · מכירות · לקוחות · עבודה · כספים · צמיחה** (+ תפריט "עוד").
- תחילת פיצול `public/app.html`: `public/js/labels.js` (מילון תוויות) + `public/js/bos.js` (מסכי BOS).
  שאר המסכים הוותיקים נשמרים inline ונגישים; הפיצול ימשך בהדרגה.
