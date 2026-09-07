import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { quotes } from '../db/schema';
import { Env, db, uid, now } from './util';

export const quotesApp = new Hono<Env>();

quotesApp.get('/', async (c) => {
  const rows = await db(c).select().from(quotes).orderBy(desc(quotes.createdAt)).limit(200).all();
  return c.json(rows);
});

quotesApp.get('/:id', async (c) => {
  const row = (await db(c).select().from(quotes).where(eq(quotes.id, c.req.param('id'))).limit(1))[0];
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json(row);
});

quotesApp.post('/', async (c) => {
  const b = await c.req.json().catch(() => ({} as any));
  const clientName = b.clientName ? String(b.clientName).slice(0, 160) : null;
  if (!clientName) return c.json({ error: 'missing_client' }, 400);
  const items = Array.isArray(b.items) ? b.items : [];
  const row = {
    id: uid(),
    quoteNo: b.quoteNo ? String(b.quoteNo).slice(0, 40) : null,
    clientId: b.clientId ? String(b.clientId) : null,
    clientName,
    title: b.title ? String(b.title).slice(0, 200) : null,
    items: JSON.stringify(items).slice(0, 8000),
    subtotal: Number(b.subtotal) || 0,
    vatPct: Number(b.vatPct) || 0,
    total: Number(b.total) || 0,
    terms: b.terms ? String(b.terms).slice(0, 500) : null,
    notes: b.notes ? String(b.notes).slice(0, 800) : null,
    validUntil: b.validUntil ? String(b.validUntil).slice(0, 10) : null,
    runId: b.runId ? String(b.runId).slice(0, 64) : null,
    runTitle: b.runTitle ? String(b.runTitle).slice(0, 200) : null,
    createdAt: now(),
  };
  await db(c).insert(quotes).values(row);
  return c.json(row);
});

quotesApp.delete('/:id', async (c) => {
  await db(c).delete(quotes).where(eq(quotes.id, c.req.param('id')));
  return c.json({ ok: true });
});
