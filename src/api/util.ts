import { Context, Next } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { adminSessions, activities } from '../db/schema';

export type Bindings = { DB: D1Database; GITHUB_TOKEN?: string };
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
