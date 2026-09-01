import { Hono } from 'hono';
import { desc, eq, and } from 'drizzle-orm';
import {
  projects, milestones, changeRequests, clients, opportunities,
  systems, processes, engagements, documents, activities, tasks,
} from '../db/schema';
import { Env, db, uid, now, pick, num, logActivity, logStatusChange } from './util';
import { autolaunchForProjectStatus } from './autolaunch';

export const projectsApp = new Hono<Env>();

const PROJ_FIELDS = [
  'organizationId', 'opportunityId', 'title', 'type', 'status', 'health', 'progress',
  'startDate', 'targetDate', 'completedDate', 'nextAction', 'nextActionDate', 'notes',
];
const MS_FIELDS = ['title', 'owner', 'dueDate', 'status', 'deliverable', 'notes', 'sort'];
const CR_FIELDS = ['title', 'description', 'reason', 'scopeImpact', 'costImpact', 'timelineImpact', 'status'];

const ACTIVE_PROJECT = (s: string) => !['completed', 'paused'].includes(s);

// רשימת פרויקטים + שם ארגון + אבן דרך קרובה
projectsApp.get('/', async (c) => {
  const d = db(c);
  const [rows, orgs, allMs] = await Promise.all([
    d.select().from(projects).orderBy(desc(projects.createdAt)).all(),
    d.select().from(clients).all(),
    d.select().from(milestones).all(),
  ]);
  const out = rows.map((p) => {
    const nextMs = allMs
      .filter((m) => m.projectId === p.id && m.status !== 'done' && m.dueDate)
      .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))[0];
    return {
      ...p,
      organizationName: orgs.find((o) => o.id === p.organizationId)?.name || '—',
      nextMilestone: nextMs ? { title: nextMs.title, dueDate: nextMs.dueDate } : null,
    };
  });
  return c.json(out);
});

projectsApp.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  if (!body.organizationId || !body.title) return c.json({ error: 'invalid_input' }, 400);
  const id = uid();
  const d = db(c);
  await d.insert(projects).values({
    id, ...pick(body, PROJ_FIELDS),
    organizationId: String(body.organizationId), title: String(body.title),
    createdAt: now(), updatedAt: now(),
  } as any);
  await logActivity(d, {
    entityType: 'project', entityId: id, organizationId: String(body.organizationId),
    type: 'note', title: 'נוצר פרויקט חדש', content: String(body.title),
  });
  return c.json({ ok: true, id });
});

// פרויקט מלא (לכל ה-Tabs)
projectsApp.get('/:id', async (c) => {
  const id = c.req.param('id');
  const d = db(c);
  const p = (await d.select().from(projects).where(eq(projects.id, id)).limit(1))[0];
  if (!p) return c.json({ error: 'not_found' }, 404);
  const org = (await d.select().from(clients).where(eq(clients.id, p.organizationId)).limit(1))[0];
  const [ms, crs, sys, procs, eng, docs, acts, linkedTasks] = await Promise.all([
    d.select().from(milestones).where(eq(milestones.projectId, id)).orderBy(milestones.sort, milestones.createdAt).all(),
    d.select().from(changeRequests).where(eq(changeRequests.projectId, id)).orderBy(desc(changeRequests.createdAt)).all(),
    d.select().from(systems).where(eq(systems.projectId, id)).all(),
    d.select().from(processes).where(eq(processes.projectId, id)).all(),
    d.select().from(engagements).where(eq(engagements.projectId, id)).all(),
    d.select().from(documents).where(eq(documents.clientId, p.organizationId)).all(),
    d.select().from(activities).where(and(eq(activities.entityType, 'project'), eq(activities.entityId, id))).orderBy(desc(activities.occurredAt)).limit(50).all(),
    d.select().from(tasks).where(and(eq(tasks.entityType, 'project'), eq(tasks.entityId, id))).orderBy(desc(tasks.createdAt)).all(),
  ]);
  const opp = p.opportunityId ? (await d.select().from(opportunities).where(eq(opportunities.id, p.opportunityId)).limit(1))[0] : null;
  return c.json({ project: p, organization: org || null, opportunity: opp || null, milestones: ms, changeRequests: crs, systems: sys, processes: procs, engagements: eng, documents: docs, activities: acts, tasks: linkedTasks });
});

projectsApp.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const d = db(c);
  const cur = (await d.select().from(projects).where(eq(projects.id, id)).limit(1))[0];
  if (!cur) return c.json({ error: 'not_found' }, 404);
  const data: any = pick(await c.req.json().catch(() => ({})), PROJ_FIELDS);
  if (Object.keys(data).length === 0) return c.json({ ok: true });
  data.updatedAt = now();
  if (data.status === 'completed' && cur.status !== 'completed' && !cur.completedDate) {
    data.completedDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
  }
  await d.update(projects).set(data).where(eq(projects.id, id));
  if (data.status && data.status !== cur.status) {
    await logStatusChange(d, 'project', id, cur.organizationId, 'סטטוס פרויקט', cur.status, data.status);
    await autolaunchForProjectStatus(d, data.status, cur.organizationId);
  }
  return c.json({ ok: true });
});

projectsApp.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const d = db(c);
  await d.delete(milestones).where(eq(milestones.projectId, id));
  await d.delete(changeRequests).where(eq(changeRequests.projectId, id));
  await d.delete(projects).where(eq(projects.id, id));
  return c.json({ ok: true });
});

/* ---- אבני דרך ---- */
projectsApp.post('/:id/milestones', async (c) => {
  const projId = c.req.param('id');
  const body = await c.req.json().catch(() => ({} as any));
  if (!body.title) return c.json({ error: 'invalid_input' }, 400);
  const id = uid();
  await db(c).insert(milestones).values({ id, projectId: projId, ...pick(body, MS_FIELDS), title: String(body.title), createdAt: now() } as any);
  return c.json({ ok: true, id });
});
projectsApp.patch('/:id/milestones/:mid', async (c) => {
  const data = pick(await c.req.json().catch(() => ({})), MS_FIELDS);
  if (Object.keys(data).length) await db(c).update(milestones).set(data as any).where(eq(milestones.id, c.req.param('mid')));
  return c.json({ ok: true });
});
projectsApp.delete('/:id/milestones/:mid', async (c) => {
  await db(c).delete(milestones).where(eq(milestones.id, c.req.param('mid')));
  return c.json({ ok: true });
});

/* ---- בקשות שינוי Scope ---- */
projectsApp.post('/:id/change-requests', async (c) => {
  const projId = c.req.param('id');
  const body = await c.req.json().catch(() => ({} as any));
  if (!body.title) return c.json({ error: 'invalid_input' }, 400);
  const id = uid();
  await db(c).insert(changeRequests).values({ id, projectId: projId, ...pick(body, CR_FIELDS), title: String(body.title), createdAt: now() } as any);
  return c.json({ ok: true, id });
});
projectsApp.patch('/:id/change-requests/:cid', async (c) => {
  const cid = c.req.param('cid');
  const d = db(c);
  const cur = (await d.select().from(changeRequests).where(eq(changeRequests.id, cid)).limit(1))[0];
  if (!cur) return c.json({ error: 'not_found' }, 404);
  const data: any = pick(await c.req.json().catch(() => ({})), CR_FIELDS);
  if (Object.keys(data).length === 0) return c.json({ ok: true });
  if (data.status === 'approved' && cur.status !== 'approved') data.approvedAt = now();
  if (data.status === 'implemented' && cur.status !== 'implemented') data.implementedAt = now();
  await d.update(changeRequests).set(data).where(eq(changeRequests.id, cid));
  if (data.status && data.status !== cur.status) {
    const p = (await d.select().from(projects).where(eq(projects.id, c.req.param('id'))).limit(1))[0];
    await logStatusChange(d, 'change_request', cid, p?.organizationId || null, 'בקשת שינוי', cur.status, data.status);
  }
  return c.json({ ok: true });
});
projectsApp.delete('/:id/change-requests/:cid', async (c) => {
  await db(c).delete(changeRequests).where(eq(changeRequests.id, c.req.param('cid')));
  return c.json({ ok: true });
});
