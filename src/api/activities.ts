import { Hono } from 'hono';
import { desc, eq, and } from 'drizzle-orm';
import { activities } from '../db/schema';
import { Env, db, uid, now, pick, logActivity } from './util';

export const activitiesApp = new Hono<Env>();

// רשימת פעילות — ?entityType=&entityId= או ?organizationId=
activitiesApp.get('/', async (c) => {
  const d = db(c);
  const entityType = c.req.query('entityType');
  const entityId = c.req.query('entityId');
  const organizationId = c.req.query('organizationId');
  let q = d.select().from(activities).$dynamic();
  if (entityType && entityId) {
    q = q.where(and(eq(activities.entityType, entityType), eq(activities.entityId, entityId)));
  } else if (organizationId) {
    q = q.where(eq(activities.organizationId, organizationId));
  }
  const rows = await q.orderBy(desc(activities.occurredAt)).limit(100).all();
  return c.json(rows);
});

activitiesApp.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  if (!body.entityType || !body.entityId || !body.title) return c.json({ error: 'invalid_input' }, 400);
  const d = db(c);
  await logActivity(d, {
    entityType: String(body.entityType),
    entityId: String(body.entityId),
    organizationId: body.organizationId || null,
    type: body.type || 'note',
    title: String(body.title),
    content: body.content || null,
    occurredAt: body.occurredAt || now(),
  });
  return c.json({ ok: true });
});

activitiesApp.delete('/:id', async (c) => {
  await db(c).delete(activities).where(eq(activities.id, c.req.param('id')));
  return c.json({ ok: true });
});
