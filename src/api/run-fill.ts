import { Hono, Context } from 'hono';
import { eq } from 'drizzle-orm';
import { playbookRuns, telegramFillSessions, clients, settings } from '../db/schema';
import { Env, db, uid, now, notifyTelegram } from './util';

/* =========================================================================
 * מילוי עצמי של הלקוח דרך בוט Telegram — ערוץ שני לאותו מהלך מתודולוגיה.
 *
 * העיקרון: אין שאלון נפרד ואין העתקה. הבוט מציג את אותן השאלות שמוגדרות במהלך
 * (playbook_run.sections), אחת אחרי השנייה, וכל תשובה נכנסת ישירות לאותו שדה
 * שממלאים ידנית במערכת — playbook_runs.answers["si-ii"] — ומסמנת את הסעיף כבוצע,
 * בדיוק כמו מילוי פנימי. טבלת telegram_fill_sessions מחזיקה רק את *מצב* המילוי.
 * ========================================================================= */

const STATUS_LABEL: Record<string, string> = {
  sent: 'נשלח',
  opened: 'נפתח',
  in_progress: 'ממלא',
  completed: 'הושלם',
  cancelled: 'בוטל',
};

function safeParse<T>(raw: any, fallback: T): T {
  try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}

const filled = (v: any) => !!String(v ?? '').trim();

/**
 * אחוז השלמה מתוך צילום הסעיפים ומפת הסימונים — אותו חישוב של מסך המהלך.
 * מיוצא כדי שגם playbooks.ts ישתמש במקור אמת אחד.
 */
export function calcProgress(sectionsRaw: string, checkedRaw: string, naRaw?: string): number {
  const sections = safeParse<any[]>(sectionsRaw, []);
  const checked = safeParse<Record<string, any>>(checkedRaw, {});
  const na = safeParse<Record<string, any>>(naRaw, {});
  let total = 0, done = 0;
  sections.forEach((s: any, si: number) =>
    (s.items || []).forEach((_: any, ii: number) => {
      const key = `${si}-${ii}`;
      if (na[key]) return;
      total++;
      if (checked[key]) done++;
    })
  );
  return total ? Math.round((done / total) * 100) : 0;
}

type Askable = { key: string; sectionTitle: string; label: string; hint: string };

/** רשימת השאלות בנות-המענה של מהלך, לפי הסדר, ללא פריטים שסומנו "לא רלוונטי". */
export function askableItems(sectionsRaw: string, naRaw?: string): Askable[] {
  const sections = safeParse<any[]>(sectionsRaw, []);
  const na = safeParse<Record<string, any>>(naRaw, {});
  const out: Askable[] = [];
  sections.forEach((s: any, si: number) =>
    (s.items || []).forEach((it: any, ii: number) => {
      const key = `${si}-${ii}`;
      if (na[key]) return;
      out.push({ key, sectionTitle: String(s.title || ''), label: String(it.label || ''), hint: String(it.hint || '') });
    })
  );
  return out;
}

/* ---------------- Telegram API (best-effort, לא זורק) ---------------- */

async function tgCall(token: string, method: string, payload: any): Promise<any> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await res.json().catch(() => ({}));
  } catch {
    return {};
  }
}

async function tgSend(token: string, chatId: string, text: string, replyMarkup?: any): Promise<void> {
  await tgCall(token, 'sendMessage', {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

async function tgAnswerCallback(token: string, callbackId: string): Promise<void> {
  await tgCall(token, 'answerCallbackQuery', { callback_query_id: callbackId });
}

/** שם המשתמש של הבוט (@name) — נדרש לבניית הקישור העמוק. נשמר ב-settings למטמון. */
async function botUsername(c: Context<Env>, force = false): Promise<string | null> {
  const d = db(c);
  const token = c.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  if (!force) {
    const row = (await d.select().from(settings).where(eq(settings.key, 'telegram_bot_username')).limit(1))[0];
    if (row?.value) return row.value;
  }
  const me = await tgCall(token, 'getMe', {});
  const uname = me?.result?.username || null;
  if (uname) {
    await d.insert(settings).values({ key: 'telegram_bot_username', value: uname })
      .onConflictDoUpdate({ target: settings.key, set: { value: uname } });
  }
  return uname;
}

/* ---------------- סיכום מצב (לתצוגה במסך המתודולוגיה) ---------------- */

export type TelegramSummary = {
  status: string;
  statusLabel: string;
  total: number;
  answered: number;
  progress: number;
  currentLabel: string | null;
  contactName: string | null;
  link: string | null;
  sentAt: number | null;
  openedAt: number | null;
  startedAt: number | null;
  lastActivityAt: number | null;
  completedAt: number | null;
};

/** בונה אובייקט סיכום מתוך שורת המהלך + שורת ההזמנה (אם קיימת). */
export function buildSummary(run: any, session: any, username: string | null): TelegramSummary | null {
  if (!session) return null;
  const items = askableItems(run.sections, run.na);
  const answers = safeParse<Record<string, any>>(run.answers, {});
  const total = items.length;
  const answered = items.filter((it) => filled(answers[it.key])).length;
  const cur = session.currentKey ? items.find((it) => it.key === session.currentKey) : null;
  return {
    status: session.status,
    statusLabel: STATUS_LABEL[session.status] || session.status,
    total,
    answered,
    progress: total ? Math.round((answered / total) * 100) : 0,
    currentLabel: cur ? cur.label : null,
    contactName: session.contactName || null,
    link: username ? `https://t.me/${username}?start=${session.token}` : null,
    sentAt: session.sentAt ?? null,
    openedAt: session.openedAt ?? null,
    startedAt: session.startedAt ?? null,
    lastActivityAt: session.lastActivityAt ?? null,
    completedAt: session.completedAt ?? null,
  };
}

/** סיכום מצב עבור מהלך בודד (טוען את ההזמנה ואת שם הבוט). */
export async function runTelegramSummary(c: Context<Env>, run: any): Promise<TelegramSummary | null> {
  const d = db(c);
  const session = (await d.select().from(telegramFillSessions).where(eq(telegramFillSessions.runId, run.id)).limit(1))[0];
  if (!session) return null;
  const uname = await botUsername(c).catch(() => null);
  return buildSummary(run, session, uname);
}

/* ---------------- יצירת/ביטול הזמנה (מנהל) ---------------- */

/**
 * "שליחה ללקוח": יוצר/מאפס הזמנת מילוי למהלך ומחזיר קישור עמוק לבוט.
 * אידמפוטנטי לפי מהלך — הזמנה קיימת מאופסת (טוקן חדש, מצב 'sent'), כך שהקישור
 * הישן מתבטל. הלקוח פותח את הקישור → הבוט מתחיל להציג את שאלות המהלך.
 */
export async function createInvite(c: Context<Env>, run: any): Promise<{ ok: boolean; error?: string; summary?: TelegramSummary }> {
  const token = c.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: 'no_bot_token' };
  if (run.kind && run.kind !== 'checklist') return { ok: false, error: 'not_checklist' };
  const items = askableItems(run.sections, run.na);
  if (!items.length) return { ok: false, error: 'no_questions' };
  const uname = await botUsername(c);
  if (!uname) return { ok: false, error: 'bot_unreachable' };

  const d = db(c);
  const t = now();
  const existing = (await d.select().from(telegramFillSessions).where(eq(telegramFillSessions.runId, run.id)).limit(1))[0];
  const newToken = uid();
  if (existing) {
    await d.update(telegramFillSessions).set({
      token: newToken,
      status: 'sent',
      currentKey: null,
      total: items.length,
      sentAt: t,
      lastActivityAt: t,
      // איפוס מחזור מילוי חדש — שומרים chat/contact אם כבר ידועים
    }).where(eq(telegramFillSessions.id, existing.id));
  } else {
    await d.insert(telegramFillSessions).values({
      id: uid(),
      runId: run.id,
      token: newToken,
      chatId: null,
      contactName: null,
      status: 'sent',
      currentKey: null,
      total: items.length,
      answeredCount: 0,
      sentAt: t,
      openedAt: null,
      startedAt: null,
      lastActivityAt: t,
      completedAt: null,
      createdAt: t,
    } as any);
  }
  const summary = await runTelegramSummary(c, run);
  return { ok: true, summary: summary || undefined };
}

export async function cancelInvite(c: Context<Env>, runId: string): Promise<boolean> {
  const d = db(c);
  const existing = (await d.select().from(telegramFillSessions).where(eq(telegramFillSessions.runId, runId)).limit(1))[0];
  if (!existing) return false;
  await d.update(telegramFillSessions).set({ status: 'cancelled', currentKey: null, lastActivityAt: now() })
    .where(eq(telegramFillSessions.id, existing.id));
  return true;
}

/* ---------------- זרימת הבוט (webhook) ---------------- */

/** מוצא את אינדקס השאלה הבאה שממתינה למענה, החל מ-start (מדלג על מה שכבר נענה). */
function askFrom(items: Askable[], answers: Record<string, any>, start: number): number {
  let i = Math.max(0, start);
  while (i < items.length && filled(answers[items[i].key])) i++;
  return i;
}

function questionText(items: Askable[], idx: number, prevSection: string | null): { text: string; markup: any } {
  const it = items[idx];
  const header = it.sectionTitle && it.sectionTitle !== prevSection ? `📂 ${it.sectionTitle}\n\n` : '';
  const text =
    `${header}שאלה ${idx + 1} מתוך ${items.length}\n\n` +
    `❓ ${it.label}` +
    (it.hint ? `\n💡 ${it.hint}` : '') +
    `\n\nכתבו את תשובתכם כהודעה. לדילוג: /skip`;
  const markup = { inline_keyboard: [[{ text: 'דילוג על השאלה ⏭️', callback_data: 'skip' }]] };
  return { text, markup };
}

/** טוען לקוח (לשם בהודעת הפתיחה) — best-effort. */
async function clientName(c: Context<Env>, run: any): Promise<string | null> {
  if (!run.clientId) return null;
  const cl = (await db(c).select().from(clients).where(eq(clients.id, run.clientId)).limit(1))[0];
  return cl?.name || null;
}

/** שולח את השאלה שבאינדקס idx, או הודעת סיום אם הגענו לסוף — ומעדכן את מצב ההזמנה. */
async function askAt(c: Context<Env>, session: any, run: any, items: Askable[], idx: number, prevSection: string | null): Promise<void> {
  const token = c.env.TELEGRAM_BOT_TOKEN!;
  const d = db(c);
  const answers = safeParse<Record<string, any>>(run.answers, {});
  const answered = items.filter((it) => filled(answers[it.key])).length;
  if (idx >= items.length) {
    await d.update(telegramFillSessions).set({
      status: 'completed', currentKey: null, answeredCount: answered, total: items.length,
      completedAt: now(), lastActivityAt: now(),
    }).where(eq(telegramFillSessions.id, session.id));
    await tgSend(token, session.chatId,
      `הגעתם לסוף התהליך 🎉\nענִיתם על ${answered} מתוך ${items.length} שאלות.\nהתשובות נשמרו ונקלטו אצלנו. תודה רבה! 🙏`);
    const who = session.contactName ? ` (${session.contactName})` : '';
    await notifyTelegram(c.env.TELEGRAM_BOT_TOKEN, c.env.TELEGRAM_CHAT_ID,
      `✅ הלקוח${who} השלים מילוי בטלגרם: "${run.title}" — ${answered}/${items.length} שאלות.`);
    return;
  }
  const q = questionText(items, idx, prevSection);
  await d.update(telegramFillSessions).set({
    currentKey: items[idx].key, answeredCount: answered, total: items.length, lastActivityAt: now(),
  }).where(eq(telegramFillSessions.id, session.id));
  await tgSend(token, session.chatId, q.text, q.markup);
}

/** מתחיל/מחדש הזמנה עבור טוקן (/start <token>). */
async function startFromToken(c: Context<Env>, tokenParam: string, chatId: string, contact: string | null): Promise<void> {
  const token = c.env.TELEGRAM_BOT_TOKEN!;
  const d = db(c);
  const session = (await d.select().from(telegramFillSessions).where(eq(telegramFillSessions.token, tokenParam)).limit(1))[0];
  if (!session) {
    await tgSend(token, chatId, 'הקישור אינו תקף או פג תוקף. בקשו מאיתנו קישור חדש 🙏');
    return;
  }
  if (session.status === 'cancelled') {
    await tgSend(token, chatId, 'ההזמנה הזו בוטלה. בקשו מאיתנו קישור מעודכן 🙏');
    return;
  }
  const run = (await d.select().from(playbookRuns).where(eq(playbookRuns.id, session.runId)).limit(1))[0];
  if (!run) {
    await tgSend(token, chatId, 'התהליך לא נמצא. בקשו מאיתנו קישור חדש 🙏');
    return;
  }
  const items = askableItems(run.sections, run.na);
  const answers = safeParse<Record<string, any>>(run.answers, {});
  const answered = items.filter((it) => filled(answers[it.key])).length;
  // קושרים את הצ'אט להזמנה ומסמנים "נפתח" (פעם ראשונה)
  await d.update(telegramFillSessions).set({
    chatId,
    contactName: contact || session.contactName || null,
    status: session.status === 'completed' ? 'completed' : (session.startedAt ? 'in_progress' : 'opened'),
    openedAt: session.openedAt ?? now(),
    total: items.length,
    answeredCount: answered,
    lastActivityAt: now(),
  }).where(eq(telegramFillSessions.id, session.id));
  if (!session.openedAt) {
    const who = contact ? ` (${contact})` : '';
    await notifyTelegram(c.env.TELEGRAM_BOT_TOKEN, c.env.TELEGRAM_CHAT_ID, `📲 הלקוח${who} פתח את התהליך "${run.title}" בטלגרם.`);
  }
  const cname = await clientName(c, run);
  const start = askFrom(items, answers, 0);
  const resumed = answered > 0 && start < items.length;
  const greet =
    `שלום 👋\n\nהוזמנתם למלא את התהליך "${run.title}"${cname ? ` עבור ${cname}` : ''}.\n` +
    `יש ${items.length} שאלות. עונים בקצב שלכם — כל תשובה נשמרת אוטומטית, ואפשר לחזור בכל רגע.` +
    (resumed ? `\n\nכבר נענו ${answered} שאלות — נמשיך מהמקום שבו עצרתם.` : '');
  await tgSend(token, chatId, greet);
  // רענון השורה מהמסד לפני שליחת השאלה (chatId עודכן זה עתה)
  const fresh = (await d.select().from(telegramFillSessions).where(eq(telegramFillSessions.id, session.id)).limit(1))[0];
  await askAt(c, fresh, run, items, start, null);
}

/** מטפל בתשובה/דילוג של הלקוח על השאלה הנוכחית. */
async function handleReply(c: Context<Env>, session: any, text: string | null, skip: boolean): Promise<void> {
  const token = c.env.TELEGRAM_BOT_TOKEN!;
  const d = db(c);
  const run = (await d.select().from(playbookRuns).where(eq(playbookRuns.id, session.runId)).limit(1))[0];
  if (!run) { await tgSend(token, session.chatId, 'התהליך לא נמצא יותר. בקשו מאיתנו קישור חדש 🙏'); return; }

  const items = askableItems(run.sections, run.na);
  if (!items.length) { await tgSend(token, session.chatId, 'אין שאלות פתוחות. תודה!'); return; }
  const answers = safeParse<Record<string, any>>(run.answers, {});

  // מיקום נוכחי: השאלה הממתינה (currentKey), ואם אינו זמין — הבאה שלא נענתה
  let idx = session.currentKey ? items.findIndex((it) => it.key === session.currentKey) : -1;
  if (idx < 0) idx = askFrom(items, answers, 0);
  if (idx >= items.length) {
    // כבר סיימנו — אין שאלה לענות עליה
    await tgSend(token, session.chatId, 'כל השאלות כבר נענו. תודה! 🙏 כדי לעדכן תשובה, פנו אלינו במערכת.');
    return;
  }
  const prevSection = items[idx].sectionTitle || null;

  if (!skip) {
    const key = items[idx].key;
    const checked = safeParse<Record<string, any>>(run.checked, {});
    answers[key] = text || '';
    checked[key] = true;
    const answersJson = JSON.stringify(answers);
    const checkedJson = JSON.stringify(checked);
    const progress = calcProgress(run.sections, checkedJson, run.na);
    await d.update(playbookRuns).set({
      answers: answersJson, checked: checkedJson, progress, updatedAt: now(),
    }).where(eq(playbookRuns.id, run.id));
    run.answers = answersJson; run.checked = checkedJson;
    await d.update(telegramFillSessions).set({
      status: 'in_progress',
      startedAt: session.startedAt ?? now(),
      lastActivityAt: now(),
    }).where(eq(telegramFillSessions.id, session.id));
    await tgSend(token, session.chatId, 'נשמר ✓');
  } else {
    await d.update(telegramFillSessions).set({ status: 'in_progress', startedAt: session.startedAt ?? now(), lastActivityAt: now() })
      .where(eq(telegramFillSessions.id, session.id));
  }

  const freshAnswers = safeParse<Record<string, any>>(run.answers, {});
  const next = askFrom(items, freshAnswers, idx + 1);
  const fresh = (await d.select().from(telegramFillSessions).where(eq(telegramFillSessions.id, session.id)).limit(1))[0];
  await askAt(c, fresh, run, items, next, prevSection);
}

/** גוף העדכון מטלגרם (message / callback_query). */
async function processUpdate(c: Context<Env>, update: any): Promise<void> {
  const token = c.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const d = db(c);

  // כפתור "דילוג"
  const cb = update.callback_query;
  if (cb) {
    await tgAnswerCallback(token, cb.id);
    const chatId = String(cb.message?.chat?.id || '');
    if (!chatId) return;
    if (cb.data === 'skip') {
      const session = (await d.select().from(telegramFillSessions).where(eq(telegramFillSessions.chatId, chatId)).limit(1))[0];
      if (session && (session.status === 'opened' || session.status === 'in_progress')) {
        await handleReply(c, session, null, true);
      }
    }
    return;
  }

  const msg = update.message;
  if (!msg || !msg.chat) return;
  const chatId = String(msg.chat.id);
  const text = String(msg.text || '').trim();
  const contact = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ').trim() ||
    (msg.from?.username ? '@' + msg.from.username : null);

  // /start <token>
  if (text.startsWith('/start')) {
    const param = text.slice('/start'.length).trim();
    if (param) { await startFromToken(c, param, chatId, contact); }
    else {
      await tgSend(token, chatId, 'שלום 👋 זהו בוט מילוי התהליכים של ORT-TECH. כדי להתחיל, פתחו את הקישור האישי שקיבלתם מאיתנו.');
    }
    return;
  }
  if (text === '/skip' || text === '/דלג') {
    const session = (await d.select().from(telegramFillSessions).where(eq(telegramFillSessions.chatId, chatId)).limit(1))[0];
    if (session && (session.status === 'opened' || session.status === 'in_progress')) await handleReply(c, session, null, true);
    else await tgSend(token, chatId, 'אין כרגע שאלה פתוחה. פתחו את הקישור האישי שקיבלתם כדי להתחיל.');
    return;
  }

  // הודעה רגילה → תשובה על השאלה הנוכחית
  const session = (await d.select().from(telegramFillSessions).where(eq(telegramFillSessions.chatId, chatId)).limit(1))[0];
  if (!session) {
    await tgSend(token, chatId, 'כדי למלא תהליך, פתחו קודם את הקישור האישי שקיבלתם מאיתנו 🙏');
    return;
  }
  if (session.status === 'completed') {
    await tgSend(token, chatId, 'כבר השלמתם את התהליך. תודה! 🙏 לעדכון תשובה, פנו אלינו במערכת.');
    return;
  }
  if (session.status === 'cancelled') {
    await tgSend(token, chatId, 'ההזמנה בוטלה. בקשו מאיתנו קישור מעודכן 🙏');
    return;
  }
  await handleReply(c, session, text, false);
}

/* ---------------- Hono: webhook ציבורי + הגדרות מנהל ---------------- */

/** ה-webhook הציבורי של טלגרם. מאמת סוד (אם הוגדר) ומחזיר 200 תמיד. */
export async function telegramWebhook(c: Context<Env>): Promise<Response> {
  const secret = c.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && c.req.header('x-telegram-bot-api-secret-token') !== secret) {
    return c.json({ ok: false }, 401);
  }
  const update = await c.req.json().catch(() => null);
  if (update) {
    try { await processUpdate(c, update); } catch { /* best-effort — לא מחזירים שגיאה לטלגרם */ }
  }
  return c.json({ ok: true });
}

export const telegramAdminApp = new Hono<Env>();

/** מצב הבוט: טוקן מוגדר? שם משתמש? האם ה-webhook מותקן? */
telegramAdminApp.get('/status', async (c) => {
  const token = c.env.TELEGRAM_BOT_TOKEN;
  if (!token) return c.json({ configured: false, reason: 'no_bot_token' });
  const uname = await botUsername(c, true).catch(() => null);
  const info = await tgCall(token, 'getWebhookInfo', {});
  const webhookUrl = info?.result?.url || '';
  const origin = new URL(c.req.url).origin;
  const expected = `${origin}/api/telegram/webhook`;
  return c.json({
    configured: !!uname,
    username: uname,
    webhookSet: webhookUrl === expected,
    webhookUrl,
    expectedUrl: expected,
    secretConfigured: !!c.env.TELEGRAM_WEBHOOK_SECRET,
    pendingUpdates: info?.result?.pending_update_count ?? 0,
  });
});

/** התקנת ה-webhook של הבוט על הדומיין הנוכחי (פעולה חד-פעמית מהמערכת). */
telegramAdminApp.post('/setup', async (c) => {
  const token = c.env.TELEGRAM_BOT_TOKEN;
  if (!token) return c.json({ ok: false, error: 'no_bot_token' }, 400);
  const origin = new URL(c.req.url).origin;
  const url = `${origin}/api/telegram/webhook`;
  const payload: any = { url, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true };
  if (c.env.TELEGRAM_WEBHOOK_SECRET) payload.secret_token = c.env.TELEGRAM_WEBHOOK_SECRET;
  const res = await tgCall(token, 'setWebhook', payload);
  const uname = await botUsername(c, true).catch(() => null);
  return c.json({ ok: !!res?.ok, url, username: uname, result: res });
});
