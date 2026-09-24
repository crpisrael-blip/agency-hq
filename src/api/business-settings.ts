import { Hono, Context } from 'hono';
import { inArray, eq } from 'drizzle-orm';
import { settings } from '../db/schema';
import { Env, db } from './util';
import { RECEIPT_COUNTER_KEY, ORDER_COUNTER_KEY, readCounterForDisplay } from './doc-numbering';

/**
 * הגדרות עסק — פרטי הזהות שמסמכי הצעה/הזמנה/קבלה שואבים מהם (מסך: ⚙️ הגדרות →
 * פרטי עסק). נשמרים בטבלת settings הכללית, באותו דפוס כמו whatsapp.ts — מפתח
 * settings ↔ נפילה חזרה למשתנה סביבה. בלי SECRET_KEYS: שום שדה כאן אינו credential.
 */
const BUSINESS_KEYS = {
  businessName: ['business_name', 'BUSINESS_NAME'],
  businessTaxId: ['business_tax_id', 'BUSINESS_TAX_ID'], // מספר עוסק (ע.מ / ח.פ)
  businessAddress: ['business_address', 'BUSINESS_ADDRESS'],
  businessPhone: ['business_phone', 'BUSINESS_PHONE'],
  businessEmail: ['business_email', 'BUSINESS_EMAIL'],
  businessWebsite: ['business_website', 'BUSINESS_WEBSITE'],
  businessLogoUrl: ['business_logo_url', 'BUSINESS_LOGO_URL'],
  issuerName: ['business_issuer_name', 'BUSINESS_ISSUER_NAME'], // שם המנפיק / חתימה
} as const;
type CfgKey = keyof typeof BUSINESS_KEYS;

export type BusinessConfig = Record<CfgKey, string>;

/** קריאת הגדרות העסק: קודם settings (D1), אחרת env. */
export async function loadBusinessConfig(c: Context<Env>): Promise<BusinessConfig> {
  const keys = (Object.keys(BUSINESS_KEYS) as CfgKey[]).map((k) => BUSINESS_KEYS[k][0]);
  const rows = await db(c)
    .select()
    .from(settings)
    .where(inArray(settings.key, keys))
    .all()
    .catch(() => [] as { key: string; value: string }[]);
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const env = c.env as unknown as Record<string, string | undefined>;
  const out: any = {};
  for (const k of Object.keys(BUSINESS_KEYS) as CfgKey[]) {
    const [sKey, eKey] = BUSINESS_KEYS[k];
    out[k] = (map[sKey] ?? '').trim() || (env[eKey] ?? '').trim();
  }
  return out as BusinessConfig;
}

/** האם פרטי העסק מספיקים כדי להפיק קבלה חוקית (מספר עוסק + כתובת) */
export function isBusinessComplete(cfg: Pick<BusinessConfig, 'businessName' | 'businessTaxId' | 'businessAddress'>): boolean {
  return !!(cfg.businessName && cfg.businessTaxId && cfg.businessAddress);
}

export const businessSettingsApp = new Hono<Env>();

businessSettingsApp.get('/', async (c) => {
  const cfg = await loadBusinessConfig(c);
  const [nextReceiptNo, nextOrderNo] = await Promise.all([
    readCounterForDisplay(c.env.DB, RECEIPT_COUNTER_KEY),
    readCounterForDisplay(c.env.DB, ORDER_COUNTER_KEY),
  ]);
  return c.json({ ...cfg, complete: isBusinessComplete(cfg), nextReceiptNo, nextOrderNo });
});

businessSettingsApp.put('/', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const d = db(c);
  const changed: string[] = [];
  for (const k of Object.keys(BUSINESS_KEYS) as CfgKey[]) {
    if (!(k in body)) continue;
    const sKey = BUSINESS_KEYS[k][0];
    const v = String(body[k] ?? '').trim();
    if (!v) {
      await d.delete(settings).where(eq(settings.key, sKey));
      changed.push(k);
      continue;
    }
    await d.insert(settings).values({ key: sKey, value: v }).onConflictDoUpdate({ target: settings.key, set: { value: v } });
    changed.push(k);
  }
  const cfg = await loadBusinessConfig(c);
  return c.json({ ok: true, changed, complete: isBusinessComplete(cfg) });
});
