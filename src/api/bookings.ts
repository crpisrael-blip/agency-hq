import { Hono, Context } from 'hono';
import { and, asc, desc, eq, gte, inArray } from 'drizzle-orm';
import { bookingSlots, bookings, leads, leadActivities, settings } from '../db/schema';
import { Env, db, uid, now, notifyTelegram } from './util';
import { loadWhatsAppConfigDb } from './whatsapp';
import {
  BOOKING_KEYS, buildBookingSettings, formatIL, sendBookingWhatsApp,
  DEFAULT_CONFIRM_TEXT, DEFAULT_REMINDER_TEXT, type BookingSettings,
} from './bookings-core';

const SELF_SYSTEM = 'sys-agency-hq-core';

async function loadBookingSettings(c: Context<Env>): Promise<BookingSettings> {
  const rows = await db(c).select().from(settings).where(inArray(settings.key, BOOKING_KEYS as unknown as string[])).all().catch(() => []);
  return buildBookingSettings(Object.fromEntries(rows.map((r) => [r.key, r.value])));
}

/* =========================================================================
 * ציבורי — האתר קורא לזה (בלי אימות מנהל)
 * ========================================================================= */
export const bookingPublicApp = new Hono<Env>();

/** הגדרות ציבוריות לעמוד הקביעה (בלי סודות) */
bookingPublicApp.get('/config', async (c) => {
  const b = await loadBookingSettings(c);
  return c.json({
    enabled: b.enabled,
    offerPhone: b.offerPhone,
    offerZoom: b.offerZoom && !!b.zoomLink,
    intro: b.pageIntro,
  });
});

/** משבצות פנויות עתידיות (id + מועד + אורך בלבד) */
bookingPublicApp.get('/slots', async (c) => {
  const b = await loadBookingSettings(c);
  if (!b.enabled) return c.json({ enabled: false, slots: [] });
  const rows = await db(c)
    .select({ id: bookingSlots.id, startAt: bookingSlots.startAt, durationMin: bookingSlots.durationMin })
    .from(bookingSlots)
    .where(and(eq(bookingSlots.status, 'open'), gte(bookingSlots.startAt, now() + 60_000)))
    .orderBy(asc(bookingSlots.startAt))
    .limit(200)
    .all();
  return c.json({ enabled: true, offerPhone: b.offerPhone, offerZoom: b.offerZoom && !!b.zoomLink, slots: rows });
});

/** קביעת פגישה — אטומי (משבצת נתפסת פעם אחת בלבד) */
bookingPublicApp.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const slotId = String(body.slotId || '').trim();
  const name = body.name ? String(body.name).slice(0, 120).trim() : '';
  const phone = body.phone ? String(body.phone).slice(0, 40).trim() : '';
  let meetingType = String(body.meetingType || 'phone');
  const note = body.note ? String(body.note).slice(0, 300) : null;
  if (!slotId || !name || !phone) return c.json({ error: 'missing_fields' }, 400);

  const b = await loadBookingSettings(c);
  if (!b.enabled) return c.json({ error: 'booking_disabled' }, 403);
  const zoomOffered = b.offerZoom && !!b.zoomLink;
  if (meetingType === 'zoom' && !zoomOffered) meetingType = b.offerPhone ? 'phone' : meetingType;
  if (meetingType === 'phone' && !b.offerPhone) meetingType = zoomOffered ? 'zoom' : meetingType;
  if (meetingType !== 'phone' && meetingType !== 'zoom') return c.json({ error: 'bad_type' }, 400);

  const d = db(c);
  const slot = (await d.select().from(bookingSlots).where(eq(bookingSlots.id, slotId)).limit(1))[0];
  if (!slot) return c.json({ error: 'slot_not_found' }, 404);
  if (slot.status !== 'open') return c.json({ error: 'slot_taken' }, 409);
  if (slot.startAt < now() + 60_000) return c.json({ error: 'slot_past' }, 409);

  // תפיסה אטומית: רק מי שמצליח לעדכן open→booked ממשיך
  const upd = await c.env.DB.prepare('UPDATE booking_slots SET status = ? WHERE id = ? AND status = ?')
    .bind('booked', slotId, 'open').run();
  if (!upd.meta || upd.meta.changes !== 1) return c.json({ error: 'slot_taken' }, 409);

  const meetingLink = meetingType === 'zoom' ? b.zoomLink : null;
  const bookingId = uid();
  const leadId = uid();

  // ליד ל-CRM (כדי שהפגישה תופיע גם ברשימת הלידים)
  const f = formatIL(slot.startAt);
  await d.insert(leads).values({
    id: leadId, systemId: SELF_SYSTEM, clientId: 'cl-agency-hq-core',
    source: 'website-booking', name, phone,
    note: `🗓️ קבע/ה שיחה ל${f.datetime} (${meetingType === 'zoom' ? 'זום' : 'טלפון'})` + (note ? ` · ${note}` : ''),
    status: 'new', createdAt: now(),
  }).catch(() => {});

  await d.insert(bookings).values({
    id: bookingId, slotId, leadId, startAt: slot.startAt, durationMin: slot.durationMin,
    name, phone, meetingType, meetingLink, note, status: 'booked', createdAt: now(),
  });

  // ברקע: הודעת אישור ווטסאפ + עדכון סטטוס + יומן פעילות + התראת טלגרם
  const bg = (async () => {
    const cfg = await loadWhatsAppConfigDb(d, c.env as any);
    const r = await sendBookingWhatsApp(cfg, b, { name, phone, startAt: slot.startAt, durationMin: slot.durationMin, meetingType, meetingLink }, 'confirm');
    await d.update(bookings).set({
      whatsappStatus: r.status, whatsappError: r.status === 'sent' ? null : r.detail.slice(0, 200),
      confirmSentAt: r.status === 'sent' ? now() : null,
    }).where(eq(bookings.id, bookingId)).catch(() => {});
    if (r.status !== 'skipped') {
      await d.insert(leadActivities).values({
        id: uid(), leadId, kind: 'whatsapp',
        text: r.status === 'sent' ? '💬 נשלח אישור פגישה בווטסאפ' : `⚠️ אישור הפגישה בווטסאפ נכשל: ${r.detail.slice(0, 160)}`,
        createdAt: now(),
      }).catch(() => {});
    }
    // התראת טלגרם למנהל
    const cfgRows = await d.select().from(settings).where(inArray(settings.key, ['telegram_bot_token', 'telegram_chat_id'])).all().catch(() => []);
    const m = Object.fromEntries(cfgRows.map((x) => [x.key, x.value]));
    const waLine = r.status === 'sent' ? '\n💬 אישור ווטסאפ נשלח ✓' : r.status === 'failed' ? `\n💬 אישור ווטסאפ נכשל (${r.detail})` : '';
    await notifyTelegram(m['telegram_bot_token'] || c.env.TELEGRAM_BOT_TOKEN, m['telegram_chat_id'] || c.env.TELEGRAM_CHAT_ID,
      `🗓️ נקבעה שיחה חדשה\n\n👤 ${name}\n📞 ${phone}\n🕐 ${f.datetime}\n${meetingType === 'zoom' ? '💻 זום' : '☎️ טלפון'}` + (note ? `\n📝 ${note}` : '') + waLine);
  })();
  if (c.executionCtx?.waitUntil) c.executionCtx.waitUntil(bg); else await bg;

  return c.json({ ok: true, startAt: slot.startAt, datetime: f.datetime, meetingType });
});

/* =========================================================================
 * מוגן (מנהל) — הגדרות, משבצות, פגישות
 * ========================================================================= */
export const bookingsAdminApp = new Hono<Env>();

bookingsAdminApp.get('/settings', async (c) => {
  const b = await loadBookingSettings(c);
  return c.json({
    ...b,
    reminderOffsets: b.reminderOffsets.join(','),
    defaults: { confirmText: DEFAULT_CONFIRM_TEXT, reminderText: DEFAULT_REMINDER_TEXT },
  });
});

bookingsAdminApp.put('/settings', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const d = db(c);
  const set = async (key: string, val: string) =>
    d.insert(settings).values({ key, value: val }).onConflictDoUpdate({ target: settings.key, set: { value: val } });
  const bool = (v: any) => (v === true || v === '1' || v === 'on' || v === 'true') ? '1' : '0';
  const pairs: [string, any][] = [
    ['booking_enabled', 'bool'], ['booking_offer_phone', 'bool'], ['booking_offer_zoom', 'bool'],
    ['booking_reminders_enabled', 'bool'], ['booking_zoom_link', 'str'], ['booking_page_intro', 'str'],
    ['booking_reminder_offsets', 'str'], ['booking_confirm_text', 'str'], ['booking_reminder_text', 'str'],
    ['booking_confirm_template', 'str'], ['booking_reminder_template', 'str'], ['booking_template_lang', 'str'],
  ];
  const camel: Record<string, string> = {
    booking_enabled: 'enabled', booking_offer_phone: 'offerPhone', booking_offer_zoom: 'offerZoom',
    booking_reminders_enabled: 'remindersEnabled', booking_zoom_link: 'zoomLink', booking_page_intro: 'pageIntro',
    booking_reminder_offsets: 'reminderOffsets', booking_confirm_text: 'confirmText', booking_reminder_text: 'reminderText',
    booking_confirm_template: 'confirmTemplate', booking_reminder_template: 'reminderTemplate', booking_template_lang: 'templateLang',
  };
  for (const [key, kind] of pairs) {
    const field = camel[key];
    if (!(field in body)) continue;
    if (kind === 'bool') await set(key, bool(body[field]));
    else await set(key, String(body[field] ?? '').slice(0, 2000));
  }
  const b = await loadBookingSettings(c);
  return c.json({ ok: true, settings: { ...b, reminderOffsets: b.reminderOffsets.join(',') } });
});

// --- משבצות ---
bookingsAdminApp.get('/slots', async (c) => {
  const d = db(c);
  const slots = await d.select().from(bookingSlots).orderBy(asc(bookingSlots.startAt)).limit(500).all();
  return c.json(slots);
});

bookingsAdminApp.post('/slots', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const list: any[] = Array.isArray(body.slots) ? body.slots : [body];
  const d = db(c);
  const created: string[] = [];
  for (const item of list) {
    const startAt = Number(item.startAt);
    if (!Number.isFinite(startAt) || startAt <= 0) continue;
    const durationMin = Number.isFinite(Number(item.durationMin)) && Number(item.durationMin) > 0 ? Math.round(Number(item.durationMin)) : 30;
    const note = item.note ? String(item.note).slice(0, 200) : null;
    // מניעת כפילות מדויקת של אותו מועד
    const dup = (await d.select({ id: bookingSlots.id }).from(bookingSlots).where(eq(bookingSlots.startAt, startAt)).limit(1))[0];
    if (dup) continue;
    const id = uid();
    await d.insert(bookingSlots).values({ id, startAt, durationMin, note, status: 'open', createdAt: now() });
    created.push(id);
  }
  return c.json({ ok: true, created: created.length });
});

bookingsAdminApp.delete('/slots/:id', async (c) => {
  const id = c.req.param('id');
  const d = db(c);
  const slot = (await d.select().from(bookingSlots).where(eq(bookingSlots.id, id)).limit(1))[0];
  if (!slot) return c.json({ error: 'not_found' }, 404);
  if (slot.status === 'booked') return c.json({ error: 'slot_booked' }, 409); // מבטלים דרך הפגישה
  await d.delete(bookingSlots).where(eq(bookingSlots.id, id));
  return c.json({ ok: true });
});

// --- פגישות ---
bookingsAdminApp.get('/', async (c) => {
  const d = db(c);
  const rows = await d.select().from(bookings).orderBy(desc(bookings.startAt)).limit(500).all();
  return c.json(rows);
});

const BOOKING_STATUSES = ['booked', 'cancelled', 'done', 'noshow'];
bookingsAdminApp.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({} as any));
  const d = db(c);
  const b = (await d.select().from(bookings).where(eq(bookings.id, id)).limit(1))[0];
  if (!b) return c.json({ error: 'not_found' }, 404);
  const patch: Record<string, unknown> = {};
  if (body.status !== undefined) {
    const st = String(body.status);
    if (!BOOKING_STATUSES.includes(st)) return c.json({ error: 'bad_status' }, 400);
    patch.status = st;
    // ביטול פגישה → משחרר את המשבצת
    if (st === 'cancelled' && b.status !== 'cancelled') {
      await d.update(bookingSlots).set({ status: 'closed' }).where(eq(bookingSlots.id, b.slotId)).catch(() => {});
    }
  }
  if (body.note !== undefined) patch.note = body.note ? String(body.note).slice(0, 300) : null;
  if (Object.keys(patch).length === 0) return c.json({ error: 'nothing' }, 400);
  await d.update(bookings).set(patch).where(eq(bookings.id, id));
  return c.json({ ok: true });
});

// שליחה חוזרת של אישור הפגישה
bookingsAdminApp.post('/:id/resend', async (c) => {
  const id = c.req.param('id');
  const d = db(c);
  const b = (await d.select().from(bookings).where(eq(bookings.id, id)).limit(1))[0];
  if (!b) return c.json({ error: 'not_found' }, 404);
  const bset = await loadBookingSettings(c);
  const cfg = await loadWhatsAppConfigDb(d, c.env as any);
  const r = await sendBookingWhatsApp(cfg, bset, b, 'confirm');
  await d.update(bookings).set({
    whatsappStatus: r.status, whatsappError: r.status === 'sent' ? null : r.detail.slice(0, 200),
    confirmSentAt: r.status === 'sent' ? now() : b.confirmSentAt,
  }).where(eq(bookings.id, id));
  return c.json({ ok: r.status === 'sent', ...r }, r.status === 'sent' ? 200 : 502);
});
