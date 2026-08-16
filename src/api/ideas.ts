import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { profitCenters, clients } from '../db/schema';
import { Env, db, uid, now, pick, num } from './util';

export const ideasApp = new Hono<Env>();

const FIELDS = ['clientId', 'title', 'description', 'model', 'potentialMonthly', 'potentialOneTime', 'effort', 'confidence', 'status', 'notes'];
const NUM_FIELDS = ['potentialMonthly', 'potentialOneTime', 'confidence'];

ideasApp.get('/', async (c) => {
  const d = db(c);
  const rows = await d.select().from(profitCenters).orderBy(desc(profitCenters.createdAt)).all();
  const cls = await d.select().from(clients).all();
  return c.json(rows.map((r) => ({
    ...r,
    clientName: cls.find((cl) => cl.id === r.clientId)?.name || null,
    // ערך משוקלל = פוטנציאל חודשי × סבירות
    weighted: num(r.potentialMonthly) * (num(r.confidence) / 100),
  })));
});

ideasApp.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  if (!body.title) return c.json({ error: 'invalid_input' }, 400);
  const data: any = pick(body, FIELDS);
  for (const f of NUM_FIELDS) if (data[f] !== undefined) data[f] = num(data[f]);
  const id = uid();
  await db(c).insert(profitCenters).values({ id, ...data, title: String(body.title), createdAt: now() } as any);
  return c.json({ ok: true, id });
});

/**
 * רעיונות מרכזי-רווח מוכנים — שירותים "פרודוקטיביים" שאפשר למכור לכמה לקוחות:
 * אינטגרציות וחיבורי קמפיינים. אידמפוטנטי (מזהים קבועים), לא דורס עריכות.
 */
const SEED_IDEAS = [
  { id: 'pc_leads_social', title: 'חיבור לידים מרשתות חברתיות למערכת', model: 'הקמה + ריטיינר', potentialOneTime: 2500, potentialMonthly: 300, effort: 'medium', confidence: 70, description: 'כל ליד ממודעה נכנס אוטומטית למערכת עם מקור הקמפיין — בלי הקלדה ובלי לידים שהולכים לאיבוד.' },
  { id: 'pc_roi_capi', title: 'מדידת ROI לקמפיינים (Pixel + CAPI)', model: 'הקמה + ריטיינר', potentialOneTime: 3000, potentialMonthly: 250, effort: 'medium', confidence: 65, description: 'סגירת הלולאה: חיבור הוצאת הפרסום ללקוח משלם במערכת. הלקוח רואה ROI אמיתי, והאלגוריתם לומד להביא לקוחות.' },
  { id: 'pc_audiences', title: 'קהלים חכמים (רימרקטינג + קהל דומה)', model: 'הקמה', potentialOneTime: 1500, potentialMonthly: 200, effort: 'low', confidence: 60, description: 'סנכרון רשימת לקוחות (מגובב, בהסכמה) לפרסום ממוקד ולקהלים דומים.' },
  { id: 'pc_accounting', title: 'אינטגרציית הנה"ח / חשבוניות', model: 'הקמה + ריטיינר', potentialOneTime: 2500, potentialMonthly: 150, effort: 'medium', confidence: 70, description: 'הפקת חשבוניות אוטומטית בתוכנת הנה"ח של הלקוח (Morning/iCount/ריווחית).' },
  { id: 'pc_payments', title: 'אינטגרציית סליקה ותשלומים', model: 'הקמה + ריטיינר', potentialOneTime: 3000, potentialMonthly: 200, effort: 'high', confidence: 60, description: 'גבייה ותשלומים מתוך המערכת (Cardcom/Tranzila/PayPlus) עם עדכון סטטוס אוטומטי.' },
  { id: 'pc_whatsapp', title: 'אוטומציית וואטסאפ ותזכורות', model: 'הקמה + ריטיינר', potentialOneTime: 1800, potentialMonthly: 250, effort: 'medium', confidence: 75, description: 'הודעות ותזכורות אוטומטיות בוואטסאפ עסקי — אישורי תור, מעקב, ושיווק חוזר.' },
];

ideasApp.post('/seed', async (c) => {
  const d = db(c);
  const existing = await d.select({ id: profitCenters.id }).from(profitCenters).all();
  const have = new Set(existing.map((r) => r.id));
  const missing = SEED_IDEAS.filter((i) => !have.has(i.id));
  const t = now();
  for (const i of missing) {
    await d.insert(profitCenters).values({ ...i, clientId: null, status: 'idea', createdAt: t } as any);
  }
  return c.json({ ok: true, added: missing.length });
});

ideasApp.patch('/:id', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const data: any = pick(body, FIELDS);
  for (const f of NUM_FIELDS) if (data[f] !== undefined) data[f] = num(data[f]);
  if (Object.keys(data).length) await db(c).update(profitCenters).set(data).where(eq(profitCenters.id, c.req.param('id')));
  return c.json({ ok: true });
});

ideasApp.delete('/:id', async (c) => {
  await db(c).delete(profitCenters).where(eq(profitCenters.id, c.req.param('id')));
  return c.json({ ok: true });
});
