import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { systems, clients } from '../db/schema';
import { Env, db, uid, now, pick, num } from './util';

export const systemsApp = new Hono<Env>();

const FIELDS = ['clientId', 'name', 'kind', 'stack', 'status', 'url', 'adminUrl', 'credentials', 'authMethod', 'authScore', 'repoUrl', 'startDate', 'launchDate', 'progress', 'description', 'notes'];

// כל המערכות (עם שם הלקוח) — אופציונלי סינון לפי לקוח ?clientId=
systemsApp.get('/', async (c) => {
  const d = db(c);
  const clientId = c.req.query('clientId');
  const rows = await d.select().from(systems).orderBy(desc(systems.createdAt)).all();
  const cls = await d.select().from(clients).all();
  const filtered = clientId ? rows.filter((s) => s.clientId === clientId) : rows;
  return c.json(filtered.map((s) => ({ ...s, clientName: cls.find((cl) => cl.id === s.clientId)?.name || '—' })));
});

// --- Dev Cockpit: בדיקת חי/נפל לכל המערכות עם כתובת חיה ---
systemsApp.get('/status', async (c) => {
  const rows = await db(c).select().from(systems).all();
  const targets = rows.filter((s) => s.url && /^https?:\/\//i.test(s.url));
  const checks = await Promise.all(targets.map(async (s) => {
    const started = Date.now();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(s.url as string, {
        method: 'GET', redirect: 'follow', signal: ctrl.signal,
        headers: { 'user-agent': 'agency-hq-healthcheck' },
      });
      clearTimeout(timer);
      return { id: s.id, ok: res.ok, status: res.status, ms: Date.now() - started };
    } catch (e) {
      return { id: s.id, ok: false, status: 0, ms: Date.now() - started, error: String(e).slice(0, 120) };
    }
  }));
  return c.json(Object.fromEntries(checks.map((x) => [x.id, x])));
});

// --- Dev Cockpit: סטטוס GitHub למערכת בודדת (commit אחרון + PRs פתוחים) ---
systemsApp.get('/:id/github', async (c) => {
  const token = c.env.GITHUB_TOKEN;
  if (!token) return c.json({ configured: false });
  const s = (await db(c).select().from(systems).where(eq(systems.id, c.req.param('id'))).limit(1))[0];
  const m = s?.repoUrl?.match(/github\.com\/([^/]+)\/([^/.\s]+)/i);
  if (!m) return c.json({ configured: true, repo: null });
  const [, owner, repo] = m;
  const gh = (path: string) => fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
    headers: { authorization: `Bearer ${token}`, 'user-agent': 'agency-hq', accept: 'application/vnd.github+json' },
  });
  try {
    const [repoRes, prRes, commitRes] = await Promise.all([gh(''), gh('/pulls?state=open&per_page=100'), gh('/commits?per_page=1')]);
    if (!repoRes.ok) return c.json({ configured: true, repo: `${owner}/${repo}`, error: 'repo_' + repoRes.status });
    const repoData: any = await repoRes.json();
    const prs: any = prRes.ok ? await prRes.json() : [];
    const commits: any = commitRes.ok ? await commitRes.json() : [];
    const lc = commits[0];
    return c.json({
      configured: true, repo: `${owner}/${repo}`, defaultBranch: repoData.default_branch,
      openIssues: repoData.open_issues_count, openPRs: Array.isArray(prs) ? prs.length : 0,
      pushedAt: repoData.pushed_at,
      lastCommit: lc ? { sha: String(lc.sha).slice(0, 7), message: (lc.commit?.message || '').split('\n')[0], date: lc.commit?.author?.date, author: lc.commit?.author?.name } : null,
    });
  } catch (e) {
    return c.json({ configured: true, repo: `${owner}/${repo}`, error: String(e).slice(0, 120) });
  }
});

systemsApp.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  if (!body.name || !body.clientId) return c.json({ error: 'invalid_input' }, 400);
  const id = uid();
  await db(c).insert(systems).values({
    id,
    ...pick(body, FIELDS),
    clientId: String(body.clientId),
    name: String(body.name),
    progress: num(body.progress),
    authScore: body.authScore != null && body.authScore !== '' ? num(body.authScore) : null,
    createdAt: now(),
  } as any);
  return c.json({ ok: true, id });
});

systemsApp.patch('/:id', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const data = pick(body, FIELDS);
  if (data.progress !== undefined) (data as any).progress = num(data.progress);
  if ((data as any).authScore !== undefined) (data as any).authScore = (data as any).authScore === '' || (data as any).authScore == null ? null : num((data as any).authScore);
  if (Object.keys(data).length) {
    await db(c).update(systems).set(data as any).where(eq(systems.id, c.req.param('id')));
  }
  return c.json({ ok: true });
});

systemsApp.delete('/:id', async (c) => {
  await db(c).delete(systems).where(eq(systems.id, c.req.param('id')));
  return c.json({ ok: true });
});
