import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { tasks } from '../db/schema';
import { Env, db, uid, now, pick } from './util';

export const tasksApp = new Hono<Env>();

const FIELDS = ['title', 'details', 'status', 'priority', 'dueDate', 'entityType', 'entityId'];

// רשימה — אופציונלי סינון ?status= / ?entityType=&entityId=
tasksApp.get('/', async (c) => {
  const d = db(c);
  let rows = await d.select().from(tasks).orderBy(desc(tasks.createdAt)).all();
  const status = c.req.query('status');
  const entityType = c.req.query('entityType');
  const entityId = c.req.query('entityId');
  if (status) rows = rows.filter((t) => t.status === status);
  if (entityType && entityId) rows = rows.filter((t) => t.entityType === entityType && t.entityId === entityId);
  return c.json(rows);
});

tasksApp.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  if (!body.title) return c.json({ error: 'invalid_input' }, 400);
  const id = uid();
  await db(c).insert(tasks).values({ id, ...pick(body, FIELDS), title: String(body.title), createdAt: now() } as any);
  return c.json({ ok: true, id });
});

tasksApp.patch('/:id', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const data: any = pick(body, FIELDS);
  if (data.status === 'done') data.doneAt = now();
  if (data.status && data.status !== 'done') data.doneAt = null;
  if (Object.keys(data).length) await db(c).update(tasks).set(data).where(eq(tasks.id, c.req.param('id')));
  return c.json({ ok: true });
});

tasksApp.delete('/:id', async (c) => {
  await db(c).delete(tasks).where(eq(tasks.id, c.req.param('id')));
  return c.json({ ok: true });
});
