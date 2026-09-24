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
import { quotesApp } from '../../src/api/quotes';
import { modulesApp } from '../../src/api/modules';
import { dashboardApp } from '../../src/api/dashboard';
import { skillsApp } from '../../src/api/skills';
import { organizationsApp } from '../../src/api/organizations';
import { opportunitiesApp } from '../../src/api/opportunities';
import { proposalsApp } from '../../src/api/proposals';
import { projectsApp } from '../../src/api/projects';
import { activitiesApp } from '../../src/api/activities';
import { callsApp } from '../../src/api/calls';
import { todayApp } from '../../src/api/today';
import { telegramWebhook, telegramAdminApp } from '../../src/api/run-fill';
import { whatsappAdminApp } from '../../src/api/whatsapp';
import { salesApp } from '../../src/api/sales';
import { businessSettingsApp } from '../../src/api/business-settings';
import { bookingPublicApp, bookingsAdminApp } from '../../src/api/bookings';
import { metaWebhookApp, integrationsAdminApp } from '../../src/api/meta-inbound';

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
app.post('/telegram/webhook', telegramWebhook); // webhook ציבורי: בוט מילוי עצמי של הלקוח
app.route('/book', bookingPublicApp); // ציבורי: קביעת שיחה מהאתר (הגדרות, משבצות, קביעה)
app.route('/meta', metaWebhookApp); // ציבורי: webhook של Meta — ווטסאפ נכנס + טפסי לידים בפייסבוק

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
app.route('/quotes', quotesApp);
app.route('/modules', modulesApp);
app.route('/dashboard', dashboardApp);
app.route('/skills', skillsApp);

// --- BOS: מחזור עסקי ---
app.route('/organizations', organizationsApp);
app.route('/opportunities', opportunitiesApp);
app.route('/proposals', proposalsApp);
app.route('/projects', projectsApp);
app.route('/activities', activitiesApp);
app.route('/calls', callsApp);
app.route('/today', todayApp);
app.route('/telegram', telegramAdminApp); // הגדרת/מצב בוט המילוי (מוגן)
app.route('/whatsapp', whatsappAdminApp); // ווטסאפ אוטומטי לליד: הגדרות / מצב / בדיקה / שליחה חוזרת (מוגן)
app.route('/sales', salesApp); // צנרת מכירה: הצעת מחיר → הזמנה → הושלם → קבלה
app.route('/business-settings', businessSettingsApp); // הגדרות עסק (מסך הגדרות)
app.route('/bookings', bookingsAdminApp); // קביעת שיחה: הגדרות זמינות, משבצות, ניהול פגישות (מוגן)
app.route('/integrations', integrationsAdminApp); // אינטגרציית Meta נכנסת: הגדרות ווטסאפ-נכנס + לידים מפייסבוק (מוגן)

app.notFound((c) => c.json({ error: 'not_found' }, 404));

export const onRequest = handle(app);
