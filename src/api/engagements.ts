import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { engagements, clients, systems } from '../db/schema';
import { Env, db, uid, now, pick, num } from './util';

export const engagementsApp = new Hono<Env>();

/**
 * ערך חודשי חוזר (MRR) של התקשרות לפי מודל החיוב.
 *  retainer – ריטיינר חודשי קבוע
 *  hourly   – תעריף שעה × שעות חודשיות
 *  revshare – אחוז ממחזור חודשי צפוי אצל הלקוח
 *  value    – מבוסס-ערך: מיוצג כריטיינר חודשי (monthlyFee)
 *  one_time – פרויקט חד-פעמי: אין רכיב חודשי (ראה engagementSetup)
 *  hybrid   – סכום כל הרכיבים
 */
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

/** רכיב חד-פעמי (הקמה/מקדמה) של ההתקשרות */
export function engagementSetup(e: any): number {
  return num(e.setupFee);
}

const FIELDS = [
  'clientId', 'systemId', 'title', 'model', 'status', 'setupFee', 'monthlyFee',
  'hourlyRate', 'monthlyHours', 'revsharePercent', 'revshareBase',
  'startDate', 'endDate', 'billingDay', 'notes',
];
const NUM_FIELDS = ['setupFee', 'monthlyFee', 'hourlyRate', 'monthlyHours', 'revsharePercent', 'revshareBase', 'billingDay'];

engagementsApp.get('/', async (c) => {
  const d = db(c);
  const rows = await d.select().from(engagements).orderBy(desc(engagements.createdAt)).all();
  const cls = await d.select().from(clients).all();
  const sys = await d.select().from(systems).all();
  return c.json(rows.map((e) => ({
    ...e,
    clientName: cls.find((cl) => cl.id === e.clientId)?.name || '—',
    systemName: sys.find((s) => s.id === e.systemId)?.name || null,
    monthlyValue: engagementMonthly(e),
    setupValue: engagementSetup(e),
  })));
});

engagementsApp.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  if (!body.title || !body.clientId) return c.json({ error: 'invalid_input' }, 400);
  const data: any = pick(body, FIELDS);
  for (const f of NUM_FIELDS) if (data[f] !== undefined) data[f] = num(data[f]);
  const id = uid();
  await db(c).insert(engagements).values({
    id, ...data, clientId: String(body.clientId), title: String(body.title), createdAt: now(),
  } as any);
  return c.json({ ok: true, id });
});

engagementsApp.patch('/:id', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const data: any = pick(body, FIELDS);
  for (const f of NUM_FIELDS) if (data[f] !== undefined) data[f] = num(data[f]);
  if (Object.keys(data).length) {
    await db(c).update(engagements).set(data).where(eq(engagements.id, c.req.param('id')));
  }
  return c.json({ ok: true });
});

engagementsApp.delete('/:id', async (c) => {
  await db(c).delete(engagements).where(eq(engagements.id, c.req.param('id')));
  return c.json({ ok: true });
});
