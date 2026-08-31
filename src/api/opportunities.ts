import { Hono } from 'hono';
import { desc, eq, and } from 'drizzle-orm';
import {
  opportunities, opportunityPains, opportunitySolutions, proposals,
  projects, clients, profitCenters,
} from '../db/schema';
import { Env, db, uid, now, pick, num, logActivity, logStatusChange } from './util';

export const opportunitiesApp = new Hono<Env>();

const OPP_FIELDS = [
  'organizationId', 'title', 'description', 'stage', 'serviceType', 'estimatedValue',
  'recurringValue', 'probability', 'expectedCloseDate', 'urgency', 'fit', 'owner',
  'decisionMakerContactId', 'nextAction', 'nextActionDate', 'lostReason', 'lostNotes',
];
const PAIN_FIELDS = ['title', 'description', 'impact', 'impactType', 'severity', 'estimatedCost', 'notes'];
const SOL_FIELDS = ['painId', 'title', 'description', 'solutionType', 'expectedOutcome', 'notes'];

const ACTIVE_STAGES = ['discovery', 'diagnosis', 'solution', 'proposal', 'negotiation', 'decision'];

// רשימת הזדמנויות (הצינור). ?scope=active מחזיר רק פעילות (ללא won/lost)
opportunitiesApp.get('/', async (c) => {
  const d = db(c);
  const scope = c.req.query('scope');
  const [rows, orgs] = await Promise.all([
    d.select().from(opportunities).orderBy(desc(opportunities.createdAt)).all(),
    d.select().from(clients).all(),
  ]);
  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name || '—';
  let out = rows.map((o) => ({ ...o, organizationName: orgName(o.organizationId), weighted: num(o.estimatedValue) * (num(o.probability) / 100) }));
  if (scope === 'active') out = out.filter((o) => ACTIVE_STAGES.includes(o.stage));
  return c.json(out);
});

opportunitiesApp.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  if (!body.organizationId || !body.title) return c.json({ error: 'invalid_input' }, 400);
  const id = uid();
  const d = db(c);
  await d.insert(opportunities).values({
    id, ...pick(body, OPP_FIELDS),
    organizationId: String(body.organizationId), title: String(body.title),
    createdAt: now(), updatedAt: now(),
  } as any);
  await logActivity(d, {
    entityType: 'opportunity', entityId: id, organizationId: String(body.organizationId),
    type: 'note', title: 'נוצרה הזדמנות חדשה', content: String(body.title),
  });
  return c.json({ ok: true, id });
});

// הזדמנות מלאה: כאבים, פתרונות, הצעות
opportunitiesApp.get('/:id', async (c) => {
  const id = c.req.param('id');
  const d = db(c);
  const opp = (await d.select().from(opportunities).where(eq(opportunities.id, id)).limit(1))[0];
  if (!opp) return c.json({ error: 'not_found' }, 404);
  const org = (await d.select().from(clients).where(eq(clients.id, opp.organizationId)).limit(1))[0];
  const [pains, sols, props, projs] = await Promise.all([
    d.select().from(opportunityPains).where(eq(opportunityPains.opportunityId, id)).orderBy(desc(opportunityPains.createdAt)).all(),
    d.select().from(opportunitySolutions).where(eq(opportunitySolutions.opportunityId, id)).orderBy(desc(opportunitySolutions.createdAt)).all(),
    d.select().from(proposals).where(eq(proposals.opportunityId, id)).orderBy(desc(proposals.version)).all(),
    d.select().from(projects).where(eq(projects.opportunityId, id)).all(),
  ]);
  return c.json({ opportunity: opp, organization: org || null, pains, solutions: sols, proposals: props, projects: projs });
});

opportunitiesApp.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const d = db(c);
  const body = await c.req.json().catch(() => ({} as any));
  const cur = (await d.select().from(opportunities).where(eq(opportunities.id, id)).limit(1))[0];
  if (!cur) return c.json({ error: 'not_found' }, 404);
  const data: any = pick(body, OPP_FIELDS);
  if (Object.keys(data).length === 0) return c.json({ ok: true });
  data.updatedAt = now();
  // מעבר שלב → תיעוד + חותמות זמן
  if (data.stage && data.stage !== cur.stage) {
    if (data.stage === 'won' && !cur.wonAt) data.wonAt = now();
    if (data.stage === 'lost' && !cur.lostAt) data.lostAt = now();
  }
  await d.update(opportunities).set(data).where(eq(opportunities.id, id));
  if (data.stage && data.stage !== cur.stage) {
    await logStatusChange(d, 'opportunity', id, cur.organizationId, 'שלב הזדמנות', cur.stage, data.stage);
  }
  return c.json({ ok: true });
});

opportunitiesApp.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const d = db(c);
  await d.delete(opportunityPains).where(eq(opportunityPains.opportunityId, id));
  await d.delete(opportunitySolutions).where(eq(opportunitySolutions.opportunityId, id));
  await d.delete(proposals).where(eq(proposals.opportunityId, id));
  await d.delete(opportunities).where(eq(opportunities.id, id));
  return c.json({ ok: true });
});

/* ---- כאבים ---- */
opportunitiesApp.post('/:id/pains', async (c) => {
  const oppId = c.req.param('id');
  const body = await c.req.json().catch(() => ({} as any));
  if (!body.title) return c.json({ error: 'invalid_input' }, 400);
  const id = uid();
  await db(c).insert(opportunityPains).values({ id, opportunityId: oppId, ...pick(body, PAIN_FIELDS), title: String(body.title), createdAt: now() } as any);
  return c.json({ ok: true, id });
});
opportunitiesApp.patch('/:id/pains/:pid', async (c) => {
  const data = pick(await c.req.json().catch(() => ({})), PAIN_FIELDS);
  if (Object.keys(data).length) await db(c).update(opportunityPains).set(data as any).where(eq(opportunityPains.id, c.req.param('pid')));
  return c.json({ ok: true });
});
opportunitiesApp.delete('/:id/pains/:pid', async (c) => {
  await db(c).delete(opportunityPains).where(eq(opportunityPains.id, c.req.param('pid')));
  return c.json({ ok: true });
});

/* ---- פתרונות ---- */
opportunitiesApp.post('/:id/solutions', async (c) => {
  const oppId = c.req.param('id');
  const body = await c.req.json().catch(() => ({} as any));
  if (!body.title) return c.json({ error: 'invalid_input' }, 400);
  const id = uid();
  await db(c).insert(opportunitySolutions).values({ id, opportunityId: oppId, ...pick(body, SOL_FIELDS), title: String(body.title), createdAt: now() } as any);
  return c.json({ ok: true, id });
});
opportunitiesApp.patch('/:id/solutions/:sid', async (c) => {
  const data = pick(await c.req.json().catch(() => ({})), SOL_FIELDS);
  if (Object.keys(data).length) await db(c).update(opportunitySolutions).set(data as any).where(eq(opportunitySolutions.id, c.req.param('sid')));
  return c.json({ ok: true });
});
opportunitiesApp.delete('/:id/solutions/:sid', async (c) => {
  await db(c).delete(opportunitySolutions).where(eq(opportunitySolutions.id, c.req.param('sid')));
  return c.json({ ok: true });
});

/* ---- המרה לפרויקט (Won → Create Project) ---- */
opportunitiesApp.post('/:id/convert-to-project', async (c) => {
  const id = c.req.param('id');
  const d = db(c);
  const opp = (await d.select().from(opportunities).where(eq(opportunities.id, id)).limit(1))[0];
  if (!opp) return c.json({ error: 'not_found' }, 404);
  const body = await c.req.json().catch(() => ({} as any));
  const pid = uid();
  await d.insert(projects).values({
    id: pid,
    organizationId: opp.organizationId,
    opportunityId: id,
    title: String(body.title || opp.title),
    type: opp.serviceType || null,
    status: 'kickoff', health: 'green', progress: 0,
    createdAt: now(), updatedAt: now(),
  } as any);
  // סימון ההזדמנות כנסגרה בהצלחה אם עדיין פעילה
  if (opp.stage !== 'won') {
    await d.update(opportunities).set({ stage: 'won', wonAt: opp.wonAt || now(), updatedAt: now() } as any).where(eq(opportunities.id, id));
    await logStatusChange(d, 'opportunity', id, opp.organizationId, 'שלב הזדמנות', opp.stage, 'won');
  }
  await logActivity(d, {
    entityType: 'project', entityId: pid, organizationId: opp.organizationId,
    type: 'automation', title: 'פרויקט נוצר מהזדמנות שנסגרה', content: opp.title,
    metadata: { opportunityId: id },
  });
  return c.json({ ok: true, projectId: pid });
});

/* ---- המרת מרכז רווח להזדמנות (Growth → Opportunity) ---- */
opportunitiesApp.post('/from-profit-center/:pcId', async (c) => {
  const pcId = c.req.param('pcId');
  const d = db(c);
  const pc = (await d.select().from(profitCenters).where(eq(profitCenters.id, pcId)).limit(1))[0];
  if (!pc) return c.json({ error: 'not_found' }, 404);
  if (!pc.clientId) return c.json({ error: 'no_organization' }, 400);
  const id = uid();
  await d.insert(opportunities).values({
    id,
    organizationId: pc.clientId,
    title: pc.title,
    description: pc.description || null,
    stage: 'discovery',
    serviceType: pc.model || null,
    estimatedValue: num(pc.potentialOneTime),
    recurringValue: num(pc.potentialMonthly),
    probability: num(pc.confidence, 20),
    createdAt: now(), updatedAt: now(),
  } as any);
  await d.update(profitCenters).set({ status: 'pitched' } as any).where(eq(profitCenters.id, pcId));
  await logActivity(d, {
    entityType: 'opportunity', entityId: id, organizationId: pc.clientId,
    type: 'automation', title: 'הזדמנות נוצרה ממרכז רווח', content: pc.title,
    metadata: { profitCenterId: pcId },
  });
  return c.json({ ok: true, id });
});
