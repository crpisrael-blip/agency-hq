/**
 * מספור רץ אטומי, ללא פערים אפשריים גם בכשל חלקי וגם בבקשות מקבילות. שני
 * סטטמנטים שנשלחים יחד ב-D1 batch (=טרנזקציה אחת אטומית): (1) INSERT מסמך
 * היעד, שבו מספר המסמך מחושב ב-SQL מתוך תת-שאילתה שקוראת את הערך *הנוכחי*
 * של המונה ב-settings (לא ערך שנקרא בקריאה קודמת מה-Worker — זה בדיוק מה
 * שמונע מרוץ); (2) קידום המונה. אם ה-INSERT נכשל (למשל constraint), כל
 * ה-batch מתבטל — אין מצב שבו המונה קודם אבל אף מסמך לא נוצר.
 */

export const RECEIPT_COUNTER_KEY = 'sales_receipt_next_number'; // סדרה משותפת לקבלות ולזיכויים
export const ORDER_COUNTER_KEY = 'sales_order_next_number';

/**
 * מחליף את המחרוזת __NEXT__ בסטטמנט ה-INSERT הנתון בתת-שאילתה שקוראת את המונה
 * הנוכחי. counterKey תמיד קבוע פנימי משלנו (לעולם לא קלט משתמש) — משום כך
 * בטוח לשבץ אותו ישירות לטקסט ה-SQL כאן; אין לקרוא לפונקציה הזו עם מפתח שמקורו
 * בקלט חיצוני בלי לוודא זאת מחדש.
 */
export function withAtomicDocNumber(insertSqlWithPlaceholder: string, counterKey: string): string {
  const sub = `COALESCE((SELECT CAST(value AS INTEGER) FROM settings WHERE key='${counterKey}'), 1)`;
  return insertSqlWithPlaceholder.replace('__NEXT__', sub);
}

/** סטטמנט קידום המונה — יש לשלוח יחד עם ה-INSERT באותו batch() בדיוק. */
export function bumpCounterStmt(DB: D1Database, counterKey: string): D1PreparedStatement {
  return DB.prepare(
    `INSERT INTO settings (key, value) VALUES (?, '2')
     ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)`
  ).bind(counterKey);
}

/** קריאה בלבד לתצוגה (למשל "המספר הבא: 7") — אף פעם לא משמשת בפועל להקצאת מספר. */
export async function readCounterForDisplay(DB: D1Database, counterKey: string): Promise<number> {
  const row = await DB.prepare('SELECT value FROM settings WHERE key = ?').bind(counterKey).first<{ value: string }>();
  const n = Number(row?.value);
  return Number.isFinite(n) ? n : 1;
}
