/* =========================================================================
 * Worker תזכורות פגישה — Cron כל 15 דק'. קורא מ-D1, שולח תזכורות ווטסאפ
 * שהגיע זמנן (ברירת מחדל 24 שעות ושעה מראש), ומעדכן את הפגישה כדי לא לשלוח פעמיים.
 * לוגיקת השליחה והנוסח משותפים עם ה-API (src/api/bookings-core.ts).
 * ========================================================================= */
import { drizzle } from 'drizzle-orm/d1';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { bookings, settings } from '../../../src/db/schema';
import { loadWhatsAppConfigDb, isWhatsAppReady } from '../../../src/api/whatsapp';
import { BOOKING_KEYS, buildBookingSettings, sendBookingWhatsApp, dueReminder } from '../../../src/api/bookings-core';

export interface Env { DB: D1Database; REMINDER_RUN_SECRET?: string }

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(run(env).then(() => {}));
  },
  // הרצה ידנית ב-HTTP (לבדיקה). אם מוגדר REMINDER_RUN_SECRET — נדרש ?key=
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/run') {
      if (env.REMINDER_RUN_SECRET && url.searchParams.get('key') !== env.REMINDER_RUN_SECRET) {
        return new Response('unauthorized', { status: 401 });
      }
      const res = await run(env);
      return new Response(JSON.stringify(res), { headers: { 'content-type': 'application/json' } });
    }
    return new Response('agency-hq reminders worker', { status: 200 });
  },
} satisfies ExportedHandler<Env>;

export async function run(env: Env) {
  const d = drizzle(env.DB);
  const rows: { key: string; value: string }[] = await d.select().from(settings)
    .where(inArray(settings.key, [...BOOKING_KEYS] as string[])).all().catch(() => []);
  const bset = buildBookingSettings(Object.fromEntries(rows.map((r) => [r.key, r.value])));
  if (!bset.remindersEnabled) return { skipped: 'reminders_disabled' };
  const cfg = await loadWhatsAppConfigDb(d, env as unknown as Record<string, string | undefined>);
  if (!isWhatsAppReady(cfg).ready) return { skipped: 'whatsapp_not_ready' };

  const now = Date.now();
  const offsets = bset.reminderOffsets;                 // יורד, למשל [1440, 60]
  const early = offsets.length >= 2 ? offsets[0] : null; // מוקדם (24 שעות) → remind24SentAt
  const late = offsets[offsets.length - 1];              // קרוב (שעה) → remind1SentAt
  const horizon = now + (early ?? late) * 60_000;

  const dueList = await d.select().from(bookings)
    .where(and(eq(bookings.status, 'booked'), gte(bookings.startAt, now), lte(bookings.startAt, horizon)))
    .all().catch(() => [] as typeof bookings.$inferSelect[]);

  let sent = 0, failed = 0, skipped = 0;
  for (const b of dueList) {
    if (!b.phone) continue;
    const due = dueReminder(b, offsets, now);
    if (!due) continue;
    const r = await sendBookingWhatsApp(cfg, bset, b, 'reminder');
    if (r.status === 'failed') { failed++; continue; }   // כשל זמני — ננסה שוב בריצה הבאה
    if (r.status === 'sent') sent++; else skipped++;
    await d.update(bookings).set(due.patch).where(eq(bookings.id, b.id)).catch(() => {});
  }
  return { checked: dueList.length, sent, failed, skipped };
}
