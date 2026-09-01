import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { clients, systems, engagements, profitCenters, tasks, leads, opportunities, projects } from '../db/schema';
import { Env, db, num, todayIL } from './util';
import { engagementMonthly } from './engagements';

export const dashboardApp = new Hono<Env>();

dashboardApp.get('/', async (c) => {
  const d = db(c);
  const [cls, sys, engs, ideas, tks, lds, opps, projs] = await Promise.all([
    d.select().from(clients).all(),
    d.select().from(systems).all(),
    d.select().from(engagements).all(),
    d.select().from(profitCenters).all(),
    d.select().from(tasks).all(),
    d.select().from(leads).all(),
    d.select().from(opportunities).all(),
    d.select().from(projects).all(),
  ]);
  const ACTIVE_STAGES = ['discovery', 'diagnosis', 'solution', 'proposal', 'negotiation', 'decision'];
  const activeOpps = opps.filter((o) => ACTIVE_STAGES.includes(o.stage));

  const monthPrefix = todayIL().slice(0, 7);
  const leadsMonth = lds.filter((l) => new Date(l.createdAt).toISOString().slice(0, 7) === monthPrefix).length;
  const leadsBySystem = sys
    .map((s) => ({ id: s.id, name: s.name, clientName: cls.find((cl) => cl.id === s.clientId)?.name || '—', count: lds.filter((l) => l.systemId === s.id).length }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);

  const activeEng = engs.filter((e) => e.status === 'active');
  const mrr = activeEng.reduce((a, e) => a + engagementMonthly(e), 0);
  // BOS: הצינור מחושב מהזדמנויות פעילות — לא מהתקשרויות
  const pipeline = activeOpps.reduce((a, o) => a + num(o.estimatedValue), 0);
  const pipelineWeighted = activeOpps.reduce((a, o) => a + num(o.estimatedValue) * (num(o.probability) / 100), 0);
  const openTasks = tks.filter((t) => t.status !== 'done');

  const kpis = {
    clientsActive: cls.filter((cl) => cl.status === 'active').length,
    clientsProspect: cls.filter((cl) => cl.status === 'prospect').length,
    systemsTotal: sys.length,
    systemsLive: sys.filter((s) => s.status === 'live').length,
    systemsBuilding: sys.filter((s) => ['discovery', 'design', 'building'].includes(s.status)).length,
    mrr,
    arr: mrr * 12,
    pipeline,
    pipelineWeighted,
    oppsActive: activeOpps.length,
    projectsActive: projs.filter((p) => !['completed', 'paused'].includes(p.status)).length,
    openTasks: openTasks.length,
    ideasActive: ideas.filter((i) => i.status !== 'dropped').length,
    ideasWeighted: ideas
      .filter((i) => !['dropped', 'active'].includes(i.status))
      .reduce((a, i) => a + num(i.potentialMonthly) * (num(i.confidence) / 100), 0),
    leadsTotal: lds.length,
    leadsMonth,
  };

  // התפלגות בריאות לקוחות פעילים
  const health = { green: 0, yellow: 0, red: 0 };
  for (const cl of cls.filter((x) => x.status === 'active')) {
    const h = (cl.health as 'green' | 'yellow' | 'red') || 'green';
    health[h] = (health[h] || 0) + 1;
  }

  // תמהיל הכנסה חוזרת לפי מודל חיוב
  const byModel: Record<string, number> = {};
  for (const e of activeEng) byModel[e.model] = (byModel[e.model] || 0) + engagementMonthly(e);

  // MRR לכל לקוח (טופ)
  const mrrByClient = cls
    .map((cl) => ({
      id: cl.id,
      name: cl.name,
      mrr: activeEng.filter((e) => e.clientId === cl.id).reduce((a, e) => a + engagementMonthly(e), 0),
    }))
    .filter((x) => x.mrr > 0)
    .sort((a, b) => b.mrr - a.mrr);

  // משימות דחופות/פתוחות אחרונות
  const recentTasks = openTasks
    .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'))
    .slice(0, 8);

  // מערכות בבנייה
  const activeSystems = sys
    .filter((s) => ['discovery', 'design', 'building'].includes(s.status))
    .map((s) => ({ ...s, clientName: cls.find((cl) => cl.id === s.clientId)?.name || '—' }))
    .sort((a, b) => num(b.progress) - num(a.progress));

  return c.json({ kpis, health, byModel, mrrByClient, recentTasks, activeSystems, leadsBySystem });
});
