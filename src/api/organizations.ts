import { Hono } from 'hono';
import { desc, eq, and } from 'drizzle-orm';
import {
  clients, contacts, opportunities, projects, engagements,
  systems, documents, activities, profitCenters,
} from '../db/schema';
import { Env, db, uid, now, pick, num } from './util';
import { engagementMonthly } from './engagements';

/**
 * Organizations = שכבת BOS מעל טבלת clients (מקור אמת יחיד, ללא שכפול נתונים).
 * הארגון אינו מחזיק שלב מכירה — שלב המכירה חי ב-opportunities בלבד.
 * הערה: clients.stage נשאר כ-legacy ואינו נחשף/נכתב מכאן.
 */
export const organizationsApp = new Hono<Env>();

// שדות ארגון מותרים (ללא stage!)
const ORG_FIELDS = ['name', 'industry', 'size', 'website', 'status', 'health', 'tags', 'notes'];
const CONTACT_FIELDS = ['name', 'role', 'phone', 'whatsapp', 'email', 'isDecisionMaker', 'isPrimary', 'notes'];

/** נרמול סטטוס legacy → אוצר מילים BOS (לתצוגה בלבד) */
function normStatus(s: string | null): string {
  if (s === 'active') return 'customer';
  if (s === 'churned') return 'former_customer';
  return s || 'prospect';
}

// רשימת ארגונים + סיכומים עסקיים
organizationsApp.get('/', async (c) => {
  const d = db(c);
  const [orgs, allOpps, allProjects, allEng] = await Promise.all([
    d.select().from(clients).orderBy(desc(clients.createdAt)).all(),
    d.select().from(opportunities).all(),
    d.select().from(projects).all(),
    d.select().from(engagements).all(),
  ]);
  const out = orgs.map((o) => {
    const opps = allOpps.filter((x) => x.organizationId === o.id);
    const openOpps = opps.filter((x) => !['won', 'lost'].includes(x.stage));
    const projs = allProjects.filter((x) => x.organizationId === o.id);
    const activeProjects = projs.filter((x) => !['completed', 'paused'].includes(x.status));
    const mrr = allEng
      .filter((e) => e.clientId === o.id && e.status === 'active')
      .reduce((a, e) => a + engagementMonthly(e), 0);
    return {
      ...o,
      status: normStatus(o.status),
      openOpportunities: openOpps.length,
      activeProjects: activeProjects.length,
      mrr,
    };
  });
  return c.json(out);
});

organizationsApp.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  if (!body.name) return c.json({ error: 'invalid_input' }, 400);
  const id = uid();
  await db(c).insert(clients).values({
    id, ...pick(body, ORG_FIELDS), name: String(body.name), createdAt: now(), updatedAt: now(),
  } as any);
  return c.json({ ok: true, id });
});

// כרטיס ארגון 360
organizationsApp.get('/:id', async (c) => {
  const id = c.req.param('id');
  const d = db(c);
  const org = (await d.select().from(clients).where(eq(clients.id, id)).limit(1))[0];
  if (!org) return c.json({ error: 'not_found' }, 404);
  const [cts, opps, projs, eng, sys, docs, acts] = await Promise.all([
    d.select().from(contacts).where(eq(contacts.organizationId, id)).orderBy(desc(contacts.isPrimary)).all(),
    d.select().from(opportunities).where(eq(opportunities.organizationId, id)).orderBy(desc(opportunities.createdAt)).all(),
    d.select().from(projects).where(eq(projects.organizationId, id)).orderBy(desc(projects.createdAt)).all(),
    d.select().from(engagements).where(eq(engagements.clientId, id)).orderBy(desc(engagements.createdAt)).all(),
    d.select().from(systems).where(eq(systems.clientId, id)).all(),
    d.select().from(documents).where(eq(documents.clientId, id)).orderBy(desc(documents.pinned), desc(documents.createdAt)).all(),
    d.select().from(activities).where(eq(activities.organizationId, id)).orderBy(desc(activities.occurredAt)).limit(50).all(),
  ]);
  const growth = await d.select().from(profitCenters).where(eq(profitCenters.clientId, id)).all();
  const mrr = eng.filter((e) => e.status === 'active').reduce((a, e) => a + engagementMonthly(e), 0);
  return c.json({
    organization: { ...org, status: normStatus(org.status) },
    contacts: cts, opportunities: opps, projects: projs, engagements: eng,
    systems: sys, documents: docs, activities: acts, growth, mrr,
  });
});

organizationsApp.patch('/:id', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const data = pick(body, ORG_FIELDS);
  if (Object.keys(data).length) {
    (data as any).updatedAt = now();
    await db(c).update(clients).set(data as any).where(eq(clients.id, c.req.param('id')));
  }
  return c.json({ ok: true });
});

organizationsApp.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const d = db(c);
  const sys = await d.select().from(systems).where(eq(systems.clientId, id)).all();
  if (sys.length) return c.json({ error: 'has_systems' }, 409);
  const eng = await d.select().from(engagements).where(eq(engagements.clientId, id)).all();
  if (eng.length) return c.json({ error: 'has_engagements' }, 409);
  const opps = await d.select().from(opportunities).where(eq(opportunities.organizationId, id)).all();
  if (opps.length) return c.json({ error: 'has_opportunities' }, 409);
  await d.delete(clients).where(eq(clients.id, id));
  return c.json({ ok: true });
});

/* ---- אנשי קשר ---- */
organizationsApp.post('/:id/contacts', async (c) => {
  const orgId = c.req.param('id');
  const body = await c.req.json().catch(() => ({} as any));
  if (!body.name) return c.json({ error: 'invalid_input' }, 400);
  const id = uid();
  await db(c).insert(contacts).values({
    id, organizationId: orgId, ...pick(body, CONTACT_FIELDS),
    name: String(body.name), createdAt: now(), updatedAt: now(),
  } as any);
  return c.json({ ok: true, id });
});

organizationsApp.patch('/:id/contacts/:cid', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const data = pick(body, CONTACT_FIELDS);
  if (Object.keys(data).length) {
    (data as any).updatedAt = now();
    await db(c).update(contacts)
      .set(data as any)
      .where(and(eq(contacts.id, c.req.param('cid')), eq(contacts.organizationId, c.req.param('id'))));
  }
  return c.json({ ok: true });
});

organizationsApp.delete('/:id/contacts/:cid', async (c) => {
  await db(c).delete(contacts)
    .where(and(eq(contacts.id, c.req.param('cid')), eq(contacts.organizationId, c.req.param('id'))));
  return c.json({ ok: true });
});
