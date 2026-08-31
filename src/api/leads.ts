import { Hono } from 'hono';
import { Context } from 'hono';
import { desc, eq, inArray } from 'drizzle-orm';
import { leads, systems, clients, settings, leadActivities } from '../db/schema';
import { Env, db, uid, now, todayIL, notifyTelegram } from './util';

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
  const source = body.source ? String(body.source) : 'website';
  const name = body.name ? String(body.name).slice(0, 120) : null;
  const note = body.note ? String(body.note).slice(0, 300) : null;
  await d.insert(leads).values({
    id: uid(),
    systemId,
    clientId: sys.clientId,
    source,
    name,
    note,
    status: 'new',
    createdAt: now(),
  });

  // התראת טלגרם — best-effort, לא מעכבת את התגובה ולא שוברת שמירה אם נכשלת
  const when = new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short',
  }).format(new Date());
  const msg =
    '🔔 ליד חדש מהאתר\n\n' +
    (name ? `👤 ${name}\n` : '') +
    (note ? `${note}\n` : '') +
    `🌐 מקור: ${source}\n` +
    `🏢 מערכת: ${sys.name}\n` +
    `🕐 ${when}`;
  // הגדרות טלגרם: קודם מטבלת settings ב-D1, ואם חסר — נפילה חזרה ל-env
  const cfg = await d
    .select()
    .from(settings)
    .where(inArray(settings.key, ['telegram_bot_token', 'telegram_chat_id']))
    .all()
    .catch(() => [] as { key: string; value: string }[]);
  const cfgMap = Object.fromEntries(cfg.map((r) => [r.key, r.value]));
  const token = cfgMap['telegram_bot_token'] || c.env.TELEGRAM_BOT_TOKEN;
  const chatIds = cfgMap['telegram_chat_id'] || c.env.TELEGRAM_CHAT_ID;
  const p = notifyTelegram(token, chatIds, msg);
  if (c.executionCtx?.waitUntil) c.executionCtx.waitUntil(p);
  else await p;

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

// עדכון ליד (סטטוס / שם / הערה)
const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'won', 'lost'];
leadsApp.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({} as any));
  const patch: Record<string, unknown> = {};
  if (body.status !== undefined) {
    const st = String(body.status);
    if (!LEAD_STATUSES.includes(st)) return c.json({ error: 'bad_status' }, 400);
    patch.status = st;
    patch.handledAt = now();
  }
  if (body.name !== undefined) patch.name = body.name ? String(body.name).slice(0, 120) : null;
  if (body.note !== undefined) patch.note = body.note ? String(body.note).slice(0, 300) : null;
  if (body.followUpAt !== undefined) {
    const n = Number(body.followUpAt);
    patch.followUpAt = Number.isFinite(n) && n > 0 ? n : null;
  }
  if (Object.keys(patch).length === 0) return c.json({ error: 'nothing_to_update' }, 400);
  await db(c).update(leads).set(patch).where(eq(leads.id, id));
  return c.json({ ok: true });
});

// --- יומן פעילות (תיעוד CRM) ---
const ACTIVITY_KINDS = ['call', 'whatsapp', 'meeting', 'note', 'status'];

leadsApp.get('/:id/activities', async (c) => {
  const rows = await db(c)
    .select()
    .from(leadActivities)
    .where(eq(leadActivities.leadId, c.req.param('id')))
    .orderBy(desc(leadActivities.createdAt))
    .all();
  return c.json(rows);
});

leadsApp.post('/:id/activities', async (c) => {
  const leadId = c.req.param('id');
  const body = await c.req.json().catch(() => ({} as any));
  const kind = String(body.kind || 'note');
  if (!ACTIVITY_KINDS.includes(kind)) return c.json({ error: 'bad_kind' }, 400);
  const text = body.text ? String(body.text).slice(0, 500) : null;
  const row = { id: uid(), leadId, kind, text, createdAt: now() };
  await db(c).insert(leadActivities).values(row);
  return c.json(row);
});

leadsApp.delete('/activities/:aid', async (c) => {
  await db(c).delete(leadActivities).where(eq(leadActivities.id, c.req.param('aid')));
  return c.json({ ok: true });
});

leadsApp.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await db(c).delete(leadActivities).where(eq(leadActivities.leadId, id));
  await db(c).delete(leads).where(eq(leads.id, id));
  return c.json({ ok: true });
});
