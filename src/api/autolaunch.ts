import { eq, and } from 'drizzle-orm';
import { playbooks, playbookRuns } from '../db/schema';
import { db, uid, now, logActivity } from './util';
import { DEFAULT_PLAYBOOKS } from './playbook-seed';

type D = ReturnType<typeof db>;

/**
 * Autolaunch — פתיחת פלייבוק אוטומטית לפי שינוי שלב בתהליך העבודה.
 * הפלייבוק הופך למנוע העבודה: מעבר שלב מהזדמנות/פרויקט פותח את הפורמט המתאים.
 * אידמפוטנטי: לא פותח שוב אם כבר קיים מהלך פעיל מאותה תבנית לאותו ארגון.
 */

// שלב הזדמנות → תבנית פלייבוק
const OPP_STAGE_PLAYBOOK: Record<string, string> = {
  discovery: 'pb_discovery_call',   // שיחת גילוי
  diagnosis: 'pb_discovery_onepager', // מסמך אפיון
  proposal: 'pb_proposal_sow',      // הצעה ו-SOW
};

// שלב פרויקט → תבנית פלייבוק
const PROJECT_STATUS_PLAYBOOK: Record<string, string> = {
  specification: 'pb_design_datamodel', // אפיון/מודל נתונים
  build: 'pb_build_dod',                // Definition of Done
  internal_test: 'pb_quality_qa',       // QA
  live: 'pb_launch_golive',             // Go-Live
  completed: 'pb_handoff_kit',          // מסירה
};

const DEFAULTS_BY_ID = new Map(DEFAULT_PLAYBOOKS.map((p) => [p.id, p]));

/** מאתר תבנית; אם חסרה בבסיס הנתונים — זורע אותה מ-DEFAULT_PLAYBOOKS (אידמפוטנטי) */
async function ensurePlaybook(d: D, pbId: string): Promise<any | null> {
  const existing = (await d.select().from(playbooks).where(eq(playbooks.id, pbId)).limit(1))[0];
  if (existing) return existing;
  const seed = DEFAULTS_BY_ID.get(pbId);
  if (!seed) return null;
  await d.insert(playbooks).values({
    id: seed.id, stage: seed.stage, title: seed.title, summary: seed.summary ?? null,
    kind: seed.kind, sections: JSON.stringify(seed.sections ?? []), body: seed.body ?? null,
    tags: seed.tags ?? null, sort: seed.sort ?? 0, builtin: 1, createdAt: now(), updatedAt: null,
  } as any);
  return (await d.select().from(playbooks).where(eq(playbooks.id, pbId)).limit(1))[0] || null;
}

/** פותח מהלך פלייבוק לארגון אם עדיין לא קיים מהלך פעיל מאותה תבנית */
export async function launchPlaybook(d: D, pbId: string, organizationId: string): Promise<{ created: boolean; id?: string; title?: string }> {
  const pb = await ensurePlaybook(d, pbId);
  if (!pb) return { created: false };
  const runs = await d.select().from(playbookRuns).where(eq(playbookRuns.clientId, organizationId)).all();
  if (runs.some((r) => r.playbookId === pbId && r.status !== 'archived')) return { created: false };
  const runId = uid();
  await d.insert(playbookRuns).values({
    id: runId, playbookId: pb.id, title: pb.title, stage: pb.stage, kind: pb.kind,
    clientId: organizationId, systemId: null, status: 'active',
    sections: pb.sections, doc: pb.kind === 'checklist' ? null : pb.body,
    checked: '{}', answers: '{}', notes: null, progress: 0, createdAt: now(),
  } as any);
  await logActivity(d, {
    entityType: 'organization', entityId: organizationId, organizationId,
    type: 'automation', title: `נפתחה מתודולוגיה: ${pb.title}`,
    metadata: { playbookId: pb.id, runId },
  });
  return { created: true, id: runId, title: pb.title };
}

/** Autolaunch לפי מעבר שלב הזדמנות */
export async function autolaunchForOpportunityStage(d: D, stage: string, organizationId: string) {
  const pbId = OPP_STAGE_PLAYBOOK[stage];
  if (!pbId || !organizationId) return { created: false };
  return launchPlaybook(d, pbId, organizationId);
}

/** Autolaunch לפי מעבר שלב פרויקט */
export async function autolaunchForProjectStatus(d: D, status: string, organizationId: string) {
  const pbId = PROJECT_STATUS_PLAYBOOK[status];
  if (!pbId || !organizationId) return { created: false };
  return launchPlaybook(d, pbId, organizationId);
}
