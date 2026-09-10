import { Hono } from 'hono';
import { desc, eq, and } from 'drizzle-orm';
import { clients, systems, engagements, tasks, profitCenters, processes, cashflow, documents, modules, expenseAllocations, playbookRuns, telegramFillSessions } from '../db/schema';
import { Env, db, uid, now, pick, num } from './util';
import { engagementMonthly } from './engagements';
import { buildSummary } from './run-fill';

export const clientsApp = new Hono<Env>();

const FIELDS = ['name', 'industry', 'size', 'contactName', 'contactRole', 'phone', 'email', 'status', 'stage', 'health', 'tags', 'notes'];

// רשימת לקוחות + סיכומים (כמה מערכות, MRR)
clientsApp.get('/', async (c) => {
  const d = db(c);
  const rows = await d.select().from(clients).orderBy(desc(clients.createdAt)).all();
  const allSystems = await d.select().from(systems).all();
  const allEng = await d.select().from(engagements).all();
  const out = rows.map((cl) => ({
    ...cl,
    systemsCount: allSystems.filter((s) => s.clientId === cl.id).length,
    liveSystems: allSystems.filter((s) => s.clientId === cl.id && s.status === 'live').length,
    mrr: allEng
      .filter((e) => e.clientId === cl.id && e.status === 'active')
      .reduce((a, e) => a + engagementMonthly(e), 0),
  }));
  return c.json(out);
});

clientsApp.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  if (!body.name) return c.json({ error: 'invalid_input' }, 400);
  const id = uid();
  await db(c).insert(clients).values({ id, ...pick(body, FIELDS), name: String(body.name), createdAt: now() } as any);
  return c.json({ ok: true, id });
});

// כרטיס 360 מלא
clientsApp.get('/:id', async (c) => {
  const id = c.req.param('id');
  const d = db(c);
  const cl = (await d.select().from(clients).where(eq(clients.id, id)).limit(1))[0];
  if (!cl) return c.json({ error: 'not_found' }, 404);
  const sys = await d.select().from(systems).where(eq(systems.clientId, id)).orderBy(desc(systems.createdAt)).all();
  const eng = await d.select().from(engagements).where(eq(engagements.clientId, id)).orderBy(desc(engagements.createdAt)).all();
  const procs = await d.select().from(processes).where(eq(processes.clientId, id)).all();
  const ideas = await d.select().from(profitCenters).where(eq(profitCenters.clientId, id)).all();
  const cf = await d.select().from(cashflow).where(eq(cashflow.clientId, id)).orderBy(desc(cashflow.startDate)).all();
  const docs = await d.select().from(documents).where(eq(documents.clientId, id)).orderBy(desc(documents.pinned), desc(documents.createdAt)).all();
  const mods = await d.select().from(modules).where(eq(modules.clientId, id)).all();
  // מהלכי המתודולוגיה של הלקוח — כל תהליך שפתחתי מולו, עם מצב מילוי בטלגרם (אם נשלח)
  const runRows = await d.select().from(playbookRuns).where(eq(playbookRuns.clientId, id))
    .orderBy(desc(playbookRuns.createdAt)).all();
  const tgRows = await d.select().from(telegramFillSessions).all();
  const tgByRun = new Map(tgRows.map((s) => [s.runId, s]));
  const runs = runRows.map((r) => ({ ...r, telegram: buildSummary(r, tgByRun.get(r.id) || null, null) }));
  const linkedTasks = await d.select().from(tasks)
    .where(and(eq(tasks.entityType, 'client'), eq(tasks.entityId, id)))
    .orderBy(desc(tasks.createdAt)).all();
  const mrr = eng.filter((e) => e.status === 'active').reduce((a, e) => a + engagementMonthly(e), 0);
  // עלות תשתית/מנויים משויכת לחודש (חלק יחסי מהמנויים המשותפים)
  const allAlloc = await d.select().from(expenseAllocations).all();
  const cfMap = new Map((await d.select().from(cashflow).all()).map((r) => [r.id, r]));
  const sumWByCf = new Map<string, number>();
  for (const a of allAlloc) sumWByCf.set(a.cashflowId, (sumWByCf.get(a.cashflowId) || 0) + (num(a.weight) || 0));
  const infraItems = allAlloc
    .filter((a) => a.clientId === id)
    .map((a) => {
      const row: any = cfMap.get(a.cashflowId);
      if (!row || row.kind !== 'expense' || row.recurring !== 'monthly') return null;
      const sw = sumWByCf.get(a.cashflowId) || 1;
      return { label: row.label, monthly: Math.round((num(row.amount) * (num(a.weight) || 0)) / sw * 100) / 100 };
    })
    .filter(Boolean) as { label: string; monthly: number }[];
  const infraMonthly = Math.round(infraItems.reduce((s, x) => s + x.monthly, 0) * 100) / 100;
  return c.json({ client: cl, systems: sys, engagements: eng, processes: procs, ideas, cashflow: cf, documents: docs, modules: mods, runs, tasks: linkedTasks, mrr, infraMonthly, infraItems });
});

clientsApp.patch('/:id', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const data = pick(body, FIELDS);
  if (Object.keys(data).length) {
    await db(c).update(clients).set(data as any).where(eq(clients.id, c.req.param('id')));
  }
  return c.json({ ok: true });
});

clientsApp.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const d = db(c);
  const sys = await d.select().from(systems).where(eq(systems.clientId, id)).all();
  if (sys.length) return c.json({ error: 'has_systems' }, 409);
  const eng = await d.select().from(engagements).where(eq(engagements.clientId, id)).all();
  if (eng.length) return c.json({ error: 'has_engagements' }, 409);
  await d.delete(clients).where(eq(clients.id, id));
  return c.json({ ok: true });
});
