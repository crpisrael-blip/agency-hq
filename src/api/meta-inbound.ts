/* =========================================================================
 * אינטגרציית Meta נכנסת — פתיחת לידים אוטומטית משני מקורות דרך webhook אחד:
 *   1. WhatsApp Cloud API  → הודעה נכנסת מלקוח פותחת ליד (object=whatsapp_business_account)
 *   2. Facebook Lead Ads   → מילוי טופס לידים בעמוד פותח ליד (object=page, field=leadgen)
 *
 * אותה אפליקציית Meta מזינה את שני המוצרים; Meta שולחת שדה object שמבדיל ביניהם.
 * ה-webhook ציבורי (Meta קוראת לו), עם אימות: verify_token ב-GET וחתימת App Secret
 * (X-Hub-Signature-256) ב-POST. ההגדרות בטבלת settings, נערכות במסך מוגן.
 * ========================================================================= */
import { Hono } from 'hono';
import { desc, eq, inArray } from 'drizzle-orm';
import { leads, leadActivities, settings } from '../db/schema';
import { Env, db, uid, now, notifyTelegram } from './util';
import { normalizeILPhone, META_GRAPH_URL } from './whatsapp';

/** מפתחות ההגדרות (טבלת settings) */
const IN_KEYS = ['meta_verify_token', 'meta_app_secret', 'fb_page_token', 'meta_wa_inbound_enabled', 'meta_fb_leads_enabled'] as const;
const SECRET = new Set(['meta_verify_token', 'meta_app_secret', 'fb_page_token']);
const short = (v: unknown) => String(v ?? '').slice(0, 200);
const mask = (v: string) => (v ? '••••' + v.slice(-4) : '');
const on = (v: string | undefined, dflt = true) =>
  v === undefined || v === null || v === '' ? dflt : !(v === '0' || v.toLowerCase() === 'false' || v.toLowerCase() === 'off');

/** קורא מפה של מפתחות מטבלת settings */
async function settingsMap(c: any, keys: readonly string[]): Promise<Record<string, string>> {
  const rows = await db(c).select().from(settings).where(inArray(settings.key, keys as string[])).all().catch(() => []);
  return Object.fromEntries(rows.map((r: any) => [r.key, r.value]));
}

/** השוואת מחרוזות בזמן קבוע (למניעת timing attack על החתימה) */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** אימות חתימת Meta (HMAC-SHA256 עם App Secret על גוף הבקשה הגולמי) */
async function verifyMetaSignature(appSecret: string, rawBody: string, header: string): Promise<boolean> {
  if (!appSecret) return true; // לא הוגדר App Secret — לא אוכפים (מומלץ להגדיר; ראה מדריך)
  if (!header || !header.startsWith('sha256=')) return false;
  const expected = header.slice(7).trim().toLowerCase();
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqual(hex, expected);
}

/** חילוץ טקסט קריא מהודעת ווטסאפ נכנסת (לפי סוג ההודעה) */
function waMessageText(m: any): string {
  switch (m?.type) {
    case 'text': return m.text?.body || '';
    case 'button': return m.button?.text || '';
    case 'interactive':
      return m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '(בחירה)';
    case 'image': return m.image?.caption ? `🖼️ ${m.image.caption}` : '🖼️ תמונה';
    case 'document': return m.document?.caption ? `📎 ${m.document.caption}` : `📎 ${m.document?.filename || 'קובץ'}`;
    case 'audio': return '🎤 הודעה קולית';
    case 'video': return m.video?.caption ? `🎬 ${m.video.caption}` : '🎬 וידאו';
    case 'location': return '📍 מיקום';
    case 'contacts': return '👤 איש קשר';
    default: return m?.type ? `(${m.type})` : '';
  }
}

/**
 * פותח ליד נכנס עם סינון כפילויות: אם קיים כבר ליד "פתוח" (חדש/בטיפול/מוסמך) עם אותו
 * טלפון — לא נפתח ליד חדש, אלא נוסיף את ההודעה כפעילות ליומן הליד הקיים. כך שיחה מתמשכת
 * לא מייצרת ליד על כל הודעה. מחזיר את מזהה הליד ואם נוצר חדש.
 */
async function createInboundLead(
  c: any,
  input: { name?: string | null; phone?: string | null; note?: string | null; source: string },
): Promise<{ leadId: string; created: boolean }> {
  const d = db(c);
  const rawPhone = input.phone ? String(input.phone).slice(0, 40) : null;
  const norm = normalizeILPhone(rawPhone);
  const name = input.name ? String(input.name).slice(0, 120) : null;
  const note = input.note ? String(input.note).slice(0, 300) : null;

  if (norm) {
    const OPEN = ['new', 'contacted', 'qualified'];
    const recent = await d.select().from(leads).orderBy(desc(leads.createdAt)).limit(500).all().catch(() => []);
    const existing = recent.find(
      (l: any) => l.phone && normalizeILPhone(l.phone) === norm && OPEN.includes(l.status || 'new'),
    );
    if (existing) {
      await d.insert(leadActivities).values({
        id: uid(), leadId: existing.id,
        kind: input.source === 'facebook' ? 'note' : 'whatsapp',
        text: (input.source === 'facebook' ? '📩 ' : '💬 ') + (note || '(הודעה נכנסת)'),
        createdAt: now(),
      }).catch(() => {});
      return { leadId: existing.id, created: false };
    }
  }

  const id = uid();
  await d.insert(leads).values({
    id, systemId: null, clientId: null, source: input.source,
    name, phone: rawPhone, note, status: 'new', createdAt: now(),
  });
  // התראת טלגרם למנהל (best-effort) — רק על ליד חדש
  const tg = await settingsMap(c, ['telegram_bot_token', 'telegram_chat_id']);
  const token = tg['telegram_bot_token'] || c.env.TELEGRAM_BOT_TOKEN;
  const chats = tg['telegram_chat_id'] || c.env.TELEGRAM_CHAT_ID;
  const label = input.source === 'facebook' ? '📘 ליד חדש מפייסבוק' : '💬 ליד חדש מווטסאפ';
  await notifyTelegram(token, chats, `${label}\n\n${name ? `👤 ${name}\n` : ''}${rawPhone ? `📞 ${rawPhone}\n` : ''}${note ? `${note}\n` : ''}🕐 ${new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' }).format(new Date())}`).catch(() => {});
  return { leadId: id, created: true };
}

/** WhatsApp Cloud API: הודעות נכנסות → לידים */
async function handleWhatsAppInbound(c: any, body: any): Promise<void> {
  for (const entry of body.entry || []) {
    for (const ch of entry.changes || []) {
      const v = ch.value || {};
      const nameByWa: Record<string, string> = {};
      for (const ct of v.contacts || []) if (ct.wa_id) nameByWa[ct.wa_id] = ct.profile?.name || '';
      for (const m of v.messages || []) {          // messages = נכנסות; statuses (קבלות) בשדה אחר ומדולגות
        const wa = m?.from ? String(m.from) : '';
        if (!wa) continue;
        await createInboundLead(c, { name: nameByWa[wa] || null, phone: wa, note: waMessageText(m), source: 'whatsapp' });
      }
    }
  }
}

/** Facebook Lead Ads: מילוי טופס → ליד (מושכים את הפרטים מ-Graph API עם Page Token) */
async function handleLeadgen(c: any, body: any, pageToken: string): Promise<void> {
  for (const entry of body.entry || []) {
    for (const ch of entry.changes || []) {
      if (ch.field !== 'leadgen') continue;
      const lg = ch.value || {};
      const leadgenId = lg.leadgen_id;
      if (!leadgenId) continue;
      let name: string | null = null, phone: string | null = null, email: string | null = null;
      const extra: string[] = [];
      if (pageToken) {
        try {
          const r = await fetch(`${META_GRAPH_URL}/${leadgenId}?access_token=${encodeURIComponent(pageToken)}`);
          const data: any = await r.json().catch(() => ({}));
          for (const f of data.field_data || []) {
            const key = String(f.name || '').toLowerCase();
            const val = (f.values && f.values[0]) || '';
            if (!val) continue;
            if (!name && /(full[_\s]?name|^name|שם)/.test(key)) name = val;
            else if (!phone && /(phone|mobile|טלפון|נייד|מספר)/.test(key)) phone = val;
            else if (!email && /(email|מייל|דוא)/.test(key)) email = val;
            else extra.push(`${f.name}: ${val}`);
          }
        } catch { /* best-effort */ }
      }
      const note = ['ליד מטופס פייסבוק', email ? `מייל: ${email}` : '', ...extra].filter(Boolean).join(' · ');
      await createInboundLead(c, { name, phone, note, source: 'facebook' });
    }
  }
}

/* ------------------------------------------------------------------------
 * webhook ציבורי — Meta קוראת לו
 * ---------------------------------------------------------------------- */
export const metaWebhookApp = new Hono<Env>();

// אימות ה-webhook בהגדרה (Meta שולחת GET עם hub.challenge)
metaWebhookApp.get('/', async (c) => {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge') || '';
  const want = (await settingsMap(c, ['meta_verify_token']))['meta_verify_token'] || '';
  if (mode === 'subscribe' && want && token === want) return c.text(challenge, 200);
  return c.text('forbidden', 403);
});

// אירועים נכנסים
metaWebhookApp.post('/', async (c) => {
  const raw = await c.req.text();
  const cfg = await settingsMap(c, ['meta_app_secret', 'meta_wa_inbound_enabled', 'meta_fb_leads_enabled', 'fb_page_token']);
  const okSig = await verifyMetaSignature(cfg['meta_app_secret'] || '', raw, c.req.header('x-hub-signature-256') || '');
  if (!okSig) return c.json({ error: 'bad_signature' }, 401);
  let body: any;
  try { body = JSON.parse(raw); } catch { return c.json({ ok: true }); }

  const work = (async () => {
    try {
      if (body.object === 'whatsapp_business_account' && on(cfg['meta_wa_inbound_enabled'])) {
        await handleWhatsAppInbound(c, body);
      } else if (body.object === 'page' && on(cfg['meta_fb_leads_enabled'])) {
        await handleLeadgen(c, body, cfg['fb_page_token'] || '');
      }
    } catch { /* best-effort — לעולם לא שוברים 200 ל-Meta */ }
  })();
  if (c.executionCtx?.waitUntil) c.executionCtx.waitUntil(work); else await work;
  return c.json({ ok: true });
});

/* ------------------------------------------------------------------------
 * API מוגן (מנהל) — הגדרות האינטגרציה
 * ---------------------------------------------------------------------- */
export const integrationsAdminApp = new Hono<Env>();

integrationsAdminApp.get('/settings', async (c) => {
  const m = await settingsMap(c, IN_KEYS);
  const origin = new URL(c.req.url).origin;
  const out: Record<string, unknown> = {
    callbackUrl: `${origin}/api/meta`,
    waInboundEnabled: on(m['meta_wa_inbound_enabled']),
    fbLeadsEnabled: on(m['meta_fb_leads_enabled']),
  };
  for (const k of IN_KEYS) {
    if (k === 'meta_wa_inbound_enabled' || k === 'meta_fb_leads_enabled') continue;
    out[k] = SECRET.has(k) ? mask(m[k] || '') : (m[k] || '');
    out[`${k}Set`] = !!m[k];
  }
  return c.json(out);
});

integrationsAdminApp.put('/settings', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const d = db(c);
  const changed: string[] = [];
  for (const k of IN_KEYS) {
    if (!(k in body)) continue;
    const raw = body[k];
    if (raw === null) { await d.delete(settings).where(eq(settings.key, k)); changed.push(k); continue; }
    let v = String(raw ?? '');
    if (k === 'meta_wa_inbound_enabled' || k === 'meta_fb_leads_enabled') v = on(v) ? '1' : '0';
    if (SECRET.has(k) && (!v.trim() || v.startsWith('••••'))) continue; // סוד ריק/מוסתר — לא משנים
    await d.insert(settings).values({ key: k, value: v }).onConflictDoUpdate({ target: settings.key, set: { value: v } });
    changed.push(k);
  }
  return c.json({ ok: true, changed });
});

/** בדיקת חיבור: תקינות ה-Page Token מול Graph API */
integrationsAdminApp.get('/status', async (c) => {
  const m = await settingsMap(c, IN_KEYS);
  const res: Record<string, unknown> = {
    verifyTokenSet: !!m['meta_verify_token'],
    appSecretSet: !!m['meta_app_secret'],
    pageTokenSet: !!m['fb_page_token'],
    waInboundEnabled: on(m['meta_wa_inbound_enabled']),
    fbLeadsEnabled: on(m['meta_fb_leads_enabled']),
  };
  if (m['fb_page_token']) {
    try {
      const r = await fetch(`${META_GRAPH_URL}/me?fields=id,name&access_token=${encodeURIComponent(m['fb_page_token'])}`);
      const data: any = await r.json().catch(() => ({}));
      res.page = r.ok ? { id: data.id, name: data.name } : null;
      res.pageError = r.ok ? '' : short(data?.error?.message || JSON.stringify(data));
    } catch (e) { res.pageError = short((e as Error)?.message || e); }
  }
  return c.json(res);
});
