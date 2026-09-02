import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PREFS, FinanceData, buildFlows, monthlyForecast, forecastScenarios,
  dailyForecast, receivables, mrr, fixedMonthlyCosts, clientProfitability,
  businessProfitability, computeExceptions, pipeline, startingBalance, addMonths, dueInMonth,
} from '../../src/finance/engine';

// ---------- בונה FinanceData עם ברירות מחדל ----------
function makeData(over: Partial<FinanceData> = {}): FinanceData {
  return {
    today: '2026-01-15',
    openingBalance: 0,
    currentBalance: 100000,
    balanceAsOf: '2026-01-15',
    prefs: { ...DEFAULT_PREFS },
    engagements: [],
    cashflow: [],
    opportunities: [],
    occurrences: [],
    clients: [{ id: 'c1', name: 'לקוח א', status: 'active' }, { id: 'c2', name: 'לקוח ב', status: 'active' }],
    allocations: [],
    projects: [],
    dismissedAlertKeys: [],
    ...over,
  };
}

const activeRetainer = (over: any = {}) => ({
  id: 'e1', clientId: 'c1', title: 'ריטיינר', model: 'retainer', status: 'active',
  monthlyFee: 10000, setupFee: 0, hourlyRate: 0, monthlyHours: 0, revsharePercent: 0, revshareBase: 0,
  startDate: '2026-01-01', endDate: null, billingDay: 1, opportunityId: null, projectId: null, ...over,
});

// ---------- עזרי חודשים ----------
test('addMonths מטפל בגלישת שנה', () => {
  assert.equal(addMonths('2026-11', 3), '2027-02');
  assert.equal(addMonths('2026-01', -1), '2025-12');
});

test('dueInMonth מבצע clamp ליום האחרון בחודש', () => {
  assert.equal(dueInMonth('2026-02', 31), '2026-02-28');
  assert.equal(dueInMonth('2026-01', 5), '2026-01-05');
});

// ---------- MRR + עלויות קבועות ----------
test('MRR מסכם רק התקשרויות פעילות', () => {
  const data = makeData({
    engagements: [activeRetainer(), activeRetainer({ id: 'e2', clientId: 'c2', monthlyFee: 5000 }), activeRetainer({ id: 'e3', status: 'ended', monthlyFee: 9999 })],
  });
  assert.equal(mrr(data), 15000);
});

test('עלויות קבועות: חודשי + שנתי/12', () => {
  const data = makeData({
    cashflow: [
      { id: 'x1', kind: 'expense', label: 'ענן', amount: 1200, recurring: 'monthly', startDate: '2026-01-01', status: 'confirmed' },
      { id: 'x2', kind: 'expense', label: 'דומיין', amount: 120, recurring: 'yearly', startDate: '2026-01-01', status: 'confirmed' },
    ],
  });
  assert.equal(fixedMonthlyCosts(data), 1210); // 1200 + 10
});

// ---------- אין Double Counting ----------
test('הזדמנות שהבשילה להתקשרות פעילה לא נספרת שוב כ-Pipeline', () => {
  const data = makeData({
    engagements: [activeRetainer({ opportunityId: 'o1' })],
    opportunities: [{ id: 'o1', organizationId: 'c1', title: 'עסקה', stage: 'proposal', estimatedValue: 50000, recurringValue: 10000, probability: 80, expectedCloseDate: '2026-02-01' }],
  });
  const pl = pipeline(data);
  assert.equal(pl.count, 0, 'ההזדמנות הוסרה מהצינור');
  assert.equal(pl.total, 0);
  // גם ב-flows אין tier=potential לאותה הזדמנות
  const flows = buildFlows(data);
  assert.equal(flows.filter((f) => f.tier === 'potential').length, 0);
});

test('הזדמנות פתוחה ללא התקשרות נספרת בצינור המשוקלל', () => {
  const data = makeData({
    opportunities: [{ id: 'o2', organizationId: 'c2', title: 'עסקה חדשה', stage: 'negotiation', estimatedValue: 40000, recurringValue: 0, probability: 50, expectedCloseDate: '2026-03-01' }],
  });
  const pl = pipeline(data);
  assert.equal(pl.total, 40000);
  assert.equal(pl.weighted, 20000); // 40000 * 0.5
});

// ---------- בידוד תרחישים (Scenario isolation) ----------
test('תרחיש Committed מתעלם מ-expected ומ-pipeline', () => {
  const data = makeData({
    engagements: [activeRetainer()], // committed 10k/ח'
    cashflow: [{ id: 'inc1', kind: 'income', label: 'צפוי', amount: 8000, recurring: 'once', startDate: '2026-02-10', status: 'planned' }], // expected
    opportunities: [{ id: 'o3', organizationId: 'c2', title: 'ליד', stage: 'discovery', estimatedValue: 30000, recurringValue: 0, probability: 40, expectedCloseDate: '2026-02-20' }], // potential
  });
  const feb = monthlyForecast(data, 'committed', 3).buckets[1]; // חודש פברואר
  assert.equal(feb.income, 10000, 'רק ההתקשרות committed');
});

test('תרחיש Realistic משקלל pipeline לפי הסתברות ומוסיף expected', () => {
  const data = makeData({
    engagements: [activeRetainer()],
    cashflow: [{ id: 'inc1', kind: 'income', label: 'צפוי', amount: 8000, recurring: 'once', startDate: '2026-02-10', status: 'planned' }],
    opportunities: [{ id: 'o3', organizationId: 'c2', title: 'ליד', stage: 'discovery', estimatedValue: 30000, recurringValue: 0, probability: 40, expectedCloseDate: '2026-02-20' }],
  });
  const feb = monthlyForecast(data, 'realistic', 3).buckets[1];
  // 10000 committed + 8000 expected + 30000*0.4 potential = 30000
  assert.equal(feb.income, 30000);
});

test('תרחיש Optimistic כולל הזדמנות מלאה מעל סף ההסתברות בלבד', () => {
  const data = makeData({
    prefs: { ...DEFAULT_PREFS, optimisticMinProbability: 30 },
    opportunities: [
      { id: 'oHi', organizationId: 'c2', title: 'סביר', stage: 'proposal', estimatedValue: 20000, recurringValue: 0, probability: 50, expectedCloseDate: '2026-02-05' },
      { id: 'oLo', organizationId: 'c2', title: 'רחוק', stage: 'discovery', estimatedValue: 90000, recurringValue: 0, probability: 10, expectedCloseDate: '2026-02-05' },
    ],
  });
  const feb = monthlyForecast(data, 'optimistic', 3).buckets[1];
  assert.equal(feb.income, 20000, 'רק ההזדמנות מעל הסף, בערך מלא');
});

// ---------- תחזית מצטברת מתחילה מהיתרה הנוכחית ----------
test('התחזית מתחילה מה-snapshot ומצטברת נטו', () => {
  const data = makeData({
    currentBalance: 50000,
    engagements: [activeRetainer({ monthlyFee: 10000 })],
  });
  assert.equal(startingBalance(data), 50000);
  const fc = monthlyForecast(data, 'committed', 3);
  // ינואר 50k+10k=60k, פברואר 70k, מרץ 80k
  assert.equal(fc.buckets[0].balance, 60000);
  assert.equal(fc.buckets[1].balance, 70000);
  assert.equal(fc.buckets[2].balance, 80000);
});

// ---------- Recurring חודשי מול שנתי ----------
test('הוצאה שנתית מופיעה רק בחודש התואם', () => {
  const data = makeData({
    currentBalance: 0,
    cashflow: [{ id: 'y1', kind: 'expense', label: 'ביטוח', amount: 1200, recurring: 'yearly', startDate: '2026-01-20', status: 'confirmed' }],
  });
  const fc = monthlyForecast(data, 'committed', 13);
  assert.equal(fc.buckets[0].expense, 1200, 'ינואר 2026');
  assert.equal(fc.buckets[1].expense, 0, 'פברואר 0');
  assert.equal(fc.buckets[12].expense, 1200, 'ינואר 2027 שוב');
});

// ---------- גבייה / Aging ----------
test('Aging מסווג תשלומים לפי ימי איחור ומזהה overdue', () => {
  const data = makeData({
    occurrences: [
      { id: 'p1', kind: 'income', label: 'חשבונית 1', amount: 5000, status: 'expected', dueDate: '2026-01-10', confidence: 100, sourceType: 'manual' }, // 5 ימים איחור
      { id: 'p2', kind: 'income', label: 'חשבונית 2', amount: 3000, status: 'expected', dueDate: '2025-12-01', confidence: 100, sourceType: 'manual' }, // 45 ימים
      { id: 'p3', kind: 'income', label: 'חשבונית 3', amount: 2000, status: 'expected', dueDate: '2026-02-20', confidence: 100, sourceType: 'manual' }, // עתידי
      { id: 'p4', kind: 'income', label: 'שולם', amount: 9999, status: 'received', dueDate: '2026-01-01', confidence: 100, sourceType: 'manual' },
    ],
  });
  const rec = receivables(data);
  assert.equal(rec.totalReceivables, 10000, 'ללא ה-received');
  assert.equal(rec.overdueReceivables, 8000, '5000 + 3000');
  const notDue = rec.buckets.find((b) => b.key === 'not_due')!;
  assert.equal(notDue.amount, 2000);
  const d1_7 = rec.buckets.find((b) => b.key === 'd1_7')!;
  assert.equal(d1_7.amount, 5000);
  const d31_60 = rec.buckets.find((b) => b.key === 'd31_60')!;
  assert.equal(d31_60.amount, 3000);
});

// ---------- רווחיות ----------
test('רווחיות לקוח: contribution ומרווח', () => {
  const data = makeData({
    engagements: [activeRetainer({ clientId: 'c1', monthlyFee: 10000 })],
    cashflow: [
      { id: 'd1', kind: 'expense', label: 'קבלן', amount: 3000, recurring: 'monthly', startDate: '2026-01-01', status: 'confirmed', clientId: 'c1' },
      { id: 'oh', kind: 'expense', label: 'הנה"ח', amount: 1000, recurring: 'monthly', startDate: '2026-01-01', status: 'confirmed' }, // overhead
    ],
  });
  const prof = clientProfitability(data);
  const c1 = prof.clients.find((x) => x.clientId === 'c1')!;
  assert.equal(c1.revenue, 10000);
  assert.equal(c1.directCosts, 3000);
  assert.equal(c1.allocatedShared, 1000, 'כל ה-overhead ללקוח היחיד');
  assert.equal(c1.contribution, 6000);
  assert.equal(c1.margin, 60);
  assert.equal(prof.topConcentration, 100);
});

test('רווחיות עסק: gross/operating contribution', () => {
  const data = makeData({
    engagements: [activeRetainer({ monthlyFee: 20000 })],
    cashflow: [
      { id: 'dc', kind: 'expense', label: 'קבלן', amount: 5000, recurring: 'monthly', startDate: '2026-01-01', status: 'confirmed', costType: 'direct' },
      { id: 'ov', kind: 'expense', label: 'משרד', amount: 2000, recurring: 'monthly', startDate: '2026-01-01', status: 'confirmed', costType: 'overhead' },
    ],
  });
  const b = businessProfitability(data);
  assert.equal(b.revenue, 20000);
  assert.equal(b.directCosts, 5000);
  assert.equal(b.grossContribution, 15000);
  assert.equal(b.overhead, 2000);
  assert.equal(b.operatingContribution, 13000);
});

// ---------- תחזית יומית מזהה ירידה באמצע החודש ----------
test('תחזית יומית מזהה ירידת מזומן מסוכנת אף שסוף החודש חיובי', () => {
  const data = makeData({
    today: '2026-01-02',
    currentBalance: 5000,
    prefs: { ...DEFAULT_PREFS, cashThreshold: 1000 },
    cashflow: [
      { id: 'big', kind: 'expense', label: 'תשלום גדול', amount: 8000, recurring: 'monthly', startDate: '2026-01-01', billingDay: 5, status: 'confirmed' },
      { id: 'in', kind: 'income', label: 'הכנסה', amount: 12000, recurring: 'monthly', startDate: '2026-01-01', billingDay: 25, status: 'confirmed' },
    ],
  });
  const daily = dailyForecast(data, 60);
  assert.ok(daily.minBalance < 1000, 'ירידה מתחת לסף באמצע החודש');
  assert.ok(daily.firstBelowThreshold, 'זוהה תאריך ירידה מתחת לסף');
});

// ---------- חריגות ----------
test('computeExceptions מזהה תשלום באיחור וניתן ל-dismiss', () => {
  const base = makeData({
    occurrences: [{ id: 'late1', kind: 'income', label: 'חוב', amount: 4000, status: 'expected', dueDate: '2025-12-20', confidence: 100, sourceType: 'manual' }],
  });
  const ex = computeExceptions(base);
  const overdue = ex.find((e) => e.type === 'overdue_income');
  assert.ok(overdue, 'זוהתה חריגת איחור');
  // dismiss לפי key
  const dismissed = computeExceptions({ ...base, dismissedAlertKeys: [overdue!.key] });
  assert.ok(!dismissed.find((e) => e.key === overdue!.key), 'החריגה סוננה לאחר dismiss');
});

// ---------- אופקי תחזית ----------
test('forecastScenarios מחזיר אופקים ו-3 קווים', () => {
  const data = makeData({ engagements: [activeRetainer({ monthlyFee: 10000 })], currentBalance: 0 });
  const fc = forecastScenarios(data, 12);
  assert.equal(fc.horizons.length, 5);
  assert.equal(fc.horizons[0].days, 30);
  // אחרי חודש אחד committed: 10000
  assert.equal(fc.horizons[0].committed, 10000);
  assert.ok(fc.committed && fc.realistic && fc.optimistic);
});
