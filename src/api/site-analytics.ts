import { Hono } from 'hono';
import { Env, todayIL } from './util';

const paths = new Set(['/', '/services', '/for-whom', '/about', '/contact', '/book', '/lp']);
const types = new Set(['page_view', 'booking_click', 'whatsapp_click', 'phone_click', 'contact_click', 'form_submit']);
const sources = new Set(['direct', 'search', 'social', 'referral']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const siteAnalyticsPublic = new Hono<Env>();
export const siteAnalyticsAdmin = new Hono<Env>();

siteAnalyticsPublic.post('/', async (c) => {
  const fetchSite = c.req.header('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin') return c.json({ error: 'forbidden' }, 403);
  const origin = c.req.header('origin');
  if (origin && origin !== new URL(c.req.url).origin) return c.json({ error: 'forbidden' }, 403);
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const id = String(body.id || '');
  const sessionId = String(body.sessionId || '');
  const path = String(body.path || '');
  const type = String(body.type || '');
  const source = String(body.source || '');
  if (!uuid.test(id) || !uuid.test(sessionId) || !paths.has(path) || !types.has(type) || !sources.has(source)) {
    return c.json({ error: 'invalid_event' }, 400);
  }
  await c.env.DB.prepare(`INSERT OR IGNORE INTO site_events
    (id, session_id, path, event_type, source, day, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, sessionId, path, type, source, todayIL(), Date.now()).run();
  return c.json({ ok: true });
});

siteAnalyticsAdmin.get('/', async (c) => {
  const requested = Number(c.req.query('days'));
  const days = [7, 30, 90].includes(requested) ? requested : 30;
  const through = todayIL();
  const start = new Date(`${through}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - days + 1);
  const since = start.toISOString().slice(0, 10);
  const startEpoch = Date.parse(`${since}T00:00:00Z`) - 3 * 60 * 60 * 1000;
  const d = c.env.DB;
  const [totals, daily, pages, actions, origins, leadCounts, bookings] = await Promise.all([
    d.prepare(`SELECT COUNT(*) AS views, COUNT(DISTINCT session_id) AS visits FROM site_events
      WHERE day >= ? AND event_type = 'page_view'`).bind(since).first<{ views: number; visits: number }>(),
    d.prepare(`SELECT day, COUNT(*) AS views FROM site_events WHERE day >= ? AND event_type = 'page_view'
      GROUP BY day ORDER BY day`).bind(since).all(),
    d.prepare(`SELECT path, COUNT(*) AS views FROM site_events WHERE day >= ? AND event_type = 'page_view'
      GROUP BY path ORDER BY views DESC`).bind(since).all(),
    d.prepare(`SELECT event_type AS type, COUNT(*) AS count FROM site_events WHERE day >= ?
      AND event_type <> 'page_view' GROUP BY event_type`).bind(since).all(),
    d.prepare(`SELECT source, COUNT(DISTINCT session_id) AS visits FROM site_events
      WHERE day >= ? AND event_type = 'page_view' GROUP BY source ORDER BY visits DESC`).bind(since).all(),
    d.prepare(`SELECT source, COUNT(*) AS count FROM leads WHERE created_at >= ?
      AND source IN ('website-home', 'website-contact', 'website-booking', 'landing')
      GROUP BY source`).bind(startEpoch).all(),
    d.prepare('SELECT COUNT(*) AS count FROM bookings WHERE created_at >= ?')
      .bind(startEpoch).first<{ count: number }>(),
  ]);
  return c.json({ since, through, days, views: totals?.views || 0, visits: totals?.visits || 0,
    daily: daily.results, pages: pages.results, actions: actions.results,
    sources: origins.results, leads: leadCounts.results, bookings: bookings?.count || 0 });
});
