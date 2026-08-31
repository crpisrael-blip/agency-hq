import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { cashflow, scenarios, engagements, clients, settings, expenseAllocations } from '../db/schema';
import { Env, db, uid, now, pick, num, todayIL } from './util';
import { engagementMonthly, engagementSetup } from './engagements';

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
const CF_FIELDS = ['kind', 'label', 'amount', 'clientId', 'engagementId', 'category', 'recurring', 'billingDay', 'startDate', 'endDate', 'status', 'notes'];

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
    ...pick(body, CF_FIELDS),
    label: String(body.label),
    amount: num(body.amount),
    billingDay: body.billingDay != null && body.billingDay !== '' ? num(body.billingDay) : null,
    startDate: String(body.startDate || todayIL()),
    createdAt: now(),
  } as any);
  return c.json({ ok: true, id });
});

financeApp.patch('/cashflow/:id', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const data: any = pick(body, CF_FIELDS);
  if (data.amount !== undefined) data.amount = num(data.amount);
  if (data.billingDay !== undefined) data.billingDay = data.billingDay === '' || data.billingDay == null ? null : num(data.billingDay);
  if (Object.keys(data).length) await db(c).update(cashflow).set(data).where(eq(cashflow.id, c.req.param('id')));
  return c.json({ ok: true });
});

financeApp.delete('/cashflow/:id', async (c) => {
  await db(c).delete(cashflow).where(eq(cashflow.id, c.req.param('id')));
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
