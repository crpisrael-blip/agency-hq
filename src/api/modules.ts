import { Hono } from 'hono';
import { asc, eq } from 'drizzle-orm';
import { modules, systems, clients } from '../db/schema';
import { Env, db, uid, now, pick, num } from './util';

export const modulesApp = new Hono<Env>();

const FIELDS = ['systemId', 'clientId', 'name', 'description', 'status', 'sort'];

// רשימה — אופציונלי ?systemId= / ?clientId=
modulesApp.get('/', async (c) => {
  const d = db(c);
  const rows = await d.select().from(modules).orderBy(asc(modules.sort)).all();
  const sys = await d.select().from(systems).all();
  const cls = await d.select().from(clients).all();
  const systemId = c.req.query('systemId');
  const clientId = c.req.query('clientId');
  let out = rows;
  if (systemId) out = out.filter((r) => r.systemId === systemId);
  if (clientId) out = out.filter((r) => r.clientId === clientId);
  return c.json(out.map((r) => ({
    ...r,
    systemName: sys.find((s) => s.id === r.systemId)?.name || null,
    clientName: cls.find((cl) => cl.id === r.clientId)?.name || null,
  })));
});

modulesApp.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  if (!body.name) return c.json({ error: 'invalid_input' }, 400);
  const data: any = pick(body, FIELDS);
  if (data.sort !== undefined) data.sort = num(data.sort);
  // אם ניתן systemId ולא clientId — נגזור את הלקוח מהמערכת
  if (data.systemId && !data.clientId) {
    const s = (await db(c).select().from(systems).where(eq(systems.id, data.systemId)).limit(1))[0];
    if (s) data.clientId = s.clientId;
  }
  const id = uid();
  await db(c).insert(modules).values({ id, ...data, name: String(body.name), createdAt: now() } as any);
  return c.json({ ok: true, id });
});

modulesApp.patch('/:id', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const data: any = pick(body, FIELDS);
  if (data.sort !== undefined) data.sort = num(data.sort);
  if (Object.keys(data).length) await db(c).update(modules).set(data).where(eq(modules.id, c.req.param('id')));
  return c.json({ ok: true });
});

modulesApp.delete('/:id', async (c) => {
  await db(c).delete(modules).where(eq(modules.id, c.req.param('id')));
  return c.json({ ok: true });
});
