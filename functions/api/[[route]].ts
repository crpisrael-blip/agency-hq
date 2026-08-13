import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { handle } from 'hono/cloudflare-pages';
import { Env, requireAdmin } from '../../src/api/util';
import { auth } from '../../src/api/auth';
import { clientsApp } from '../../src/api/clients';
import { systemsApp } from '../../src/api/systems';
import { engagementsApp } from '../../src/api/engagements';
import { financeApp } from '../../src/api/finance';
import { ideasApp } from '../../src/api/ideas';
import { processesApp } from '../../src/api/processes';
import { playbooksApp } from '../../src/api/playbooks';
import { tasksApp } from '../../src/api/tasks';
import { feedbackApp } from '../../src/api/feedback';
import { documentsApp } from '../../src/api/documents';
import { leadsApp, registerLeadPublic } from '../../src/api/leads';
import { dashboardApp } from '../../src/api/dashboard';

const app = new Hono<Env>().basePath('/api');

app.use('*', cors());

// --- ציבורי ---
app.get('/health', async (c) => {
  try {
    const r = await c.env.DB.prepare('SELECT 1 as ok').first<{ ok: number }>();
    return c.json({ ok: true, db: r?.ok === 1, ts: Date.now() });
  } catch (e) {
    return c.json({ ok: true, db: false, error: String(e) }, 200);
  }
});

app.route('/auth', auth); // כניסת מנהל
app.post('/hook/lead', registerLeadPublic); // webhook ציבורי: מערכות לקוח רושמות ליד

// --- מוגן: כל השאר דורש טוקן מנהל ---
app.use('*', requireAdmin);

app.route('/clients', clientsApp);
app.route('/systems', systemsApp);
app.route('/engagements', engagementsApp);
app.route('/finance', financeApp);
app.route('/ideas', ideasApp);
app.route('/processes', processesApp);
app.route('/playbooks', playbooksApp);
app.route('/tasks', tasksApp);
app.route('/feedback', feedbackApp);
app.route('/documents', documentsApp);
app.route('/leads', leadsApp);
app.route('/dashboard', dashboardApp);

app.notFound((c) => c.json({ error: 'not_found' }, 404));

export const onRequest = handle(app);
