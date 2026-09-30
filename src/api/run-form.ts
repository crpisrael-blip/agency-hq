import { Hono, Context } from 'hono';
import { eq } from 'drizzle-orm';
import { playbookRuns, runFormLinks, clients, settings } from '../db/schema';
import { Env, db, uid, now, notifyTelegram } from './util';
import { askableItems, calcProgress } from './run-fill';

/* =========================================================================
 * טופס בקישור — מילוי עצמי של הלקוח בדף ווב (ort-tech.co.il/f/<token>).
 *
 * אותו עיקרון כמו המילוי בטלגרם: אין שאלון נפרד ואין העתקה. הדף מציג את השאלות
 * של המהלך (playbook_run.sections), וכל תשובה נכנסת ישירות ל-playbook_runs.answers
 * ["si-ii"] ומסמנת את הסעיף כבוצע — בדיוק כמו מילוי פנימי במערכת.
 * הטבלה run_form_links מחזיקה רק את מצב הקישור (נשלח/נפתח/ממלא/הושלם/בוטל).
 * ========================================================================= */

const STATUS_LABEL: Record<string, string> = {
  sent: 'נשלח',
  opened: 'נפתח',
  in_progress: 'ממלא',
  completed: 'הושלם',
  cancelled: 'בוטל',
};
const MAX_ANSWER = 4000;

function safeParse<T>(raw: any, fallback: T): T {
  try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
const filled = (v: any) => !!String(v ?? '').trim();

/** טוקן בלתי-ניחוש (32 בתים = 64 תווי hex) */
export function newFormToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}
const TOKEN_RE = /^[0-9a-f]{64}$/;

export type FormLinkSummary = {
  status: string;
  statusLabel: string;
  total: number;
  answered: number;
  progress: number;
  path: string | null;
  sentAt: number | null;
  openedAt: number | null;
  lastActivityAt: number | null;
  completedAt: number | null;
};

/** סיכום מצב הקישור למהלך (לרשימה ולמסך המהלך). path יחסי — הלקוח משלים את הדומיין. */
export function buildFormSummary(run: any, link: any): FormLinkSummary | null {
  if (!link) return null;
  const items = askableItems(run.sections, run.na);
  const answers = safeParse<Record<string, any>>(run.answers, {});
  const answered = items.filter((it) => filled(answers[it.key])).length;
  return {
    status: link.status,
    statusLabel: STATUS_LABEL[link.status] || link.status,
    total: items.length,
    answered,
    progress: items.length ? Math.round((answered / items.length) * 100) : 0,
    path: link.status === 'cancelled' ? null : `/f/${link.token}`,
    sentAt: link.sentAt ?? null,
    openedAt: link.openedAt ?? null,
    lastActivityAt: link.lastActivityAt ?? null,
    completedAt: link.completedAt ?? null,
  };
}

export async function runFormSummary(c: Context<Env>, run: any): Promise<FormLinkSummary | null> {
  const link = (await db(c).select().from(runFormLinks).where(eq(runFormLinks.runId, run.id)).limit(1))[0];
  return buildFormSummary(run, link || null);
}

/** יצירת קישור / איפוס קישור קיים (טוקן חדש — הקישור הישן מפסיק לעבוד). התשובות נשמרות. */
export async function createFormLink(c: Context<Env>, run: any): Promise<FormLinkSummary | null> {
  const d = db(c);
  const t = now();
  const token = newFormToken();
  const existing = (await d.select().from(runFormLinks).where(eq(runFormLinks.runId, run.id)).limit(1))[0];
  if (existing) {
    await d.update(runFormLinks)
      .set({ token, status: 'sent', sentAt: t, openedAt: null, lastActivityAt: null, completedAt: null })
      .where(eq(runFormLinks.id, existing.id));
  } else {
    await d.insert(runFormLinks).values({ id: uid(), runId: run.id, token, status: 'sent', sentAt: t, createdAt: t } as any);
  }
  return runFormSummary(c, run);
}

export async function cancelFormLink(c: Context<Env>, runId: string): Promise<boolean> {
  const d = db(c);
  const existing = (await d.select().from(runFormLinks).where(eq(runFormLinks.runId, runId)).limit(1))[0];
  if (!existing) return false;
  await d.update(runFormLinks).set({ status: 'cancelled', lastActivityAt: now() }).where(eq(runFormLinks.id, existing.id));
  return true;
}

/**
 * מיזוג תשובות שהגיעו מהטופס לתוך המהלך. מקבל רק מפתחות של שאלות קיימות שאינן
 * "לא רלוונטי", מחרוזות עד MAX_ANSWER. תשובה מלאה מסמנת את הסעיף כבוצע; תשובה
 * שנמחקה מבטלת את הסימון. מחזיר null אם הקלט לא תקין.
 */
export function mergeFormAnswers(
  run: { sections: string; answers: string; checked: string; na?: string | null },
  incoming: unknown,
): { answers: Record<string, string>; checked: Record<string, boolean> } | null {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return null;
  const allowed = new Set(askableItems(run.sections, run.na || '{}').map((it) => it.key));
  const answers = safeParse<Record<string, string>>(run.answers, {});
  const checked = safeParse<Record<string, boolean>>(run.checked, {});
  for (const [k, v] of Object.entries(incoming as Record<string, unknown>)) {
    if (!allowed.has(k) || typeof v !== 'string' || v.length > MAX_ANSWER) return null;
    const val = v.replace(/\r\n/g, '\n');
    if (filled(val)) { answers[k] = val; checked[k] = true; }
    else { delete answers[k]; delete checked[k]; }
  }
  return { answers, checked };
}

async function loadByToken(c: Context<Env>, token: string) {
  if (!TOKEN_RE.test(token)) return null;
  const d = db(c);
  const link = (await d.select().from(runFormLinks).where(eq(runFormLinks.token, token)).limit(1))[0];
  if (!link || link.status === 'cancelled') return null;
  const run = (await d.select().from(playbookRuns).where(eq(playbookRuns.id, link.runId)).limit(1))[0];
  if (!run) return null;
  return { link, run };
}

/* ---------------- API ציבורי (הלקוח) — /api/form/:token ---------------- */
export const formPublicApp = new Hono<Env>();

formPublicApp.get('/:token', async (c) => {
  const found = await loadByToken(c, c.req.param('token'));
  if (!found) return c.json({ error: 'not_found' }, 404);
  const { link, run } = found;
  const d = db(c);
  if (link.status === 'sent') {
    await d.update(runFormLinks).set({ status: 'opened', openedAt: now(), lastActivityAt: now() }).where(eq(runFormLinks.id, link.id));
  }
  const cl = run.clientId ? (await d.select().from(clients).where(eq(clients.id, run.clientId)).limit(1))[0] : null;
  const items = askableItems(run.sections, run.na);
  const answers = safeParse<Record<string, string>>(run.answers, {});
  // מקבצים חזרה לסעיפים לתצוגה; רק תשובות לשאלות שמוצגות נשלחות ללקוח
  const sections: { title: string; items: { key: string; label: string; hint: string }[] }[] = [];
  for (const it of items) {
    let s = sections[sections.length - 1];
    if (!s || s.title !== it.sectionTitle) { s = { title: it.sectionTitle, items: [] }; sections.push(s); }
    s.items.push({ key: it.key, label: it.label, hint: it.hint });
  }
  const visible: Record<string, string> = {};
  for (const it of items) if (filled(answers[it.key])) visible[it.key] = answers[it.key];
  return c.json({
    title: run.title,
    clientName: cl?.name || null,
    sections,
    answers: visible,
    completed: link.status === 'completed',
  }, 200, { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
});

formPublicApp.post('/:token', async (c) => {
  const found = await loadByToken(c, c.req.param('token'));
  if (!found) return c.json({ error: 'not_found' }, 404);
  const { link, run } = found;
  const body = await c.req.json().catch(() => null) as any;
  const merged = mergeFormAnswers(run as any, body?.answers);
  if (!merged) return c.json({ error: 'invalid_answers' }, 400);
  const final = body?.final === true;
  const t = now();
  const d = db(c);
  const checkedRaw = JSON.stringify(merged.checked);
  const progress = calcProgress(run.sections, checkedRaw, run.na);
  const runSet: any = { answers: JSON.stringify(merged.answers), checked: checkedRaw, progress, updatedAt: t };
  if (final && progress === 100 && run.status === 'active') { runSet.status = 'done'; runSet.completedAt = t; }
  await d.update(playbookRuns).set(runSet).where(eq(playbookRuns.id, run.id));
  const wasCompleted = link.status === 'completed';
  await d.update(runFormLinks).set({
    status: final ? 'completed' : (wasCompleted ? 'completed' : 'in_progress'),
    lastActivityAt: t,
    ...(final ? { completedAt: t } : {}),
  }).where(eq(runFormLinks.id, link.id));

  if (final) {
    // התראה למנהל — best-effort, לא מעכבת את התגובה ללקוח
    const bg = (async () => {
      const rows = await d.select().from(settings).all().catch(() => [] as any[]);
      const m = Object.fromEntries(rows.filter((r: any) => r.key === 'telegram_bot_token' || r.key === 'telegram_chat_id').map((r: any) => [r.key, r.value]));
      const cl = run.clientId ? (await d.select().from(clients).where(eq(clients.id, run.clientId)).limit(1))[0] : null;
      const items = askableItems(run.sections, run.na);
      const answered = items.filter((it) => filled(merged.answers[it.key])).length;
      await notifyTelegram(
        m['telegram_bot_token'] || c.env.TELEGRAM_BOT_TOKEN,
        m['telegram_chat_id'] || c.env.TELEGRAM_CHAT_ID,
        `📝 ${wasCompleted ? 'עודכן' : 'מולא'} טופס בקישור\n\n📋 ${run.title}` + (cl ? `\n👤 ${cl.name}` : '') + `\n✅ ${answered}/${items.length} שאלות נענו`,
      );
    })();
    if (c.executionCtx?.waitUntil) c.executionCtx.waitUntil(bg); else await bg;
  }
  return c.json({ ok: true, progress, completed: final || wasCompleted });
});
