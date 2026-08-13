import { Hono } from 'hono';
import { Context } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { leads, systems, clients } from '../db/schema';
import { Env, db, uid, now, todayIL } from './util';

export const leadsApp = new Hono<Env>();

/**
 * Webhook ציבורי — מערכת לקוח קוראת לו כשנכנס ליד.
 * POST /api/hook/lead  { systemId, source?, name?, note?, clientId? }
 * לא דורש אימות מנהל (מערכות חיצוניות קוראות לו), אבל systemId חייב להיות תקף.
 */
export async function registerLeadPublic(c: Context<Env>) {
  const body = await c.req.json().catch(() => ({} as any));
  const systemId = String(body.systemId || '').trim();
  if (!systemId) return c.json({ error: 'missing_system' }, 400);
  const d = db(c);
  const sys = (await d.select().from(systems).where(eq(systems.id, systemId)).limit(1))[0];
  if (!sys) return c.json({ error: 'unknown_system' }, 404);
  await d.insert(leads).values({
    id: uid(),
    systemId,
    clientId: sys.clientId,
    source: body.source ? String(body.source) : 'website',
    name: body.name ? String(body.name).slice(0, 120) : null,
    note: body.note ? String(body.note).slice(0, 300) : null,
    createdAt: now(),
  });
  return c.json({ ok: true });
}

// --- מוגן (מנהל) ---

// רשימה — אופציונלי ?systemId= / ?clientId=
leadsApp.get('/', async (c) => {
  const d = db(c);
  let rows = await d.select().from(leads).orderBy(desc(leads.createdAt)).limit(500).all();
  const systemId = c.req.query('systemId');
  const clientId = c.req.query('clientId');
  if (systemId) rows = rows.filter((r) => r.systemId === systemId);
  if (clientId) rows = rows.filter((r) => r.clientId === clientId);
  return c.json(rows);
});

// סיכום מונים — סה"כ, החודש, ופירוט לפי מערכת
leadsApp.get('/summary', async (c) => {
  const d = db(c);
  const rows = await d.select().from(leads).all();
  const sys = await d.select().from(systems).all();
  const cls = await d.select().from(clients).all();
  const monthPrefix = todayIL().slice(0, 7); // YYYY-MM
  const inMonth = (ms: number) => new Date(ms).toISOString().slice(0, 7) === monthPrefix;

  const bySystemMap = new Map<string, { systemId: string; count: number; month: number; last: number }>();
  for (const r of rows) {
    const key = r.systemId || 'unknown';
    const e = bySystemMap.get(key) || { systemId: key, count: 0, month: 0, last: 0 };
    e.count++;
    if (inMonth(r.createdAt)) e.month++;
    if (r.createdAt > e.last) e.last = r.createdAt;
    bySystemMap.set(key, e);
  }
  const bySystem = [...bySystemMap.values()]
    .map((e) => {
      const s = sys.find((x) => x.id === e.systemId);
      return {
        ...e,
        systemName: s?.name || '—',
        clientName: cls.find((cl) => cl.id === s?.clientId)?.name || '—',
      };
    })
    .sort((a, b) => b.count - a.count);

  return c.json({
    total: rows.length,
    thisMonth: rows.filter((r) => inMonth(r.createdAt)).length,
    bySystem,
  });
});

leadsApp.delete('/:id', async (c) => {
  await db(c).delete(leads).where(eq(leads.id, c.req.param('id')));
  return c.json({ ok: true });
});
