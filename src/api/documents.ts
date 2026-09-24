import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { documents, clients } from '../db/schema';
import { Env, db, uid, now, pick, num } from './util';

export const documentsApp = new Hono<Env>();

const FIELDS = ['clientId', 'systemId', 'title', 'category', 'source', 'url', 'notes', 'pinned'];

// רשימה — אופציונלי סינון ?clientId=
documentsApp.get('/', async (c) => {
  const d = db(c);
  const rows = await d.select().from(documents).orderBy(desc(documents.pinned), desc(documents.createdAt)).all();
  const cls = await d.select().from(clients).all();
  const clientId = c.req.query('clientId');
  const filtered = clientId ? rows.filter((r) => r.clientId === clientId) : rows;
  return c.json(filtered.map((r) => ({ ...r, clientName: cls.find((cl) => cl.id === r.clientId)?.name || null })));
});

documentsApp.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  if (!body.title) return c.json({ error: 'invalid_input' }, 400);
  const data: any = pick(body, FIELDS);
  if (data.pinned !== undefined) data.pinned = num(data.pinned);
  const id = uid();
  await db(c).insert(documents).values({ id, ...data, title: String(body.title), createdAt: now() } as any);
  return c.json({ ok: true, id });
});

documentsApp.patch('/:id', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const data: any = pick(body, FIELDS);
  if (data.pinned !== undefined) data.pinned = num(data.pinned);
  if (Object.keys(data).length) await db(c).update(documents).set(data).where(eq(documents.id, c.req.param('id')));
  return c.json({ ok: true });
});

documentsApp.delete('/:id', async (c) => {
  const id = c.req.param('id');
  // מחיקת הקובץ המצורף מ-R2 (אם יש) — למניעת יתומים
  const row = (await db(c).select().from(documents).where(eq(documents.id, id)).limit(1))[0];
  if (row?.fileKey && c.env.RECEIPTS) { try { await c.env.RECEIPTS.delete(row.fileKey); } catch { /* best-effort */ } }
  await db(c).delete(documents).where(eq(documents.id, id));
  return c.json({ ok: true });
});

// ---------- קובץ מצורף למסמך — ב-R2 (אותו bucket פרטי של הקבלות, קידומת documents/) ----------
const FILE_MAX_BYTES = 25 * 1024 * 1024; // 25MB

// העלאה/החלפה של הקובץ (multipart/form-data, שדה "file")
documentsApp.post('/:id/file', async (c) => {
  if (!c.env.RECEIPTS) return c.json({ error: 'storage_unavailable' }, 503);
  const id = c.req.param('id');
  const row = (await db(c).select().from(documents).where(eq(documents.id, id)).limit(1))[0];
  if (!row) return c.json({ error: 'not_found' }, 404);
  let form: FormData;
  try { form = await c.req.formData(); } catch { return c.json({ error: 'invalid_input' }, 400); }
  const file = form.get('file');
  if (!file || typeof file === 'string') return c.json({ error: 'no_file' }, 400);
  const buf = await (file as File).arrayBuffer();
  if (buf.byteLength > FILE_MAX_BYTES) return c.json({ error: 'too_large' }, 413);
  if (buf.byteLength === 0) return c.json({ error: 'empty_file' }, 400);
  const type = (file as File).type || 'application/octet-stream';
  const safeName = ((file as File).name || 'file').replace(/[^\w.\-֐-׿ ]+/g, '_').slice(0, 120);
  const key = `documents/${id}/${uid()}`;
  await c.env.RECEIPTS.put(key, buf, { httpMetadata: { contentType: type } });
  // מחיקת הקובץ הקודם אחרי שהחדש נשמר
  if (row.fileKey) { try { await c.env.RECEIPTS.delete(row.fileKey); } catch { /* best-effort */ } }
  await db(c).update(documents)
    .set({ fileKey: key, fileName: safeName, fileType: type, fileSize: buf.byteLength } as any)
    .where(eq(documents.id, id));
  return c.json({ ok: true, fileName: safeName, fileType: type, fileSize: buf.byteLength });
});

// צפייה/הורדה (מוגן בטוקן מנהל — כמו כל /api). inline לתצוגה, ?download להורדה.
documentsApp.get('/:id/file', async (c) => {
  if (!c.env.RECEIPTS) return c.json({ error: 'storage_unavailable' }, 503);
  const row = (await db(c).select().from(documents).where(eq(documents.id, c.req.param('id'))).limit(1))[0];
  if (!row?.fileKey) return c.json({ error: 'not_found' }, 404);
  const obj = await c.env.RECEIPTS.get(row.fileKey);
  if (!obj) return c.json({ error: 'not_found' }, 404);
  const disp = c.req.query('download') != null ? 'attachment' : 'inline';
  const fname = encodeURIComponent(row.fileName || 'file');
  return new Response(obj.body, {
    headers: {
      'Content-Type': row.fileType || 'application/octet-stream',
      'Content-Disposition': `${disp}; filename*=UTF-8''${fname}`,
      'Cache-Control': 'private, max-age=60',
    },
  });
});

// הסרת הקובץ המצורף (המסמך עצמו נשאר)
documentsApp.delete('/:id/file', async (c) => {
  const id = c.req.param('id');
  const row = (await db(c).select().from(documents).where(eq(documents.id, id)).limit(1))[0];
  if (!row) return c.json({ error: 'not_found' }, 404);
  if (row.fileKey && c.env.RECEIPTS) { try { await c.env.RECEIPTS.delete(row.fileKey); } catch { /* best-effort */ } }
  await db(c).update(documents)
    .set({ fileKey: null, fileName: null, fileType: null, fileSize: null } as any)
    .where(eq(documents.id, id));
  return c.json({ ok: true });
});
