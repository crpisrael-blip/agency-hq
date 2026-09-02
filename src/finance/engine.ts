/**
 * Finance Control — מנוע החישוב המרכזי (§27).
 *
 * מודול טהור (pure) וללא תלות ב-DB/Hono כדי שיהיה ניתן ל-unit-test ולריכוז כל הלוגיקה
 * העסקית בצד השרת (§1.4). ה-API טוען נתונים גולמיים, מזרים אותם לכאן, ומחזיר תוצאות.
 *
 * עקרונות מפתח:
 *  - ארבע רמות ודאות: actual / committed / expected / potential (§1.1).
 *  - אין Double Counting: לכל עסקה מקור אמת יחיד לפי השלב העסקי (§1.2, §27).
 *      עדיפות: Actual > Committed manual > Active engagement > Accepted commitment
 *              > Expected income > Opportunity weighted. מקור גבוה מבטל נמוך לאותה עסקה.
 *  - Actual היסטורי כבר גלום ביתרה הנוכחית ולכן אינו נספר שוב קדימה.
 *  - Scenario הוא snapshot חישובי בלבד — לעולם לא משנה נתוני אמת (§20).
 */

// ============ טיפוסים ============

export type Tier = 'actual' | 'committed' | 'expected' | 'potential';
export type Kind = 'income' | 'expense';
export type Recurring = 'once' | 'monthly' | 'yearly';
export type ScenarioKind = 'committed' | 'realistic' | 'optimistic';

export interface Prefs {
  currency: string;
  cashThreshold: number;
  forecastMonths: number;
  defaultScenario: ScenarioKind;
  overdueGraceDays: number;
  alertRenewalDays: number[];
  marginWarningThreshold: number;
  revenueConcentrationThreshold: number;
  defaultOpportunityForecastMode: 'weighted' | 'full' | 'none';
  optimisticMinProbability: number;
  unusualExpenseFactor: number;
}

export const DEFAULT_PREFS: Prefs = {
  currency: 'ILS',
  cashThreshold: 0,
  forecastMonths: 12,
  defaultScenario: 'realistic',
  overdueGraceDays: 0,
  alertRenewalDays: [30, 14, 7],
  marginWarningThreshold: 20,
  revenueConcentrationThreshold: 40,
  defaultOpportunityForecastMode: 'weighted',
  optimisticMinProbability: 30,
  unusualExpenseFactor: 2.5,
};

/** תנועה מנורמלת אחת בציר הזמן. הבסיס לכל תחזית/תזרים. */
export interface Flow {
  kind: Kind;
  tier: Tier;
  label: string;
  amount: number;            // סכום לאירוע בודד (חיובי)
  probability: number;       // 0-100 (100 לכל מה שאינו potential)
  recurring: Recurring;
  startYm: string;           // YYYY-MM — לחוזר: חודש התחלה; לחד-פעמי: חודש האירוע
  endYm: string | null;      // לחוזר: חודש סיום (כולל) או null=פתוח
  date: string | null;       // YYYY-MM-DD — לחישוב יומי/aging (dueDate/expectedDate/onceDate)
  billingDay: number | null; // יום בחודש לחוזר (לחישוב יומי)
  clientId: string | null;
  projectId: string | null;
  sourceType: string;
  sourceId: string | null;
}

export interface FinanceData {
  today: string;                       // YYYY-MM-DD (שעון ישראל)
  openingBalance: number;              // settings.opening_balance (legacy)
  currentBalance: number | null;       // snapshot אחרון — מקור היתרה הנוכחית
  balanceAsOf: string | null;
  prefs: Prefs;
  engagements: any[];
  cashflow: any[];
  opportunities: any[];
  occurrences: any[];
  clients: any[];
  allocations: any[];                  // { cashflowId, clientId, weight }
  projects: any[];
  dismissedAlertKeys?: string[];       // מפתחות alert שסומנו dismissed/resolved
}

// ============ עזרי מספרים/תאריכים ============

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: any, d = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
export const ymOf = (iso: string | null | undefined): string => (iso || '').slice(0, 7);

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}
export const monthLabel = (ym: string): string => {
  const [y, m] = ym.split('-');
  return `${m}/${y.slice(2)}`;
};
/** מספר ימים בין שני תאריכי ISO (b - a). חיובי אם b מאוחר יותר. */
export function daysBetween(a: string, b: string): number {
  const da = Date.parse(a + 'T00:00:00Z');
  const db = Date.parse(b + 'T00:00:00Z');
  if (!Number.isFinite(da) || !Number.isFinite(db)) return 0;
  return Math.round((db - da) / 86400000);
}
export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** תאריך היעד של חוזר בתוך חודש נתון, לפי billingDay (clamped לאורך החודש). */
export function dueInMonth(ym: string, billingDay: number | null): string {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const day = Math.min(Math.max(1, billingDay || 1), last);
  return `${ym}-${String(day).padStart(2, '0')}`;
}

// ============ ערך התקשרות (מקור אמת יחיד — משמש גם ב-engagements API) ============

/** ערך חודשי חוזר (MRR) של התקשרות לפי מודל החיוב. */
export function engagementMonthly(e: any): number {
  const retainer = num(e.monthlyFee);
  const hourly = num(e.hourlyRate) * num(e.monthlyHours);
  const rev = num(e.revshareBase) * (num(e.revsharePercent) / 100);
  switch (e.model) {
    case 'retainer':
    case 'value':
      return retainer;
    case 'hourly':
      return hourly;
    case 'revshare':
      return rev;
    case 'one_time':
      return 0;
    case 'hybrid':
      return retainer + hourly + rev;
    default:
      return retainer;
  }
}
/** רכיב חד-פעמי (הקמה/מקדמה). */
export function engagementSetup(e: any): number {
  return num(e.setupFee);
}

// ============ נגזרת תנועות (Flows) ממקורות — עם מניעת Double Counting ============

const ACTIVE_OPP_STAGES = ['discovery', 'diagnosis', 'solution', 'proposal', 'negotiation', 'decision'];

/**
 * בונה את רשימת ה-Flows המנורמלת מכל המקורות, לפי עדיפות מקור האמת (§27):
 *  - התקשרויות פעילות → committed (חוזר חודשי + מקדמת הקמה בחודש ההתחלה).
 *  - תנועות cashflow ידניות → tier לפי סטטוס/סוג.
 *  - Occurrences ידניים (שאינם נגזרים ממקור אחר) → tier לפי סטטוס.
 *  - הזדמנויות פתוחות → potential, למעט הזדמנות שכבר הבשילה להתקשרות פעילה.
 */
export function buildFlows(data: FinanceData): Flow[] {
  const flows: Flow[] = [];
  const nameOf = (cid: string | null) => data.clients.find((c) => c.id === cid)?.name || null;

  // הזדמנויות שכבר הפכו להתקשרות פעילה — לא נספרות שוב כ-Pipeline
  const committedOppIds = new Set(
    data.engagements
      .filter((e) => e.status === 'active' && e.opportunityId)
      .map((e) => String(e.opportunityId)),
  );

  // --- 1. התקשרויות פעילות (committed) ---
  for (const e of data.engagements) {
    if (e.status !== 'active') continue;
    const startYm = e.startDate ? ymOf(e.startDate) : ymOf(data.today);
    const endYm = e.endDate ? ymOf(e.endDate) : null;
    const mv = engagementMonthly(e);
    const label = nameOf(e.clientId) || e.title || 'התקשרות';
    if (mv > 0) {
      flows.push({
        kind: 'income', tier: 'committed', label, amount: mv, probability: 100,
        recurring: 'monthly', startYm, endYm, date: null,
        billingDay: e.billingDay != null ? num(e.billingDay) : 1,
        clientId: e.clientId || null, projectId: e.projectId || null,
        sourceType: 'engagement', sourceId: e.id,
      });
    }
    const sv = engagementSetup(e);
    if (sv > 0) {
      flows.push({
        kind: 'income', tier: 'committed', label: label + ' (מקדמה)', amount: sv, probability: 100,
        recurring: 'once', startYm, endYm: startYm, date: e.startDate || dueInMonth(startYm, e.billingDay),
        billingDay: e.billingDay != null ? num(e.billingDay) : 1,
        clientId: e.clientId || null, projectId: e.projectId || null,
        sourceType: 'engagement', sourceId: e.id,
      });
    }
  }

  // --- 2. תנועות cashflow ידניות ---
  for (const r of data.cashflow) {
    const amt = num(r.amount);
    if (!amt) continue; // תנועת 0 (כלי שלא עלה כסף) — לא בתחזית
    const rec: Recurring = r.recurring === 'monthly' ? 'monthly' : r.recurring === 'yearly' ? 'yearly' : 'once';
    const startYm = ymOf(r.startDate);
    const endYm = r.endDate ? ymOf(r.endDate) : null;
    const date = r.actualDate || r.dueDate || r.expectedDate || r.startDate || null;
    let tier: Tier;
    if (r.status === 'paid') tier = 'actual';
    else if (r.kind === 'expense') tier = rec !== 'once' ? 'committed' : (r.status === 'confirmed' ? 'committed' : 'expected');
    else tier = rec !== 'once' ? 'committed' : (r.status === 'confirmed' ? 'committed' : 'expected');
    flows.push({
      kind: r.kind === 'expense' ? 'expense' : 'income', tier, label: r.label || '—', amount: amt, probability: 100,
      recurring: rec, startYm, endYm, date,
      billingDay: r.billingDay != null ? num(r.billingDay) : null,
      clientId: r.clientId || null, projectId: r.projectId || null,
      sourceType: r.sourceType || 'manual', sourceId: r.sourceId || r.id,
    });
  }

  // --- 3. Occurrences ידניים (שאינם נגזרים ממקור המטופל לעצמו) ---
  const DERIVED = new Set(['engagement', 'opportunity', 'proposal']);
  for (const o of data.occurrences) {
    if (DERIVED.has(o.sourceType)) continue; // נמנע כפילות מול הנגזרות
    if (o.status === 'cancelled') continue;
    const amt = num(o.amount);
    if (!amt) continue;
    const date = o.actualDate || o.dueDate || o.expectedDate || null;
    const ym = ymOf(date || data.today);
    let tier: Tier;
    if (o.status === 'received' || o.status === 'paid') tier = 'actual';
    else if (o.status === 'committed') tier = 'committed';
    else tier = 'expected';
    flows.push({
      kind: o.kind === 'expense' ? 'expense' : 'income', tier, label: o.label || 'תשלום', amount: amt,
      probability: num(o.confidence, 100), recurring: 'once', startYm: ym, endYm: ym, date,
      billingDay: null, clientId: o.clientId || null, projectId: o.projectId || null,
      sourceType: o.sourceType || 'manual', sourceId: o.sourceId || o.id,
    });
  }

  // --- 4. הזדמנויות פתוחות (potential) ---
  for (const opp of data.opportunities) {
    if (!ACTIVE_OPP_STAGES.includes(opp.stage)) continue;      // רק צינור פעיל
    if (committedOppIds.has(String(opp.id))) continue;         // הבשילה להתקשרות — לא כפול
    const prob = Math.min(100, Math.max(0, num(opp.probability)));
    const closeYm = opp.expectedCloseDate ? ymOf(opp.expectedCloseDate) : ymOf(addMonths(ymOf(data.today), 1));
    const one = num(opp.estimatedValue);
    const rec = num(opp.recurringValue);
    if (one > 0) {
      flows.push({
        kind: 'income', tier: 'potential', label: opp.title || 'הזדמנות', amount: one, probability: prob,
        recurring: 'once', startYm: closeYm, endYm: closeYm, date: opp.expectedCloseDate || null,
        billingDay: null, clientId: opp.organizationId || null, projectId: null,
        sourceType: 'opportunity', sourceId: opp.id,
      });
    }
    if (rec > 0) {
      flows.push({
        kind: 'income', tier: 'potential', label: (opp.title || 'הזדמנות') + ' (חוזר)', amount: rec, probability: prob,
        recurring: 'monthly', startYm: closeYm, endYm: null, date: opp.expectedCloseDate || null,
        billingDay: null, clientId: opp.organizationId || null, projectId: null,
        sourceType: 'opportunity', sourceId: opp.id,
      });
    }
  }

  return flows;
}

// ============ בחירת מקורות לפי תרחיש + שקלול ============

/** האם flow פעיל בחודש נתון (חוזר בטווח / חד-פעמי באותו חודש). */
function activeInMonth(f: Flow, ym: string): boolean {
  if (f.recurring === 'once') return f.startYm === ym;
  if (ym < f.startYm) return false;
  if (f.endYm && ym > f.endYm) return false;
  if (f.recurring === 'yearly') return ym.slice(5) === f.startYm.slice(5);
  return true; // monthly
}

/**
 * הסכום התורם של flow בחודש נתון עבור תרחיש — כולל כללי שקלול והכללה:
 *  committed  → actual(עבר בלבד, מטופל בנפרד) + committed. ללא expected/potential.
 *  realistic  → committed + expected + potential*probability/100.
 *  optimistic → committed + expected + potential מלא עבור prob>=optimisticMinProbability.
 * Actual קדימה = 0 (כבר גלום ביתרה). Actual נספר רק להיסטוריה/variance.
 */
function contribution(f: Flow, scenario: ScenarioKind, prefs: Prefs, isFuture: boolean): number {
  if (f.tier === 'actual') return 0; // לא נספר קדימה
  if (f.tier === 'committed') return f.amount;
  if (f.tier === 'expected') return scenario === 'committed' ? 0 : f.amount;
  // potential
  if (scenario === 'committed') return 0;
  if (scenario === 'realistic') return f.amount * (f.probability / 100);
  // optimistic
  return f.probability >= prefs.optimisticMinProbability ? f.amount : 0;
}

// ============ תחזית חודשית (עד 36 חודשים) ============

export interface MonthBucket {
  ym: string;
  label: string;
  income: number;
  expense: number;
  net: number;
  balance: number;      // מאזן מצטבר בסוף החודש
  items: { label: string; amount: number; kind: Kind; tier: Tier; source: string }[];
}
export interface MonthlyForecast {
  scenario: ScenarioKind;
  opening: number;
  months: number;
  buckets: MonthBucket[];
  summary: { totalIncome: number; totalExpense: number; net: number; endBalance: number; minBalance: number; minBalanceYm: string | null };
}

export function startingBalance(data: FinanceData): number {
  return data.currentBalance != null ? num(data.currentBalance) : num(data.openingBalance);
}

export function monthlyForecast(data: FinanceData, scenario: ScenarioKind, months: number): MonthlyForecast {
  const prefs = data.prefs;
  const flows = buildFlows(data);
  const start = ymOf(data.today);
  const n = Math.min(36, Math.max(1, months));
  let balance = startingBalance(data);
  const buckets: MonthBucket[] = [];
  let minBalance = balance;
  let minBalanceYm: string | null = null;

  for (let i = 0; i < n; i++) {
    const ym = addMonths(start, i);
    let income = 0;
    let expense = 0;
    const items: MonthBucket['items'] = [];
    for (const f of flows) {
      if (!activeInMonth(f, ym)) continue;
      const val = contribution(f, scenario, prefs, true);
      if (!val) continue;
      if (f.kind === 'income') income += val;
      else expense += val;
      items.push({ label: f.label, amount: round2(val), kind: f.kind, tier: f.tier, source: f.sourceType });
    }
    income = round2(income);
    expense = round2(expense);
    const net = round2(income - expense);
    balance = round2(balance + net);
    if (balance < minBalance) { minBalance = balance; minBalanceYm = ym; }
    buckets.push({ ym, label: monthLabel(ym), income, expense, net, balance, items });
  }

  const totalIncome = round2(buckets.reduce((a, b) => a + b.income, 0));
  const totalExpense = round2(buckets.reduce((a, b) => a + b.expense, 0));
  return {
    scenario, opening: startingBalance(data), months: n, buckets,
    summary: {
      totalIncome, totalExpense, net: round2(totalIncome - totalExpense),
      endBalance: buckets.at(-1)?.balance ?? startingBalance(data),
      minBalance, minBalanceYm,
    },
  };
}

/** שלושת התרחישים יחד + נקודות זמן +30/60/90/180/365 (§13.2). */
export function forecastScenarios(data: FinanceData, months: number) {
  const committed = monthlyForecast(data, 'committed', months);
  const realistic = monthlyForecast(data, 'realistic', months);
  const optimistic = monthlyForecast(data, 'optimistic', months);
  const daily = dailyForecast(data, 90);
  const balanceAt = (fc: MonthlyForecast, monthsAhead: number) => {
    const idx = Math.min(fc.buckets.length - 1, monthsAhead - 1);
    return idx >= 0 && fc.buckets[idx] ? fc.buckets[idx].balance : fc.opening;
  };
  const horizons = [1, 2, 3, 6, 12].map((m, i) => ({
    days: [30, 60, 90, 180, 365][i],
    committed: balanceAt(committed, m),
    realistic: balanceAt(realistic, m),
    optimistic: balanceAt(optimistic, m),
  }));
  return {
    opening: startingBalance(data),
    threshold: data.prefs.cashThreshold,
    committed, realistic, optimistic, daily, horizons,
  };
}

// ============ תחזית יומית (90 יום, §12) ============

export interface DayPoint {
  date: string;
  income: number;
  expense: number;
  net: number;
  balance: number;
  events: { label: string; amount: number; kind: Kind; tier: Tier }[];
}
export interface DailyForecast {
  scenario: ScenarioKind;
  opening: number;
  days: DayPoint[];
  minBalance: number;
  minBalanceDate: string | null;
  firstBelowThreshold: string | null;
}

/** תחזית יומית ל-N ימים — מזהה ירידת מזומן מסוכנת באמצע החודש (§12). */
export function dailyForecast(data: FinanceData, daysCount = 90, scenario: ScenarioKind = 'realistic'): DailyForecast {
  const prefs = data.prefs;
  const flows = buildFlows(data);
  const start = data.today;
  let balance = startingBalance(data);
  const days: DayPoint[] = [];
  let minBalance = balance;
  let minBalanceDate: string | null = null;
  let firstBelow: string | null = null;

  // ממפה כל flow לתאריך בתוך יום ספציפי בחודש נתון
  const flowDateInMonth = (f: Flow, ym: string): string => {
    if (f.recurring === 'once') return f.date || dueInMonth(ym, f.billingDay);
    // חוזר: יום החיוב, ואם אין — היום-בחודש מתאריך ההתחלה, ואם אין — 1
    let day = f.billingDay;
    if (day == null && f.date) day = Number(f.date.slice(8, 10)) || 1;
    return dueInMonth(ym, day);
  };

  for (let i = 0; i < daysCount; i++) {
    const date = addDays(start, i);
    const ym = ymOf(date);
    let income = 0;
    let expense = 0;
    const events: DayPoint['events'] = [];
    for (const f of flows) {
      if (!activeInMonth(f, ym)) continue;
      if (flowDateInMonth(f, ym) !== date) continue;
      const val = contribution(f, scenario, prefs, true);
      if (!val) continue;
      if (f.kind === 'income') income += val;
      else expense += val;
      events.push({ label: f.label, amount: round2(val), kind: f.kind, tier: f.tier });
    }
    const net = round2(income - expense);
    balance = round2(balance + net);
    if (balance < minBalance) { minBalance = balance; minBalanceDate = date; }
    if (firstBelow == null && balance < prefs.cashThreshold) firstBelow = date;
    days.push({ date, income: round2(income), expense: round2(expense), net, balance, events });
  }

  return { scenario, opening: startingBalance(data), days, minBalance, minBalanceDate, firstBelowThreshold: firstBelow };
}

// ============ גבייה / Receivables + Aging (§6) ============

export interface AgingBucket { key: string; label: string; count: number; amount: number }
export interface Receivables {
  totalReceivables: number;
  overdueReceivables: number;
  averageDaysLate: number;
  buckets: AgingBucket[];
  items: { label: string; amount: number; dueDate: string | null; daysLate: number; clientId: string | null; sourceType: string; sourceId: string | null }[];
}

const AGING_DEFS: { key: string; label: string; min: number; max: number | null }[] = [
  { key: 'not_due', label: 'טרם הגיע מועד', min: -Infinity, max: 0 },
  { key: 'd1_7', label: '1–7 ימים', min: 1, max: 7 },
  { key: 'd8_30', label: '8–30 ימים', min: 8, max: 30 },
  { key: 'd31_60', label: '31–60 ימים', min: 31, max: 60 },
  { key: 'd61_90', label: '61–90 ימים', min: 61, max: 90 },
  { key: 'd90p', label: '90+ ימים', min: 91, max: null },
];

/** גבייה פתוחה = הכנסות committed/expected שטרם התקבלו, לפי dueDate. */
export function receivables(data: FinanceData): Receivables {
  const today = data.today;
  const nameOf = (cid: string | null) => data.clients.find((c) => c.id === cid)?.name || null;
  const items: Receivables['items'] = [];

  // מ-occurrences הכנסה שטרם התקבלו
  for (const o of data.occurrences) {
    if (o.kind === 'expense') continue;
    if (o.status === 'received' || o.status === 'paid' || o.status === 'cancelled') continue;
    const amt = num(o.amount);
    if (!amt) continue;
    const due = o.dueDate || o.expectedDate || null;
    const daysLate = due ? daysBetween(due, today) : 0;
    items.push({ label: o.label || nameOf(o.clientId) || 'תשלום', amount: amt, dueDate: due, daysLate, clientId: o.clientId || null, sourceType: o.sourceType || 'manual', sourceId: o.sourceId || o.id });
  }
  // מ-cashflow הכנסה שלא שולמה עם מועד
  for (const r of data.cashflow) {
    if (r.kind !== 'income') continue;
    if (r.status === 'paid') continue;
    if (r.recurring !== 'once') continue; // חוזר מטופל בתחזית, לא בגבייה חד-פעמית
    const amt = num(r.amount);
    if (!amt) continue;
    const due = r.dueDate || r.expectedDate || r.startDate || null;
    const daysLate = due ? daysBetween(due, today) : 0;
    items.push({ label: r.label || 'הכנסה', amount: amt, dueDate: due, daysLate, clientId: r.clientId || null, sourceType: r.sourceType || 'manual', sourceId: r.id });
  }

  const buckets: AgingBucket[] = AGING_DEFS.map((d) => ({ key: d.key, label: d.label, count: 0, amount: 0 }));
  let overdue = 0;
  let lateSum = 0;
  let lateCount = 0;
  for (const it of items) {
    const def = AGING_DEFS.find((d) => it.daysLate >= d.min && (d.max == null || it.daysLate <= d.max))!;
    const b = buckets.find((x) => x.key === def.key)!;
    b.count += 1;
    b.amount = round2(b.amount + it.amount);
    if (it.daysLate > data.prefs.overdueGraceDays) {
      overdue = round2(overdue + it.amount);
      lateSum += it.daysLate;
      lateCount += 1;
    }
  }
  return {
    totalReceivables: round2(items.reduce((a, x) => a + x.amount, 0)),
    overdueReceivables: overdue,
    averageDaysLate: lateCount ? Math.round(lateSum / lateCount) : 0,
    buckets,
    items: items.sort((a, b) => b.daysLate - a.daysLate),
  };
}

// ============ MRR + עלויות קבועות + Burn/Runway (§15, §19) ============

export function mrr(data: FinanceData): number {
  return round2(data.engagements.filter((e) => e.status === 'active').reduce((a, e) => a + engagementMonthly(e), 0));
}

/** עלויות קבועות חודשיות שקולות (חוזר חודשי + שנתי/12). */
export function fixedMonthlyCosts(data: FinanceData): number {
  let sum = 0;
  for (const r of data.cashflow) {
    if (r.kind !== 'expense') continue;
    const amt = num(r.amount);
    if (r.recurring === 'monthly') sum += amt;
    else if (r.recurring === 'yearly') sum += amt / 12;
  }
  return round2(sum);
}

export function burnAndRunway(data: FinanceData) {
  const monthlyBurn = fixedMonthlyCosts(data);
  const monthlyIncome = mrr(data);
  const netMonthly = round2(monthlyIncome - monthlyBurn);
  const cash = startingBalance(data);
  // Runway רלוונטי רק כשהעסק שורף מזומן (net שלילי) (§15)
  const runwayMonths = netMonthly < 0 && monthlyBurn > 0 ? Math.floor(cash / (monthlyBurn - monthlyIncome)) : null;
  return { monthlyBurn, monthlyIncome, netMonthly, runwayMonths, cashNegative: netMonthly < 0 };
}

// ============ רווחיות (§17) ============

export interface ClientProfit {
  clientId: string | null;
  name: string;
  revenue: number;         // חודשי
  directCosts: number;     // חודשי
  allocatedShared: number; // חודשי
  contribution: number;
  margin: number;          // אחוז
  rating: 'high' | 'ok' | 'review' | 'low';
}

function ratingOf(margin: number): ClientProfit['rating'] {
  if (margin > 60) return 'high';
  if (margin >= 40) return 'ok';
  if (margin >= 20) return 'review';
  return 'low';
}

/**
 * רווחיות חודשית לפי לקוח (§17.1):
 *  Revenue        = MRR של התקשרויות פעילות ללקוח.
 *  Direct Costs   = הוצאות חודשיות עם clientId ישיר + חלק הלקוח מהוצאות משויכות (expenseAllocations).
 *  Allocated Shared = חלק יחסי (לפי הכנסה) מ-overhead שאינו משויך לאף לקוח.
 */
export function clientProfitability(data: FinanceData): { clients: ClientProfit[]; concentration: { clientId: string | null; name: string; percent: number }[]; topConcentration: number } {
  const nameOf = (cid: string | null) => data.clients.find((c) => c.id === cid)?.name || (cid ? '—' : 'בית התוכנה (Agency HQ)');
  const active = data.engagements.filter((e) => e.status === 'active');

  // הכנסה חודשית לכל לקוח
  const revByClient = new Map<string, number>();
  for (const e of active) {
    if (!e.clientId) continue;
    revByClient.set(e.clientId, round2((revByClient.get(e.clientId) || 0) + engagementMonthly(e)));
  }

  // הוצאות חודשיות ישירות/משויכות לכל לקוח + overhead לא-משויך
  const directByClient = new Map<string, number>();
  let overhead = 0;
  const monthlyOf = (r: any) => (r.recurring === 'monthly' ? num(r.amount) : r.recurring === 'yearly' ? num(r.amount) / 12 : 0);
  for (const r of data.cashflow) {
    if (r.kind !== 'expense') continue;
    const m = monthlyOf(r);
    if (m <= 0) continue;
    const allocs = data.allocations.filter((a) => a.cashflowId === r.id);
    if (allocs.length) {
      const sumW = allocs.reduce((a, x) => a + (num(x.weight) || 0), 0) || 1;
      for (const a of allocs) {
        const share = (m * (num(a.weight) || 0)) / sumW;
        if (a.clientId) directByClient.set(a.clientId, round2((directByClient.get(a.clientId) || 0) + share));
        else overhead += share; // NULL = בית התוכנה / overhead משותף
      }
    } else if (r.clientId) {
      directByClient.set(r.clientId, round2((directByClient.get(r.clientId) || 0) + m));
    } else {
      overhead += m; // הוצאה כללית לא משויכת
    }
  }
  overhead = round2(overhead);

  const totalRev = round2([...revByClient.values()].reduce((a, x) => a + x, 0));
  const ids = new Set<string>([...revByClient.keys(), ...directByClient.keys()]);
  const clientsOut: ClientProfit[] = [];
  for (const id of ids) {
    const revenue = round2(revByClient.get(id) || 0);
    const directCosts = round2(directByClient.get(id) || 0);
    const allocatedShared = totalRev > 0 ? round2(overhead * (revenue / totalRev)) : 0;
    const contribution = round2(revenue - directCosts - allocatedShared);
    const margin = revenue > 0 ? round2((contribution / revenue) * 100) : 0;
    clientsOut.push({ clientId: id, name: nameOf(id), revenue, directCosts, allocatedShared, contribution, margin, rating: ratingOf(margin) });
  }
  clientsOut.sort((a, b) => b.contribution - a.contribution);

  // ריכוזיות הכנסה (§18)
  const concentration = [...revByClient.entries()]
    .map(([id, rev]) => ({ clientId: id, name: nameOf(id), percent: totalRev > 0 ? round2((rev / totalRev) * 100) : 0 }))
    .sort((a, b) => b.percent - a.percent);
  const topConcentration = concentration[0]?.percent || 0;

  return { clients: clientsOut, concentration, topConcentration };
}

/** רווחיות ברמת העסק (§17.3). */
export function businessProfitability(data: FinanceData) {
  const revenue = mrr(data);
  let directCosts = 0;
  let overhead = 0;
  const monthlyOf = (r: any) => (r.recurring === 'monthly' ? num(r.amount) : r.recurring === 'yearly' ? num(r.amount) / 12 : 0);
  for (const r of data.cashflow) {
    if (r.kind !== 'expense') continue;
    const m = monthlyOf(r);
    if (m <= 0) continue;
    const ct = r.costType;
    if (ct === 'direct' || ct === 'variable') directCosts += m;
    else if (ct === 'overhead' || ct === 'fixed') overhead += m;
    else if (r.clientId || data.allocations.some((a) => a.cashflowId === r.id && a.clientId)) directCosts += m;
    else overhead += m;
  }
  directCosts = round2(directCosts);
  overhead = round2(overhead);
  const grossContribution = round2(revenue - directCosts);
  const operatingContribution = round2(grossContribution - overhead);
  return {
    revenue, directCosts, grossContribution, overhead, operatingContribution,
    grossMargin: revenue > 0 ? round2((grossContribution / revenue) * 100) : 0,
    operatingMargin: revenue > 0 ? round2((operatingContribution / revenue) * 100) : 0,
  };
}

// ============ חריגות / Financial Exceptions + Alerts (§3.3, §21) ============

export interface Exception {
  key: string;                // מזהה יציב לצורך dismiss
  type: string;
  title: string;
  message: string;
  amount: number | null;
  dueDate: string | null;
  entityType: string | null;
  entityId: string | null;
  severity: 'info' | 'warning' | 'critical';
  recommendedAction: string | null;
}

/** מחשב חריגות פיננסיות חיות מהנתונים (לפני סינון dismissed). */
export function computeExceptions(data: FinanceData): Exception[] {
  const out: Exception[] = [];
  const today = data.today;
  const prefs = data.prefs;
  const nameOf = (cid: string | null) => data.clients.find((c) => c.id === cid)?.name || null;

  // תשלומי לקוח באיחור (מהגבייה)
  const rec = receivables(data);
  for (const it of rec.items) {
    if (it.daysLate > prefs.overdueGraceDays && it.dueDate) {
      out.push({
        key: `overdue_income:${it.sourceType}:${it.sourceId}`, type: 'overdue_income',
        title: 'תשלום באיחור', message: `${it.label} — ${it.daysLate} ימים באיחור`,
        amount: it.amount, dueDate: it.dueDate, entityType: 'occurrence', entityId: it.sourceId,
        severity: it.daysLate > 30 ? 'critical' : 'warning',
        recommendedAction: 'צור משימת גבייה / פנה ללקוח',
      });
    }
  }

  // הוצאות: איחור, ללא קטגוריה, ללא שיוך, חריגה
  const expenses = data.cashflow.filter((r) => r.kind === 'expense');
  const expAmts = expenses.map((r) => num(r.amount)).filter((a) => a > 0);
  const avgExp = expAmts.length ? expAmts.reduce((a, b) => a + b, 0) / expAmts.length : 0;
  for (const r of expenses) {
    const amt = num(r.amount);
    // איחור בתשלום הוצאה חד-פעמית
    if (r.recurring === 'once' && r.status !== 'paid' && (r.dueDate || r.startDate) && String(r.dueDate || r.startDate) < today) {
      out.push({
        key: `overdue_expense:${r.id}`, type: 'overdue_expense', title: 'הוצאה באיחור',
        message: `${r.label} — מועד חלף`, amount: amt, dueDate: r.dueDate || r.startDate,
        entityType: 'cashflow', entityId: r.id, severity: 'warning', recommendedAction: 'ודא תשלום / עדכן סטטוס',
      });
    }
    // הוצאה ללא קטגוריה
    if (!r.category && !r.categoryId) {
      out.push({
        key: `uncategorized_expense:${r.id}`, type: 'unusual_expense', title: 'הוצאה ללא קטגוריה',
        message: `${r.label} — חסרה קטגוריה`, amount: amt, dueDate: null,
        entityType: 'cashflow', entityId: r.id, severity: 'info', recommendedAction: 'שייך קטגוריה',
      });
    }
    // הוצאה ללא שיוך (רק חוזרות משמעותיות)
    if ((r.recurring === 'monthly' || r.recurring === 'yearly') && amt > 0) {
      const hasAlloc = data.allocations.some((a) => a.cashflowId === r.id);
      if (!hasAlloc && !r.clientId && !r.projectId) {
        out.push({
          key: `unallocated_expense:${r.id}`, type: 'unallocated_expense', title: 'הוצאה ללא שיוך',
          message: `${r.label} — לא משויכת ללקוח/פרויקט`, amount: amt, dueDate: null,
          entityType: 'cashflow', entityId: r.id, severity: 'info', recommendedAction: 'שייך לפרויקט/לקוח/Overhead',
        });
      }
    }
    // הוצאה חריגה
    if (avgExp > 0 && amt >= avgExp * prefs.unusualExpenseFactor) {
      out.push({
        key: `unusual_expense:${r.id}`, type: 'unusual_expense', title: 'הוצאה חריגה',
        message: `${r.label} — גבוהה מהממוצע (${money0(amt)})`, amount: amt, dueDate: null,
        entityType: 'cashflow', entityId: r.id, severity: 'info', recommendedAction: 'בדוק חיוב',
      });
    }
    // חידוש מנוי מתקרב
    if (r.renewalDate) {
      const daysTo = daysBetween(today, r.renewalDate);
      const near = prefs.alertRenewalDays.some((d) => daysTo >= 0 && daysTo <= d);
      if (near) {
        out.push({
          key: `subscription_renewal:${r.id}`, type: 'subscription_renewal', title: 'חידוש מנוי מתקרב',
          message: `${r.label} — חידוש בעוד ${daysTo} ימים`, amount: amt, dueDate: r.renewalDate,
          entityType: 'cashflow', entityId: r.id, severity: daysTo <= 7 ? 'warning' : 'info',
          recommendedAction: r.cancellable ? 'החלט: לחדש או לבטל' : 'תזכורת חידוש',
        });
      }
    }
  }

  // חוזה (התקשרות) שעומד להסתיים
  for (const e of data.engagements) {
    if (e.status !== 'active' || !e.endDate) continue;
    const daysTo = daysBetween(today, e.endDate);
    if (daysTo >= 0 && daysTo <= 30) {
      out.push({
        key: `contract_ending:${e.id}`, type: 'contract_ending', title: 'חוזה מסתיים',
        message: `${nameOf(e.clientId) || e.title} — מסתיים בעוד ${daysTo} ימים`, amount: engagementMonthly(e),
        dueDate: e.endDate, entityType: 'engagement', entityId: e.id, severity: 'warning',
        recommendedAction: 'יזום חידוש/הארכה',
      });
    }
  }

  // חודש עתידי עם תזרים שלילי / יתרה מתחת לסף (תרחיש ריאלי)
  const fc = monthlyForecast(data, prefs.defaultScenario, prefs.forecastMonths);
  for (const b of fc.buckets) {
    if (b.net < 0 && b.balance < 0) {
      out.push({
        key: `negative_forecast:${b.ym}`, type: 'negative_forecast', title: 'חודש תזרים שלילי',
        message: `${b.label} — יתרה צפויה שלילית (${money0(b.balance)})`, amount: b.net, dueDate: `${b.ym}-01`,
        entityType: 'month', entityId: b.ym, severity: 'critical', recommendedAction: 'הקדם גבייה / דחה הוצאות',
      });
      break; // מספיק להתריע על הראשון
    }
  }
  if (fc.summary.minBalance < prefs.cashThreshold && prefs.cashThreshold > 0) {
    out.push({
      key: `balance_below_threshold:${fc.summary.minBalanceYm}`, type: 'balance_below_threshold',
      title: 'יתרה מתחת לסף', message: `היתרה צפויה לרדת ל-${money0(fc.summary.minBalance)} (סף: ${money0(prefs.cashThreshold)})`,
      amount: fc.summary.minBalance, dueDate: fc.summary.minBalanceYm ? `${fc.summary.minBalanceYm}-01` : null,
      entityType: 'month', entityId: fc.summary.minBalanceYm, severity: 'critical', recommendedAction: 'עדכן יתרה / תזמן כניסות',
    });
  }

  // ריכוזיות הכנסה גבוהה
  const prof = clientProfitability(data);
  if (prof.topConcentration >= prefs.revenueConcentrationThreshold && prof.concentration[0]) {
    out.push({
      key: `revenue_concentration:${prof.concentration[0].clientId}`, type: 'revenue_concentration',
      title: 'תלות בלקוח בודד', message: `${prof.concentration[0].name} מהווה ${prof.topConcentration}% מ-MRR`,
      amount: null, dueDate: null, entityType: 'client', entityId: prof.concentration[0].clientId,
      severity: 'warning', recommendedAction: 'גוון מקורות הכנסה',
    });
  }
  // לקוח/פרויקט ברווחיות נמוכה
  for (const cp of prof.clients) {
    if (cp.revenue > 0 && cp.margin < prefs.marginWarningThreshold) {
      out.push({
        key: `low_project_margin:${cp.clientId}`, type: 'low_project_margin', title: 'רווחיות נמוכה',
        message: `${cp.name} — מרווח ${cp.margin}%`, amount: cp.contribution, dueDate: null,
        entityType: 'client', entityId: cp.clientId, severity: 'warning', recommendedAction: 'בחן תמחור/עלויות',
      });
    }
  }

  // עסקה גדולה שצפויה להיסגר ולא התקדמה
  for (const opp of data.opportunities) {
    if (!ACTIVE_OPP_STAGES.includes(opp.stage)) continue;
    if (opp.expectedCloseDate && String(opp.expectedCloseDate) < today && num(opp.estimatedValue) > 0) {
      out.push({
        key: `stale_opportunity:${opp.id}`, type: 'pipeline_shortfall', title: 'עסקה תקועה',
        message: `${opp.title} — תאריך סגירה חלף`, amount: num(opp.estimatedValue), dueDate: opp.expectedCloseDate,
        entityType: 'opportunity', entityId: opp.id, severity: 'info', recommendedAction: 'עדכן שלב/תאריך',
      });
    }
  }

  const dismissed = new Set(data.dismissedAlertKeys || []);
  return out.filter((e) => !dismissed.has(e.key));
}

// ============ איכות תחזית / Data Quality (§30) ============

export function dataQuality(data: FinanceData): { score: number; level: 'high' | 'medium' | 'low'; issues: { label: string; count: number }[] } {
  const issues: { label: string; count: number }[] = [];
  const unallocated = data.cashflow.filter((r) => r.kind === 'expense' && (r.recurring === 'monthly' || r.recurring === 'yearly') && num(r.amount) > 0 && !r.clientId && !r.projectId && !data.allocations.some((a) => a.cashflowId === r.id)).length;
  const engNoDates = data.engagements.filter((e) => e.status === 'active' && !e.startDate).length;
  const oppNoClose = data.opportunities.filter((o) => ACTIVE_OPP_STAGES.includes(o.stage) && !o.expectedCloseDate).length;
  const occNoDue = data.occurrences.filter((o) => o.status !== 'received' && o.status !== 'paid' && o.status !== 'cancelled' && !o.dueDate && !o.expectedDate).length;
  if (unallocated) issues.push({ label: 'הוצאות ללא שיוך', count: unallocated });
  if (engNoDates) issues.push({ label: 'התקשרויות ללא תאריכים', count: engNoDates });
  if (oppNoClose) issues.push({ label: 'הזדמנויות ללא תאריך סגירה', count: oppNoClose });
  if (occNoDue) issues.push({ label: 'תשלומים ללא מועד', count: occNoDue });
  const totalIssues = issues.reduce((a, x) => a + x.count, 0);
  const denom = data.cashflow.length + data.engagements.length + data.opportunities.length + data.occurrences.length || 1;
  const score = Math.max(0, Math.round(100 - (totalIssues / denom) * 100));
  const level = score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low';
  return { score, level, issues };
}

// ============ מצב העסק (טקסט ניהולי §3.2) ============

export function businessStatus(data: FinanceData): { tone: 'ok' | 'attention' | 'critical'; lines: string[] } {
  const lines: string[] = [];
  let tone: 'ok' | 'attention' | 'critical' = 'ok';
  const fc90 = dailyForecast(data, 90);
  const rec = receivables(data);
  const prefs = data.prefs;

  if (fc90.firstBelowThreshold) {
    tone = 'critical';
    lines.push(`היתרה צפויה לרדת מתחת לסף בתאריך ${fmtDate(fc90.firstBelowThreshold)}`);
  } else if (fc90.minBalance < 0) {
    tone = 'critical';
    lines.push(`התזרים צפוי להיות שלילי ב-90 הימים הקרובים (מינימום ${money0(fc90.minBalance)})`);
  } else {
    lines.push('התזרים חיובי ב-90 הימים הקרובים');
  }
  if (rec.overdueReceivables > 0) {
    if (tone === 'ok') tone = 'attention';
    const overdueCount = rec.items.filter((i) => i.daysLate > prefs.overdueGraceDays).length;
    lines.push(`קיימים ${overdueCount} תשלומים באיחור בסך ${money0(rec.overdueReceivables)}`);
  }
  const unallocated = data.cashflow.filter((r) => r.kind === 'expense' && (r.recurring === 'monthly' || r.recurring === 'yearly') && num(r.amount) > 0 && !r.clientId && !r.projectId && !data.allocations.some((a) => a.cashflowId === r.id)).length;
  if (unallocated > 0) {
    if (tone === 'ok') tone = 'attention';
    lines.push(`קיימות ${unallocated} הוצאות ללא שיוך`);
  }
  return { tone, lines };
}

// ============ Pipeline כספי (§3.6, §4.2) ============

export function pipeline(data: FinanceData) {
  const committedOppIds = new Set(data.engagements.filter((e) => e.status === 'active' && e.opportunityId).map((e) => String(e.opportunityId)));
  const open = data.opportunities.filter((o) => ACTIVE_OPP_STAGES.includes(o.stage) && !committedOppIds.has(String(o.id)));
  const total = round2(open.reduce((a, o) => a + num(o.estimatedValue), 0));
  const weighted = round2(open.reduce((a, o) => a + num(o.estimatedValue) * (num(o.probability) / 100), 0));
  const recurringWeighted = round2(open.reduce((a, o) => a + num(o.recurringValue) * (num(o.probability) / 100), 0));
  return { total, weighted, recurringWeighted, count: open.length };
}

// ============ מטבע/עזרי טקסט פנימיים ============

function money0(n: number): string {
  try {
    return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(Math.round(n || 0));
  } catch {
    return `₪${Math.round(n || 0)}`;
  }
}
function fmtDate(iso: string): string {
  return iso.split('-').reverse().join('/');
}

// ============ תרחישי What-if (§20) — Snapshot בלבד, לא נוגע בנתוני אמת ============

/**
 * התאמת תרחיש בודדת. מנורמלת: target (הכנסה/הוצאה), op (הוספה/הסרה), סכום, מחזוריות וטווח.
 * ה-frontend מתרגם סוגי-תרחיש ידידותיים (לקוח חדש, אובדן לקוח, גיוס, דחיית תשלום...) להתאמות אלה.
 */
export interface Adjustment {
  label: string;
  target: 'income' | 'expense';
  op: 'add' | 'remove';
  amount: number;
  recurring: 'once' | 'monthly';
  startDate: string | null;  // YYYY-MM-DD
  endDate: string | null;
}

function adjActiveInMonth(a: Adjustment, ym: string, firstYm: string): boolean {
  const startYm = a.startDate ? ymOf(a.startDate) : firstYm;
  const endYm = a.endDate ? ymOf(a.endDate) : null;
  if (a.recurring === 'once') return startYm === ym;
  if (ym < startYm) return false;
  if (endYm && ym > endYm) return false;
  return true;
}

export interface SimulationResult {
  scenario: ScenarioKind;
  months: number;
  base: MonthBucket[];
  simulated: MonthBucket[];
  summary: {
    baseEndBalance: number;
    simEndBalance: number;
    endBalanceDelta: number;
    baseMinBalance: number;
    simMinBalance: number;
    minBalanceDelta: number;
    mrrDelta: number;         // שינוי חוזר חודשי נטו
    firstNegativeYm: string | null;
  };
  adjustments: Adjustment[];
}

/**
 * מריץ סימולציית What-if: לוקח את התחזית הבסיסית (על נתוני אמת) ומוסיף מעליה שכבת
 * התאמות — בלי לשנות שום נתון אמיתי (§20). מחזיר בסיס מול תרחיש להשוואה.
 */
export function simulateScenario(data: FinanceData, adjustments: Adjustment[], scenario: ScenarioKind, months: number): SimulationResult {
  const base = monthlyForecast(data, scenario, months);
  const firstYm = ymOf(data.today);
  const opening = startingBalance(data);
  const adjs = (adjustments || []).filter((a) => a && a.amount);

  let balance = opening;
  let simMin = opening;
  let firstNeg: string | null = null;
  const simulated: MonthBucket[] = base.buckets.map((b) => {
    let dIncome = 0;
    let dExpense = 0;
    const extraItems: MonthBucket['items'] = [];
    for (const a of adjs) {
      if (!adjActiveInMonth(a, b.ym, firstYm)) continue;
      const signed = a.op === 'add' ? a.amount : -a.amount;
      if (a.target === 'income') dIncome += signed;
      else dExpense += signed;
      extraItems.push({ label: a.label, amount: round2(signed), kind: a.target, tier: 'potential', source: 'scenario' });
    }
    const income = round2(b.income + dIncome);
    const expense = round2(b.expense + dExpense);
    const net = round2(income - expense);
    balance = round2(balance + net);
    if (balance < simMin) simMin = balance;
    if (firstNeg == null && balance < 0) firstNeg = b.ym;
    return { ym: b.ym, label: b.label, income, expense, net, balance, items: [...b.items, ...extraItems] };
  });

  // שינוי MRR נטו = סך התאמות חוזרות על הכנסה (add−remove) שפעילות לאורך זמן
  const mrrDelta = round2(adjs.filter((a) => a.recurring === 'monthly' && a.target === 'income').reduce((s, a) => s + (a.op === 'add' ? a.amount : -a.amount), 0)
    - adjs.filter((a) => a.recurring === 'monthly' && a.target === 'expense').reduce((s, a) => s + (a.op === 'add' ? a.amount : -a.amount), 0));

  return {
    scenario, months, base: base.buckets, simulated,
    summary: {
      baseEndBalance: base.summary.endBalance,
      simEndBalance: simulated.at(-1)?.balance ?? opening,
      endBalanceDelta: round2((simulated.at(-1)?.balance ?? opening) - base.summary.endBalance),
      baseMinBalance: base.summary.minBalance,
      simMinBalance: simMin,
      minBalanceDelta: round2(simMin - base.summary.minBalance),
      mrrDelta,
      firstNegativeYm: firstNeg,
    },
    adjustments: adjs,
  };
}

// ============ Payload מאוחד למסך שליטה (§26) ============

export function controlPayload(data: FinanceData) {
  const cash = startingBalance(data);
  const fcScenarios = forecastScenarios(data, data.prefs.forecastMonths);
  const realistic = fcScenarios.realistic;
  const thisMonth = realistic.buckets[0];
  const rec = receivables(data);
  const prof = clientProfitability(data);
  const business = businessProfitability(data);
  const exceptions = computeExceptions(data);
  const burn = burnAndRunway(data);
  const pl = pipeline(data);
  const monthlyMrr = mrr(data);
  const fixed = fixedMonthlyCosts(data);

  const expectedIncome = thisMonth ? thisMonth.income : 0;
  const expectedExpense = thisMonth ? thisMonth.expense : 0;
  const expectedNet = round2(expectedIncome - expectedExpense);

  // 30 הימים הקרובים (אירועים)
  const daily = fcScenarios.daily;
  const upcoming = daily.days.slice(0, 30).flatMap((d) => d.events.map((e) => ({ date: d.date, ...e }))).sort((a, b) => a.date.localeCompare(b.date));

  return {
    currency: data.prefs.currency,
    summary: {
      currentBalance: cash,
      balanceAsOf: data.balanceAsOf,
      expectedIncomeMonth: expectedIncome,
      expectedExpenseMonth: expectedExpense,
      expectedNetMonth: expectedNet,
      expectedEndBalance: round2(cash + expectedNet),
      receivables: rec.totalReceivables,
      overdueReceivables: rec.overdueReceivables,
      openCommitments: round2(data.engagements.filter((e) => e.status === 'active').reduce((a, e) => a + engagementMonthly(e), 0)),
      mrr: monthlyMrr,
      arr: round2(monthlyMrr * 12),
      fixedMonthlyCosts: fixed,
      operatingContribution: business.operatingContribution,
    },
    cashPosition: { current: cash, asOf: data.balanceAsOf, threshold: data.prefs.cashThreshold },
    month: thisMonth || null,
    receivables: { total: rec.totalReceivables, overdue: rec.overdueReceivables, averageDaysLate: rec.averageDaysLate, buckets: rec.buckets },
    payables: { fixedMonthly: fixed },
    mrr: { current: monthlyMrr, arr: round2(monthlyMrr * 12) },
    burn,
    forecast: {
      horizons: fcScenarios.horizons,
      threshold: fcScenarios.threshold,
      committed: fcScenarios.committed.buckets.map((b) => ({ ym: b.ym, label: b.label, balance: b.balance })),
      realistic: fcScenarios.realistic.buckets.map((b) => ({ ym: b.ym, label: b.label, balance: b.balance, income: b.income, expense: b.expense, net: b.net })),
      optimistic: fcScenarios.optimistic.buckets.map((b) => ({ ym: b.ym, label: b.label, balance: b.balance })),
      dailyMin: { balance: daily.minBalance, date: daily.minBalanceDate, firstBelowThreshold: daily.firstBelowThreshold },
    },
    alerts: exceptions,
    upcoming,
    profitability: { clients: prof.clients.slice(0, 8), concentration: prof.concentration.slice(0, 6), topConcentration: prof.topConcentration, business },
    pipeline: pl,
    status: businessStatus(data),
    dataQuality: dataQuality(data),
  };
}
