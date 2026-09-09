import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { skillUsage, systems } from '../db/schema';
import { Env, db, uid, now } from './util';

export const skillsApp = new Hono<Env>();

// מקורות הסקילז המוכרים. הקטלוג עצמו יושב בצד הלקוח (public/app + public/js/skills-il.js);
// כאן רק מוודאים שהמקור חוקי ושומרים איתו את נתיב הגישה.
export const SKILL_SOURCES = ['ecc', 'skills-il'] as const;
export type SkillSource = (typeof SKILL_SOURCES)[number];

function normSource(v: unknown): SkillSource {
  const s = String(v || 'ecc').trim();
  return (SKILL_SOURCES as readonly string[]).includes(s) ? (s as SkillSource) : 'ecc';
}

/** נתיב גישה ברירת מחדל כשלא נשלח מהלקוח (שורות ECC ישנות) */
function defaultRef(source: SkillSource, skillName: string): string | null {
  if (source === 'ecc') return 'affaan-m/ecc/skills/' + skillName;
  return null; // ל-skills-il חייבים לדעת את הריפו — הלקוח שולח
}

export type UsageRow = { id: string; source: string; sourceRef: string | null; systemId: string | null; systemName: string };

// מפת שימוש: "<source>:<skillName>" -> [{ id, source, sourceRef, systemId, systemName }]
// המפתח כולל את המקור כי אותו שם יכול להופיע בשני מקורות (למשל hebrew-document-generator).
skillsApp.get('/usage', async (c) => {
  const rows = await db(c).select().from(skillUsage).all();
  const map: Record<string, UsageRow[]> = {};
  for (const r of rows) {
    const source = normSource(r.source);
    const key = source + ':' + r.skillName;
    (map[key] = map[key] || []).push({
      id: r.id,
      source,
      sourceRef: r.sourceRef ?? defaultRef(source, r.skillName),
      systemId: r.systemId ?? null,
      systemName: r.systemName,
    });
  }
  return c.json(map);
});

// סימון שימוש: { skillName, source?, sourceRef?, systemId?, systemName? }
skillsApp.post('/usage', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const skillName = String(body.skillName || '').trim();
  if (!skillName) return c.json({ error: 'invalid_input' }, 400);
  const source = normSource(body.source);
  const sourceRef = String(body.sourceRef || '').trim() || defaultRef(source, skillName);

  const systemId = body.systemId ? String(body.systemId) : null;
  let systemName = String(body.systemName || '').trim();
  if (systemId && !systemName) {
    const s = (await db(c).select().from(systems).where(eq(systems.id, systemId)).limit(1))[0];
    systemName = s?.name || systemId;
  }
  if (!systemName) return c.json({ error: 'invalid_input' }, 400);

  const id = uid();
  await db(c).insert(skillUsage).values({ id, skillName, source, sourceRef, systemId, systemName, createdAt: now() } as any);
  return c.json({ ok: true, id, skillName, source, sourceRef, systemId, systemName });
});

// הסרת סימון
skillsApp.delete('/usage/:id', async (c) => {
  await db(c).delete(skillUsage).where(eq(skillUsage.id, c.req.param('id')));
  return c.json({ ok: true });
});
