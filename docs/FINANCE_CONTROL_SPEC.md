# Agency HQ — Finance Control Specification

## מטרת המסמך

מסמך זה הוא מקור האמת למודול **כספים** ב-Agency HQ. מטרת המודול היא להפוך את אזור התזרים הקיים לשכבת שליטה פיננסית ניהולית לבעל העסק, בלי להפוך את המערכת למערכת הנהלת חשבונות ובלי לשכפל נתונים שכבר קיימים ב-BOS.

המודול צריך לענות במהירות על:

- כמה כסף יש עכשיו.
- כמה צפוי להיכנס ולצאת.
- מה באיחור.
- מה יקרה בעוד 30/60/90/180/365 יום.
- מה רמת הוודאות של כל סכום.
- אילו לקוחות ופרויקטים רווחיים.
- אילו הוצאות דורשות טיפול.
- אילו עסקאות עתידיות משפיעות על התחזית.
- מה דורש פעולה עכשיו.

---

# 1. עקרונות מוצר

## 1.1 ארבע רמות ודאות

כל סכום במערכת צריך להשתייך לאחת מהרמות:

1. **Actual** — התקבל/שולם בפועל.
2. **Committed** — התחייבות חוזית או ידועה.
3. **Expected** — צפוי בסבירות גבוהה אך לא מחויב.
4. **Potential** — Pipeline עסקי.

המערכת חייבת להבדיל בין הרמות ולא לסכום אותן יחד ללא הקשר.

## 1.2 אין Double Counting

אותה עסקה יכולה להופיע ב-Opportunity, Proposal, Engagement, Payment Schedule ו-Cashflow. יש לבחור מקור אמת יחיד לפי השלב העסקי.

כלל בסיס:

- Opportunity פתוחה -> Pipeline.
- Proposal שלא אושרה -> עדיין Pipeline.
- Proposal Accepted + Engagement -> Engagement הוא מקור האמת המחויב.
- Payment occurrence שנוצר מ-Engagement -> מייצג אירוע תשלום.
- Received/Paid -> Actual.

אסור לספור את אותה הכנסה במספר שכבות יחד.

## 1.3 לא מערכת הנהלת חשבונות

אין לבנות חשבשבת, התאמות בנקים, דיווחי מס, הנהלת חשבונות כפולה או ספר חשבונות מלא. המטרה היא Financial Control / Management Accounting.

## 1.4 Backend הוא מקור החישובים

חישובי forecast, profitability, MRR, alerts, aging, balances ו-variance יתבצעו בצד השרת בשירותים מרכזיים. ה-frontend יציג תוצאות ולא ישכפל לוגיקה עסקית.

## 1.5 מיגרציות לא הרסניות

אין למחוק טבלאות או שדות קיימים. יש להוסיף שדות nullable, טבלאות חדשות ו-backfill בטוח. Legacy נשמר עד שאין תלות בו.

---

# 2. מבנה ניווט

בתפריט הראשי נשאר: **כספים**.

בתוך אזור כספים:

1. **שליטה** — Dashboard פיננסי מרכזי.
2. **הכנסות** — Actual / Committed / Expected / Potential.
3. **הוצאות** — הוצאות, התחייבויות, ספקים, חידושים ושיוכים.
4. **תזרים** — ציר זמן של כניסות ויציאות.
5. **תחזית** — 3/6/12/24/36 חודשים + תרחישים.
6. **רווחיות** — לקוח, פרויקט, כלל העסק.
7. **תרחישים** — What-if simulation.

אין ליצור מודולים כפולים אם קיימת פונקציונליות קיימת. יש להרחיב את הקיים.

---

# 3. מסך שליטה

מסך ברירת המחדל של כספים. מטרתו לתת תשובה תוך פחות מ-10 שניות על מצב העסק.

## 3.1 KPIs עליונים

- יתרה נוכחית.
- צפוי להיכנס החודש.
- צפוי לצאת החודש.
- נטו צפוי החודש.
- יתרה צפויה בסוף החודש.
- חייבים לי.
- התחייבויות פתוחות.
- MRR.
- הוצאות קבועות חודשיות.
- רווח תפעולי צפוי.

נוסחאות:

- `Expected Net = Expected Income - Expected Expenses`
- `Expected End Balance = Current Balance + Expected Net`
- `Yearly Recurring Cost Monthly Equivalent = yearlyAmount / 12`

## 3.2 מצב העסק

להציג טקסט ניהולי קצר המבוסס על הנתונים:

- תקין: "התזרים חיובי ב-90 הימים הקרובים".
- תשומת לב: "היתרה צפויה לרדת מתחת לסף בתאריך X".
- גבייה: "קיימים N תשלומים באיחור בסך Y".
- הוצאות: "קיימות N הוצאות ללא שיוך".

## 3.3 דורש טיפול

Financial Exceptions:

- תשלום לקוח באיחור.
- הוצאה באיחור.
- הוצאה ללא קטגוריה.
- הוצאה ללא שיוך.
- הוצאה חריגה.
- הכנסה צפויה שלא אושרה.
- חוזה שעומד להסתיים.
- מנוי שעומד להתחדש.
- לקוח/פרויקט ברווחיות נמוכה.
- חודש עתידי עם תזרים שלילי.
- יתרה צפויה מתחת לסף.
- עסקה גדולה שצפויה להיסגר ועדיין לא התקדמה.

כל חריגה כוללת:

- title
- message
- amount
- dueDate
- entityType
- entityId
- severity
- recommendedAction
- status

פעולות: פתח רשומה, צור משימה, סמן כטופל, דחה.

## 3.4 מבנה UI

Row 1: KPIs

Row 2: Forecast chart

Row 3: דורש טיפול + 30 הימים הקרובים

Row 4: הכנסות מול הוצאות

Row 5: רווחיות לקוחות

Row 6: Pipeline כספי

כל KPI clickable עם Drill Down.

---

# 4. הכנסות

## 4.1 מקורות הכנסה

- Actual — התקבל בפועל.
- Committed — מ-Engagement פעיל/התחייבות מאושרת.
- Expected — תשלום צפוי אך טרם התקבל.
- Potential — Opportunities / Pipeline.

## 4.2 KPIs

- התקבל החודש.
- צפוי החודש.
- באיחור.
- MRR.
- Pipeline פתוח.
- Weighted Pipeline.

Weighted Pipeline:

`estimatedValue * probability / 100`

Recurring weighted:

`recurringValue * probability / 100`

## 4.3 Lifecycle

Opportunity -> Proposal -> Accepted Proposal -> Engagement -> Expected Payment -> Received

אין להזין מחדש נתון שכבר קיים במקור אחר.

## 4.4 סטטוסים מומלצים

- potential
- planned
- committed
- expected
- received
- overdue
- cancelled

יש לשמור תאימות לסטטוסים קיימים (`planned`, `confirmed`, `paid`) באמצעות mapping ומיגרציה הדרגתית.

---

# 5. Financial Occurrences / Payment Schedule

יש להפריד בין מקור הכנסה/הוצאה לבין אירוע התשלום בפועל.

לדוגמה, Engagement של 10,000 ₪ לחודש אינה תנועה אחת אלא מקור שמייצר occurrences חודשיים.

טבלה מומלצת: `financial_occurrences`

שדות:

- id
- sourceType
- sourceId
- kind (`income` / `expense`)
- amount
- dueDate
- expectedDate
- actualDate
- status
- confidence
- clientId
- projectId
- engagementId
- cashflowId
- notes
- createdAt
- updatedAt

`sourceType` אפשרי:

- manual
- opportunity
- proposal
- engagement
- project
- subscription
- vendor
- scenario
- system

ברירת מחדל ל-confidence:

- Actual = 100
- Committed = 100
- Expected = 80
- Opportunity = `opportunity.probability`

---

# 6. גבייה / Receivables

מסך הכנסות יכלול Aging:

- טרם הגיע מועד.
- 1-7 ימים באיחור.
- 8-30.
- 31-60.
- 61-90.
- 90+.

KPIs:

- Total Receivables.
- Overdue Receivables.
- Average Days Late.

יש להפריד בין:

- dueDate
- expectedDate
- receivedDate / actualDate

כך ניתן למדוד איחורים גם לאחר שהתשלום התקבל.

---

# 7. הוצאות

מסך ההוצאות יהפוך ל-Expense Control.

## 7.1 שדות מרכזיים

- שם
- סכום
- ספק
- קטגוריה
- תת-קטגוריה
- תאריך חיוב
- recurrence
- startDate
- endDate
- paymentMethod
- status
- costType
- essential
- cancellable
- renewalDate
- cancelNoticeDays
- clientId
- projectId
- engagementId
- notes

## 7.2 סוגי עלות

- fixed
- variable
- direct
- overhead

אפשר לאפשר מאפיינים משולבים בעתיד, אך אין לסבך את ה-MVP.

## 7.3 קטגוריות הוצאה

טבלת `expense_categories`, ניתנת לניהול. Seed בסיסי:

- תוכנה ומנויים
- ענן ואחסון
- AI/API
- שיווק ופרסום
- קבלני משנה
- שכר
- הנהלת חשבונות
- משפטי
- ציוד
- תקשורת
- נסיעות
- משרד
- עמלות סליקה
- ביטוח
- מסים
- אחר

אין לקודד קטגוריות ישירות ב-frontend.

---

# 8. ספקים

טבלה מומלצת: `vendors`

- id
- name
- categoryId
- website
- contactName
- email
- phone
- notes
- active
- createdAt
- updatedAt

הוצאה חוזרת יכולה להיות משויכת לספק.

---

# 9. הוצאות חוזרות וחידושים

לכל הוצאה חוזרת להציג:

- עלות חודשית שקולה.
- עלות שנתית.
- מועד חיוב הבא.
- מועד חידוש.
- האם ניתן לבטל.
- מספר ימי הודעה מוקדמת.

התראות חידוש ברירת מחדל: 30, 14, 7 ימים — ניתנות להגדרה.

בעריכת סדרה חוזרת:

- רק האירוע הזה.
- מהאירוע הזה והלאה.
- כל הסדרה.

אין לשנות היסטוריה שכבר סומנה Actual/Paid.

---

# 10. שיוך הוצאות

יש לשמור ולהרחיב את מנגנון `expenseAllocations` הקיים.

יעדי שיוך:

- Client
- Project
- Internal / Agency HQ
- Shared Overhead

שיטות:

- חלוקה שווה
- אחוזים
- weight
- סכום קבוע

המערכת תוודא שהחלוקה מסתכמת ב-100% או בסכום ההוצאה. אם נשארה יתרה לא משויכת, להציג warning.

---

# 11. תזרים

מסך התזרים יהיה ציר זמן כספי ולא רק טבלה.

תצוגות:

- שבוע
- חודש
- רבעון
- שנה
- טבלה
- Timeline
- Calendar

לכל יום/תקופה:

- opening balance
- income
- expense
- net
- closing balance
- financial events

---

# 12. Daily Cash Forecast

התחזית הקיימת החודשית נשמרת ומורחבת.

יש להוסיף תחזית יומית לפחות ל-90 יום, תוך שימוש ב-`billingDay` וב-due dates.

המטרה: לזהות מצב שבו סוף החודש חיובי אך באמצע החודש יש ירידה מסוכנת במזומן.

---

# 13. Forecast

טווחים:

- 3 חודשים
- 6 חודשים
- 12 חודשים
- 24 חודשים
- 36 חודשים

## 13.1 שלושה תרחישים אוטומטיים

### Committed

כולל:

- balance
- active engagements
- fixed expenses
- approved payments
- ללא pipeline

### Realistic / Weighted

Committed + expected income + weighted pipeline.

### Optimistic

Committed + opportunities שעומדות בקריטריון שנבחר, למשל probability >= 30%.

## 13.2 Forecast Chart

שלושה קווים:

- Committed
- Realistic
- Optimistic

+ Minimum Cash Threshold.

נקודות זמן:

- +30
- +60
- +90
- +180
- +365

לכל נקודה להציג balance לפי שלושת התרחישים.

---

# 14. Balance Management

יש להבדיל בין Opening Balance היסטורי לבין Current Confirmed Balance.

להוסיף פעולה: **עדכון יתרה נוכחית**.

טבלה: `finance_balance_snapshots`

- id
- amount
- asOfDate
- notes
- createdAt

התחזית מתחילה מה-snapshot האחרון הקיים.

---

# 15. Burn Rate ו-Runway

Monthly Burn:

ממוצע הוצאות של 3/6/12 חודשים.

אם פעילות המזומנים שלילית:

`Runway = Current Cash / Average Monthly Burn`

אם העסק חיובי, לא להציג Runway בצורה מבהילה או לא רלוונטית.

---

# 16. Actual vs Forecast / Variance

לכל חודש:

- Forecast Revenue
- Actual Revenue
- Revenue Variance
- Forecast Expense
- Actual Expense
- Expense Variance
- Forecast Net
- Actual Net

להפריד בגרף:

`Actual <- Today -> Forecast`

בעתיד ניתן לחשב Forecast Accuracy.

---

# 17. רווחיות

שלוש רמות:

- לקוח
- פרויקט
- כלל העסק

## 17.1 לקוח

- Revenue
- Direct Costs
- Allocated Shared Costs
- Contribution
- Contribution Margin

`Contribution = Revenue - Direct Costs - Allocated Shared Costs`

`Margin % = Contribution / Revenue * 100`

## 17.2 פרויקט

- Contracted Revenue
- Received Revenue
- Direct Costs
- Shared Costs
- Vendor Costs
- Profit
- Margin

## 17.3 עסק

- Revenue
- Direct Costs / COGS
- Gross Contribution
- Overhead
- Operating Contribution

אין לקרוא לזה P&L חשבונאי מלא.

## 17.4 דירוג לקוחות

ברירות מחדל, ניתנות להגדרה:

- >60% רווחי מאוד
- 40%-60% תקין
- 20%-40% דורש בדיקה
- <20% בעייתי

---

# 18. Revenue Concentration

KPI המציג כמה אחוז מההכנסה/MRR מגיע מכל לקוח.

אם לקוח עובר threshold, למשל 40%, להציג התרעת תלות גבוהה.

---

# 19. MRR

MRR מחושב מ-Engagements פעילות.

בעתיד ניתן להוסיף:

- New MRR
- Expansion MRR
- Lost MRR
- Net MRR Change

אין צורך ב-SaaS analytics מלא בשלב ראשון.

---

# 20. Scenarios / What-if

להרחיב את מנגנון scenarios הקיים.

תרחיש יכול לכלול:

- לקוח חדש
- הכנסה חד-פעמית
- MRR חדש
- אובדן לקוח
- עובד/קבלן חדש
- מנוי חדש
- הגדלת/הפחתת הוצאה
- דחיית פרויקט
- דחיית תשלום

Scenario הוא Snapshot בלבד. אסור לו לשנות Actual, Cashflow, Engagement, Opportunity או Project.

---

# 21. Financial Alerts

טבלה מומלצת: `financial_alerts`

- id
- type
- entityType
- entityId
- message
- amount
- dueDate
- severity (`info`, `warning`, `critical`)
- status
- createdAt
- resolvedAt

סוגי Alert:

- balance_below_threshold
- overdue_income
- overdue_expense
- unusual_expense
- subscription_renewal
- contract_ending
- unallocated_expense
- revenue_concentration
- low_project_margin
- negative_forecast
- mrr_decrease
- pipeline_shortfall

אין למחוק alerts לאחר טיפול; לסמן resolved.

---

# 22. אינטגרציה עם "היום" ו-Tasks

התראות פיננסיות משמעותיות יוצגו גם במסך "היום".

על Payment / Expense / Alert / Forecast Risk יהיה כפתור "צור משימה" המשתמש במנוע המשימות הקיים.

---

# 23. Opportunities / Proposals / Engagements

אין ליצור Pipeline פיננסי מקביל.

יש להשתמש בנתונים הקיימים:

- `estimatedValue`
- `recurringValue`
- `probability`
- `expectedCloseDate`

Proposal Accepted יכולה לייצר Engagement באמצעות המנגנון הקיים.

לאחר יצירת Engagement, היא הופכת למקור המחויב בתחזית ולא נספרת שוב כ-Pipeline.

---

# 24. הרחבות DB מומלצות

## טבלאות חדשות

- `financial_occurrences`
- `vendors`
- `expense_categories`
- `financial_alerts`
- `finance_preferences`
- `finance_balance_snapshots`

## הרחבת cashflow בשדות nullable לפי הצורך

- vendorId
- projectId
- costType
- paymentMethod
- renewalDate
- cancelNoticeDays
- essential
- actualDate
- expectedDate
- externalRef
- sourceType
- sourceId

כל השינויים לא הרסניים.

---

# 25. Finance Preferences

טבלה/הגדרות ברמת העסק:

- currency (default ILS)
- cashThreshold
- forecastMonths
- defaultScenario
- overdueGraceDays
- alertRenewalDays
- marginWarningThreshold
- revenueConcentrationThreshold
- defaultOpportunityForecastMode

---

# 26. API מוצע

להרחיב את `/finance` הקיים.

- GET `/finance/control`
- GET `/finance/income`
- GET `/finance/expenses`
- GET `/finance/cashflow`
- GET `/finance/forecast`
- GET `/finance/profitability`
- GET `/finance/alerts`
- GET `/finance/receivables`
- GET `/finance/renewals`
- GET `/finance/by-client`
- GET `/finance/by-project`
- POST `/finance/balance`
- POST `/finance/occurrences`
- PATCH `/finance/occurrences/:id`
- POST `/finance/alerts/:id/resolve`

`GET /finance/control` צריך להחזיר payload מאוחד למסך הראשי כדי להימנע מעשרות requests.

מומלץ לכלול:

- summary
- cashPosition
- month
- receivables
- payables
- mrr
- fixedCosts
- forecast
- alerts
- upcoming
- profitability
- pipeline

---

# 27. Forecast Engine

יש לרכז את החישובים בשירות אחד.

Input:

- period
- scenario
- filters

Output:

- opening
- income
- expense
- net
- endingBalance
- items
- confidence

Priority בין מקורות:

1. Actual occurrence
2. Manual committed occurrence
3. Active engagement
4. Accepted commercial commitment
5. Expected income
6. Opportunity weighted forecast

מקור גבוה יותר מבטל ספירה של מקור נמוך יותר לאותה עסקה.

---

# 28. פילטרים וחיפוש

פילטרים:

- תקופה
- לקוח
- פרויקט
- ספק
- קטגוריה
- status
- Actual / Forecast
- Income / Expense
- Recurring / Once

חיפוש לפי:

- שם תנועה
- לקוח
- פרויקט
- ספק
- הערה

---

# 29. UX

## פעולות מהירות

- הוסף הכנסה
- הוסף הוצאה
- עדכן יתרה
- צור תרחיש

## Progressive Disclosure

טפסים לא יציגו שדות שאינם רלוונטיים.

- recurring פותח recurrence fields.
- project פותח allocation/project fields.
- subscription פותח renewal fields.

## Empty States

לא להציג רק 0. להסביר מה חסר ומה כדאי להוסיף.

## Explainability

לכל KPI חשוב יהיה tooltip / "איך חושב?".

## Mobile

- RTL מלא.
- KPIs ב-1/2 עמודות בהתאם לרוחב.
- טבלאות הופכות לכרטיסים כשצריך.
- גרפים scrollable/responsive.

## צבעים

- ירוק: Actual / תקין
- כחול: Expected / מידע
- כתום: Warning
- אדום: Critical / overdue
- אפור: Potential

לעולם לא להסתמך על צבע בלבד.

---

# 30. Data Quality

במסך שליטה ניתן להציג "איכות תחזית": גבוהה / בינונית / נמוכה.

המדד יתבסס על:

- הוצאות ללא שיוך.
- Engagements ללא תאריכים.
- Payments ללא Due Date.
- Pipeline ללא Expected Close Date.
- מקורות ללא סכום/סטטוס תקין.

---

# 31. Audit

כל שינוי משמעותי בנתון כספי צריך להיכנס ל-Activity/Audit Trail הקיים:

- amount
- status
- dueDate/actualDate
- allocation
- cancellation/archive

רשומה פיננסית שכבר שימשה Actual לא תימחק כברירת מחדל; להשתמש ב-cancelled/archived.

---

# 32. סדר יישום

## Phase 1 — Foundation

- schema migrations
- financial_occurrences
- categories
- vendors
- balance snapshots
- cashflow extensions

## Phase 2 — Control

- control API
- KPIs
- alerts
- upcoming 30 days

## Phase 3 — Forecast

- daily 90-day forecast
- monthly 36-month forecast
- committed/realistic/optimistic

## Phase 4 — Income Control

- receivables
- overdue
- pipeline integration

## Phase 5 — Expense Control

- recurring costs
- renewals
- allocations

## Phase 6 — Profitability

- client
- project
- business

## Phase 7 — Scenarios

- advanced What-if simulation

כל השלבים יכולים להתבצע באותה משימת Claude Code, אבל יש ליישם אותם בסדר הזה כדי לשמור עקביות.

---

# 33. כללי ברזל ליישום

1. Existing code first — ללמוד את הקוד הקיים לפני שינוי.
2. No destructive migrations.
3. No duplicate source of truth.
4. No double counting.
5. Backend calculations only.
6. Preserve legacy compatibility.
7. Reuse existing BOS entities and APIs where possible.
8. Scenario never changes actual data.
9. Actual history is immutable by default.
10. RTL + Hebrew-first UI.
11. No mock-only UI — כל מסך צריך להיות מחובר לנתונים אמיתיים.
12. Every KPI must support drill-down or explanation.
13. Do not break existing cashflow, forecast, engagements, opportunities, proposals, projects or expense allocations.
14. Run migrations/build/tests before completion.
15. Fix regressions found during implementation.

---

# 34. Definition of Done

המודול נחשב גמור כאשר בעל העסק יכול לפתוח את מסך "שליטה" ותוך פחות מ-10 שניות לדעת:

- כמה כסף יש.
- מה נכנס.
- מה יוצא.
- מה באיחור.
- מה צפוי ב-90 הימים הקרובים.
- איזה חודש מסוכן.
- מי הלקוחות/פרויקטים הרווחיים.
- אילו הוצאות דורשות טיפול.
- כמה מההכנסה העתידית ודאית וכמה Pipeline.
- מה הפעולה הפיננסית הבאה שדורשת טיפול.

העיקרון המנחה:

> Agency HQ צריך לענות לא רק "איפה רשמתי את ההוצאה?" אלא "מה מצב העסק שלי עכשיו, מה צפוי לקרות, ואיפה אני צריך להתערב?"
