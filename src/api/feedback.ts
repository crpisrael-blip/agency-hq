import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { feedbackItems } from '../db/schema';
import { Env, db, uid, now, pick } from './util';

export const feedbackApp = new Hono<Env>();

const FIELDS = ['kind', 'content', 'screen', 'status'];

feedbackApp.get('/', async (c) => {
  const rows = await db(c).select().from(feedbackItems).orderBy(desc(feedbackItems.createdAt)).all();
  return c.json(rows);
});

feedbackApp.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  if (!body.content) return c.json({ error: 'invalid_input' }, 400);
  const id = uid();
  await db(c).insert(feedbackItems).values({
    id, ...pick(body, FIELDS), content: String(body.content), createdAt: now(),
  } as any);
  return c.json({ ok: true, id });
});

feedbackApp.patch('/:id', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const data = pick(body, FIELDS);
  if (Object.keys(data).length) {
    await db(c).update(feedbackItems).set(data as any).where(eq(feedbackItems.id, c.req.param('id')));
  }
  return c.json({ ok: true });
});

feedbackApp.delete('/:id', async (c) => {
  await db(c).delete(feedbackItems).where(eq(feedbackItems.id, c.req.param('id')));
  return c.json({ ok: true });
});
