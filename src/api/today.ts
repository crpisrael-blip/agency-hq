import { Hono } from 'hono';
import {
  opportunities, proposals, projects, tasks, milestones, leads,
  engagements, clients,
} from '../db/schema';
import { Env, db, num, todayIL } from './util';
import { engagementMonthly } from './engagements';

/**
 * מסך "היום" — Command Center. מרכז את מה שדורש טיפול עכשיו + סיכום עסקי + הפעולות שלי.
 * הצינור (Pipeline) מחושב מהזדמנויות בלבד — לא מהתקשרויות.
 */
export const todayApp = new Hono<Env>();

const ACTIVE_STAGES = ['discovery', 'diagnosis', 'solution', 'proposal', 'negotiation', 'decision'];

todayApp.get('/', async (c) => {
  const d = db(c);
  const today = todayIL();
  const [opps, props, projs, tks, ms, lds, engs, orgs] = await Promise.all([
    d.select().from(opportunities).all(),
    d.select().from(proposals).all(),
    d.select().from(projects).all(),
    d.select().from(tasks).all(),
    d.select().from(milestones).all(),
    d.select().from(leads).all(),
    d.select().from(engagements).all(),
    d.select().from(clients).all(),
  ]);
  const orgName = (id: string | null) => orgs.find((o) => o.id === id)?.name || '—';

  const activeOpps = opps.filter((o) => ACTIVE_STAGES.includes(o.stage));

  // --- דורש טיפול ---
  const newLeads = lds
    .filter((l) => new Date(l.createdAt).getTime() >= Date.now() - 7 * 864e5)
    .slice(0, 10)
    .map((l) => ({ id: l.id, name: l.name, source: l.source, createdAt: l.createdAt }));

  const oppsNoNextAction = activeOpps
    .filter((o) => !o.nextAction || !String(o.nextAction).trim())
    .map((o) => ({ id: o.id, title: o.title, organizationName: orgName(o.organizationId), stage: o.stage }));

  const overdueFollowups = activeOpps
    .filter((o) => o.nextActionDate && String(o.nextActionDate) < today)
    .map((o) => ({ id: o.id, title: o.title, organizationName: orgName(o.organizationId), nextAction: o.nextAction, nextActionDate: o.nextActionDate }));

  const waitingProposals = props
    .filter((p) => ['sent', 'viewed', 'discussion'].includes(p.status))
    .map((p) => {
      const opp = opps.find((o) => o.id === p.opportunityId);
      return { id: p.id, version: p.version, status: p.status, opportunityId: p.opportunityId, opportunityTitle: opp?.title || '—', organizationName: orgName(opp?.organizationId || null) };
    });

  const projectsAtRisk = projs
    .filter((p) => p.health === 'red' && !['completed', 'paused'].includes(p.status))
    .map((p) => ({ id: p.id, title: p.title, organizationName: orgName(p.organizationId), status: p.status, health: p.health }));

  const overdueTasks = tks
    .filter((t) => t.status !== 'done' && t.dueDate && String(t.dueDate) < today)
    .map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate, entityType: t.entityType, entityId: t.entityId }));

  const upcomingMilestones = ms
    .filter((m) => m.status !== 'done' && m.dueDate && String(m.dueDate) >= today && String(m.dueDate) <= isoPlus(today, 14))
    .map((m) => ({ id: m.id, title: m.title, dueDate: m.dueDate, projectId: m.projectId }))
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));

  // --- סיכום עסקי ---
  const pipeline = activeOpps.reduce((a, o) => a + num(o.estimatedValue), 0);
  const weightedPipeline = activeOpps.reduce((a, o) => a + num(o.estimatedValue) * (num(o.probability) / 100), 0);
  const activeProjects = projs.filter((p) => !['completed', 'paused'].includes(p.status)).length;
  const activeCustomers = orgs.filter((o) => ['active', 'customer'].includes(o.status)).length;
  const mrr = engs.filter((e) => e.status === 'active').reduce((a, e) => a + engagementMonthly(e), 0);
  const proposalsWaiting = waitingProposals.length;

  // --- הפעולות שלי (Next Actions מהזדמנויות ופרויקטים) ---
  const collectActions = () => {
    const acc: { entity: string; id: string; title: string; action: string; date: string | null; organizationName: string }[] = [];
    for (const o of activeOpps) {
      if (o.nextAction && String(o.nextAction).trim())
        acc.push({ entity: 'opportunity', id: o.id, title: o.title, action: o.nextAction, date: o.nextActionDate || null, organizationName: orgName(o.organizationId) });
    }
    for (const p of projs.filter((x) => !['completed', 'paused'].includes(x.status))) {
      if (p.nextAction && String(p.nextAction).trim())
        acc.push({ entity: 'project', id: p.id, title: p.title, action: p.nextAction, date: p.nextActionDate || null, organizationName: orgName(p.organizationId) });
    }
    return acc;
  };
  const actions = collectActions();
  const myActions = {
    overdue: actions.filter((a) => a.date && a.date < today).sort(byDate),
    today: actions.filter((a) => a.date === today),
    upcoming: actions.filter((a) => a.date && a.date > today).sort(byDate),
    undated: actions.filter((a) => !a.date),
  };

  return c.json({
    needsAttention: {
      newLeads, oppsNoNextAction, overdueFollowups, waitingProposals,
      projectsAtRisk, overdueTasks, upcomingMilestones,
    },
    summary: { pipeline, weightedPipeline, activeProjects, activeCustomers, mrr, arr: mrr * 12, proposalsWaiting },
    myActions,
  });
});

function byDate(a: { date: string | null }, b: { date: string | null }) {
  return String(a.date || '9999').localeCompare(String(b.date || '9999'));
}
function isoPlus(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
