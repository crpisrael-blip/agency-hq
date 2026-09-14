import { Context, Next } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { adminSessions, activities } from '../db/schema';

export type Bindings = {
  DB: D1Database;
  GITHUB_TOKEN?: string;
  /** טוקן בוט טלגרם (מ-@BotFather) — סוד. אם ריק, התראות טלגרם מושבתות. */
  TELEGRAM_BOT_TOKEN?: string;
  /** מזהה/י צ'אט לקבלת התראות לידים. אפשר כמה מופרדים בפסיק. */
  TELEGRAM_CHAT_ID?: string;
  /**
   * סוד לאימות ה-webhook של טלגרם (X-Telegram-Bot-Api-Secret-Token). אופציונלי אך
   * מומלץ: אם מוגדר — עדכונים בלי הכותרת הזו נדחים. נקבע גם ב-setWebhook.
   */
  TELEGRAM_WEBHOOK_SECRET?: string;
  /**
   * ווטסאפ אוטומטי לליד (הודעת אישור מיידית). כל ההגדרות ניתנות גם מטבלת settings
   * (מסך לידים → ⚙️ ווטסאפ אוטומטי), והערכים כאן הם נפילה חזרה. ראה src/api/whatsapp.ts.
   */
  WHATSAPP_PROVIDER?: string;      // green | meta
  WHATSAPP_ENABLED?: string;       // "0" כדי לכבות בלי למחוק סודות
  WHATSAPP_WELCOME_TEXT?: string;  // נוסח ההודעה ({name} מוחלף בשם הליד)
  GREEN_API_INSTANCE?: string;     // Green API: idInstance
  GREEN_API_TOKEN?: string;        // Green API: apiTokenInstance — סוד
  GREEN_API_URL?: string;          // Green API: כתובת ה-API של המופע (ברירת מחדל api.green-api.com)
  WHATSAPP_PHONE_ID?: string;      // Meta Cloud API: Phone number ID
  WHATSAPP_TOKEN?: string;         // Meta Cloud API: טוקן קבוע (System User) — סוד
  WHATSAPP_TEMPLATE?: string;      // Meta Cloud API: שם התבנית המאושרת (חובה להודעה יזומה)
  WHATSAPP_TEMPLATE_LANG?: string; // Meta Cloud API: שפת התבנית (ברירת מחדל he)
  /** אחסון קבצים לקבלות הוצאה (bucket פרטי). אם ריק — העלאת קבלות מושבתת. */
  RECEIPTS?: R2Bucket;
};
export type Env = { Bindings: Bindings };

export const db = (c: Context<Env>) => drizzle(c.env.DB);
export const uid = () => crypto.randomUUID();
export const now = () => Date.now();

/** YYYY-MM-DD לפי שעון ישראל */
export function todayIL(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
}

export async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** בוחר רק שדות מותרים מגוף הבקשה (מסנן undefined) */
export function pick<T extends Record<string, any>>(body: any, fields: string[]): Partial<T> {
  const out: Record<string, any> = {};
  for (const f of fields) if (body[f] !== undefined) out[f] = body[f];
  return out as Partial<T>;
}

export const num = (v: any, d = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

/**
 * רישום פעילות (Timeline + Audit Trail). מקבל את מופע ה-drizzle כדי לרוץ בתוך אותה בקשה.
 * שימוש עיקרי: תיעוד שינויי סטטוס (previous → new) על הזדמנות/פרויקט/הצעה/התקשרות.
 */
export async function logActivity(
  d: ReturnType<typeof db>,
  a: {
    entityType: string;
    entityId: string;
    organizationId?: string | null;
    type?: string;
    title: string;
    content?: string | null;
    metadata?: Record<string, any> | null;
    occurredAt?: number;
  },
) {
  const ts = now();
  await d.insert(activities).values({
    id: uid(),
    entityType: a.entityType,
    entityId: a.entityId,
    organizationId: a.organizationId ?? null,
    type: a.type || 'note',
    title: a.title,
    content: a.content ?? null,
    metadata: a.metadata ? JSON.stringify(a.metadata) : null,
    occurredAt: a.occurredAt ?? ts,
    createdAt: ts,
  } as any);
}

/** רישום שינוי סטטוס — קיצור נפוץ ל-logActivity מסוג status_change */
export async function logStatusChange(
  d: ReturnType<typeof db>,
  entityType: string,
  entityId: string,
  organizationId: string | null,
  label: string,
  previous: string,
  next: string,
) {
  if (previous === next) return;
  await logActivity(d, {
    entityType,
    entityId,
    organizationId,
    type: 'status_change',
    title: `${label}: ${previous} → ${next}`,
    metadata: { previous, new: next },
  });
}

/**
 * שולח הודעת טקסט לטלגרם לכל צ'אט (chatIds מופרד בפסיק).
 * לא זורק לעולם — אם אין טוקן/צ'אט או שהקריאה נכשלה, מחזיר בשקט.
 * מיועד לעטיפה ב-executionCtx.waitUntil כדי לא לעכב את התגובה.
 */
export async function notifyTelegram(
  token: string | undefined,
  chatIds: string | undefined,
  text: string
): Promise<void> {
  try {
    const chats = (chatIds || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!token || chats.length === 0) return;
    await Promise.all(
      chats.map((chat_id) =>
        fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id, text, disable_web_page_preview: true }),
        }).catch(() => {})
      )
    );
  } catch {
    /* מתעלמים — התראה היא best-effort ולא אמורה לשבור שמירת ליד */
  }
}

/** אימות מנהל: טוקן בכותרת x-admin-token */
export async function requireAdmin(c: Context<Env>, next: Next) {
  const token = c.req.header('x-admin-token') || '';
  if (!token) return c.json({ error: 'unauthorized' }, 401);
  const rows = await db(c)
    .select()
    .from(adminSessions)
    .where(eq(adminSessions.token, token))
    .limit(1);
  const s = rows[0];
  if (!s || s.expiresAt < Date.now()) return c.json({ error: 'unauthorized' }, 401);
  await next();
}
