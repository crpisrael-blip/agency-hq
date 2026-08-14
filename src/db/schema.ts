import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

/**
 * סכמת בסיס הנתונים (D1 / SQLite) עם Drizzle ORM — מערכת-על לניהול בית התוכנה.
 *
 * הישויות המרכזיות:
 *  clients      – הלקוחות שלי (העסקים שאני משרת)
 *  systems      – המערכות שאני מפתח לכל לקוח
 *  engagements  – מודל ההתקשרות/החיוב מול הלקוח (מה שמייצר את התזרים)
 *  scenarios    – תרחישי מחשבון החיוב (what-if שמורים)
 *  cashflow     – תנועות תזרים (הכנסות/הוצאות, חד-פעמי/חודשי)
 *  profitCenters– מרכזי רווח / רעיונות עסקיים חדשים
 *  processes    – תהליכי עבודה / מסעות לקוח שאני בונה
 *  tasks        – משימות מקושרות לכל ישות
 */

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const adminSessions = sqliteTable('admin_sessions', {
  token: text('token').primaryKey(),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
});

/** לקוח = עסק שאני משרת (טבע האדם, קרב מגע, ...) */
export const clients = sqliteTable('clients', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  industry: text('industry'),                 // תחום העסק
  size: text('size').default('solo'),         // solo | micro | small | medium
  contactName: text('contact_name'),
  contactRole: text('contact_role'),          // תפקיד איש הקשר
  phone: text('phone'),
  email: text('email'),
  status: text('status').notNull().default('prospect'), // prospect | active | paused | churned
  stage: text('stage').notNull().default('lead'),        // מסע הלקוח: lead | discovery | proposal | building | live | retainer
  health: text('health').notNull().default('green'),     // green | yellow | red
  tags: text('tags'),
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
});

/** מערכת מידע שאני מפתח עבור לקוח */
export const systems = sqliteTable('systems', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => clients.id),
  name: text('name').notNull(),
  kind: text('kind').default('web_app'),      // web_app | crm | automation | website | dashboard | other
  stack: text('stack'),                        // טכנולוגיות
  status: text('status').notNull().default('discovery'), // discovery | design | building | live | maintenance | retired
  url: text('url'),                            // כתובת חיה (עמוד ציבורי / נחיתה)
  adminUrl: text('admin_url'),                 // כתובת ממשק ניהול
  credentials: text('credentials'),            // פרטי כניסה ראשונית ללקוח
  authMethod: text('auth_method'),             // אופן הכניסה/הזדהות (PIN, אימייל+סיסמה, Google OAuth, ...)
  authScore: integer('auth_score'),            // ציון אבטחת כניסה 1–5 (5 = הכי מאובטח)
  repoUrl: text('repo_url'),
  startDate: text('start_date'),               // YYYY-MM-DD
  launchDate: text('launch_date'),
  progress: integer('progress').notNull().default(0), // 0-100
  description: text('description'),
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
});

/**
 * התקשרות = מודל החיוב מול הלקוח. מזין ישירות את התזרים החוזר (MRR).
 * model: one_time | retainer | hourly | revshare | value | hybrid
 */
export const engagements = sqliteTable('engagements', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => clients.id),
  systemId: text('system_id').references(() => systems.id),
  title: text('title').notNull(),
  model: text('model').notNull().default('retainer'),
  status: text('status').notNull().default('proposed'), // proposed | active | paused | ended
  setupFee: real('setup_fee').notNull().default(0),       // מקדמה/הקמה חד-פעמית
  monthlyFee: real('monthly_fee').notNull().default(0),   // ריטיינר חודשי
  hourlyRate: real('hourly_rate').notNull().default(0),
  monthlyHours: real('monthly_hours').notNull().default(0), // שעות חודשיות משוערות (למודל שעתי)
  revsharePercent: real('revshare_percent').notNull().default(0), // אחוז ממחזור הלקוח
  revshareBase: real('revshare_base').notNull().default(0),       // בסיס מחזור חודשי צפוי אצל הלקוח
  startDate: text('start_date'),
  endDate: text('end_date'),
  billingDay: integer('billing_day').notNull().default(1),  // יום חיוב בחודש
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
});

/** תרחיש מחשבון חיוב — שומר את כל המשתנים והתוצאה שחושבה */
export const scenarios = sqliteTable('scenarios', {
  id: text('id').primaryKey(),
  clientId: text('client_id').references(() => clients.id),
  name: text('name').notNull(),
  model: text('model').notNull().default('retainer'),
  inputs: text('inputs').notNull().default('{}'),  // JSON: כל משתני הקלט
  results: text('results').notNull().default('{}'), // JSON: תוצאות מחושבות (סנאפשוט)
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
});

/** תנועת תזרים. clientId/engagementId אופציונליים לקישור. */
export const cashflow = sqliteTable('cashflow', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull().default('income'), // income | expense
  label: text('label').notNull(),
  amount: real('amount').notNull().default(0),
  clientId: text('client_id').references(() => clients.id),
  engagementId: text('engagement_id').references(() => engagements.id),
  category: text('category'),
  recurring: text('recurring').notNull().default('once'), // once | monthly
  billingDay: integer('billing_day'),                     // יום חיוב בחודש (למנויים חוזרים)
  startDate: text('start_date').notNull(),                // YYYY-MM-DD
  endDate: text('end_date'),                              // חודשי: עד מתי (ריק = פתוח)
  status: text('status').notNull().default('planned'),    // planned | confirmed | paid
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
});

/** מרכז רווח / רעיון עסקי חדש — החוזקה הייחודית: לייצר הכנסות חדשות מהמשאבים הקיימים */
export const profitCenters = sqliteTable('profit_centers', {
  id: text('id').primaryKey(),
  clientId: text('client_id').references(() => clients.id), // ריק = רעיון פנימי לבית התוכנה
  title: text('title').notNull(),
  description: text('description'),
  model: text('model'),                        // מודל הכנסה מוצע
  potentialMonthly: real('potential_monthly').notNull().default(0), // פוטנציאל חודשי
  potentialOneTime: real('potential_one_time').notNull().default(0),
  effort: text('effort').notNull().default('medium'), // low | medium | high
  confidence: integer('confidence').notNull().default(50), // 0-100 סבירות
  status: text('status').notNull().default('idea'),   // idea | exploring | pitched | active | dropped
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
});

/** תהליך עבודה / מסע לקוח / נוהל שאני בונה עבור הלקוח */
export const processes = sqliteTable('processes', {
  id: text('id').primaryKey(),
  clientId: text('client_id').references(() => clients.id),
  systemId: text('system_id').references(() => systems.id),
  name: text('name').notNull(),
  kind: text('kind').notNull().default('process'), // process | journey | sop
  status: text('status').notNull().default('draft'), // draft | active | archived
  steps: text('steps').notNull().default('[]'),      // JSON: [{title, owner, trigger, notes, done}]
  description: text('description'),
  createdAt: integer('created_at').notNull(),
});

/** משימה מקושרת לכל ישות במערכת */
export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  details: text('details'),
  status: text('status').notNull().default('todo'),   // todo | doing | done
  priority: text('priority').notNull().default('normal'), // low | normal | high | urgent
  dueDate: text('due_date'),
  entityType: text('entity_type'), // client | system | engagement | profit_center | process
  entityId: text('entity_id'),
  createdAt: integer('created_at').notNull(),
  doneAt: integer('done_at'),
});

/** מודול פונקציונלי שמוטמע במערכת של לקוח (לוח בקרה, לידים, הזמנות, פורטל...) */
export const modules = sqliteTable('modules', {
  id: text('id').primaryKey(),
  systemId: text('system_id').references(() => systems.id),
  clientId: text('client_id').references(() => clients.id),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').notNull().default('active'), // active | planned | deprecated
  sort: integer('sort').notNull().default(0),
  createdAt: integer('created_at').notNull(),
});

/**
 * שיוך הוצאה לפרויקטים — מנוי/הוצאה אחת יכולה להתחלק בין כמה פרויקטים.
 * העלות לכל יעד = amount * weight / סכום ה-weights (ברירת מחדל: חלוקה שווה).
 * clientId ריק (NULL) = מערכת הניהול / בית התוכנה עצמו (Agency HQ).
 */
export const expenseAllocations = sqliteTable('expense_allocations', {
  id: text('id').primaryKey(),
  cashflowId: text('cashflow_id').notNull().references(() => cashflow.id),
  clientId: text('client_id').references(() => clients.id), // NULL = בית התוכנה עצמו
  weight: real('weight').notNull().default(1),
  createdAt: integer('created_at').notNull(),
});

/** ליד שנכנס דרך אחת המערכות שבניתי (נרשם דרך webhook ציבורי) */
export const leads = sqliteTable('leads', {
  id: text('id').primaryKey(),
  systemId: text('system_id').references(() => systems.id),
  clientId: text('client_id').references(() => clients.id),
  source: text('source'),        // website | form | whatsapp | phone | other
  name: text('name'),
  note: text('note'),
  createdAt: integer('created_at').notNull(),
});

/** מרכז מסמכים/תוצרים — כל הקישורים והנכסים של כל פרויקט במקום אחד */
export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  clientId: text('client_id').references(() => clients.id), // ריק = תוצר חוצה-פרויקטים (בית התוכנה)
  systemId: text('system_id').references(() => systems.id),
  title: text('title').notNull(),
  category: text('category').notNull().default('doc'), // live | repo | infra | guide | deck | design | security | devlog | ideas | spec | doc | other
  source: text('source'),   // artifact | github | supabase | netlify | vercel | cloudflare | firebase | expo | drive | other
  url: text('url'),
  notes: text('notes'),
  pinned: integer('pinned').notNull().default(0),
  createdAt: integer('created_at').notNull(),
});

/** בועת רעיונות — לכידה מהירה של רעיונות/באגים/משימות תוך כדי עבודה */
export const feedbackItems = sqliteTable('feedback_items', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull().default('idea'), // idea | bug | todo
  content: text('content').notNull(),
  screen: text('screen'),                        // המסך שממנו נלכד
  device: text('device'),                        // נייד | נייח
  status: text('status').notNull().default('open'), // open | done | doing
  createdAt: integer('created_at').notNull(),
});

/**
 * פלייבוק = פורמט/תבנית מקצועית לשלב במסע המוצר (אפיון, הצעה, אבטחה, מסירה…).
 * ניתן לעריכה מלאה בתוך המערכת (config-over-code) ולהחלה על לקוח/מערכת.
 * stage: discovery | proposal | design | build | quality | security | launch | handoff | care | advisory
 * kind: checklist | template (מסמך markdown) | canvas
 */
export const playbooks = sqliteTable('playbooks', {
  id: text('id').primaryKey(),
  stage: text('stage').notNull().default('discovery'),
  title: text('title').notNull(),
  summary: text('summary'),                       // שורה אחת: מה זה ולמה
  kind: text('kind').notNull().default('checklist'),
  sections: text('sections').notNull().default('[]'), // JSON: [{title, items:[{label, hint}]}]
  body: text('body'),                             // markdown לפורמט מסוג template/canvas
  tags: text('tags'),
  sort: integer('sort').notNull().default(0),
  builtin: integer('builtin').notNull().default(0), // 1 = תבנית ברירת מחדל (ניתנת לעריכה/מחיקה)
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at'),
});

/**
 * מהלך = החלה של פלייבוק על עבודה אמיתית. מצלם (snapshot) את הסעיפים כדי
 * שיישאר עצמאי משינויים עתידיים בתבנית — בדיוק כמו checklist_items באורטק.
 */
export const playbookRuns = sqliteTable('playbook_runs', {
  id: text('id').primaryKey(),
  playbookId: text('playbook_id').references(() => playbooks.id),
  title: text('title').notNull(),
  stage: text('stage'),
  clientId: text('client_id').references(() => clients.id),
  systemId: text('system_id').references(() => systems.id),
  status: text('status').notNull().default('active'), // active | done | archived
  sections: text('sections').notNull().default('[]'), // צילום הסעיפים בזמן ההחלה
  checked: text('checked').notNull().default('{}'),    // JSON: { "s-i": true }
  notes: text('notes'),
  progress: integer('progress').notNull().default(0),  // 0-100
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at'),
  completedAt: integer('completed_at'),
});

export type Client = typeof clients.$inferSelect;
export type System = typeof systems.$inferSelect;
export type Engagement = typeof engagements.$inferSelect;
export type Scenario = typeof scenarios.$inferSelect;
export type Cashflow = typeof cashflow.$inferSelect;
export type ProfitCenter = typeof profitCenters.$inferSelect;
export type Process = typeof processes.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Playbook = typeof playbooks.$inferSelect;
export type PlaybookRun = typeof playbookRuns.$inferSelect;
export type ExpenseAllocation = typeof expenseAllocations.$inferSelect;
