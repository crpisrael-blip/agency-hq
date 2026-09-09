import { Hono } from 'hono';
import { desc, eq, inArray } from 'drizzle-orm';
import { calls, clients, tasks, profitCenters } from '../db/schema';
import { Env, db, uid, now, pick, num, logActivity } from './util';

/**
 * תיעוד שיחות עם לקוחות. שיחה = אירוע שכבר קרה שרוצים לתעד:
 * מי יזם · מה דובר · מה סוכם · רעיונות שעלו · משימות שנגזרו.
 *
 * הרעיונות והמשימות שנגזרים נשמרים כישויות אמיתיות (profitCenters / tasks)
 * כדי שיזרמו למסכים הקיימים (משימות הלקוח, מרכזי רווח) — והמזהים שלהם
 * נשמרים על השיחה כדי להציג את מקורם ואת הסטטוס החי שלהם.
 */
export const callsApp = new Hono<Env>();

const FIELDS = ['clientId', 'clientName', 'systemId', 'initiator', 'contactName', 'channel', 'occurredAt', 'durationMin', 'discussed', 'agreed', 'ideas', 'notes'];

function parseIds(v: unknown): string[] {
  try { const a = JSON.parse(String(v || '[]')); return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []; }
  catch { return []; }
}

// רשימת שיחות — אופציונלי ?clientId= · העשרה בשם הלקוח
callsApp.get('/', async (c) => {
  const d = db(c);
  const clientId = c.req.query('clientId');
  let q = d.select().from(calls).$dynamic();
  if (clientId) q = q.where(eq(calls.clientId, clientId));
  const rows = await q.orderBy(desc(calls.occurredAt)).limit(200).all();
  const cls = await d.select({ id: clients.id, name: clients.name }).from(clients).all();
  const nameById = new Map(cls.map((x) => [x.id, x.name]));
  return c.json(rows.map((r) => ({
    ...r,
    clientName: (r.clientId && nameById.get(r.clientId)) || r.clientName || null,
    taskCount: parseIds(r.taskIds).length,
    ideaCount: parseIds(r.ideaIds).length,
  })));
});

// שיחה בודדת + המשימות והרעיונות שנגזרו ממנה (סטטוס חי)
callsApp.get('/:id', async (c) => {
  const d = db(c);
  const row = (await d.select().from(calls).where(eq(calls.id, c.req.param('id'))).limit(1))[0];
  if (!row) return c.json({ error: 'not_found' }, 404);
  const taskIds = parseIds(row.taskIds);
  const ideaIds = parseIds(row.ideaIds);
  const linkedTasks = taskIds.length ? await d.select().from(tasks).where(inArray(tasks.id, taskIds)).all() : [];
  const linkedIdeas = ideaIds.length ? await d.select().from(profitCenters).where(inArray(profitCenters.id, ideaIds)).all() : [];
  let clientName = row.clientName;
  if (row.clientId) {
    const cl = (await d.select({ name: clients.name }).from(clients).where(eq(clients.id, row.clientId)).limit(1))[0];
    if (cl) clientName = cl.name;
  }
  return c.json({ call: { ...row, clientName }, tasks: linkedTasks, ideas: linkedIdeas });
});

/**
 * תיעוד שיחה חדשה. מלבד השדות של השיחה עצמה, מקבל:
 *  derivedTasks: [{ title, priority?, dueDate? }]  — נוצרות כמשימות אמיתיות
 *  derivedIdeas: [{ title, potentialMonthly?, notes? }] — נוצרים כמרכזי רווח
 * מקושרות ללקוח כשקיים, כך שיופיעו בכרטיס הלקוח ובמסך המשימות.
 */
callsApp.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const d = db(c);
  const id = uid();
  const ts = now();
  const clientId: string | null = body.clientId || null;

  // משימות שנגזרו → tasks אמיתיים
  const taskIds: string[] = [];
  for (const t of Array.isArray(body.derivedTasks) ? body.derivedTasks : []) {
    const title = String(t?.title || '').trim();
    if (!title) continue;
    const tid = uid();
    await d.insert(tasks).values({
      id: tid,
      title,
      details: t.details ? String(t.details) : null,
      status: 'todo',
      priority: ['low', 'normal', 'high', 'urgent'].includes(t.priority) ? t.priority : 'normal',
      dueDate: t.dueDate ? String(t.dueDate) : null,
      entityType: clientId ? 'client' : 'call',
      entityId: clientId || id,
      createdAt: ts,
    } as any);
    taskIds.push(tid);
  }

  // רעיונות שעלו → profitCenters (מרכזי רווח)
  const ideaIds: string[] = [];
  for (const it of Array.isArray(body.derivedIdeas) ? body.derivedIdeas : []) {
    const title = String(it?.title || '').trim();
    if (!title) continue;
    const iid = uid();
    await d.insert(profitCenters).values({
      id: iid,
      clientId,
      title,
      description: it.description ? String(it.description) : null,
      potentialMonthly: num(it.potentialMonthly),
      potentialOneTime: num(it.potentialOneTime),
      status: 'idea',
      notes: it.notes ? String(it.notes) : 'עלה בשיחה עם הלקוח',
      createdAt: ts,
    } as any);
    ideaIds.push(iid);
  }

  await d.insert(calls).values({
    id,
    ...pick(body, FIELDS),
    clientId,
    initiator: ['me', 'client', 'other'].includes(body.initiator) ? body.initiator : 'me',
    channel: ['phone', 'whatsapp', 'video', 'meeting', 'other'].includes(body.channel) ? body.channel : 'phone',
    occurredAt: num(body.occurredAt, ts) || ts,
    durationMin: body.durationMin != null && body.durationMin !== '' ? num(body.durationMin) : null,
    taskIds: JSON.stringify(taskIds),
    ideaIds: JSON.stringify(ideaIds),
    createdAt: ts,
  } as any);

  // רישום בציר הזמן של הלקוח (Timeline) — כדי שהשיחה תופיע ב"פעילות אחרונה"
  if (clientId) {
    const parts: string[] = [];
    if (body.discussed) parts.push('דובר: ' + String(body.discussed));
    if (body.agreed) parts.push('סוכם: ' + String(body.agreed));
    await logActivity(d, {
      entityType: 'client',
      entityId: clientId,
      organizationId: clientId,
      type: 'call',
      title: `שיחה — ${body.initiator === 'client' ? 'הלקוח יזם' : body.initiator === 'other' ? 'ביוזמת גורם שלישי' : 'יזמתי'}`,
      content: parts.join(' · ') || null,
      metadata: { callId: id, tasks: taskIds.length, ideas: ideaIds.length },
      occurredAt: num(body.occurredAt, ts) || ts,
    });
  }

  return c.json({ ok: true, id, taskCount: taskIds.length, ideaCount: ideaIds.length });
});

// עדכון תיעוד השיחה (הנרטיב עצמו — לא נוגע במשימות/רעיונות שכבר נגזרו)
callsApp.patch('/:id', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const data: any = pick(body, FIELDS);
  if (data.occurredAt !== undefined) data.occurredAt = num(data.occurredAt) || now();
  if (data.durationMin !== undefined) data.durationMin = data.durationMin === '' || data.durationMin == null ? null : num(data.durationMin);
  if (Object.keys(data).length) await db(c).update(calls).set(data).where(eq(calls.id, c.req.param('id')));
  return c.json({ ok: true });
});

callsApp.delete('/:id', async (c) => {
  await db(c).delete(calls).where(eq(calls.id, c.req.param('id')));
  return c.json({ ok: true });
});
