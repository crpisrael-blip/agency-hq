import { Hono, Context } from 'hono';
import { eq, inArray } from 'drizzle-orm';
import { leads, leadActivities, settings } from '../db/schema';
import { Env, db, uid, now } from './util';

/* =========================================================================
 * ווטסאפ אוטומטי לליד — הודעת אישור מיידית למי שהשאיר פרטים באתר.
 *
 * הזרימה: טופס באתר → POST /api/hook/lead → הליד נשמר → (ברקע) נשלחת למבקר הודעת
 * ווטסאפ: "הפנייה התקבלה, נחזור בהקדם, בינתיים ספר/י לנו בכמה מילים…". התוצאה
 * נרשמת על הליד (whatsapp_status) וביומן הפעילות שלו, כך שבדשבורד רואים מי קיבל.
 *
 * שני ספקים נתמכים (בחירה בהגדרות):
 *   green — Green API (green-api.com): מחברים את מספר הווטסאפ העסקי שלך בסריקת QR,
 *           ושולחים טקסט חופשי. הכי פשוט לעסק קטן בישראל.
 *   meta  — WhatsApp Cloud API הרשמי של Meta. הודעה יזומה (העסק פותח שיחה) חייבת
 *           להישלח כ"תבנית" מאושרת מראש, עם {{1}} = שם הליד.
 *
 * כל ההגדרות נשמרות בטבלת settings (עריכה מהדשבורד: לידים → ⚙️ ווטסאפ אוטומטי),
 * עם נפילה חזרה למשתני סביבה. השליחה היא best-effort: לעולם לא זורקת ולא שוברת
 * שמירת ליד.
 * ========================================================================= */

export const DEFAULT_WELCOME_TEXT =
  'היי {name} 👋\n' +
  'תודה שפנית ל-ORT-TECH. הפנייה שלך התקבלה ונחזור אליך בהקדם.\n\n' +
  'בינתיים, כדי שנגיע לשיחה מוכנים, נשמח לכמה מילים ממך כאן:\n' +
  'מה העסק עושה, ומה היית רוצה לשפר או לפתור?\n\n' +
  'נדבר בקרוב 🙂';

/** מפתחות settings ← משתני סביבה מקבילים */
const KEYS = {
  enabled: ['whatsapp_enabled', 'WHATSAPP_ENABLED'],
  provider: ['whatsapp_provider', 'WHATSAPP_PROVIDER'],
  welcomeText: ['whatsapp_welcome_text', 'WHATSAPP_WELCOME_TEXT'],
  greenInstance: ['green_api_instance', 'GREEN_API_INSTANCE'],
  greenToken: ['green_api_token', 'GREEN_API_TOKEN'],
  greenUrl: ['green_api_url', 'GREEN_API_URL'],
  metaPhoneId: ['whatsapp_phone_id', 'WHATSAPP_PHONE_ID'],
  metaToken: ['whatsapp_token', 'WHATSAPP_TOKEN'],
  metaTemplate: ['whatsapp_template', 'WHATSAPP_TEMPLATE'],
  metaTemplateLang: ['whatsapp_template_lang', 'WHATSAPP_TEMPLATE_LANG'],
} as const;
type CfgKey = keyof typeof KEYS;
const SECRET_KEYS: CfgKey[] = ['greenToken', 'metaToken'];

export type WhatsAppConfig = Record<CfgKey, string> & { source: Record<CfgKey, 'settings' | 'env' | 'none'> };

export const GREEN_DEFAULT_URL = 'https://api.green-api.com';
export const META_GRAPH_URL = 'https://graph.facebook.com/v21.0';

/** בונה את ההגדרות ממפת settings + env — ליבה בלי Context (משמש גם את ה-Worker לתזכורות). */
export function buildWhatsAppConfig(
  map: Record<string, string>,
  env: Record<string, string | undefined>,
): WhatsAppConfig {
  const out: any = { source: {} };
  for (const k of Object.keys(KEYS) as CfgKey[]) {
    const [sKey, eKey] = KEYS[k];
    const fromSettings = (map[sKey] ?? '').trim();
    const fromEnv = (env[eKey] ?? '').trim();
    out[k] = fromSettings || fromEnv;
    out.source[k] = fromSettings ? 'settings' : fromEnv ? 'env' : 'none';
  }
  return out as WhatsAppConfig;
}

/** קריאת ההגדרות ממופע drizzle כלשהו (Pages או Worker). */
export async function loadWhatsAppConfigDb(
  d: { select: Function },
  env: Record<string, string | undefined>,
): Promise<WhatsAppConfig> {
  const keys = (Object.keys(KEYS) as CfgKey[]).map((k) => KEYS[k][0]);
  const rows: { key: string; value: string }[] = await (d as any)
    .select()
    .from(settings)
    .where(inArray(settings.key, keys))
    .all()
    .catch(() => []);
  return buildWhatsAppConfig(Object.fromEntries(rows.map((r) => [r.key, r.value])), env);
}

/** קריאת ההגדרות: קודם settings (D1), אחרת env. */
export async function loadWhatsAppConfig(c: Context<Env>): Promise<WhatsAppConfig> {
  return loadWhatsAppConfigDb(db(c), c.env as unknown as Record<string, string | undefined>);
}

/** האם השליחה האוטומטית פעילה ומוגדרת מספיק כדי לנסות לשלוח */
export function isWhatsAppReady(cfg: Pick<WhatsAppConfig, CfgKey>): { ready: boolean; reason?: string } {
  if (cfg.enabled === '0' || cfg.enabled.toLowerCase() === 'false' || cfg.enabled.toLowerCase() === 'off') {
    return { ready: false, reason: 'disabled' };
  }
  const provider = (cfg.provider || 'green').toLowerCase();
  if (provider === 'green') {
    if (!cfg.greenInstance || !cfg.greenToken) return { ready: false, reason: 'green_not_configured' };
    return { ready: true };
  }
  if (provider === 'meta') {
    if (!cfg.metaPhoneId || !cfg.metaToken) return { ready: false, reason: 'meta_not_configured' };
    return { ready: true };
  }
  return { ready: false, reason: 'unknown_provider' };
}

/**
 * נרמול טלפון ישראלי לפורמט בינלאומי בלי + (972541234567).
 * מקבל 054-1234567 / +972 54 123 4567 / 972541234567 / 00972… — מחזיר null אם לא נראה כמספר תקין.
 */
export function normalizeILPhone(raw: string | null | undefined): string | null {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('972')) {
    // 972 0 54… (כתבו 0 מוביל אחרי הקידומת) → מורידים את ה-0
    if (d.length === 13 && d[3] === '0') d = '972' + d.slice(4);
  } else if (d.startsWith('0')) {
    d = '972' + d.slice(1);
  } else if (d.length >= 8 && d.length <= 9) {
    // מספר בלי 0 מוביל (541234567) — מניחים ישראל
    d = '972' + d;
  }
  // ישראל: 972 + 8–9 ספרות. מספר בינלאומי אחר: 8–15 ספרות (E.164)
  if (d.startsWith('972')) return d.length === 11 || d.length === 12 ? d : null;
  return d.length >= 8 && d.length <= 15 ? d : null;
}

/** מכניס את שם הליד (מילה ראשונה) לנוסח ההודעה. בלי שם — הברכה נשארת נקייה. */
export function renderWelcome(template: string, name: string | null | undefined): string {
  const first = String(name ?? '').trim().split(/\s+/)[0] || '';
  let text = (template || DEFAULT_WELCOME_TEXT).replace(/\{name\}/g, first);
  if (!first) text = text.replace(/[ \t]{2,}/g, ' ').replace(/ +([,!?.\n])/g, '$1').replace(/ +$/gm, '');
  return text.trim();
}

export type SendResult = { ok: boolean; id?: string; error?: string };

/** Green API — שליחת טקסט חופשי למספר */
export function greenSendRequest(cfg: Pick<WhatsAppConfig, 'greenInstance' | 'greenToken' | 'greenUrl'>, phone: string, text: string) {
  const base = (cfg.greenUrl || GREEN_DEFAULT_URL).replace(/\/+$/, '');
  return {
    url: `${base}/waInstance${cfg.greenInstance}/sendMessage/${cfg.greenToken}`,
    body: { chatId: `${phone}@c.us`, message: text },
  };
}

/**
 * קוד שפה של תבנית Meta — רגיש לאותיות: 'he', 'en_US'. מנרמל קלט ידני ('He', ' HE ',
 * 'en-us') לצורה ש-Meta מצפה לה; אחרת Meta מחזירה 132001 (Template name does not exist
 * in the translation) גם כשהתבנית קיימת ומאושרת.
 */
export function normalizeTemplateLang(lang: string | null | undefined): string {
  const raw = String(lang ?? '').trim().replace(/-/g, '_');
  if (!raw) return 'he';
  const [base, region] = raw.split('_');
  return region ? `${base.toLowerCase()}_${region.toUpperCase()}` : base.toLowerCase();
}

/** Meta Cloud API — תבנית מאושרת (הודעה יזומה) או טקסט (רק בתוך חלון 24 שעות) */
export function metaSendRequest(
  cfg: Pick<WhatsAppConfig, 'metaPhoneId' | 'metaToken' | 'metaTemplate' | 'metaTemplateLang'>,
  phone: string,
  text: string,
  name: string | null | undefined,
) {
  const url = `${META_GRAPH_URL}/${cfg.metaPhoneId}/messages`;
  const first = String(name ?? '').trim().split(/\s+/)[0] || 'שלום';
  const body = cfg.metaTemplate
    ? {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: cfg.metaTemplate,
          language: { code: normalizeTemplateLang(cfg.metaTemplateLang) },
          components: [{ type: 'body', parameters: [{ type: 'text', text: first }] }],
        },
      }
    : { messaging_product: 'whatsapp', to: phone, type: 'text', text: { preview_url: false, body: text } };
  return { url, headers: { Authorization: `Bearer ${cfg.metaToken}` }, body };
}

/** Meta Cloud API — תבנית מאושרת עם מספר משתני-גוף לפי הסדר ({{1}}, {{2}}, …) */
export function metaTemplateRequest(
  cfg: Pick<WhatsAppConfig, 'metaPhoneId' | 'metaToken'>,
  phone: string,
  templateName: string,
  lang: string,
  params: string[],
) {
  const url = `${META_GRAPH_URL}/${cfg.metaPhoneId}/messages`;
  const components = params.length
    ? [{ type: 'body', parameters: params.map((t) => ({ type: 'text', text: String(t ?? '') })) }]
    : [];
  return {
    url,
    headers: { Authorization: `Bearer ${cfg.metaToken}` },
    body: {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: { name: templateName, language: { code: normalizeTemplateLang(lang) }, components },
    },
  };
}

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const data: any = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

const short = (v: unknown) => String(v ?? '').slice(0, 200);

/** שליחת הודעת טקסט אחת. לעולם לא זורקת — מחזירה {ok:false, error} בכשל. */
export async function sendWhatsAppText(
  cfg: Pick<WhatsAppConfig, CfgKey>,
  phone: string,
  text: string,
  name?: string | null,
): Promise<SendResult> {
  try {
    const provider = (cfg.provider || 'green').toLowerCase();
    if (provider === 'green') {
      const req = greenSendRequest(cfg, phone, text);
      const r = await postJson(req.url, req.body);
      if (r.ok && r.data?.idMessage) return { ok: true, id: String(r.data.idMessage) };
      return { ok: false, error: `green ${r.status}: ${short(r.data?.message || r.data?.error || JSON.stringify(r.data))}` };
    }
    if (provider === 'meta') {
      const req = metaSendRequest(cfg, phone, text, name);
      const r = await postJson(req.url, req.body, req.headers);
      const id = r.data?.messages?.[0]?.id;
      if (r.ok && id) return { ok: true, id: String(id) };
      return { ok: false, error: `meta ${r.status}: ${short(r.data?.error?.message || JSON.stringify(r.data))}` };
    }
    return { ok: false, error: 'unknown_provider' };
  } catch (e) {
    return { ok: false, error: short((e as Error)?.message || e) };
  }
}

/**
 * שליחה גנרית: טקסט חופשי (Green) או תבנית מאושרת (Meta). לעולם לא זורקת.
 * ב-Green נשלח תמיד `text`. ב-Meta: אם ניתן `template` — נשלחת התבנית עם הפרמטרים;
 * אחרת טקסט (עובד רק בתוך חלון 24 שעות). משמש גם את הודעות הפגישה (אישור/תזכורת).
 */
export async function sendWhatsAppMessage(
  cfg: Pick<WhatsAppConfig, CfgKey>,
  phone: string,
  opts: { text: string; template?: { name: string; lang?: string; params: string[] } },
): Promise<SendResult> {
  try {
    const provider = (cfg.provider || 'green').toLowerCase();
    if (provider === 'green') {
      const req = greenSendRequest(cfg, phone, opts.text);
      const r = await postJson(req.url, req.body);
      if (r.ok && r.data?.idMessage) return { ok: true, id: String(r.data.idMessage) };
      return { ok: false, error: `green ${r.status}: ${short(r.data?.message || r.data?.error || JSON.stringify(r.data))}` };
    }
    if (provider === 'meta') {
      const req = opts.template?.name
        ? metaTemplateRequest(cfg, phone, opts.template.name, opts.template.lang || 'he', opts.template.params)
        : { url: `${META_GRAPH_URL}/${cfg.metaPhoneId}/messages`, headers: { Authorization: `Bearer ${cfg.metaToken}` }, body: { messaging_product: 'whatsapp', to: phone, type: 'text', text: { preview_url: false, body: opts.text } } };
      const r = await postJson(req.url, req.body, req.headers);
      const id = r.data?.messages?.[0]?.id;
      if (r.ok && id) return { ok: true, id: String(id) };
      return { ok: false, error: `meta ${r.status}: ${short(r.data?.error?.message || JSON.stringify(r.data))}` };
    }
    return { ok: false, error: 'unknown_provider' };
  } catch (e) {
    return { ok: false, error: short((e as Error)?.message || e) };
  }
}

type LeadRow = { id: string; name: string | null; phone: string | null };

/**
 * הודעת האישור האוטומטית לליד: מנרמל טלפון, מרנדר נוסח, שולח, ומעדכן את הליד ואת
 * יומן הפעילות שלו. מיועד ל-executionCtx.waitUntil. לעולם לא זורק.
 * מחזיר תיאור קצר לתצוגה (למשל בהתראת הטלגרם למנהל).
 */
export async function sendLeadWelcome(
  c: Context<Env>,
  lead: LeadRow,
  cfg?: WhatsAppConfig,
): Promise<{ status: 'sent' | 'failed' | 'skipped'; detail: string }> {
  const d = db(c);
  const finish = async (status: 'sent' | 'failed' | 'skipped', detail: string, logIt: boolean) => {
    await d
      .update(leads)
      .set({
        whatsappStatus: status,
        whatsappSentAt: status === 'sent' ? now() : null,
        whatsappError: status === 'sent' ? null : detail.slice(0, 200),
      })
      .where(eq(leads.id, lead.id))
      .catch(() => {});
    if (logIt) {
      await d
        .insert(leadActivities)
        .values({
          id: uid(),
          leadId: lead.id,
          kind: 'whatsapp',
          text: status === 'sent' ? '💬 נשלחה הודעת אישור אוטומטית בווטסאפ' : `⚠️ הודעת ווטסאפ אוטומטית נכשלה: ${detail.slice(0, 160)}`,
          createdAt: now(),
        })
        .catch(() => {});
    }
    return { status, detail };
  };
  try {
    const conf = cfg || (await loadWhatsAppConfig(c));
    const ready = isWhatsAppReady(conf);
    if (!ready.ready) return finish('skipped', ready.reason || 'not_ready', false);
    const phone = normalizeILPhone(lead.phone);
    if (!phone) return finish('skipped', 'bad_phone', false);
    const text = renderWelcome(conf.welcomeText, lead.name);
    const r = await sendWhatsAppText(conf, phone, text, lead.name);
    if (r.ok) return finish('sent', r.id || 'sent', true);
    return finish('failed', r.error || 'send_failed', true);
  } catch (e) {
    return finish('failed', short((e as Error)?.message || e), true);
  }
}

/** תיאור קריא לעברית של תוצאת השליחה (להתראת הטלגרם למנהל) */
export function describeWelcomeResult(r: { status: string; detail: string }): string {
  if (r.status === 'sent') return '💬 ווטסאפ אוטומטי: נשלח ✓';
  if (r.status === 'failed') {
    const hint = /#13200[01]/.test(r.detail) ? '\n↳ בהגדרות ← ווטסאפ: "🔍 בדוק תבנית ב-Meta" יראה מה לא תואם' : '';
    return `💬 ווטסאפ אוטומטי: נכשל (${r.detail})${hint}`;
  }
  const why: Record<string, string> = {
    disabled: 'כבוי בהגדרות',
    bad_phone: 'טלפון לא תקין',
    green_not_configured: 'Green API לא מוגדר',
    meta_not_configured: 'Meta API לא מוגדר',
    unknown_provider: 'ספק לא מוכר',
  };
  return `💬 ווטסאפ אוטומטי: לא נשלח (${why[r.detail] || r.detail})`;
}

/* ------------------------------------------------------------------------
 * אבחון תבנית Meta: משווה את השם/שפה שהוגדרו מול התבניות שקיימות בפועל בחשבון
 * ה-WhatsApp Business שאליו שייך מספר השליחה. עונה על שגיאות 132001/132000.
 * ---------------------------------------------------------------------- */
export interface MetaTemplateInfo { name: string; language: string; status: string; bodyParams: number }
export interface MetaWabaInfo { id: string; hasPhone: boolean; templates: MetaTemplateInfo[] }

/** מספר המשתנים {{n}} בגוף התבנית */
export function templateBodyParams(components: any[] | undefined): number {
  const body = (components || []).find((x: any) => String(x?.type).toUpperCase() === 'BODY');
  const m = String(body?.text || '').match(/\{\{\s*\d+\s*\}\}/g);
  return m ? new Set(m.map((x) => x.replace(/\s/g, ''))).size : 0;
}

/** אבחנה בעברית: האם התבנית שהוגדרה תעבוד עם מספר השליחה, ואם לא — למה */
export function diagnoseTemplate(
  wabas: MetaWabaInfo[],
  name: string,
  lang: string,
): { ok: boolean; message: string } {
  const want = String(name || '').trim();
  const wantLang = normalizeTemplateLang(lang);
  if (!want) return { ok: false, message: 'לא הוגדר שם תבנית.' };
  if (!wabas.length) return { ok: false, message: 'לא נמצא חשבון WhatsApp Business שהטוקן מורשה אליו — צריך טוקן עם הרשאת whatsapp_business_management.' };
  const own = wabas.filter((w) => w.hasPhone);
  const pool = own.length ? own : wabas;
  const same = pool.flatMap((w) => w.templates.filter((t) => t.name === want));
  if (!same.length) {
    const elsewhere = wabas.filter((w) => !w.hasPhone).some((w) => w.templates.some((t) => t.name === want));
    if (own.length && elsewhere) {
      return { ok: false, message: `התבנית "${want}" קיימת, אבל בחשבון WhatsApp Business אחר — לא בחשבון שאליו שייך מספר השליחה. צריך ליצור אותה בחשבון של המספר.` };
    }
    const close = pool.flatMap((w) => w.templates).find((t) => t.name.toLowerCase() === want.toLowerCase());
    if (close) return { ok: false, message: `אין תבנית בשם "${want}" — יש "${close.name}". השמות רגישים לאותיות; עדכן את שם התבנית בהגדרות.` };
    return { ok: false, message: `אין בחשבון תבנית בשם "${want}".` };
  }
  const exact = same.find((t) => t.language === wantLang);
  if (!exact) {
    const langs = [...new Set(same.map((t) => t.language))].join(', ');
    return { ok: false, message: `התבנית "${want}" קיימת רק בשפה: ${langs} — ולא ב-"${wantLang}". עדכן את "שפת התבנית" בהגדרות ל-${same[0].language}.` };
  }
  if (exact.status !== 'APPROVED') {
    return { ok: false, message: `התבנית "${want}" (${wantLang}) נמצאת בסטטוס ${exact.status} — אפשר לשלוח רק תבנית בסטטוס APPROVED.` };
  }
  if (exact.bodyParams !== 1) {
    return { ok: false, message: `בתבנית "${want}" יש ${exact.bodyParams} משתנים בגוף ההודעה, והמערכת שולחת משתנה אחד ({{1}} = השם הפרטי). צריך תבנית עם משתנה אחד בדיוק.` };
  }
  return { ok: true, message: `התבנית "${want}" (${wantLang}) מאושרת ותואמת ✓` };
}

async function graphGet(path: string, token: string) {
  const r = await fetch(`${META_GRAPH_URL}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.message || `http_${r.status}`);
  return data;
}

/* ------------------------------------------------------------------------
 * API מוגן (מנהל): הגדרות, מצב חיבור, בדיקת שליחה, שליחה חוזרת לליד
 * ---------------------------------------------------------------------- */
export const whatsappAdminApp = new Hono<Env>();

const mask = (v: string) => (v ? '••••' + v.slice(-4) : '');

/** ההגדרות לתצוגה — סודות מוסתרים (רק 4 תווים אחרונים) */
whatsappAdminApp.get('/settings', async (c) => {
  const cfg = await loadWhatsAppConfig(c);
  const out: Record<string, unknown> = { source: cfg.source, defaultWelcomeText: DEFAULT_WELCOME_TEXT };
  for (const k of Object.keys(KEYS) as CfgKey[]) {
    out[k] = SECRET_KEYS.includes(k) ? mask(cfg[k]) : cfg[k];
    if (SECRET_KEYS.includes(k)) out[`${k}Set`] = !!cfg[k];
  }
  out.ready = isWhatsAppReady(cfg);
  out.preview = renderWelcome(cfg.welcomeText, 'דנה');
  return c.json(out);
});

/**
 * שמירת הגדרות. שדות שלא נשלחו — לא משתנים. סוד שנשלח ריק או מוסתר (••••) — לא משתנה;
 * כדי למחוק סוד שולחים null.
 */
whatsappAdminApp.put('/settings', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const d = db(c);
  const changed: string[] = [];
  for (const k of Object.keys(KEYS) as CfgKey[]) {
    if (!(k in body)) continue;
    const raw = body[k];
    const sKey = KEYS[k][0];
    if (raw === null) {
      await d.delete(settings).where(eq(settings.key, sKey));
      changed.push(k);
      continue;
    }
    let v = String(raw ?? '');
    if (k === 'enabled') v = v === '1' || v === 'true' || v === 'on' ? '1' : '0';
    if (k === 'provider') v = v.toLowerCase() === 'meta' ? 'meta' : 'green';
    if (k === 'welcomeText') v = v.slice(0, 1000);
    if (SECRET_KEYS.includes(k) && (!v.trim() || v.startsWith('••••'))) continue;
    await d.insert(settings).values({ key: sKey, value: v }).onConflictDoUpdate({ target: settings.key, set: { value: v } });
    changed.push(k);
  }
  const cfg = await loadWhatsAppConfig(c);
  return c.json({ ok: true, changed, ready: isWhatsAppReady(cfg), preview: renderWelcome(cfg.welcomeText, 'דנה') });
});

/** בדיקת חיבור מול הספק (בלי לשלוח הודעה) */
whatsappAdminApp.get('/status', async (c) => {
  const cfg = await loadWhatsAppConfig(c);
  const ready = isWhatsAppReady(cfg);
  if (!ready.ready) return c.json({ ok: false, connected: false, reason: ready.reason, provider: cfg.provider || 'green' });
  try {
    if ((cfg.provider || 'green') === 'green') {
      const base = (cfg.greenUrl || GREEN_DEFAULT_URL).replace(/\/+$/, '');
      const r = await fetch(`${base}/waInstance${cfg.greenInstance}/getStateInstance/${cfg.greenToken}`);
      const data: any = await r.json().catch(() => ({}));
      const state = data?.stateInstance || '';
      return c.json({ ok: r.ok, connected: state === 'authorized', provider: 'green', state, detail: r.ok ? '' : short(JSON.stringify(data)) });
    }
    const r = await fetch(`${META_GRAPH_URL}/${cfg.metaPhoneId}?fields=display_phone_number,verified_name,quality_rating`, {
      headers: { Authorization: `Bearer ${cfg.metaToken}` },
    });
    const data: any = await r.json().catch(() => ({}));
    return c.json({
      ok: r.ok,
      connected: r.ok,
      provider: 'meta',
      phone: data?.display_phone_number || '',
      name: data?.verified_name || '',
      quality: data?.quality_rating || '',
      templateConfigured: !!cfg.metaTemplate,
      detail: r.ok ? '' : short(data?.error?.message || JSON.stringify(data)),
    });
  } catch (e) {
    return c.json({ ok: false, connected: false, provider: cfg.provider || 'green', detail: short((e as Error)?.message || e) });
  }
});

/** אבחון תבנית: התבניות בפועל בחשבון המספר מול מה שהוגדר (Meta בלבד) */
whatsappAdminApp.get('/templates', async (c) => {
  const cfg = await loadWhatsAppConfig(c);
  if (cfg.provider !== 'meta' || !cfg.metaToken || !cfg.metaPhoneId) {
    return c.json({ ok: false, error: 'meta_not_configured' }, 400);
  }
  try {
    // חשבונות ה-WABA שהטוקן מורשה אליהם (מתוך ההרשאות הגרנולריות של הטוקן)
    const dbg = await graphGet(`debug_token?input_token=${encodeURIComponent(cfg.metaToken)}`, cfg.metaToken);
    const ids = new Set<string>();
    for (const sc of dbg?.data?.granular_scopes || []) {
      if (String(sc.scope).startsWith('whatsapp_business')) for (const id of sc.target_ids || []) ids.add(String(id));
    }
    const wabas: MetaWabaInfo[] = [];
    for (const id of ids) {
      const phones = await graphGet(`${id}/phone_numbers?fields=id,display_phone_number&limit=100`, cfg.metaToken).catch(() => ({ data: [] }));
      const tpl = await graphGet(`${id}/message_templates?fields=name,language,status,components&limit=200`, cfg.metaToken).catch(() => ({ data: [] }));
      wabas.push({
        id,
        hasPhone: (phones.data || []).some((p: any) => String(p.id) === String(cfg.metaPhoneId)),
        templates: (tpl.data || []).map((t: any) => ({
          name: String(t.name), language: String(t.language), status: String(t.status), bodyParams: templateBodyParams(t.components),
        })),
      });
    }
    const diagnosis = diagnoseTemplate(wabas, cfg.metaTemplate, cfg.metaTemplateLang);
    return c.json({ ok: true, configured: { name: cfg.metaTemplate, lang: normalizeTemplateLang(cfg.metaTemplateLang) }, diagnosis, wabas });
  } catch (e) {
    return c.json({ ok: false, error: short((e as Error)?.message || e) }, 502);
  }
});

/** שליחת הודעת בדיקה למספר (אותו נוסח שיקבל ליד) */
whatsappAdminApp.post('/test', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const cfg = await loadWhatsAppConfig(c);
  const ready = isWhatsAppReady(cfg);
  if (!ready.ready) return c.json({ ok: false, error: ready.reason }, 400);
  const phone = normalizeILPhone(body.phone);
  if (!phone) return c.json({ ok: false, error: 'bad_phone' }, 400);
  const name = body.name ? String(body.name).slice(0, 60) : 'בדיקה';
  const r = await sendWhatsAppText(cfg, phone, renderWelcome(cfg.welcomeText, name), name);
  return c.json({ ...r, phone }, r.ok ? 200 : 502);
});

/** שליחה חוזרת (ידנית) של הודעת האישור לליד קיים — למשל אחרי תיקון הגדרות */
whatsappAdminApp.post('/resend/:leadId', async (c) => {
  const id = c.req.param('leadId');
  const d = db(c);
  const lead = (await d.select().from(leads).where(eq(leads.id, id)).limit(1))[0];
  if (!lead) return c.json({ error: 'not_found' }, 404);
  const body = await c.req.json().catch(() => ({} as any));
  let phone = lead.phone;
  if (body.phone) {
    phone = String(body.phone).slice(0, 40);
    await d.update(leads).set({ phone }).where(eq(leads.id, id));
  }
  const r = await sendLeadWelcome(c, { id: lead.id, name: lead.name, phone });
  const ok = r.status === 'sent';
  return c.json({ ok, ...r, error: ok ? undefined : describeWelcomeResult(r) }, ok ? 200 : 502);
});
