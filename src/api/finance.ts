import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import {
  cashflow, scenarios, engagements, clients, settings, expenseAllocations,
  opportunities, projects, financialOccurrences, vendors, expenseCategories,
  financialAlerts, financePreferences, financeBalanceSnapshots, expenseReceipts,
} from '../db/schema';
import { Env, db, uid, now, pick, num, todayIL, logActivity } from './util';
import { engagementMonthly, engagementSetup } from './engagements';
import {
  FinanceData, Prefs, DEFAULT_PREFS, ScenarioKind, Adjustment,
  controlPayload, forecastScenarios, monthlyForecast, monthlyHistory, dailyForecast, receivables,
  clientProfitability, businessProfitability, computeExceptions, pipeline, mrr,
  fixedMonthlyCosts, burnAndRunway, buildFlows, startingBalance, dataQuality, simulateScenario,
} from '../finance/engine';

const INTERNAL_LABEL = 'מערכת הניהול (Agency HQ)';

export const financeApp = new Hono<Env>();

const OPENING_KEY = 'opening_balance';

// ---------- עזרי חודשים ----------
const ymOf = (isoDate: string) => (isoDate || '').slice(0, 7); // YYYY-MM
function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}
const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-');
  return `${m}/${y.slice(2)}`;
};

// ---------- פנקס תזרים (CRUD) ----------
const CF_FIELDS = [
  'kind', 'label', 'amount', 'clientId', 'engagementId', 'category', 'recurring', 'billingDay', 'startDate', 'endDate', 'status', 'notes',
  // Finance Control (0023)
  'vendorId', 'projectId', 'categoryId', 'subcategory', 'costType', 'paymentMethod', 'renewalDate',
  'cancelNoticeDays', 'essential', 'cancellable', 'dueDate', 'actualDate', 'expectedDate', 'externalRef',
  'sourceType', 'sourceId', 'confidence', 'trackOnly',
];
const CF_NUM = ['amount', 'billingDay', 'cancelNoticeDays', 'confidence'];
const CF_BOOL = ['essential', 'cancellable', 'trackOnly'];
function normalizeCf(data: any) {
  for (const f of CF_NUM) if (data[f] !== undefined) data[f] = data[f] === '' || data[f] == null ? null : num(data[f]);
  for (const f of CF_BOOL) if (data[f] !== undefined) data[f] = data[f] ? 1 : 0;
  return data;
}

financeApp.get('/cashflow', async (c) => {
  const d = db(c);
  const rows = await d.select().from(cashflow).orderBy(desc(cashflow.startDate)).all();
  const cls = await d.select().from(clients).all();
  const allocs = await d.select().from(expenseAllocations).all();
  const nameOf = (cid: string | null) => (cid ? cls.find((cl) => cl.id === cid)?.name || null : INTERNAL_LABEL);
  return c.json(rows.map((r) => {
    const mine = allocs.filter((a) => a.cashflowId === r.id);
    const sumW = mine.reduce((a, x) => a + (num(x.weight) || 0), 0) || 1;
    const allocations = mine.map((a) => ({
      id: a.id,
      clientId: a.clientId,
      clientName: nameOf(a.clientId),
      weight: num(a.weight),
      share: Math.round((num(r.amount) * (num(a.weight) || 0)) / sumW * 100) / 100,
    }));
    return { ...r, clientName: cls.find((cl) => cl.id === r.clientId)?.name || null, allocations };
  }));
});

// ---------- שיוך הוצאה לפרויקטים (פיצול עלות) ----------
// גוף: { targets: [{ clientId: string|null, weight?: number }] }  · clientId ריק = מערכת הניהול
financeApp.put('/cashflow/:id/allocations', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({} as any));
  const targets: any[] = Array.isArray(body.targets) ? body.targets : [];
  const d = db(c);
  const row = (await d.select().from(cashflow).where(eq(cashflow.id, id)).limit(1))[0];
  if (!row) return c.json({ error: 'not_found' }, 404);
  await d.delete(expenseAllocations).where(eq(expenseAllocations.cashflowId, id));
  const ts = now();
  for (const t of targets) {
    await d.insert(expenseAllocations).values({
      id: uid(),
      cashflowId: id,
      clientId: t.clientId || null,
      weight: t.weight != null && t.weight !== '' ? num(t.weight) : 1,
      createdAt: ts,
    } as any);
  }
  return c.json({ ok: true, count: targets.length });
});

// עלות תשתית/מנויים לפי פרויקט (חודשי) — לפי השיוכים
financeApp.get('/by-project', async (c) => {
  const d = db(c);
  const cfs = await d.select().from(cashflow).all();
  const cls = await d.select().from(clients).all();
  const allocs = await d.select().from(expenseAllocations).all();
  const nameOf = (cid: string | null) => (cid ? cls.find((cl) => cl.id === cid)?.name || '—' : INTERNAL_LABEL);
  // צבירה לכל יעד: key = clientId או '__internal__'
  const acc: Record<string, { clientId: string | null; name: string; monthly: number; items: any[] }> = {};
  const bump = (cid: string | null, monthly: number, label: string) => {
    const key = cid || '__internal__';
    if (!acc[key]) acc[key] = { clientId: cid, name: nameOf(cid), monthly: 0, items: [] };
    acc[key].monthly += monthly;
    acc[key].items.push({ label, monthly: Math.round(monthly * 100) / 100 });
  };
  let unassignedMonthly = 0;
  const unassignedItems: any[] = [];
  for (const r of cfs) {
    if (r.kind !== 'expense') continue;
    if (r.recurring !== 'monthly' && r.recurring !== 'yearly') continue;
    const amt = r.recurring === 'yearly' ? Math.round((num(r.amount) / 12) * 100) / 100 : num(r.amount);
    if (amt <= 0) continue;
    const mine = allocs.filter((a) => a.cashflowId === r.id);
    if (!mine.length) {
      unassignedMonthly += amt;
      unassignedItems.push({ label: r.label, monthly: amt });
      continue;
    }
    const sumW = mine.reduce((a, x) => a + (num(x.weight) || 0), 0) || 1;
    for (const a of mine) bump(a.clientId, (amt * (num(a.weight) || 0)) / sumW, r.label);
  }
  const projects = Object.values(acc)
    .map((p) => ({ ...p, monthly: Math.round(p.monthly * 100) / 100 }))
    .sort((a, b) => b.monthly - a.monthly);
  const totalAllocated = projects.reduce((a, p) => a + p.monthly, 0);
  return c.json({
    projects,
    unassigned: { monthly: Math.round(unassignedMonthly * 100) / 100, items: unassignedItems },
    totalAllocated: Math.round(totalAllocated * 100) / 100,
  });
});

financeApp.post('/cashflow', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  if (!body.label) return c.json({ error: 'invalid_input' }, 400);
  const id = uid();
  await db(c).insert(cashflow).values({
    id,
    ...normalizeCf(pick(body, CF_FIELDS)),
    label: String(body.label),
    amount: num(body.amount),
    startDate: String(body.startDate || todayIL()),
    createdAt: now(),
  } as any);
  return c.json({ ok: true, id });
});

financeApp.patch('/cashflow/:id', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const data: any = normalizeCf(pick(body, CF_FIELDS));
  if (Object.keys(data).length) await db(c).update(cashflow).set(data).where(eq(cashflow.id, c.req.param('id')));
  return c.json({ ok: true });
});

financeApp.delete('/cashflow/:id', async (c) => {
  const id = c.req.param('id');
  // מחיקת קבלות משויכות (גם מ-R2) לפני מחיקת ההוצאה — למניעת יתומים
  const recs = await db(c).select().from(expenseReceipts).where(eq(expenseReceipts.cashflowId, id)).all();
  if (recs.length && c.env.RECEIPTS) {
    for (const r of recs) { try { await c.env.RECEIPTS.delete(r.r2Key); } catch { /* best-effort */ } }
  }
  if (recs.length) await db(c).delete(expenseReceipts).where(eq(expenseReceipts.cashflowId, id));
  await db(c).delete(cashflow).where(eq(cashflow.id, id));
  return c.json({ ok: true });
});

// ---------- קבלות להוצאה (idea 1) — קובץ ב-R2, מטא-דאטה ב-D1 ----------
const RECEIPT_MAX_BYTES = 10 * 1024 * 1024; // 10MB
const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif', 'application/pdf'];

// רשימת קבלות של הוצאה (מטא-דאטה בלבד)
financeApp.get('/cashflow/:id/receipts', async (c) => {
  const rows = await db(c).select().from(expenseReceipts)
    .where(eq(expenseReceipts.cashflowId, c.req.param('id')))
    .orderBy(desc(expenseReceipts.uploadedAt)).all();
  return c.json(rows.map((r) => ({
    id: r.id, filename: r.filename, contentType: r.contentType, size: r.size, uploadedAt: r.uploadedAt,
  })));
});

// העלאת קבלה (multipart/form-data, שדה "file")
financeApp.post('/cashflow/:id/receipts', async (c) => {
  if (!c.env.RECEIPTS) return c.json({ error: 'storage_unavailable' }, 503);
  const cfId = c.req.param('id');
  const exists = (await db(c).select().from(cashflow).where(eq(cashflow.id, cfId)).limit(1))[0];
  if (!exists) return c.json({ error: 'not_found' }, 404);
  let form: FormData;
  try { form = await c.req.formData(); } catch { return c.json({ error: 'invalid_input' }, 400); }
  const file = form.get('file');
  if (!file || typeof file === 'string') return c.json({ error: 'no_file' }, 400);
  const type = (file as File).type || 'application/octet-stream';
  if (!RECEIPT_TYPES.includes(type)) return c.json({ error: 'unsupported_type' }, 415);
  const buf = await (file as File).arrayBuffer();
  if (buf.byteLength > RECEIPT_MAX_BYTES) return c.json({ error: 'too_large' }, 413);
  if (buf.byteLength === 0) return c.json({ error: 'empty_file' }, 400);
  const id = uid();
  const safeName = ((file as File).name || 'receipt').replace(/[^\w.\-֐-׿ ]+/g, '_').slice(0, 120);
  const key = `receipts/${cfId}/${id}`;
  await c.env.RECEIPTS.put(key, buf, { httpMetadata: { contentType: type } });
  await db(c).insert(expenseReceipts).values({
    id, cashflowId: cfId, r2Key: key, filename: safeName, contentType: type, size: buf.byteLength, uploadedAt: now(),
  } as any);
  return c.json({ ok: true, id, filename: safeName, contentType: type, size: buf.byteLength });
});

// הורדת/צפייה בקובץ הקבלה (מוגן בטוקן מנהל — כמו כל /api). inline לתצוגה בדפדפן.
financeApp.get('/receipts/:id/file', async (c) => {
  if (!c.env.RECEIPTS) return c.json({ error: 'storage_unavailable' }, 503);
  const row = (await db(c).select().from(expenseReceipts).where(eq(expenseReceipts.id, c.req.param('id'))).limit(1))[0];
  if (!row) return c.json({ error: 'not_found' }, 404);
  const obj = await c.env.RECEIPTS.get(row.r2Key);
  if (!obj) return c.json({ error: 'not_found' }, 404);
  const disp = c.req.query('download') != null ? 'attachment' : 'inline';
  const fname = encodeURIComponent(row.filename || 'receipt');
  return new Response(obj.body, {
    headers: {
      'Content-Type': row.contentType || 'application/octet-stream',
      'Content-Disposition': `${disp}; filename*=UTF-8''${fname}`,
      'Cache-Control': 'private, max-age=60',
    },
  });
});

// מחיקת קבלה בודדת
financeApp.delete('/receipts/:id', async (c) => {
  const row = (await db(c).select().from(expenseReceipts).where(eq(expenseReceipts.id, c.req.param('id'))).limit(1))[0];
  if (!row) return c.json({ error: 'not_found' }, 404);
  if (c.env.RECEIPTS) { try { await c.env.RECEIPTS.delete(row.r2Key); } catch { /* best-effort */ } }
  await db(c).delete(expenseReceipts).where(eq(expenseReceipts.id, c.req.param('id')));
  return c.json({ ok: true });
});

// ---------- יתרת פתיחה ----------
async function getOpening(c: any): Promise<number> {
  const r = await db(c).select().from(settings).where(eq(settings.key, OPENING_KEY)).limit(1);
  return r.length ? num(r[0].value) : 0;
}

financeApp.get('/opening', async (c) => c.json({ value: await getOpening(c) }));

financeApp.post('/opening', async (c) => {
  const { value } = await c.req.json().catch(() => ({} as any));
  const d = db(c);
  const v = String(num(value));
  const existing = await d.select().from(settings).where(eq(settings.key, OPENING_KEY)).limit(1);
  if (existing.length) await d.update(settings).set({ value: v }).where(eq(settings.key, OPENING_KEY));
  else await d.insert(settings).values({ key: OPENING_KEY, value: v });
  return c.json({ ok: true });
});

/**
 * תחזית תזרים ל-N חודשים קדימה.
 * מקורות ההכנסה/הוצאה:
 *  1. התקשרויות פעילות (active) → הכנסה חוזרת חודשית אוטומטית + מקדמת הקמה בחודש ההתחלה.
 *  2. תנועות תזרים ידניות (טבלת cashflow) → הכנסות/הוצאות חד-פעמיות או חודשיות.
 * מחזיר שורה לכל חודש: הכנסה, הוצאה, נטו, ומאזן מצטבר מיתרת הפתיחה.
 */
financeApp.get('/forecast', async (c) => {
  const months = Math.min(36, Math.max(1, num(c.req.query('months'), 12)));
  const d = db(c);
  const opening = await getOpening(c);
  const engs = (await d.select().from(engagements).all()).filter((e) => e.status === 'active');
  const cfs = await d.select().from(cashflow).all();

  const cls = await d.select().from(clients).all();
  const clientName = (id: string | null) => (id ? cls.find((c) => c.id === id)?.name : null) || null;

  const start = ymOf(todayIL());
  type LineItem = { label: string; amount: number; kind: 'income' | 'expense'; source: 'engagement' | 'manual'; recurring: string };
  const buckets: { ym: string; label: string; income: number; expense: number; net: number; balance: number; items: LineItem[] }[] = [];

  let balance = opening;
  for (let i = 0; i < months; i++) {
    const ym = addMonths(start, i);
    let income = 0;
    let expense = 0;
    const items: LineItem[] = [];

    // מהתקשרויות פעילות
    for (const e of engs) {
      const eStart = e.startDate ? ymOf(e.startDate) : start;
      const eEnd = e.endDate ? ymOf(e.endDate) : null;
      const inRange = ym >= eStart && (!eEnd || ym <= eEnd);
      if (inRange) {
        const mv = engagementMonthly(e);
        if (mv > 0) {
          income += mv;
          items.push({ label: clientName(e.clientId) || e.id, amount: mv, kind: 'income', source: 'engagement', recurring: 'monthly' });
        }
      }
      if (engagementSetup(e) > 0 && ym === eStart) {
        const sv = engagementSetup(e);
        income += sv;
        items.push({ label: (clientName(e.clientId) || e.id) + ' (מקדמה)', amount: sv, kind: 'income', source: 'engagement', recurring: 'once' });
      }
    }

    // מתנועות ידניות
    for (const r of cfs) {
      const rStart = ymOf(r.startDate);
      const amt = num(r.amount);
      let hit = false;
      if (r.recurring === 'monthly') {
        const rEnd = r.endDate ? ymOf(r.endDate) : null;
        hit = ym >= rStart && (!rEnd || ym <= rEnd);
      } else if (r.recurring === 'yearly') {
        const rEnd = r.endDate ? ymOf(r.endDate) : null;
        if (ym >= rStart && (!rEnd || ym <= rEnd)) {
          hit = ym.slice(5) === rStart.slice(5);
        }
      } else {
        hit = ym === rStart;
      }
      if (!hit) continue;
      if (!amt) continue; // תנועה בסכום 0 (מערכת/כלי שלא עלו כסף) לא מופיעה בפירוט החודש
      if (r.kind === 'income') income += amt;
      else expense += amt;
      items.push({ label: r.label, amount: amt, kind: r.kind as 'income' | 'expense', source: 'manual', recurring: r.recurring });
    }

    const net = income - expense;
    balance += net;
    buckets.push({ ym, label: monthLabel(ym), income, expense, net, balance, items });
  }

  const totalIncome = buckets.reduce((a, b) => a + b.income, 0);
  const totalExpense = buckets.reduce((a, b) => a + b.expense, 0);
  const mrr = engs.reduce((a, e) => a + engagementMonthly(e), 0);
  return c.json({
    opening, months, buckets,
    summary: { totalIncome, totalExpense, net: totalIncome - totalExpense, endBalance: buckets.at(-1)?.balance ?? opening, mrr },
  });
});

// ---------- תרחישי מחשבון חיוב ----------
const SC_FIELDS = ['clientId', 'name', 'model', 'inputs', 'results', 'notes'];

financeApp.get('/scenarios', async (c) => {
  const d = db(c);
  const rows = await d.select().from(scenarios).orderBy(desc(scenarios.createdAt)).all();
  const cls = await d.select().from(clients).all();
  return c.json(rows.map((s) => ({ ...s, clientName: cls.find((cl) => cl.id === s.clientId)?.name || null })));
});

financeApp.post('/scenarios', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  if (!body.name) return c.json({ error: 'invalid_input' }, 400);
  const id = uid();
  await db(c).insert(scenarios).values({
    id,
    clientId: body.clientId || null,
    name: String(body.name),
    model: String(body.model || 'retainer'),
    inputs: typeof body.inputs === 'string' ? body.inputs : JSON.stringify(body.inputs || {}),
    results: typeof body.results === 'string' ? body.results : JSON.stringify(body.results || {}),
    notes: body.notes ? String(body.notes) : null,
    createdAt: now(),
  } as any);
  return c.json({ ok: true, id });
});

financeApp.patch('/scenarios/:id', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const data: any = pick(body, SC_FIELDS);
  if (data.inputs && typeof data.inputs !== 'string') data.inputs = JSON.stringify(data.inputs);
  if (data.results && typeof data.results !== 'string') data.results = JSON.stringify(data.results);
  if (Object.keys(data).length) await db(c).update(scenarios).set(data).where(eq(scenarios.id, c.req.param('id')));
  return c.json({ ok: true });
});

financeApp.delete('/scenarios/:id', async (c) => {
  await db(c).delete(scenarios).where(eq(scenarios.id, c.req.param('id')));
  return c.json({ ok: true });
});

/* =========================================================================
 * Finance Control — מודול שליטה פיננסית (§26)
 * טעינת נתונים מרוכזת + מנוע חישוב מרכזי (src/finance/engine).
 * כל endpoint טוען את הנתונים הגולמיים פעם אחת ומזרים אותם למנוע הטהור.
 * ========================================================================= */

function parsePrefs(row: any): Prefs {
  if (!row) return { ...DEFAULT_PREFS };
  return {
    currency: row.currency || 'ILS',
    cashThreshold: num(row.cashThreshold),
    forecastMonths: num(row.forecastMonths, 12),
    defaultScenario: (row.defaultScenario || 'realistic') as ScenarioKind,
    overdueGraceDays: num(row.overdueGraceDays),
    alertRenewalDays: String(row.alertRenewalDays || '30,14,7').split(',').map((s) => num(s.trim())).filter((n) => n > 0),
    marginWarningThreshold: num(row.marginWarningThreshold, 20),
    revenueConcentrationThreshold: num(row.revenueConcentrationThreshold, 40),
    defaultOpportunityForecastMode: (row.defaultOpportunityForecastMode || 'weighted') as Prefs['defaultOpportunityForecastMode'],
    optimisticMinProbability: num(row.optimisticMinProbability, 30),
    unusualExpenseFactor: num(row.unusualExpenseFactor, 2.5),
  };
}

/** טוען את כל הנתונים הדרושים למנוע הפיננסי בבת אחת. */
async function loadFinanceData(c: any): Promise<FinanceData> {
  const d = db(c);
  const [engs, cfs, opps, occs, cls, allocs, projs, prefRows, snaps, alertRows, openingRow] = await Promise.all([
    d.select().from(engagements).all(),
    d.select().from(cashflow).all(),
    d.select().from(opportunities).all(),
    d.select().from(financialOccurrences).all(),
    d.select().from(clients).all(),
    d.select().from(expenseAllocations).all(),
    d.select().from(projects).all(),
    d.select().from(financePreferences).where(eq(financePreferences.id, 'default')).limit(1),
    d.select().from(financeBalanceSnapshots).all(),
    d.select().from(financialAlerts).all(),
    d.select().from(settings).where(eq(settings.key, OPENING_KEY)).limit(1),
  ]);
  const prefs = parsePrefs(prefRows[0]);
  const openingBalance = openingRow.length ? num(openingRow[0].value) : 0;
  const sortedSnaps = [...snaps].sort((a: any, b: any) =>
    String(b.asOfDate).localeCompare(String(a.asOfDate)) || num(b.createdAt) - num(a.createdAt));
  const latest = sortedSnaps[0];
  const dismissedAlertKeys = alertRows
    .filter((a: any) => (a.status === 'dismissed' || a.status === 'resolved') && a.entityId)
    .map((a: any) => String(a.entityId));
  return {
    today: todayIL(),
    openingBalance,
    currentBalance: latest ? num(latest.amount) : null,
    balanceAsOf: latest ? String(latest.asOfDate) : null,
    prefs,
    engagements: engs,
    cashflow: cfs,
    opportunities: opps,
    occurrences: occs,
    clients: cls,
    allocations: allocs,
    projects: projs,
    dismissedAlertKeys,
  };
}

// ---------- מסך שליטה (payload מאוחד §26) ----------
financeApp.get('/control', async (c) => {
  const data = await loadFinanceData(c);
  return c.json(controlPayload(data));
});

// ---------- תחזית מלאה: 3 תרחישים + יומי 90 (§13) ----------
financeApp.get('/forecast/scenarios', async (c) => {
  const data = await loadFinanceData(c);
  const months = Math.min(36, Math.max(1, num(c.req.query('months'), data.prefs.forecastMonths)));
  return c.json(forecastScenarios(data, months));
});

// ---------- תחזית חודשית לפי תרחיש בודד ----------
financeApp.get('/forecast/monthly', async (c) => {
  const data = await loadFinanceData(c);
  const months = Math.min(36, Math.max(1, num(c.req.query('months'), data.prefs.forecastMonths)));
  const scenario = (c.req.query('scenario') || data.prefs.defaultScenario) as ScenarioKind;
  return c.json(monthlyForecast(data, scenario, months));
});

// ---------- תחזית יומית (§12) ----------
financeApp.get('/forecast/daily', async (c) => {
  const data = await loadFinanceData(c);
  const days = Math.min(365, Math.max(7, num(c.req.query('days'), 90)));
  const scenario = (c.req.query('scenario') || data.prefs.defaultScenario) as ScenarioKind;
  return c.json(dailyForecast(data, days, scenario));
});

// ---------- הכנסות: מקורות + גבייה + צינור (§4, §6) ----------
financeApp.get('/income', async (c) => {
  const data = await loadFinanceData(c);
  const flows = buildFlows(data).filter((f) => f.kind === 'income');
  const byTier = (t: string) => flows.filter((f) => f.tier === t);
  const monthValue = (arr: typeof flows) => arr.reduce((a, f) => a + (f.recurring === 'monthly' ? f.amount : 0), 0);
  const rec = receivables(data);
  const pl = pipeline(data);
  return c.json({
    currency: data.prefs.currency,
    kpis: {
      mrr: mrr(data),
      committedMonthly: Math.round(monthValue(byTier('committed')) * 100) / 100,
      expectedMonthly: Math.round(monthValue(byTier('expected')) * 100) / 100,
      overdue: rec.overdueReceivables,
      pipeline: pl.total,
      weightedPipeline: pl.weighted,
    },
    receivables: rec,
    pipeline: pl,
    sources: flows.map((f) => ({
      label: f.label, amount: f.amount, tier: f.tier, recurring: f.recurring,
      probability: f.probability, clientId: f.clientId, sourceType: f.sourceType, sourceId: f.sourceId, date: f.date,
    })),
  });
});

// ---------- הוצאות: Expense Control (§7) ----------
financeApp.get('/expenses', async (c) => {
  const data = await loadFinanceData(c);
  const cats = await db(c).select().from(expenseCategories).all();
  const vends = await db(c).select().from(vendors).all();
  const receiptRows = await db(c).select().from(expenseReceipts).all();
  const receiptCountOf = (cfId: string) => receiptRows.filter((x: any) => x.cashflowId === cfId).length;
  const catName = (id: string | null) => cats.find((x: any) => x.id === id)?.name || null;
  const vendorName = (id: string | null) => vends.find((x: any) => x.id === id)?.name || null;
  const clientName = (id: string | null) => data.clients.find((x: any) => x.id === id)?.name || null;
  const monthlyOf = (r: any) => (r.recurring === 'monthly' ? num(r.amount) : r.recurring === 'yearly' ? num(r.amount) / 12 : 0);
  const all = data.cashflow.filter((r: any) => r.kind === 'expense').map((r: any) => {
    const allocs = data.allocations.filter((a: any) => a.cashflowId === r.id);
    return {
      ...r,
      trackOnly: !!r.trackOnly,
      categoryName: catName(r.categoryId) || r.category || null,
      vendorName: vendorName(r.vendorId),
      clientName: clientName(r.clientId),
      monthlyEquivalent: Math.round(monthlyOf(r) * 100) / 100,
      yearlyEquivalent: Math.round((r.recurring === 'monthly' ? num(r.amount) * 12 : r.recurring === 'yearly' ? num(r.amount) : 0) * 100) / 100,
      allocationCount: allocs.length,
      unallocated: !allocs.length && !r.clientId && !r.projectId,
      receiptCount: receiptCountOf(r.id),
    };
  });
  // תשתיות למעקב בלבד (idea 4) — לא נספרות כהוצאה; מוצגות בנפרד
  const infra = all.filter((e) => e.trackOnly);
  const expenses = all.filter((e) => !e.trackOnly);
  const recurring = expenses.filter((e) => e.recurring === 'monthly' || e.recurring === 'yearly');
  return c.json({
    currency: data.prefs.currency,
    kpis: {
      fixedMonthly: fixedMonthlyCosts(data),
      recurringCount: recurring.length,
      unallocatedCount: expenses.filter((e) => e.unallocated && (e.recurring === 'monthly' || e.recurring === 'yearly')).length,
      totalMonthly: Math.round(expenses.reduce((a, e) => a + e.monthlyEquivalent, 0) * 100) / 100,
      infraCount: infra.length,
    },
    burn: burnAndRunway(data),
    expenses,
    infra,
    categories: cats,
    vendors: vends,
  });
});

// ---------- היסטוריית הוצאות (idea 2) — פירוט חודשי לחודשים שחלפו ----------
// לכל חודש עבר: סכום ההוצאות/הכנסות + פירוט הפריטים שהיו פעילים באותו חודש.
financeApp.get('/expenses/history', async (c) => {
  const data = await loadFinanceData(c);
  const monthsBack = Math.min(36, Math.max(1, num(c.req.query('months'), 12)));
  const hist = monthlyHistory(data, monthsBack);
  return c.json({ currency: data.prefs.currency, ...hist });
});

// ---------- חידושים ומנויים (§9) ----------
financeApp.get('/renewals', async (c) => {
  const data = await loadFinanceData(c);
  const today = data.today;
  const items = data.cashflow
    .filter((r: any) => r.kind === 'expense' && (r.recurring === 'monthly' || r.recurring === 'yearly'))
    .map((r: any) => {
      const monthly = r.recurring === 'yearly' ? num(r.amount) / 12 : num(r.amount);
      const daysToRenewal = r.renewalDate
        ? Math.round((Date.parse(r.renewalDate + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000)
        : null;
      return {
        id: r.id, label: r.label, amount: num(r.amount), recurring: r.recurring,
        monthlyEquivalent: Math.round(monthly * 100) / 100,
        yearlyEquivalent: Math.round((r.recurring === 'monthly' ? num(r.amount) * 12 : num(r.amount)) * 100) / 100,
        renewalDate: r.renewalDate || null, daysToRenewal,
        cancellable: !!r.cancellable, cancelNoticeDays: r.cancelNoticeDays || null, essential: !!r.essential,
        vendorId: r.vendorId || null,
      };
    })
    .sort((a, b) => {
      if (a.daysToRenewal == null) return 1;
      if (b.daysToRenewal == null) return -1;
      return a.daysToRenewal - b.daysToRenewal;
    });
  return c.json({ currency: data.prefs.currency, items });
});

// ---------- גבייה (§6) ----------
financeApp.get('/receivables', async (c) => {
  const data = await loadFinanceData(c);
  return c.json(receivables(data));
});

// ---------- רווחיות (§17) ----------
financeApp.get('/profitability', async (c) => {
  const data = await loadFinanceData(c);
  const prof = clientProfitability(data);
  return c.json({
    currency: data.prefs.currency,
    clients: prof.clients,
    concentration: prof.concentration,
    topConcentration: prof.topConcentration,
    business: businessProfitability(data),
    marginThresholds: { high: 60, ok: 40, review: 20 },
  });
});

// ---------- רווחיות לפי לקוח (drill-down §17.1) ----------
financeApp.get('/by-client', async (c) => {
  const data = await loadFinanceData(c);
  return c.json(clientProfitability(data));
});

// ---------- התראות/חריגות (§21) ----------
financeApp.get('/alerts', async (c) => {
  const data = await loadFinanceData(c);
  const exceptions = computeExceptions(data);
  // התראות ידניות פתוחות שנשמרו (לא כולל רשומות dismiss/resolve)
  const persisted = (await db(c).select().from(financialAlerts).all())
    .filter((a: any) => a.status === 'open');
  return c.json({ exceptions, persisted });
});

// דחייה/סימון-כטופל של חריגה מחושבת — נשמר לפי key יציב (§3.3)
financeApp.post('/alerts/dismiss', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  if (!body.key) return c.json({ error: 'invalid_input' }, 400);
  const action = body.action === 'resolve' ? 'resolved' : 'dismissed';
  const d = db(c);
  const ts = now();
  await d.insert(financialAlerts).values({
    id: uid(),
    type: String(body.type || 'exception'),
    entityType: 'exception',
    entityId: String(body.key),
    title: body.title ? String(body.title) : null,
    message: body.message ? String(body.message) : null,
    amount: body.amount != null ? num(body.amount) : null,
    dueDate: body.dueDate ? String(body.dueDate) : null,
    severity: String(body.severity || 'info'),
    recommendedAction: body.recommendedAction ? String(body.recommendedAction) : null,
    status: action,
    createdAt: ts,
    resolvedAt: ts,
  } as any);
  return c.json({ ok: true });
});

// שחזור חריגה שנדחתה (מבטל את רשומת ה-dismiss/resolve)
financeApp.post('/alerts/restore', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  if (!body.key) return c.json({ error: 'invalid_input' }, 400);
  await db(c).delete(financialAlerts).where(eq(financialAlerts.entityId, String(body.key)));
  return c.json({ ok: true });
});

// סימון alert ידני שמור כטופל (§21 — לא נמחק)
financeApp.post('/alerts/:id/resolve', async (c) => {
  await db(c).update(financialAlerts)
    .set({ status: 'resolved', resolvedAt: now() } as any)
    .where(eq(financialAlerts.id, c.req.param('id')));
  return c.json({ ok: true });
});

// ---------- יתרה נוכחית / Snapshots (§14) ----------
financeApp.get('/balance', async (c) => {
  const data = await loadFinanceData(c);
  const d = db(c);
  const snaps = (await d.select().from(financeBalanceSnapshots).all())
    .sort((a: any, b: any) => String(b.asOfDate).localeCompare(String(a.asOfDate)) || num(b.createdAt) - num(a.createdAt));
  return c.json({
    current: startingBalance(data),
    asOf: data.balanceAsOf,
    opening: data.openingBalance,
    history: snaps.slice(0, 24),
  });
});

financeApp.post('/balance', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  if (body.amount == null || body.amount === '') return c.json({ error: 'invalid_input' }, 400);
  const d = db(c);
  const id = uid();
  const asOf = String(body.asOfDate || todayIL());
  await d.insert(financeBalanceSnapshots).values({
    id, amount: num(body.amount), asOfDate: asOf, notes: body.notes ? String(body.notes) : null, createdAt: now(),
  } as any);
  await logActivity(d, {
    entityType: 'finance', entityId: id, type: 'note',
    title: `עדכון יתרה נוכחית: ${num(body.amount)}`, metadata: { asOfDate: asOf },
  });
  return c.json({ ok: true, id });
});

// ---------- Occurrences (§5) ----------
const OCC_FIELDS = ['sourceType', 'sourceId', 'kind', 'label', 'amount', 'dueDate', 'expectedDate', 'actualDate', 'status', 'confidence', 'clientId', 'projectId', 'engagementId', 'vendorId', 'categoryId', 'cashflowId', 'notes'];

financeApp.get('/occurrences', async (c) => {
  const d = db(c);
  const rows = await d.select().from(financialOccurrences).orderBy(desc(financialOccurrences.dueDate)).all();
  return c.json(rows);
});

financeApp.post('/occurrences', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  if (body.amount == null) return c.json({ error: 'invalid_input' }, 400);
  const data: any = pick(body, OCC_FIELDS);
  if (data.amount !== undefined) data.amount = num(data.amount);
  if (data.confidence !== undefined) data.confidence = num(data.confidence);
  const id = uid();
  await db(c).insert(financialOccurrences).values({
    id,
    sourceType: String(body.sourceType || 'manual'),
    kind: body.kind === 'expense' ? 'expense' : 'income',
    status: String(body.status || 'expected'),
    confidence: data.confidence != null ? data.confidence : 80,
    ...data,
    amount: num(body.amount),
    createdAt: now(),
  } as any);
  return c.json({ ok: true, id });
});

financeApp.patch('/occurrences/:id', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const data: any = pick(body, OCC_FIELDS);
  if (data.amount !== undefined) data.amount = num(data.amount);
  if (data.confidence !== undefined) data.confidence = num(data.confidence);
  data.updatedAt = now();
  if (Object.keys(data).length) await db(c).update(financialOccurrences).set(data).where(eq(financialOccurrences.id, c.req.param('id')));
  return c.json({ ok: true });
});

financeApp.delete('/occurrences/:id', async (c) => {
  await db(c).delete(financialOccurrences).where(eq(financialOccurrences.id, c.req.param('id')));
  return c.json({ ok: true });
});

// ---------- קטגוריות הוצאה (§7.3) ----------
financeApp.get('/categories', async (c) => {
  const rows = await db(c).select().from(expenseCategories).all();
  return c.json(rows.sort((a: any, b: any) => num(a.sort) - num(b.sort)));
});

financeApp.post('/categories', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  if (!body.name) return c.json({ error: 'invalid_input' }, 400);
  const id = uid();
  await db(c).insert(expenseCategories).values({
    id, name: String(body.name), kind: String(body.kind || 'expense'),
    sort: num(body.sort, 50), active: 1, builtin: 0, createdAt: now(),
  } as any);
  return c.json({ ok: true, id });
});

financeApp.patch('/categories/:id', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const data: any = pick(body, ['name', 'kind', 'sort', 'active']);
  if (data.sort !== undefined) data.sort = num(data.sort);
  if (data.active !== undefined) data.active = data.active ? 1 : 0;
  if (Object.keys(data).length) await db(c).update(expenseCategories).set(data).where(eq(expenseCategories.id, c.req.param('id')));
  return c.json({ ok: true });
});

// ---------- ספקים (§8) ----------
const VENDOR_FIELDS = ['name', 'categoryId', 'website', 'contactName', 'email', 'phone', 'notes', 'active'];

financeApp.get('/vendors', async (c) => {
  const rows = await db(c).select().from(vendors).orderBy(desc(vendors.createdAt)).all();
  return c.json(rows);
});

financeApp.post('/vendors', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  if (!body.name) return c.json({ error: 'invalid_input' }, 400);
  const id = uid();
  const data: any = pick(body, VENDOR_FIELDS);
  if (data.active !== undefined) data.active = data.active ? 1 : 0;
  await db(c).insert(vendors).values({ id, ...data, name: String(body.name), active: data.active ?? 1, createdAt: now() } as any);
  return c.json({ ok: true, id });
});

financeApp.patch('/vendors/:id', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const data: any = pick(body, VENDOR_FIELDS);
  if (data.active !== undefined) data.active = data.active ? 1 : 0;
  data.updatedAt = now();
  if (Object.keys(data).length) await db(c).update(vendors).set(data).where(eq(vendors.id, c.req.param('id')));
  return c.json({ ok: true });
});

financeApp.delete('/vendors/:id', async (c) => {
  await db(c).delete(vendors).where(eq(vendors.id, c.req.param('id')));
  return c.json({ ok: true });
});

// ---------- העדפות פיננסיות (§25) ----------
const PREF_FIELDS = ['currency', 'cashThreshold', 'forecastMonths', 'defaultScenario', 'overdueGraceDays', 'alertRenewalDays', 'marginWarningThreshold', 'revenueConcentrationThreshold', 'defaultOpportunityForecastMode', 'optimisticMinProbability', 'unusualExpenseFactor'];

financeApp.get('/preferences', async (c) => {
  const rows = await db(c).select().from(financePreferences).where(eq(financePreferences.id, 'default')).limit(1);
  return c.json(rows[0] || { id: 'default', ...DEFAULT_PREFS, alertRenewalDays: '30,14,7' });
});

financeApp.put('/preferences', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const data: any = pick(body, PREF_FIELDS);
  for (const f of ['cashThreshold', 'forecastMonths', 'overdueGraceDays', 'marginWarningThreshold', 'revenueConcentrationThreshold', 'optimisticMinProbability', 'unusualExpenseFactor']) {
    if (data[f] !== undefined) data[f] = num(data[f]);
  }
  if (data.alertRenewalDays !== undefined && Array.isArray(data.alertRenewalDays)) data.alertRenewalDays = data.alertRenewalDays.join(',');
  data.updatedAt = now();
  const d = db(c);
  const existing = await d.select().from(financePreferences).where(eq(financePreferences.id, 'default')).limit(1);
  if (existing.length) await d.update(financePreferences).set(data).where(eq(financePreferences.id, 'default'));
  else await d.insert(financePreferences).values({ id: 'default', ...data } as any);
  return c.json({ ok: true });
});

/* ---------- תרחישי What-if (§20) ----------
 * נשמרים בטבלת scenarios הקיימת עם model='whatif' (inputs=הגדרת התרחיש) כדי לא לשכפל טבלה.
 * הסימולציה טהורה ולא נוגעת בנתוני אמת — Snapshot בלבד.
 */
function normalizeAdjustments(raw: any): Adjustment[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((a) => ({
    label: String(a.label || 'התאמה'),
    target: a.target === 'expense' ? 'expense' : 'income',
    op: a.op === 'remove' ? 'remove' : 'add',
    amount: num(a.amount),
    recurring: a.recurring === 'monthly' ? 'monthly' : 'once',
    startDate: a.startDate ? String(a.startDate) : null,
    endDate: a.endDate ? String(a.endDate) : null,
  })) as Adjustment[];
}

// הרצת סימולציה ללא שמירה (Preview חי)
financeApp.post('/whatif/simulate', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const data = await loadFinanceData(c);
  const adjustments = normalizeAdjustments(body.adjustments);
  const months = Math.min(36, Math.max(1, num(body.months, data.prefs.forecastMonths)));
  const scenario = (body.scenario || data.prefs.defaultScenario) as ScenarioKind;
  return c.json(simulateScenario(data, adjustments, scenario, months));
});

// רשימת תרחישי What-if שמורים (בלבד — לא תרחישי מחשבון החיוב)
financeApp.get('/whatif', async (c) => {
  const rows = await db(c).select().from(scenarios).where(eq(scenarios.model, 'whatif')).orderBy(desc(scenarios.createdAt)).all();
  return c.json(rows.map((s) => {
    let cfg: any = {};
    try { cfg = JSON.parse(s.inputs || '{}'); } catch { /* ignore */ }
    return { id: s.id, name: s.name, notes: s.notes, createdAt: s.createdAt, adjustments: cfg.adjustments || [], months: cfg.months || 12, scenario: cfg.scenario || 'realistic' };
  }));
});

financeApp.post('/whatif', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  if (!body.name) return c.json({ error: 'invalid_input' }, 400);
  const id = uid();
  const cfg = {
    adjustments: normalizeAdjustments(body.adjustments),
    months: Math.min(36, Math.max(1, num(body.months, 12))),
    scenario: body.scenario || 'realistic',
  };
  await db(c).insert(scenarios).values({
    id, clientId: body.clientId || null, name: String(body.name), model: 'whatif',
    inputs: JSON.stringify(cfg), results: '{}', notes: body.notes ? String(body.notes) : null, createdAt: now(),
  } as any);
  return c.json({ ok: true, id });
});

financeApp.patch('/whatif/:id', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const data: any = {};
  if (body.name !== undefined) data.name = String(body.name);
  if (body.notes !== undefined) data.notes = body.notes ? String(body.notes) : null;
  if (body.adjustments !== undefined || body.months !== undefined || body.scenario !== undefined) {
    const cur = (await db(c).select().from(scenarios).where(eq(scenarios.id, c.req.param('id'))).limit(1))[0];
    let cfg: any = {}; try { cfg = JSON.parse(cur?.inputs || '{}'); } catch { /* ignore */ }
    if (body.adjustments !== undefined) cfg.adjustments = normalizeAdjustments(body.adjustments);
    if (body.months !== undefined) cfg.months = Math.min(36, Math.max(1, num(body.months, 12)));
    if (body.scenario !== undefined) cfg.scenario = body.scenario;
    data.inputs = JSON.stringify(cfg);
  }
  if (Object.keys(data).length) await db(c).update(scenarios).set(data).where(eq(scenarios.id, c.req.param('id')));
  return c.json({ ok: true });
});

financeApp.delete('/whatif/:id', async (c) => {
  await db(c).delete(scenarios).where(eq(scenarios.id, c.req.param('id')));
  return c.json({ ok: true });
});
