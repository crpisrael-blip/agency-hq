import { Hono } from 'hono';
import { asc, desc, eq } from 'drizzle-orm';
import { playbooks, playbookRuns, clients, systems } from '../db/schema';
import { Env, db, uid, now, pick, todayIL } from './util';
import { STAGES, DEFAULT_PLAYBOOKS } from './playbook-seed';

const STAGE_LABEL: Record<string, string> = Object.fromEntries(STAGES.map((s) => [s.key, s.label]));

export const playbooksApp = new Hono<Env>();

const PB_FIELDS = ['stage', 'title', 'summary', 'kind', 'sections', 'body', 'tags', 'sort'];
const RUN_FIELDS = ['title', 'status', 'checked', 'answers', 'doc', 'notes', 'clientId', 'systemId'];

const asJson = (v: any, fallback: string) =>
  v === undefined ? undefined : typeof v === 'string' ? v : JSON.stringify(v ?? JSON.parse(fallback));

/**
 * מחשב אחוז השלמה מתוך צילום הסעיפים ומפת הסימונים.
 * למהלך מסוג תבנית אין פריטים — הוא נמדד בסימון ידני כהושלם.
 */
function calcProgress(sectionsRaw: string, checkedRaw: string): number {
  try {
    const sections = JSON.parse(sectionsRaw || '[]');
    const checked = JSON.parse(checkedRaw || '{}');
    let total = 0;
    let done = 0;
    sections.forEach((s: any, si: number) =>
      (s.items || []).forEach((_: any, ii: number) => {
        total++;
        if (checked[`${si}-${ii}`]) done++;
      })
    );
    return total ? Math.round((done / total) * 100) : 0;
  } catch {
    return 0;
  }
}

/** מזריע את תבניות ברירת המחדל שחסרות (אידמפוטנטי — לא מכפיל, לא דורס עריכות) */
async function seedDefaults(c: any) {
  const d = db(c);
  const existing = await d.select({ id: playbooks.id }).from(playbooks).all();
  const have = new Set(existing.map((r) => r.id));
  const missing = DEFAULT_PLAYBOOKS.filter((p) => !have.has(p.id));
  const t = now();
  for (const p of missing) {
    await d.insert(playbooks).values({
      id: p.id,
      stage: p.stage,
      title: p.title,
      summary: p.summary ?? null,
      kind: p.kind,
      sections: JSON.stringify(p.sections ?? []),
      body: p.body ?? null,
      tags: p.tags ?? null,
      sort: p.sort ?? 0,
      builtin: 1,
      createdAt: t,
      updatedAt: null,
    } as any);
  }
  return missing.length;
}

// ---------- מטא: שלבי מסע המוצר ----------
playbooksApp.get('/meta', (c) => c.json({ stages: STAGES }));

// ---------- ספריית הפורמטים ----------
playbooksApp.get('/', async (c) => {
  const d = db(c);
  let rows = await d.select().from(playbooks).orderBy(asc(playbooks.sort)).all();
  if (rows.length === 0) {
    await seedDefaults(c);
    rows = await d.select().from(playbooks).orderBy(asc(playbooks.sort)).all();
  }
  return c.json(rows);
});

// שחזור תבניות ברירת המחדל שנמחקו
playbooksApp.post('/reseed', async (c) => {
  const added = await seedDefaults(c);
  return c.json({ ok: true, added });
});

/** מיפוי שלב-במסע-הלקוח → פורמט ברירת המחדל שנפתח אוטומטית */
const STAGE_TO_PLAYBOOK: Record<string, string> = {
  lead: 'pb_discovery_call',
  discovery: 'pb_discovery_onepager',
  proposal: 'pb_proposal_sow',
  building: 'pb_build_dod',
  live: 'pb_launch_golive',
  retainer: 'pb_advisory_qbr',
};

// קישור אוטומטי: כשלקוח עובר שלב, נפתח לו המהלך המתאים (אידמפוטנטי — לא מכפיל)
playbooksApp.post('/autolaunch', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const clientId = body.clientId;
  const pbId = STAGE_TO_PLAYBOOK[body.clientStage];
  if (!clientId || !pbId) return c.json({ created: false });
  const d = db(c);
  const pb = (await d.select().from(playbooks).where(eq(playbooks.id, pbId)).limit(1))[0];
  if (!pb) return c.json({ created: false, reason: 'no_template' });
  const runs = await d.select().from(playbookRuns).where(eq(playbookRuns.clientId, clientId)).all();
  if (runs.some((r) => r.playbookId === pbId)) return c.json({ created: false, reason: 'exists' });
  const runId = uid();
  await d.insert(playbookRuns).values({
    id: runId,
    playbookId: pb.id,
    title: pb.title,
    stage: pb.stage,
    kind: pb.kind,
    clientId,
    systemId: null,
    status: 'active',
    sections: pb.sections,
    doc: pb.kind === 'checklist' ? null : pb.body,
    checked: '{}',
    answers: '{}',
    notes: null,
    progress: 0,
    createdAt: now(),
  } as any);
  return c.json({ created: true, id: runId, title: pb.title });
});

playbooksApp.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  if (!body.title) return c.json({ error: 'invalid_input' }, 400);
  const data: any = pick(body, PB_FIELDS);
  if (data.sections !== undefined) data.sections = asJson(data.sections, '[]');
  const id = uid();
  await db(c)
    .insert(playbooks)
    .values({ id, ...data, title: String(body.title), builtin: 0, createdAt: now() } as any);
  return c.json({ ok: true, id });
});

playbooksApp.patch('/:id', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const data: any = pick(body, PB_FIELDS);
  if (data.sections !== undefined) data.sections = asJson(data.sections, '[]');
  data.updatedAt = now();
  await db(c).update(playbooks).set(data).where(eq(playbooks.id, c.req.param('id')));
  return c.json({ ok: true });
});

playbooksApp.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await db(c).delete(playbookRuns).where(eq(playbookRuns.playbookId, id));
  await db(c).delete(playbooks).where(eq(playbooks.id, id));
  return c.json({ ok: true });
});

// ---------- מהלכים (החלה על עבודה אמיתית) ----------
playbooksApp.get('/runs', async (c) => {
  const d = db(c);
  const rows = await d.select().from(playbookRuns).orderBy(desc(playbookRuns.createdAt)).all();
  const cls = await d.select().from(clients).all();
  const sys = await d.select().from(systems).all();
  const clientId = c.req.query('clientId');
  const filtered = clientId ? rows.filter((r) => r.clientId === clientId) : rows;
  return c.json(
    filtered.map((r) => ({
      ...r,
      clientName: cls.find((cl) => cl.id === r.clientId)?.name || null,
      systemName: sys.find((s) => s.id === r.systemId)?.name || null,
    }))
  );
});

/** מהלך בודד + שמות הלקוח/המערכת */
async function loadRun(c: any, id: string) {
  const d = db(c);
  const r = (await d.select().from(playbookRuns).where(eq(playbookRuns.id, id)).limit(1))[0];
  if (!r) return null;
  const cl = r.clientId ? (await d.select().from(clients).where(eq(clients.id, r.clientId)).limit(1))[0] : null;
  const sy = r.systemId ? (await d.select().from(systems).where(eq(systems.id, r.systemId)).limit(1))[0] : null;
  return { ...r, clientName: cl?.name || null, systemName: sy?.name || null };
}

playbooksApp.get('/runs/:id', async (c) => {
  const run = await loadRun(c, c.req.param('id'));
  return run ? c.json(run) : c.json({ error: 'not_found' }, 404);
});

/**
 * הטופס המלא — הופך את המהלך (שאלות + התשובות שמילאתי) למסמך מוכן
 * להעתקה/שליחה/שמירה במרכז המסמכים. זה ה"פלט" של המתודולוגיה.
 */
function buildForm(run: any): string {
  const sections = JSON.parse(run.sections || '[]');
  const answers = JSON.parse(run.answers || '{}');
  const checked = JSON.parse(run.checked || '{}');
  const meta = [
    run.clientName ? `**לקוח:** ${run.clientName}` : null,
    run.systemName ? `**מערכת:** ${run.systemName}` : null,
    run.stage ? `**שלב:** ${STAGE_LABEL[run.stage] || run.stage}` : null,
    `**תאריך:** ${todayIL()}`,
    `**התקדמות:** ${run.progress || 0}%`,
    run.status === 'done' ? '**סטטוס:** הושלם ✓' : null,
  ].filter(Boolean);

  const out: string[] = [`# ${run.title}`, '', meta.join('  |  '), ''];
  // מהלך מסוג תבנית: המסמך עצמו הוא הטופס
  if (run.kind === 'template') {
    out.push(String(run.doc || '').trim(), '');
    const docNotes = String(run.notes || '').trim();
    if (docNotes) out.push('## הערות', '', docNotes, '');
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }
  sections.forEach((s: any, si: number) => {
    out.push(`## ${s.title || ''}`, '');
    (s.items || []).forEach((it: any, ii: number) => {
      const key = `${si}-${ii}`;
      const ans = String(answers[key] ?? '').trim();
      out.push(`**${checked[key] ? '✓' : '○'} ${it.label || ''}**`);
      out.push(ans ? ans.split('\n').map((l: string) => l.trim()).join('\n') : '_(טרם נענה)_');
      out.push('');
    });
  });
  const notes = String(run.notes || '').trim();
  if (notes) out.push('## הערות', '', notes, '');
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

playbooksApp.get('/runs/:id/form', async (c) => {
  const run = await loadRun(c, c.req.param('id'));
  if (!run) return c.json({ error: 'not_found' }, 404);
  return c.json({ title: run.title, clientId: run.clientId, clientName: run.clientName, markdown: buildForm(run) });
});

// החלת פורמט → יוצר מהלך עם צילום הסעיפים
playbooksApp.post('/:id/apply', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({} as any));
  const rows = await db(c).select().from(playbooks).where(eq(playbooks.id, id)).limit(1);
  const pb = rows[0];
  if (!pb) return c.json({ error: 'not_found' }, 404);
  const runId = uid();
  await db(c)
    .insert(playbookRuns)
    .values({
      id: runId,
      playbookId: pb.id,
      title: body.title ? String(body.title) : pb.title,
      stage: pb.stage,
      kind: pb.kind,
      clientId: body.clientId || null,
      systemId: body.systemId || null,
      status: 'active',
      sections: pb.sections,
      doc: pb.kind === 'checklist' ? null : pb.body,
      checked: '{}',
      answers: '{}',
      notes: null,
      progress: 0,
      createdAt: now(),
    } as any);
  return c.json({ ok: true, id: runId });
});

playbooksApp.patch('/runs/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({} as any));
  const data: any = pick(body, RUN_FIELDS);
  if (data.checked !== undefined) data.checked = asJson(data.checked, '{}');
  if (data.answers !== undefined) data.answers = asJson(data.answers, '{}');
  const cur = (await db(c).select().from(playbookRuns).where(eq(playbookRuns.id, id)).limit(1))[0];
  if (!cur) return c.json({ error: 'not_found' }, 404);
  const checkedRaw = data.checked !== undefined ? data.checked : cur.checked;
  const status = data.status || cur.status;
  // תבנית מסמך נמדדת בסימון ידני; צ׳ק־ליסט לפי הפריטים שסומנו
  data.progress = cur.kind === 'template' ? (status === 'done' ? 100 : 0) : calcProgress(cur.sections, checkedRaw);
  if (data.status === 'done' || (data.progress === 100 && cur.status === 'active')) {
    data.status = data.status || 'done';
    data.completedAt = now();
  }
  if (data.status && data.status !== 'done') data.completedAt = null;
  data.updatedAt = now();
  await db(c).update(playbookRuns).set(data).where(eq(playbookRuns.id, id));
  return c.json({ ok: true, progress: data.progress });
});

playbooksApp.delete('/runs/:id', async (c) => {
  await db(c).delete(playbookRuns).where(eq(playbookRuns.id, c.req.param('id')));
  return c.json({ ok: true });
});
