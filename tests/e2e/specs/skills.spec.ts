import { test, expect } from '@playwright/test';
import { AppShell } from '../pages/AppShell';

async function openCatalog(page: import('@playwright/test').Page) {
  const app = new AppShell(page);
  await page.goto('/app');
  await app.waitReady();
  await app.skillsButton.click();
  await expect(page.getByRole('heading', { name: /מאגר סקילז/ })).toBeVisible();
}

test.describe('מאגר סקילז ופקודות', () => {
  test('הקטלוג נטען עם מאות פריטים', async ({ page }) => {
    await openCatalog(page);
    const items = page.locator('.sk-item');
    // 285 סקילז + 94 פקודות
    expect(await items.count()).toBeGreaterThan(300);
  });

  test('חיפוש מסנן לפריט מבוקש', async ({ page }) => {
    await openCatalog(page);
    await page.fill('#skq', 'database-migrations');
    const visible = page.locator('.sk-item:visible');
    await expect(visible).toHaveCount(1);
    await expect(visible.first()).toContainText('database-migrations');
  });

  test('סינון לפי קטגוריה מציג רק את הקטגוריה שנבחרה', async ({ page }) => {
    await openCatalog(page);
    await page.selectOption('#skCat', 'db');
    const secs = page.locator('#view .sk-sec:visible');
    await expect(secs).toHaveCount(1);
    await expect(secs.first()).toContainText('בסיסי נתונים');
    await expect(page.locator('.sk-item:visible').first()).toContainText('database-migrations');
  });

  test('מסנן "בשימוש" מציג רק סקילז שמסומנים במערכת', async ({ page }) => {
    await openCatalog(page);
    await page.getByRole('button', { name: '✅ בשימוש', exact: true }).click();
    const visible = page.locator('.sk-item:visible');
    await expect(visible.first()).toBeVisible();
    const total = await visible.count();
    const inst = await page.locator('.sk-item.inst:visible').count();
    expect(total).toBe(inst);
    expect(total).toBeGreaterThanOrEqual(1);
  });

  test('מסנן "פקודות" מציג רק פקודות', async ({ page }) => {
    await openCatalog(page);
    await page.getByRole('button', { name: 'פקודות', exact: true }).click();
    await expect(page.locator('.sk-item.skill:visible')).toHaveCount(0);
    await expect(page.locator('.sk-item.cmd:visible').first()).toBeVisible();
  });

  test('בחירה מרובה: לחיצה בוחרת, המגירה אוספת והעתקה עובדת', async ({ page }) => {
    await openCatalog(page);
    await page.fill('#skq', 'e2e-testing');
    const item = page.locator('.sk-item:visible').first();
    await item.click();
    await expect(item).toHaveClass(/sel/);

    const tray = page.locator('#skTray');
    await expect(tray).toHaveClass(/open/);
    await expect(tray).toContainText('e2e-testing');

    await tray.getByRole('button', { name: /העתק/ }).click();
    // נפתח מודל "העתק + סימון התקנה" — נעתיק בלבד
    await page.getByRole('button', { name: 'העתק בלבד', exact: true }).click();
    await expect(page.locator('#toast .toast', { hasText: 'הועתקו' })).toBeVisible();

    // הסרה מהמגירה מבטלת את הבחירה
    await tray.locator('.sk-chip', { hasText: 'e2e-testing' }).click();
    await expect(item).not.toHaveClass(/sel/);
  });

  test('"העתק וסמן" רושם שימוש בפרויקט שנבחר', async ({ page }) => {
    await openCatalog(page);
    await page.fill('#skq', 'frontend-design-direction');
    const item = page.locator('.sk-item:visible').first();
    await item.click();
    const tray = page.locator('#skTray');
    await tray.getByRole('button', { name: /העתק/ }).click();
    // בורר פרויקט → שם חופשי → העתק וסמן
    await page.fill('#sk_copy_free', 'qa-sandbox');
    await page.getByRole('button', { name: /העתק וסמן/ }).click();
    await expect(page.locator('#toast .toast', { hasText: 'סומנו' })).toBeVisible();
    // אחרי רענון המסך — הצ'יפ של הפרויקט מופיע על הסקיל
    await page.fill('#skq', 'frontend-design-direction');
    await expect(page.locator('.sk-item.inst:visible .sk-use', { hasText: 'qa-sandbox' }).first()).toBeVisible();
  });

  test('סקיל שסומן מציג את המערכת שהשתמשה בו', async ({ page }) => {
    await openCatalog(page);
    await page.fill('#skq', 'make-interfaces-feel-better');
    const item = page.locator('.sk-item.inst:visible').first();
    await expect(item).toBeVisible();
    await expect(item.locator('.sk-use')).toContainText('agency-hq');
  });
});
