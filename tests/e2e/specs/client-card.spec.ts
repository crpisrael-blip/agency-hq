import { test, expect } from '@playwright/test';
import { AppShell } from '../pages/AppShell';
import { ClientsPage } from '../pages/ClientsPage';

// כרטיס הלקוח המאוחד — כרטיס מסך-מלא יחיד לכל לקוח, שאליו מגיעים מכל מקום רלוונטי.
// מוודא שהוא נפתח מהניווט הראשי "לקוחות" בלי שגיאות JS ומאחד את המקטעים משתי השכבות.
test('כרטיס לקוח מאוחד נפתח מ"לקוחות" בלי שגיאות ומציג + משימה', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    // מתעלמים מכשלי-רשת של משאבים חיצוניים (רעש סביבה), נכשלים רק על שגיאות JS אמיתיות
    const t = m.text();
    if (m.type() === 'error' && !/ERR_CONNECTION_RESET|Failed to load resource/.test(t)) errors.push('console: ' + t);
  });

  const app = new AppShell(page);
  await page.goto('/app');
  await app.waitReady();

  // הניווט הראשי "לקוחות" מציג את הרשימה המאוחדת היחידה (אקורדיון + חיפוש)
  await app.openTab('לקוחות');
  const clients = new ClientsPage(page);
  await clients.open();
  await expect(page.locator('#pfS')).toBeVisible(); // תיבת החיפוש של הרשימה המאוחדת
  const name = `כרטיס E2E ${Date.now()}`;
  await clients.createClient(name);
  await expect(app.toast(/נשמר/)).toBeVisible();
  await expect(clients.row(name)).toBeVisible();
  await page.screenshot({ path: 'test-results/unified-list.png', fullPage: true });

  // פתיחת הכרטיס המאוחד דרך כפתור "פרטים" בשורת הלקוח (openClient — הכרטיס היחיד)
  await clients.row(name).getByRole('button', { name: 'פרטים' }).click();

  // הכרטיס המאוחד: כפתור + משימה + מקטעים משתי השכבות
  await expect(page.locator('#view').getByRole('button', { name: '+ משימה' }).first()).toBeVisible();
  for (const h of ['מערכות', 'הזדמנויות', 'פרויקטים', '📋 משימות', 'התקשרויות']) {
    await expect(page.locator('#view .card h3', { hasText: h }).first()).toBeVisible();
  }

  await page.screenshot({ path: 'test-results/unified-card.png', fullPage: true });
  expect(errors, 'no runtime errors on the unified card').toEqual([]);
});
