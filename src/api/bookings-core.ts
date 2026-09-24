/* =========================================================================
 * קביעת שיחה — ליבה בלי Hono Context: הגדרות, פורמט תאריך בעברית, ובניית הודעות
 * הווטסאפ (אישור/תזכורת). משמש גם את ה-API של האתר וגם את ה-Worker לתזכורות.
 * ========================================================================= */
import {
  type WhatsAppConfig, isWhatsAppReady, normalizeILPhone, sendWhatsAppMessage, type SendResult,
} from './whatsapp';

export const IL_TZ = 'Asia/Jerusalem';

/** מפתחות ההגדרות של קביעת השיחה (טבלת settings) */
export const BOOKING_KEYS = [
  'booking_enabled', 'booking_offer_phone', 'booking_offer_zoom', 'booking_zoom_link',
  'booking_page_intro', 'booking_reminders_enabled', 'booking_reminder_offsets',
  'booking_confirm_text', 'booking_reminder_text',
  'booking_confirm_template', 'booking_reminder_template', 'booking_template_lang',
] as const;
export type BookingKey = typeof BOOKING_KEYS[number];

export type BookingSettings = {
  enabled: boolean;
  offerPhone: boolean;
  offerZoom: boolean;
  zoomLink: string;
  pageIntro: string;
  remindersEnabled: boolean;
  reminderOffsets: number[];   // דקות לפני הפגישה, יורד (למשל [1440, 60])
  confirmText: string;
  reminderText: string;
  confirmTemplate: string;
  reminderTemplate: string;
  templateLang: string;
};

export const DEFAULT_CONFIRM_TEXT =
  'היי {name}, קבענו! 🗓️\n' +
  'השיחה שלנו נקבעה ל{datetime}.\n' +
  '{details}\n\n' +
  'נתראה! אם צריך לשנות מועד — פשוט השב/י להודעה הזו.';

export const DEFAULT_REMINDER_TEXT =
  'תזכורת קטנה 🔔\n' +
  '{name}, הפגישה שלנו מתקרבת: {datetime}.\n' +
  '{details}\n\n' +
  'נדבר בקרוב 🙂';

const truthy = (v: string | undefined) => v === '1' || (v || '').toLowerCase() === 'true' || (v || '').toLowerCase() === 'on';

/** בונה את הגדרות הקביעה ממפת settings */
export function buildBookingSettings(map: Record<string, string>): BookingSettings {
  const offsets = (map['booking_reminder_offsets'] || '1440,60')
    .split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => b - a);
  return {
    enabled: truthy(map['booking_enabled']),
    offerPhone: map['booking_offer_phone'] === undefined ? true : truthy(map['booking_offer_phone']),
    offerZoom: truthy(map['booking_offer_zoom']),
    zoomLink: (map['booking_zoom_link'] || '').trim(),
    pageIntro: (map['booking_page_intro'] || '').trim(),
    remindersEnabled: map['booking_reminders_enabled'] === undefined ? true : truthy(map['booking_reminders_enabled']),
    reminderOffsets: offsets.length ? offsets : [1440, 60],
    confirmText: (map['booking_confirm_text'] || '').trim() || DEFAULT_CONFIRM_TEXT,
    reminderText: (map['booking_reminder_text'] || '').trim() || DEFAULT_REMINDER_TEXT,
    confirmTemplate: (map['booking_confirm_template'] || '').trim(),
    reminderTemplate: (map['booking_reminder_template'] || '').trim(),
    templateLang: (map['booking_template_lang'] || 'he').trim(),
  };
}

/** פורמט מועד בעברית לפי שעון ישראל */
export function formatIL(startAt: number): { date: string; time: string; weekday: string; datetime: string } {
  const d = new Date(startAt);
  const date = new Intl.DateTimeFormat('he-IL', { timeZone: IL_TZ, day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  const time = new Intl.DateTimeFormat('he-IL', { timeZone: IL_TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  const weekday = new Intl.DateTimeFormat('he-IL', { timeZone: IL_TZ, weekday: 'long' }).format(d);
  return { date, time, weekday, datetime: `${weekday}, ${date}, ${time}` };
}

export type BookingLike = {
  name: string | null; phone?: string | null; startAt: number; durationMin: number;
  meetingType: string; meetingLink?: string | null;
};

/** תיאור אופן המפגש (טלפון / זום עם קישור) */
export function meetingDetails(b: BookingLike): string {
  if (b.meetingType === 'zoom') {
    return b.meetingLink ? `💻 מפגש זום: ${b.meetingLink}` : '💻 מפגש זום (הקישור יישלח בנפרד)';
  }
  return '☎️ שיחת טלפון — אחזור אליך במספר שהשארת.';
}

/** מכניס משתנים לנוסח חופשי (Green / תצוגה) */
export function renderBookingText(template: string, b: BookingLike): string {
  const f = formatIL(b.startAt);
  const first = String(b.name ?? '').trim().split(/\s+/)[0] || '';
  const map: Record<string, string> = {
    name: first, date: f.date, time: f.time, weekday: f.weekday,
    datetime: f.datetime, details: meetingDetails(b), link: b.meetingLink || '',
    type: b.meetingType === 'zoom' ? 'זום' : 'טלפון', duration: String(b.durationMin),
  };
  let out = (template || '').replace(/\{(\w+)\}/g, (_, k) => (k in map ? map[k] : `{${k}}`));
  if (!first) out = out.replace(/[ \t]{2,}/g, ' ').replace(/ +([,!?.\n])/g, '$1');
  return out.trim();
}

/** פרמטרים לתבנית Meta: {{1}}=שם, {{2}}=מועד, {{3}}=אופן המפגש */
export function bookingTemplateParams(b: BookingLike): string[] {
  const f = formatIL(b.startAt);
  const first = String(b.name ?? '').trim().split(/\s+/)[0] || 'שלום';
  return [first, f.datetime, meetingDetails(b)];
}

/**
 * מחליט אילו תזכורת (אם בכלל) לשלוח לפגישה עכשיו, ומה לעדכן כדי לא לשלוח פעמיים.
 * שולח לכל היותר תזכורת אחת בכל ריצה, ומעדיף את הקרובה; אם הקרובה נשלחת, מסמן גם
 * את המוקדמת כ"נשלחה" כדי לא להציף בשתי תזכורות ברצף. מחזיר null אם אין מה לשלוח.
 */
export function dueReminder(
  b: { startAt: number; remind1SentAt?: number | null; remind24SentAt?: number | null },
  offsets: number[],
  now: number,
): { patch: { remind1SentAt?: number; remind24SentAt?: number } } | null {
  if (now >= b.startAt) return null; // הפגישה כבר עברה/מתקיימת
  const sorted = [...offsets].filter((n) => Number.isFinite(n) && n > 0).sort((a, z) => z - a);
  if (!sorted.length) return null;
  const early = sorted.length >= 2 ? sorted[0] : null; // מוקדם (24 שעות) → remind24SentAt
  const late = sorted[sorted.length - 1];              // קרוב (שעה) → remind1SentAt
  if (late != null && !b.remind1SentAt && now >= b.startAt - late * 60_000) {
    const patch: { remind1SentAt?: number; remind24SentAt?: number } = { remind1SentAt: now };
    if (early != null && !b.remind24SentAt) patch.remind24SentAt = now;
    return { patch };
  }
  if (early != null && !b.remind24SentAt && now >= b.startAt - early * 60_000) {
    return { patch: { remind24SentAt: now } };
  }
  return null;
}

export type BookingMsgKind = 'confirm' | 'reminder';

/** שולח הודעת פגישה (אישור/תזכורת). לעולם לא זורק. */
export async function sendBookingWhatsApp(
  cfg: Pick<WhatsAppConfig, 'provider' | 'enabled' | 'greenInstance' | 'greenToken' | 'greenUrl' | 'metaPhoneId' | 'metaToken' | 'welcomeText' | 'metaTemplate' | 'metaTemplateLang'>,
  bset: BookingSettings,
  b: BookingLike,
  kind: BookingMsgKind,
): Promise<{ status: 'sent' | 'failed' | 'skipped'; detail: string }> {
  const ready = isWhatsAppReady(cfg as any);
  if (!ready.ready) return { status: 'skipped', detail: ready.reason || 'not_ready' };
  const phone = normalizeILPhone(b.phone);
  if (!phone) return { status: 'skipped', detail: 'bad_phone' };
  const text = renderBookingText(kind === 'confirm' ? bset.confirmText : bset.reminderText, b);
  const templateName = kind === 'confirm' ? bset.confirmTemplate : bset.reminderTemplate;
  const r: SendResult = await sendWhatsAppMessage(cfg as any, phone, {
    text,
    template: templateName ? { name: templateName, lang: bset.templateLang, params: bookingTemplateParams(b) } : undefined,
  });
  return r.ok ? { status: 'sent', detail: r.id || 'sent' } : { status: 'failed', detail: r.error || 'send_failed' };
}
