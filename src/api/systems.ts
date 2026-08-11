import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { systems, clients } from '../db/schema';
import { Env, db, uid, now, pick, num } from './util';

export const systemsApp = new Hono<Env>();

const FIELDS = ['clientId', 'name', 'kind', 'stack', 'status', 'url', 'repoUrl', 'startDate', 'launchDate', 'progress', 'description', 'notes'];

// כל המערכות (עם שם הלקוח) — אופציונלי סינון לפי לקוח ?clientId=
systemsApp.get('/', async (c) => {
  const d = db(c);
  const clientId = c.req.query('clientId');
  const rows = await d.select().from(systems).orderBy(desc(systems.createdAt)).all();
  const cls = await d.select().from(clients).all();
  const filtered = clientId ? rows.filter((s) => s.clientId === clientId) : rows;
  return c.json(filtered.map((s) => ({ ...s, clientName: cls.find((cl) => cl.id === s.clientId)?.name || '—' })));
});

systemsApp.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  if (!body.name || !body.clientId) return c.json({ error: 'invalid_input' }, 400);
  const id = uid();
  await db(c).insert(systems).values({
    id,
    ...pick(body, FIELDS),
    clientId: String(body.clientId),
    name: String(body.name),
    progress: num(body.progress),
    createdAt: now(),
  } as any);
  return c.json({ ok: true, id });
});

systemsApp.patch('/:id', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const data = pick(body, FIELDS);
  if (data.progress !== undefined) (data as any).progress = num(data.progress);
  if (Object.keys(data).length) {
    await db(c).update(systems).set(data as any).where(eq(systems.id, c.req.param('id')));
  }
  return c.json({ ok: true });
});

systemsApp.delete('/:id', async (c) => {
  await db(c).delete(systems).where(eq(systems.id, c.req.param('id')));
  return c.json({ ok: true });
});
