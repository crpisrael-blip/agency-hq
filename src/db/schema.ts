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
  status: text('status').notNull().default('prospect'), // prospect | customer | paused | former_customer (legacy: active/churned)
  stage: text('stage').notNull().default('lead'),        // LEGACY בלבד — לא בשימוש במודל BOS (הזדמנויות מחזיקות את שלב המכירה)
  health: text('health').notNull().default('green'),     // green | yellow | red
  website: text('website'),                              // אתר הארגון (BOS)
  tags: text('tags'),
  notes: text('notes'),
  isSelf: integer('is_self').default(0),      // 1 = העסק שלי (ORT-TECH) — לידים שלו מנוהלים כ-CRM מלא
  archived: integer('archived').default(0),   // 1 = בארכיון (מוסתר ממסך הלקוחות, ניתן לשחזור/מחיקה)
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at'),
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
  leadUrl: text('lead_url'),                   // דף נחיתה ציבורי שאוסף לידים (גרסה א')
  leadUrlB: text('lead_url_b'),                // דף נחיתה ציבורי נוסף (גרסה ב') — להרצת A/B
  adminUrl: text('admin_url'),                 // כתובת ממשק ניהול
  credentials: text('credentials'),            // פרטי כניסה ראשונית ללקוח
  authMethod: text('auth_method'),             // אופן הכניסה/הזדהות (PIN, אימייל+סיסמה, Google OAuth, ...)
  authScore: integer('auth_score'),            // ציון אבטחת כניסה 1–5 (5 = הכי מאובטח)
  guideUrl: text('guide_url'),                 // לינק למדריך למערכת (ללקוח)
  ideaBubble: integer('idea_bubble').notNull().default(0), // 1 = יש בועת רעיונות (מוסבר בהודעת המסירה)
  repoUrl: text('repo_url'),
  projectId: text('project_id'),               // BOS: המערכת נבנית במסגרת פרויקט (אופציונלי)
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
  opportunityId: text('opportunity_id'),   // BOS: ההזדמנות שממנה נולדה ההתקשרות
  projectId: text('project_id'),           // BOS: הפרויקט המקושר
  proposalId: text('proposal_id'),         // BOS: ההצעה שאושרה
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
  recurring: text('recurring').notNull().default('once'), // once | monthly | yearly
  billingDay: integer('billing_day'),                     // יום חיוב בחודש (למנויים חוזרים)
  startDate: text('start_date').notNull(),                // YYYY-MM-DD
  endDate: text('end_date'),                              // חודשי: עד מתי (ריק = פתוח)
  status: text('status').notNull().default('planned'),    // planned | confirmed | paid
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
  // --- הרחבות Finance Control (0023, כולן nullable — תאימות מלאה ל-legacy) ---
  vendorId: text('vendor_id'),
  projectId: text('project_id'),
  categoryId: text('category_id'),
  subcategory: text('subcategory'),
  costType: text('cost_type'),               // fixed | variable | direct | overhead
  paymentMethod: text('payment_method'),
  renewalDate: text('renewal_date'),         // מנוי: מועד חידוש
  cancelNoticeDays: integer('cancel_notice_days'),
  essential: integer('essential'),           // 1 | 0
  cancellable: integer('cancellable'),       // 1 | 0
  dueDate: text('due_date'),
  actualDate: text('actual_date'),
  expectedDate: text('expected_date'),
  externalRef: text('external_ref'),
  sourceType: text('source_type'),
  sourceId: text('source_id'),
  confidence: integer('confidence'),         // 0-100
});

/**
 * אירוע תשלום — מפריד בין מקור הכנסה/הוצאה לבין תנועת התשלום בפועל.
 * מקור אחד (התקשרות/מנוי) מייצר occurrences חודשיים. מאפשר Actual מול Forecast
 * ומדידת איחורים גם לאחר שהתשלום התקבל (dueDate מול actualDate).
 */
export const financialOccurrences = sqliteTable('financial_occurrences', {
  id: text('id').primaryKey(),
  sourceType: text('source_type').notNull().default('manual'), // manual|opportunity|proposal|engagement|project|subscription|vendor|scenario|system
  sourceId: text('source_id'),
  kind: text('kind').notNull().default('income'), // income | expense
  label: text('label'),
  amount: real('amount').notNull().default(0),
  dueDate: text('due_date'),
  expectedDate: text('expected_date'),
  actualDate: text('actual_date'),
  status: text('status').notNull().default('expected'), // expected|committed|received|paid|overdue|cancelled
  confidence: integer('confidence').notNull().default(80),
  clientId: text('client_id'),
  projectId: text('project_id'),
  engagementId: text('engagement_id'),
  vendorId: text('vendor_id'),
  categoryId: text('category_id'),
  cashflowId: text('cashflow_id'),
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at'),
});

/** ספק — הוצאה חוזרת יכולה להיות משויכת לספק */
export const vendors = sqliteTable('vendors', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  categoryId: text('category_id'),
  website: text('website'),
  contactName: text('contact_name'),
  email: text('email'),
  phone: text('phone'),
  notes: text('notes'),
  active: integer('active').notNull().default(1),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at'),
});

/** קטגוריית הוצאה/הכנסה — ניתנת לניהול (לא מקודדת ב-frontend) */
export const expenseCategories = sqliteTable('expense_categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').notNull().default('expense'), // expense | income
  sort: integer('sort').notNull().default(0),
  active: integer('active').notNull().default(1),
  builtin: integer('builtin').notNull().default(0),
  createdAt: integer('created_at').notNull(),
});

/** התראה פיננסית — לא נמחקת לאחר טיפול, מסומנת resolved/dismissed */
export const financialAlerts = sqliteTable('financial_alerts', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  title: text('title'),
  message: text('message'),
  amount: real('amount'),
  dueDate: text('due_date'),
  severity: text('severity').notNull().default('warning'), // info | warning | critical
  recommendedAction: text('recommended_action'),
  status: text('status').notNull().default('open'), // open | resolved | dismissed
  createdAt: integer('created_at').notNull(),
  resolvedAt: integer('resolved_at'),
});

/** העדפות פיננסיות ברמת העסק — שורה יחידה (id='default') */
export const financePreferences = sqliteTable('finance_preferences', {
  id: text('id').primaryKey().default('default'),
  currency: text('currency').notNull().default('ILS'),
  cashThreshold: real('cash_threshold').notNull().default(0),
  forecastMonths: integer('forecast_months').notNull().default(12),
  defaultScenario: text('default_scenario').notNull().default('realistic'),
  overdueGraceDays: integer('overdue_grace_days').notNull().default(0),
  alertRenewalDays: text('alert_renewal_days').notNull().default('30,14,7'),
  marginWarningThreshold: integer('margin_warning_threshold').notNull().default(20),
  revenueConcentrationThreshold: integer('revenue_concentration_threshold').notNull().default(40),
  defaultOpportunityForecastMode: text('default_opportunity_forecast_mode').notNull().default('weighted'),
  optimisticMinProbability: integer('optimistic_min_probability').notNull().default(30),
  unusualExpenseFactor: real('unusual_expense_factor').notNull().default(2.5),
  updatedAt: integer('updated_at'),
});

/** תמונת יתרה נוכחית — התחזית מתחילה מה-snapshot האחרון */
export const financeBalanceSnapshots = sqliteTable('finance_balance_snapshots', {
  id: text('id').primaryKey(),
  amount: real('amount').notNull().default(0),
  asOfDate: text('as_of_date').notNull(),
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
  projectId: text('project_id'),               // BOS: התהליך נבנה במסגרת פרויקט (אופציונלי)
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
  projectId: text('project_id'),               // BOS: קישור אופציונלי לפרויקט (systemId נשאר הקישור המרכזי)
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
  status: text('status').default('new'), // new | contacted | qualified | won | lost
  handledAt: integer('handled_at'),
  followUpAt: integer('follow_up_at'),   // תאריך חזרה ללקוח (follow-up)
  convertedClientId: text('converted_client_id'), // הלקוח שנוצר מהליד — מונע המרה כפולה
  createdAt: integer('created_at').notNull(),
});

// הצעות מחיר שנוצרו — לצפייה והדפסה חוזרת
export const quotes = sqliteTable('quotes', {
  id: text('id').primaryKey(),
  quoteNo: text('quote_no'),
  clientId: text('client_id'),
  clientName: text('client_name'),
  title: text('title'),
  items: text('items'),
  subtotal: real('subtotal'),
  vatPct: real('vat_pct'),
  total: real('total'),
  terms: text('terms'),
  notes: text('notes'),
  validUntil: text('valid_until'),
  createdAt: integer('created_at').notNull(),
});

// יומן פעילות לליד — תיעוד שיחות, הודעות, פגישות והערות (CRM)
export const leadActivities = sqliteTable('lead_activities', {
  id: text('id').primaryKey(),
  leadId: text('lead_id').notNull(),
  kind: text('kind').notNull(), // call | whatsapp | meeting | note | status
  text: text('text'),
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
  kind: text('kind').notNull().default('checklist'), // checklist | template | canvas
  clientId: text('client_id').references(() => clients.id),
  systemId: text('system_id').references(() => systems.id),
  status: text('status').notNull().default('active'), // active | done | archived
  sections: text('sections').notNull().default('[]'), // צילום הסעיפים בזמן ההחלה
  doc: text('doc'),                                   // מהלך מסוג תבנית: המסמך שממלאים
  checked: text('checked').notNull().default('{}'),    // JSON: { "s-i": true }
  answers: text('answers').notNull().default('{}'),    // JSON: { "s-i": "התשובה שכתבתי" }
  notes: text('notes'),
  progress: integer('progress').notNull().default(0),  // 0-100
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at'),
  completedAt: integer('completed_at'),
});

// מעקב שימוש בסקילז של ECC לפי מערכת/פרויקט
export const skillUsage = sqliteTable('skill_usage', {
  id: text('id').primaryKey(),
  skillName: text('skill_name').notNull(),   // שם הסקיל/פקודה
  systemId: text('system_id'),               // קישור אופציונלי למערכת
  systemName: text('system_name').notNull(), // תווית לתצוגה (snapshot)
  note: text('note'),
  createdAt: integer('created_at').notNull(),
});

/* =========================================================================
 * BOS — Business Operating System · ישויות המחזור העסקי
 * ליד → הזדמנות → לקוח → פרויקט → מסירה → תמיכה → צמיחה
 * ========================================================================= */

/** איש קשר בארגון (organizationId = clients.id בשכבת ההתאמה) */
export const contacts = sqliteTable('contacts', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  name: text('name').notNull(),
  role: text('role'),
  phone: text('phone'),
  whatsapp: text('whatsapp'),
  email: text('email'),
  isDecisionMaker: integer('is_decision_maker').notNull().default(0),
  isPrimary: integer('is_primary').notNull().default(0),
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at'),
});

/** הזדמנות = עסקה/צורך. שלב המכירה חי כאן (לא בארגון). הצינור נמדד מכאן. */
export const opportunities = sqliteTable('opportunities', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  stage: text('stage').notNull().default('discovery'), // discovery|diagnosis|solution|proposal|negotiation|decision|won|lost
  serviceType: text('service_type'),
  estimatedValue: real('estimated_value').notNull().default(0),
  recurringValue: real('recurring_value').notNull().default(0),
  probability: integer('probability').notNull().default(20), // 0-100
  expectedCloseDate: text('expected_close_date'),
  urgency: text('urgency'),
  fit: text('fit'),
  owner: text('owner'),
  decisionMakerContactId: text('decision_maker_contact_id'),
  nextAction: text('next_action'),
  nextActionDate: text('next_action_date'),
  lostReason: text('lost_reason'),
  lostNotes: text('lost_notes'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at'),
  wonAt: integer('won_at'),
  lostAt: integer('lost_at'),
});

/** כאב/בעיה שזוהו אצל הלקוח */
export const opportunityPains = sqliteTable('opportunity_pains', {
  id: text('id').primaryKey(),
  opportunityId: text('opportunity_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  impact: text('impact'),
  impactType: text('impact_type'),
  severity: text('severity'),
  estimatedCost: real('estimated_cost').notNull().default(0),
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
});

/** פתרון מוצע (יכול להתחבר לכאב) */
export const opportunitySolutions = sqliteTable('opportunity_solutions', {
  id: text('id').primaryKey(),
  opportunityId: text('opportunity_id').notNull(),
  painId: text('pain_id'),
  title: text('title').notNull(),
  description: text('description'),
  solutionType: text('solution_type'),
  expectedOutcome: text('expected_outcome'),
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
});

/** הצעה — מופרדת מהתקשרות, מגורסת. אסור לדרוס גרסה קודמת. */
export const proposals = sqliteTable('proposals', {
  id: text('id').primaryKey(),
  opportunityId: text('opportunity_id').notNull(),
  version: integer('version').notNull().default(1),
  status: text('status').notNull().default('draft'), // draft|sent|viewed|discussion|accepted|rejected|expired
  oneTimeValue: real('one_time_value').notNull().default(0),
  monthlyValue: real('monthly_value').notNull().default(0),
  validUntil: text('valid_until'),
  scopeIncluded: text('scope_included'),
  scopeExcluded: text('scope_excluded'),
  assumptions: text('assumptions'),
  dependencies: text('dependencies'),
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
  sentAt: integer('sent_at'),
  acceptedAt: integer('accepted_at'),
  rejectedAt: integer('rejected_at'),
});

/** פרויקט = ביצוע אמיתי */
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  opportunityId: text('opportunity_id'),
  title: text('title').notNull(),
  type: text('type'),
  status: text('status').notNull().default('kickoff'), // kickoff|discovery|specification|build|internal_test|customer_test|implementation|live|stabilization|completed|paused
  health: text('health').notNull().default('green'),   // green|yellow|red
  progress: integer('progress').notNull().default(0),  // 0-100
  startDate: text('start_date'),
  targetDate: text('target_date'),
  completedDate: text('completed_date'),
  nextAction: text('next_action'),
  nextActionDate: text('next_action_date'),
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at'),
});

/** אבן דרך בפרויקט */
export const milestones = sqliteTable('milestones', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  title: text('title').notNull(),
  owner: text('owner'),
  dueDate: text('due_date'),
  status: text('status').notNull().default('pending'), // pending|in_progress|done|blocked
  deliverable: text('deliverable'),
  notes: text('notes'),
  sort: integer('sort').notNull().default(0),
  createdAt: integer('created_at').notNull(),
});

/** בקשת שינוי Scope */
export const changeRequests = sqliteTable('change_requests', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  reason: text('reason'),
  scopeImpact: text('scope_impact'),
  costImpact: real('cost_impact').notNull().default(0),
  timelineImpact: text('timeline_impact'),
  status: text('status').notNull().default('pending'), // pending|approved|rejected|implemented
  approvedAt: integer('approved_at'),
  implementedAt: integer('implemented_at'),
  createdAt: integer('created_at').notNull(),
});

/** פעילות — Timeline כללית + Audit Trail לכל הישויות */
export const activities = sqliteTable('activities', {
  id: text('id').primaryKey(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  organizationId: text('organization_id'),
  type: text('type').notNull().default('note'), // call|meeting|whatsapp|email|note|task|document|decision|status_change|automation
  title: text('title').notNull(),
  content: text('content'),
  metadata: text('metadata'), // JSON
  occurredAt: integer('occurred_at').notNull(),
  createdAt: integer('created_at').notNull(),
});

export type Contact = typeof contacts.$inferSelect;
export type Opportunity = typeof opportunities.$inferSelect;
export type OpportunityPain = typeof opportunityPains.$inferSelect;
export type OpportunitySolution = typeof opportunitySolutions.$inferSelect;
export type Proposal = typeof proposals.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Milestone = typeof milestones.$inferSelect;
export type ChangeRequest = typeof changeRequests.$inferSelect;
export type Activity = typeof activities.$inferSelect;

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
export type SkillUsage = typeof skillUsage.$inferSelect;

export type FinancialOccurrence = typeof financialOccurrences.$inferSelect;
export type Vendor = typeof vendors.$inferSelect;
export type ExpenseCategory = typeof expenseCategories.$inferSelect;
export type FinancialAlert = typeof financialAlerts.$inferSelect;
export type FinancePreferences = typeof financePreferences.$inferSelect;
export type FinanceBalanceSnapshot = typeof financeBalanceSnapshots.$inferSelect;
