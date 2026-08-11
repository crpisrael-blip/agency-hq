import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { processes, clients, systems } from '../db/schema';
import { Env, db, uid, now, pick } from './util';

export const processesApp = new Hono<Env>();

const FIELDS = ['clientId', 'systemId', 'name', 'kind', 'status', 'steps', 'description'];

const normSteps = (v: any) => (typeof v === 'string' ? v : JSON.stringify(v || []));

processesApp.get('/', async (c) => {
  const d = db(c);
  const rows = await d.select().from(processes).orderBy(desc(processes.createdAt)).all();
  const cls = await d.select().from(clients).all();
  const sys = await d.select().from(systems).all();
  return c.json(rows.map((r) => ({
    ...r,
    clientName: cls.find((cl) => cl.id === r.clientId)?.name || null,
    systemName: sys.find((s) => s.id === r.systemId)?.name || null,
  })));
});

processesApp.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  if (!body.name) return c.json({ error: 'invalid_input' }, 400);
  const data: any = pick(body, FIELDS);
  if (data.steps !== undefined) data.steps = normSteps(data.steps);
  const id = uid();
  await db(c).insert(processes).values({ id, ...data, name: String(body.name), createdAt: now() } as any);
  return c.json({ ok: true, id });
});

processesApp.patch('/:id', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const data: any = pick(body, FIELDS);
  if (data.steps !== undefined) data.steps = normSteps(data.steps);
  if (Object.keys(data).length) await db(c).update(processes).set(data).where(eq(processes.id, c.req.param('id')));
  return c.json({ ok: true });
});

processesApp.delete('/:id', async (c) => {
  await db(c).delete(processes).where(eq(processes.id, c.req.param('id')));
  return c.json({ ok: true });
});
