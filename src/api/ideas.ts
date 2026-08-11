import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { profitCenters, clients } from '../db/schema';
import { Env, db, uid, now, pick, num } from './util';

export const ideasApp = new Hono<Env>();

const FIELDS = ['clientId', 'title', 'description', 'model', 'potentialMonthly', 'potentialOneTime', 'effort', 'confidence', 'status', 'notes'];
const NUM_FIELDS = ['potentialMonthly', 'potentialOneTime', 'confidence'];

ideasApp.get('/', async (c) => {
  const d = db(c);
  const rows = await d.select().from(profitCenters).orderBy(desc(profitCenters.createdAt)).all();
  const cls = await d.select().from(clients).all();
  return c.json(rows.map((r) => ({
    ...r,
    clientName: cls.find((cl) => cl.id === r.clientId)?.name || null,
    // ערך משוקלל = פוטנציאל חודשי × סבירות
    weighted: num(r.potentialMonthly) * (num(r.confidence) / 100),
  })));
});

ideasApp.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  if (!body.title) return c.json({ error: 'invalid_input' }, 400);
  const data: any = pick(body, FIELDS);
  for (const f of NUM_FIELDS) if (data[f] !== undefined) data[f] = num(data[f]);
  const id = uid();
  await db(c).insert(profitCenters).values({ id, ...data, title: String(body.title), createdAt: now() } as any);
  return c.json({ ok: true, id });
});

ideasApp.patch('/:id', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const data: any = pick(body, FIELDS);
  for (const f of NUM_FIELDS) if (data[f] !== undefined) data[f] = num(data[f]);
  if (Object.keys(data).length) await db(c).update(profitCenters).set(data).where(eq(profitCenters.id, c.req.param('id')));
  return c.json({ ok: true });
});

ideasApp.delete('/:id', async (c) => {
  await db(c).delete(profitCenters).where(eq(profitCenters.id, c.req.param('id')));
  return c.json({ ok: true });
});
