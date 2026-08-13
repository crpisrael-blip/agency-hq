import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { documents, clients } from '../db/schema';
import { Env, db, uid, now, pick, num } from './util';

export const documentsApp = new Hono<Env>();

const FIELDS = ['clientId', 'systemId', 'title', 'category', 'source', 'url', 'notes', 'pinned'];

// רשימה — אופציונלי סינון ?clientId=
documentsApp.get('/', async (c) => {
  const d = db(c);
  const rows = await d.select().from(documents).orderBy(desc(documents.pinned), desc(documents.createdAt)).all();
  const cls = await d.select().from(clients).all();
  const clientId = c.req.query('clientId');
  const filtered = clientId ? rows.filter((r) => r.clientId === clientId) : rows;
  return c.json(filtered.map((r) => ({ ...r, clientName: cls.find((cl) => cl.id === r.clientId)?.name || null })));
});

documentsApp.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  if (!body.title) return c.json({ error: 'invalid_input' }, 400);
  const data: any = pick(body, FIELDS);
  if (data.pinned !== undefined) data.pinned = num(data.pinned);
  const id = uid();
  await db(c).insert(documents).values({ id, ...data, title: String(body.title), createdAt: now() } as any);
  return c.json({ ok: true, id });
});

documentsApp.patch('/:id', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const data: any = pick(body, FIELDS);
  if (data.pinned !== undefined) data.pinned = num(data.pinned);
  if (Object.keys(data).length) await db(c).update(documents).set(data).where(eq(documents.id, c.req.param('id')));
  return c.json({ ok: true });
});

documentsApp.delete('/:id', async (c) => {
  await db(c).delete(documents).where(eq(documents.id, c.req.param('id')));
  return c.json({ ok: true });
});
