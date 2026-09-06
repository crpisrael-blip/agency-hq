import { test, expect } from '@playwright/test';
import { AppShell } from '../pages/AppShell';

// בועת הרעיונות (#fb-bubble) נוצרת ב-init() אסינכרונית. בלי דגל סינכרוני, שתי קריאות
// מקבילות (self-init + showApp) עברו את השומר לפני היצירה ונוצרו שתי בועות. הבדיקה
// משחזרת את המרוץ (שתי קריאות במקביל) ומוודאת שלעולם לא נוצרת יותר מבועה אחת.
test('בועת הרעיונות — לעולם לא כפולה, גם בקריאות init מקבילות', async ({ page }) => {
  const app = new AppShell(page);
  await page.goto('/app');
  await app.waitReady();

  // מצב רגיל: לכל היותר בועה אחת
  expect(await page.locator('#fb-bubble').count()).toBeLessThanOrEqual(1);

  // שחזור המרוץ: איפוס ואז שתי אתחולים במקביל
  const count = await page.evaluate(async () => {
    (window as any).ideaBubbleDestroy?.();
    const init = (window as any).ideaBubbleInit;
    if (typeof init !== 'function') return -1;
    await Promise.all([init(), init()]);
    return document.querySelectorAll('#fb-bubble').length;
  });
  // -1 = אין בכלל בועה בסביבה הזו (לא רגרסיה); אחרת חייב להיות בדיוק 1, לעולם לא 2
  expect(count).toBeLessThanOrEqual(1);
});
