import { Hono } from 'hono';
import { desc, eq, and } from 'drizzle-orm';
import { quotes, salesDeals, salesOrders, salesReceipts, cashflow } from '../db/schema';
import { Env, db, uid, now, todayIL, logActivity, logStatusChange } from './util';
import { loadBusinessConfig, isBusinessComplete } from './business-settings';
import { withAtomicDocNumber, bumpCounterStmt, RECEIPT_COUNTER_KEY, ORDER_COUNTER_KEY } from './doc-numbering';

/**
 * צנרת מכירה: הצעת מחיר (quotes, קיים) → הזמנה נפתחת (sales_deals + sales_orders)
 * → הושלם → קבלה (sales_receipts). עסקה נוצרת רק בלחיצה על "פתח הזמנה" — לא
 * בזמן יצירת ההצעה, כדי לא לגעת בזרימת ההצעה הקיימת. ר' migrations/0035 +
 * /root/.claude/plans/harmonic-weaving-wilkes.md לתיעוד ההחלטות.
 */
export const salesApp = new Hono<Env>();

const PAYMENT_METHODS = new Set(['cash', 'bank_transfer', 'credit_card', 'check', 'other']);

// מיזוג quotes (ללא עסקה עדיין) + sales_deals לקנבן 4 עמודות אחד
salesApp.get('/pipeline', async (c) => {
  const d = db(c);
  const [allQuotes, deals, receipts] = await Promise.all([
    d.select().from(quotes).orderBy(desc(quotes.createdAt)).limit(200).all(),
    d.select().from(salesDeals).orderBy(desc(salesDeals.createdAt)).all(),
    d.select().from(salesReceipts).all(),
  ]);
  const dealByQuote = new Set(deals.map((x) => x.quoteId));
  const quoteItems = allQuotes
    .filter((q) => !dealByQuote.has(q.id))
    .map((q) => ({
      kind: 'quote', stage: 'quote', id: q.id, quoteId: q.id, dealId: null,
      clientName: q.clientName, total: q.total, createdAt: q.createdAt, quoteNo: q.quoteNo,
    }));
  const dealItems = deals.map((deal) => ({
    kind: 'deal', stage: deal.stage, id: deal.id, dealId: deal.id, quoteId: deal.quoteId,
    clientName: deal.clientName, title: deal.title, totalAmount: deal.totalAmount, createdAt: deal.createdAt,
    receipts: receipts.filter((r) => r.dealId === deal.id).sort((a, b) => a.receiptNo - b.receiptNo),
  }));
  const out = [...quoteItems, ...dealItems].sort((a, b) => b.createdAt - a.createdAt);
  return c.json(out);
});

salesApp.get('/deals/:id', async (c) => {
  const id = c.req.param('id');
  const d = db(c);
  const deal = (await d.select().from(salesDeals).where(eq(salesDeals.id, id)).limit(1))[0];
  if (!deal) return c.json({ error: 'not_found' }, 404);
  const [orderRows, receipts, quoteRows] = await Promise.all([
    d.select().from(salesOrders).where(eq(salesOrders.dealId, id)).limit(1),
    d.select().from(salesReceipts).where(eq(salesReceipts.dealId, id)).all(),
    d.select().from(quotes).where(eq(quotes.id, deal.quoteId)).limit(1),
  ]);
  return c.json({
    deal, order: orderRows[0] || null,
    receipts: receipts.sort((a, b) => a.receiptNo - b.receiptNo),
    quote: quoteRows[0] || null,
  });
});

// "פתח הזמנה" — יוצר עסקה + מסמך הזמנה ממוספר-רץ מתוך הצעת מחיר קיימת. אידמפוטנטי.
salesApp.post('/deals', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const quoteId = String(body.quoteId || '');
  if (!quoteId) return c.json({ error: 'invalid_input' }, 400);
  const d = db(c);
  const q = (await d.select().from(quotes).where(eq(quotes.id, quoteId)).limit(1))[0];
  if (!q) return c.json({ error: 'not_found' }, 404);

  const existing = (await d.select().from(salesDeals).where(eq(salesDeals.quoteId, quoteId)).limit(1))[0];
  if (existing) {
    const order = (await d.select().from(salesOrders).where(eq(salesOrders.dealId, existing.id)).limit(1))[0] || null;
    return c.json({ ok: true, deal: existing, order });
  }

  const ts = now();
  const dealId = uid();
  const orderId = uid();

  const insertSql = withAtomicDocNumber(
    `INSERT INTO sales_orders
     (id, deal_id, order_no, client_name, title, items, subtotal, vat_pct, total, delivery_notes, created_at)
     VALUES (?, ?, __NEXT__, ?, ?, ?, ?, ?, ?, NULL, ?)
     RETURNING order_no`,
    ORDER_COUNTER_KEY,
  );
  const insertStmt = c.env.DB.prepare(insertSql).bind(
    orderId, dealId, q.clientName || '', q.title || '', q.items || '[]',
    q.subtotal || 0, q.vatPct || 0, q.total || 0, ts,
  );
  const [insertResult] = await c.env.DB.batch([insertStmt, bumpCounterStmt(c.env.DB, ORDER_COUNTER_KEY)]);
  const orderNo = String((insertResult.results?.[0] as any)?.order_no ?? '');

  await d.insert(salesDeals).values({
    id: dealId, quoteId, clientId: q.clientId, clientName: q.clientName || '',
    title: q.title, stage: 'order', totalAmount: q.total || 0,
    orderOpenedAt: ts, createdAt: ts,
  } as any);

  await logActivity(d, {
    entityType: 'sales_deal', entityId: dealId, type: 'document',
    title: `הזמנה נפתחה מהצעת מחיר ${q.quoteNo || ''}`, metadata: { quoteId, orderNo },
  });

  const deal = (await d.select().from(salesDeals).where(eq(salesDeals.id, dealId)).limit(1))[0];
  const order = (await d.select().from(salesOrders).where(eq(salesOrders.id, orderId)).limit(1))[0];
  return c.json({ ok: true, deal, order });
});

// מעבר שלב יחיד ומוגדר: order → completed
salesApp.patch('/deals/:id/stage', async (c) => {
  const id = c.req.param('id');
  const d = db(c);
  const cur = (await d.select().from(salesDeals).where(eq(salesDeals.id, id)).limit(1))[0];
  if (!cur) return c.json({ error: 'not_found' }, 404);
  const body = await c.req.json().catch(() => ({} as any));
  const next = String(body.stage || '');
  if (cur.stage !== 'order' || next !== 'completed') return c.json({ error: 'invalid_transition' }, 409);
  await d.update(salesDeals).set({ stage: 'completed', completedAt: now() }).where(eq(salesDeals.id, id));
  await logStatusChange(d, 'sales_deal', id, null, 'שלב עסקה', cur.stage, 'completed');
  return c.json({ ok: true });
});

// הפקת קבלה — חוסמת עד שפרטי עסק מלאים ועד שהעסקה הושלמה; אחריות: cashflow + מעבר stage
salesApp.post('/deals/:id/receipts', async (c) => {
  const dealId = c.req.param('id');
  const d = db(c);
  const deal = (await d.select().from(salesDeals).where(eq(salesDeals.id, dealId)).limit(1))[0];
  if (!deal) return c.json({ error: 'not_found' }, 404);
  if (deal.stage === 'order') return c.json({ error: 'deal_not_completed' }, 409);

  const body = await c.req.json().catch(() => ({} as any));
  const amount = Number(body.amount);
  const paymentMethod = String(body.paymentMethod || '');
  const description = String(body.description || '').slice(0, 500);
  if (!(amount > 0) || !PAYMENT_METHODS.has(paymentMethod) || !description) {
    return c.json({ error: 'invalid_input' }, 400);
  }

  const biz = await loadBusinessConfig(c);
  if (!isBusinessComplete(biz)) return c.json({ error: 'business_settings_incomplete' }, 400);

  const customerName = body.customerName ? String(body.customerName).slice(0, 160) : (deal.clientName || null);
  const issuerName = String(body.issuerName || biz.issuerName || '').slice(0, 120);
  if (!issuerName) return c.json({ error: 'business_settings_incomplete' }, 400);

  const receipt = await issueReceipt(c, {
    dealId, kind: 'receipt', creditsReceiptId: null, creditReason: null,
    customerName, amount, paymentMethod, description, issuerName, biz,
  });

  await d.update(salesDeals).set({ stage: 'receipt_issued' })
    .where(and(eq(salesDeals.id, dealId), eq(salesDeals.stage, 'completed')));

  await db(c).insert(cashflow).values({
    id: uid(), kind: 'income', label: `קבלה #${receipt.receiptNo} — ${deal.clientName}`,
    amount, clientId: deal.clientId, category: 'sales_receipt', status: 'paid',
    startDate: receipt.issueDate, actualDate: receipt.issueDate,
    sourceType: 'sales_receipt', sourceId: receipt.id, createdAt: now(),
  } as any);

  await logActivity(db(c), {
    entityType: 'sales_deal', entityId: dealId, type: 'document',
    title: `קבלה #${receipt.receiptNo} הופקה`, metadata: { receiptId: receipt.id, amount },
  });

  return c.json(receipt);
});

// קבלת זיכוי — מסמך חדש באותה סדרה, המקור נשאר בלתי-משתנה
salesApp.post('/receipts/:id/credit', async (c) => {
  const id = c.req.param('id');
  const d = db(c);
  const orig = (await d.select().from(salesReceipts).where(eq(salesReceipts.id, id)).limit(1))[0];
  if (!orig) return c.json({ error: 'not_found' }, 404);
  if (orig.kind !== 'receipt') return c.json({ error: 'not_a_receipt' }, 409);

  const body = await c.req.json().catch(() => ({} as any));
  const reason = String(body.reason || '').slice(0, 500);
  if (!reason) return c.json({ error: 'invalid_input' }, 400);
  const amount = body.amount !== undefined ? Number(body.amount) : orig.amount;
  if (!(amount > 0)) return c.json({ error: 'invalid_input' }, 400);

  const biz = await loadBusinessConfig(c);
  if (!isBusinessComplete(biz)) return c.json({ error: 'business_settings_incomplete' }, 400);

  const credit = await issueReceipt(c, {
    dealId: orig.dealId, kind: 'credit', creditsReceiptId: orig.id, creditReason: reason,
    customerName: orig.customerName, amount, paymentMethod: orig.paymentMethod,
    description: orig.description, issuerName: orig.issuerName || biz.issuerName || '', biz,
  });

  await db(c).insert(cashflow).values({
    id: uid(), kind: 'expense', label: `קבלת זיכוי #${credit.receiptNo} — מזכה קבלה #${orig.receiptNo}`,
    amount, category: 'sales_credit', status: 'paid',
    startDate: credit.issueDate, actualDate: credit.issueDate,
    sourceType: 'sales_receipt', sourceId: credit.id, createdAt: now(),
  } as any);

  await logActivity(db(c), {
    entityType: 'sales_deal', entityId: orig.dealId, type: 'document',
    title: `קבלת זיכוי #${credit.receiptNo} הופקה עבור קבלה #${orig.receiptNo}`,
    content: reason, metadata: { creditsReceiptId: orig.id },
  });

  return c.json({ ...credit, creditsReceiptNo: orig.receiptNo });
});

salesApp.get('/receipts/single/:id', async (c) => {
  const d = db(c);
  const row = (await d.select().from(salesReceipts).where(eq(salesReceipts.id, c.req.param('id'))).limit(1))[0];
  if (!row) return c.json({ error: 'not_found' }, 404);
  if (row.kind === 'credit' && row.creditsReceiptId) {
    const orig = (await d.select().from(salesReceipts).where(eq(salesReceipts.id, row.creditsReceiptId)).limit(1))[0];
    return c.json({ ...row, creditsReceiptNo: orig?.receiptNo });
  }
  return c.json(row);
});

/** הפקת שורת sales_receipts עם מספור רץ אטומי (batch יחיד — ר' doc-numbering.ts) */
async function issueReceipt(
  c: Parameters<typeof db>[0],
  args: {
    dealId: string; kind: 'receipt' | 'credit'; creditsReceiptId: string | null; creditReason: string | null;
    customerName: string | null; amount: number; paymentMethod: string; description: string; issuerName: string;
    biz: Awaited<ReturnType<typeof loadBusinessConfig>>;
  },
) {
  const id = uid();
  const ts = now();
  const issueDate = todayIL();
  const insertSql = withAtomicDocNumber(
    `INSERT INTO sales_receipts
     (id, deal_id, receipt_no, kind, credits_receipt_id, credit_reason, issue_date,
      business_name, business_tax_id, business_address, customer_name, amount,
      payment_method, description, issuer_name, created_at)
     VALUES (?, ?, __NEXT__, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING receipt_no`,
    RECEIPT_COUNTER_KEY,
  );
  const insertStmt = c.env.DB.prepare(insertSql).bind(
    id, args.dealId, args.kind, args.creditsReceiptId, args.creditReason, issueDate,
    args.biz.businessName, args.biz.businessTaxId, args.biz.businessAddress, args.customerName,
    args.amount, args.paymentMethod, args.description, args.issuerName, ts,
  );
  const [insertResult] = await c.env.DB.batch([insertStmt, bumpCounterStmt(c.env.DB, RECEIPT_COUNTER_KEY)]);
  const receiptNo = Number((insertResult.results?.[0] as any)?.receipt_no);
  const row = (await db(c).select().from(salesReceipts).where(eq(salesReceipts.id, id)).limit(1))[0];
  return { ...row, receiptNo };
}
