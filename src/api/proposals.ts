import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { proposals, opportunities, engagements } from '../db/schema';
import { Env, db, uid, now, pick, num, logActivity, logStatusChange } from './util';

/**
 * הצעות — מופרדות מהתקשרות, מגורסות. אסור לדרוס גרסה קודמת:
 * שינוי מהותי נעשה דרך "גרסה חדשה" (revise) שמעתיקה את התוכן ל-version+1.
 */
export const proposalsApp = new Hono<Env>();

const PROP_FIELDS = [
  'oneTimeValue', 'monthlyValue', 'validUntil', 'scopeIncluded', 'scopeExcluded',
  'assumptions', 'dependencies', 'notes',
];
const STATUS_TS: Record<string, string> = { sent: 'sentAt', accepted: 'acceptedAt', rejected: 'rejectedAt' };

// רשימה — ?status=sent להצעות ממתינות, ?opportunityId= לסינון
proposalsApp.get('/', async (c) => {
  const d = db(c);
  const status = c.req.query('status');
  const oppId = c.req.query('opportunityId');
  const [rows, opps] = await Promise.all([
    d.select().from(proposals).orderBy(desc(proposals.createdAt)).all(),
    d.select().from(opportunities).all(),
  ]);
  let out = rows.map((p) => {
    const opp = opps.find((o) => o.id === p.opportunityId);
    return { ...p, opportunityTitle: opp?.title || '—', organizationId: opp?.organizationId || null };
  });
  if (status) out = out.filter((p) => p.status === status);
  if (oppId) out = out.filter((p) => p.opportunityId === oppId);
  return c.json(out);
});

proposalsApp.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  if (!body.opportunityId) return c.json({ error: 'invalid_input' }, 400);
  const d = db(c);
  const existing = await d.select().from(proposals).where(eq(proposals.opportunityId, String(body.opportunityId))).all();
  const version = existing.reduce((m, p) => Math.max(m, num(p.version)), 0) + 1;
  const id = uid();
  await d.insert(proposals).values({
    id, opportunityId: String(body.opportunityId), version, status: 'draft',
    ...pick(body, PROP_FIELDS), createdAt: now(),
  } as any);
  const opp = (await d.select().from(opportunities).where(eq(opportunities.id, String(body.opportunityId))).limit(1))[0];
  await logActivity(d, {
    entityType: 'opportunity', entityId: String(body.opportunityId), organizationId: opp?.organizationId || null,
    type: 'document', title: `נוצרה הצעה — גרסה ${version}`,
  });
  return c.json({ ok: true, id, version });
});

proposalsApp.get('/:id', async (c) => {
  const p = (await db(c).select().from(proposals).where(eq(proposals.id, c.req.param('id'))).limit(1))[0];
  if (!p) return c.json({ error: 'not_found' }, 404);
  return c.json(p);
});

// עריכת תוכן טיוטה בלבד. שינוי בהצעה שנשלחה → צור גרסה חדשה (revise).
proposalsApp.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const d = db(c);
  const cur = (await d.select().from(proposals).where(eq(proposals.id, id)).limit(1))[0];
  if (!cur) return c.json({ error: 'not_found' }, 404);
  if (cur.status !== 'draft') return c.json({ error: 'locked_create_new_version' }, 409);
  const data = pick(await c.req.json().catch(() => ({})), PROP_FIELDS);
  if (Object.keys(data).length) await d.update(proposals).set(data as any).where(eq(proposals.id, id));
  return c.json({ ok: true });
});

// שינוי סטטוס (draft→sent→viewed→discussion→accepted/rejected/expired) + חותמות זמן + Audit
proposalsApp.patch('/:id/status', async (c) => {
  const id = c.req.param('id');
  const d = db(c);
  const cur = (await d.select().from(proposals).where(eq(proposals.id, id)).limit(1))[0];
  if (!cur) return c.json({ error: 'not_found' }, 404);
  const body = await c.req.json().catch(() => ({} as any));
  const next = String(body.status || '');
  const valid = ['draft', 'sent', 'viewed', 'discussion', 'accepted', 'rejected', 'expired'];
  if (!valid.includes(next)) return c.json({ error: 'invalid_status' }, 400);
  const data: any = { status: next };
  const tsField = STATUS_TS[next];
  if (tsField && !(cur as any)[tsField]) data[tsField] = now();
  await d.update(proposals).set(data).where(eq(proposals.id, id));
  const opp = (await d.select().from(opportunities).where(eq(opportunities.id, cur.opportunityId)).limit(1))[0];
  await logStatusChange(d, 'proposal', id, opp?.organizationId || null, `הצעה v${cur.version}`, cur.status, next);
  return c.json({ ok: true });
});

// גרסה חדשה — מעתיקה תוכן קיים ל-version+1 בסטטוס draft (לא דורס)
proposalsApp.post('/:id/revise', async (c) => {
  const id = c.req.param('id');
  const d = db(c);
  const cur = (await d.select().from(proposals).where(eq(proposals.id, id)).limit(1))[0];
  if (!cur) return c.json({ error: 'not_found' }, 404);
  const existing = await d.select().from(proposals).where(eq(proposals.opportunityId, cur.opportunityId)).all();
  const version = existing.reduce((m, p) => Math.max(m, num(p.version)), 0) + 1;
  const nid = uid();
  await d.insert(proposals).values({
    id: nid, opportunityId: cur.opportunityId, version, status: 'draft',
    oneTimeValue: cur.oneTimeValue, monthlyValue: cur.monthlyValue, validUntil: cur.validUntil,
    scopeIncluded: cur.scopeIncluded, scopeExcluded: cur.scopeExcluded, assumptions: cur.assumptions,
    dependencies: cur.dependencies, notes: cur.notes, createdAt: now(),
  } as any);
  return c.json({ ok: true, id: nid, version });
});

// הצעה שאושרה → יצירת התקשרות (Engagement)
proposalsApp.post('/:id/create-engagement', async (c) => {
  const id = c.req.param('id');
  const d = db(c);
  const p = (await d.select().from(proposals).where(eq(proposals.id, id)).limit(1))[0];
  if (!p) return c.json({ error: 'not_found' }, 404);
  const opp = (await d.select().from(opportunities).where(eq(opportunities.id, p.opportunityId)).limit(1))[0];
  if (!opp) return c.json({ error: 'no_opportunity' }, 400);
  const body = await c.req.json().catch(() => ({} as any));
  const eid = uid();
  await d.insert(engagements).values({
    id: eid,
    clientId: opp.organizationId,
    title: String(body.title || opp.title),
    model: num(p.monthlyValue) > 0 ? 'retainer' : 'one_time',
    status: 'active',
    setupFee: num(p.oneTimeValue),
    monthlyFee: num(p.monthlyValue),
    opportunityId: opp.id,
    proposalId: id,
    projectId: body.projectId || null,
    createdAt: now(),
  } as any);
  await logActivity(d, {
    entityType: 'engagement', entityId: eid, organizationId: opp.organizationId,
    type: 'automation', title: 'התקשרות נוצרה מהצעה שאושרה', content: opp.title,
    metadata: { proposalId: id, opportunityId: opp.id },
  });
  return c.json({ ok: true, id: eid });
});
