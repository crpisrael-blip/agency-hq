import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { settings, adminSessions } from '../db/schema';
import { Env, db, sha256, now } from './util';

const PIN_KEY = 'admin_pin_hash';
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export const auth = new Hono<Env>();

// האם כבר הוגדר קוד גישה (למסך ראשוני)
auth.get('/status', async (c) => {
  const rows = await db(c).select().from(settings).where(eq(settings.key, PIN_KEY)).limit(1);
  return c.json({ setup: rows.length > 0 });
});

// הגדרת קוד ראשונית — עובדת רק פעם אחת, כשאין עדיין קוד
auth.post('/setup', async (c) => {
  const { pin } = await c.req.json().catch(() => ({} as any));
  if (!pin || String(pin).length < 4) return c.json({ error: 'pin_too_short' }, 400);
  const d = db(c);
  const existing = await d.select().from(settings).where(eq(settings.key, PIN_KEY)).limit(1);
  if (existing.length) return c.json({ error: 'already_setup' }, 409);
  await d.insert(settings).values({ key: PIN_KEY, value: await sha256(String(pin)) });
  const token = crypto.randomUUID() + crypto.randomUUID();
  await d.insert(adminSessions).values({ token, createdAt: now(), expiresAt: now() + MONTH_MS });
  return c.json({ ok: true, token });
});

auth.post('/login', async (c) => {
  const { pin } = await c.req.json().catch(() => ({} as any));
  const d = db(c);
  const rows = await d.select().from(settings).where(eq(settings.key, PIN_KEY)).limit(1);
  if (!rows.length) return c.json({ error: 'not_setup' }, 409);
  if (rows[0].value !== (await sha256(String(pin || '')))) {
    return c.json({ error: 'wrong_pin' }, 401);
  }
  const token = crypto.randomUUID() + crypto.randomUUID();
  await d.insert(adminSessions).values({ token, createdAt: now(), expiresAt: now() + MONTH_MS });
  return c.json({ ok: true, token });
});

// שינוי קוד גישה — דורש את הקוד הנוכחי (הגנה מספקת)
auth.post('/change', async (c) => {
  const { currentPin, newPin } = await c.req.json().catch(() => ({} as any));
  if (!newPin || String(newPin).length < 4) return c.json({ error: 'pin_too_short' }, 400);
  const d = db(c);
  const rows = await d.select().from(settings).where(eq(settings.key, PIN_KEY)).limit(1);
  if (!rows.length) return c.json({ error: 'not_setup' }, 409);
  if (rows[0].value !== (await sha256(String(currentPin || '')))) {
    return c.json({ error: 'wrong_pin' }, 401);
  }
  await d.update(settings).set({ value: await sha256(String(newPin)) }).where(eq(settings.key, PIN_KEY));
  return c.json({ ok: true });
});

auth.post('/logout', async (c) => {
  const token = c.req.header('x-admin-token') || '';
  if (token) await db(c).delete(adminSessions).where(eq(adminSessions.token, token));
  return c.json({ ok: true });
});
