import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { skillUsage, systems } from '../db/schema';
import { Env, db, uid, now } from './util';

export const skillsApp = new Hono<Env>();

// מפת שימוש: skillName -> [{ id, systemId, systemName }]
skillsApp.get('/usage', async (c) => {
  const rows = await db(c).select().from(skillUsage).all();
  const map: Record<string, { id: string; systemId: string | null; systemName: string }[]> = {};
  for (const r of rows) {
    (map[r.skillName] = map[r.skillName] || []).push({
      id: r.id,
      systemId: r.systemId ?? null,
      systemName: r.systemName,
    });
  }
  return c.json(map);
});

// סימון שימוש: { skillName, systemId?, systemName? }
skillsApp.post('/usage', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const skillName = String(body.skillName || '').trim();
  if (!skillName) return c.json({ error: 'invalid_input' }, 400);

  const systemId = body.systemId ? String(body.systemId) : null;
  let systemName = String(body.systemName || '').trim();
  if (systemId && !systemName) {
    const s = (await db(c).select().from(systems).where(eq(systems.id, systemId)).limit(1))[0];
    systemName = s?.name || systemId;
  }
  if (!systemName) return c.json({ error: 'invalid_input' }, 400);

  const id = uid();
  await db(c).insert(skillUsage).values({ id, skillName, systemId, systemName, createdAt: now() } as any);
  return c.json({ ok: true, id, skillName, systemId, systemName });
});

// הסרת סימון
skillsApp.delete('/usage/:id', async (c) => {
  await db(c).delete(skillUsage).where(eq(skillUsage.id, c.req.param('id')));
  return c.json({ ok: true });
});
