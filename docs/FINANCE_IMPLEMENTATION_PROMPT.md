# Claude Code — Finance Control Implementation Task

קרא במלואו לפני תחילת העבודה את:

1. `docs/FINANCE_CONTROL_SPEC.md`
2. `docs/BOS.md`

לאחר מכן עבור על הקוד הקיים בפועל לפני כל שינוי, במיוחד:

- finance API/services
- DB schema + migrations
- cashflow
- forecast/scenarios
- engagements
- opportunities
- proposals
- projects
- expense allocations
- tasks/activities/audit
- frontend של אזור כספים והתזרים

## המשימה

יישם מקצה לקצה את `docs/FINANCE_CONTROL_SPEC.md` בתוך המערכת הקיימת.

אל תבנה מערכת כספים מקבילה ואל תחליף רכיבים קיימים שעובדים ללא צורך. הרחב ושפר את הארכיטקטורה הקיימת.

## כללי ביצוע מחייבים

- קודם להבין את הקוד, אחר כך לשנות.
- שמור על תאימות מלאה לפונקציונליות קיימת.
- migrations לא הרסניות בלבד.
- אין DROP או מחיקת נתוני legacy.
- אין duplicate sources of truth.
- מנע double counting בין Opportunity, Proposal, Engagement, occurrences ו-Cashflow.
- השתמש ב-BOS הקיים כמקור ללקוחות, הזדמנויות, הצעות, התקשרויות ופרויקטים.
- כל חישוב פיננסי מרכזי יתבצע ב-backend ולא יוכפל ב-frontend.
- Actual ו-Forecast נשמרים לוגית בנפרד.
- Scenarios אינם משנים נתוני אמת.
- היסטוריה פיננסית שכבר הפכה ל-Actual לא תימחק או תיכתב מחדש ללא צורך מפורש.
- UI בעברית, RTL, responsive ומותאם גם לנייד.
- אין ליצור mock UI לא מחובר. כל מסך/כרטיס/KPI צריך לעבוד מול נתונים אמיתיים.
- כל KPI משמעותי צריך Drill Down או הסבר כיצד חושב.
- השתמש בעיצוב וב-components הקיימים של Agency HQ; אל תיצור שפה עיצובית זרה למערכת.

## סדר עבודה

בצע את העבודה ברצף הבא:

1. Audit של המימוש הקיים ומיפוי מה ניתן למחזר.
2. DB schema + migrations + safe backfill.
3. Finance domain/service layer ומנוע forecast מרכזי.
4. Financial occurrences / payment schedule.
5. Balance snapshots/preferences/categories/vendors/alerts לפי הצורך.
6. Control dashboard API.
7. Income + receivables + overdue + pipeline integration.
8. Expense control + recurring + renewals + allocations.
9. Daily 90-day + monthly 36-month forecast.
10. Committed / Realistic / Optimistic scenarios.
11. Profitability by client/project/business.
12. Integration with Today/Tasks/Activity Audit.
13. RTL frontend לכל מסכי הכספים.
14. Empty states, loading/error states, filters, drill-downs ו-mobile responsiveness.
15. Tests, build, migrations validation ו-regression checks.

## חשוב

אל תעצור לאחר Audit או תוכנית עבודה. לאחר שהבנת את המערכת, המשך ישירות ליישום.

אל תשאל אותי שאלות שניתן לפתור מתוך הקוד, הסכמה או האפיון. אם קיימת סתירה אמיתית, בחר בפתרון הבטוח ביותר ששומר backward compatibility ותעד את ההחלטה.

אם חלק מהאפיון כבר קיים — אל תשכפל אותו. בדוק אותו, תקן/הרחב רק אם נדרש, וסמן אותו כמיושם.

אם במהלך העבודה מתגלה שהצעה באפיון אינה מתאימה לארכיטקטורה בפועל, מותר להתאים את דרך המימוש, אך אסור לוותר על מטרת המוצר. תעד את ההתאמה בסיכום.

## בדיקות חובה לפני סיום

- migrations רצות על DB קיים ללא אובדן נתונים.
- build עובר.
- tests קיימים עוברים.
- הוסף tests ללוגיקות פיננסיות קריטיות.
- בדוק double-counting scenarios.
- בדוק recurring monthly/yearly calculations.
- בדוק due/overdue logic.
- בדוק opening/current balance + forecast cumulative balance.
- בדוק weighted pipeline.
- בדוק profitability allocations.
- בדוק scenario isolation.
- בדוק responsive RTL במסכים החדשים.
- ודא שהמסכים הישנים שלא הוחלפו עדיין עובדים.

## בסיום

החזר סיכום מסודר בלבד לאחר שהיישום והבדיקות הסתיימו:

1. מה יושם.
2. אילו migrations נוספו.
3. אילו APIs נוספו/שונו.
4. אילו מסכים נוספו/שונו.
5. אילו חלקים מהאפיון כבר היו קיימים ונעשה בהם reuse.
6. אילו החלטות ארכיטקטוניות התקבלו.
7. תוצאות build/tests.
8. דברים שנותרו, רק אם קיימת סיבה טכנית אמיתית שלא ניתן היה להשלים אותם.

המטרה הסופית: אזור **כספים** צריך להיות מרכז שליטה ניהולי שמראה מה מצב העסק עכשיו, מה צפוי לקרות, מה רווחי ומה דורש פעולה — ולא רק טבלת תזרים.
