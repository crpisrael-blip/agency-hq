import { test, expect } from '@playwright/test';
import { AppShell } from '../pages/AppShell';

async function openCatalog(page: import('@playwright/test').Page) {
  const app = new AppShell(page);
  await page.goto('/');
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
    await expect(page.locator('#toast .toast', { hasText: 'הועתקו' })).toBeVisible();

    // הסרה מהמגירה מבטלת את הבחירה
    await tray.locator('.sk-chip', { hasText: 'e2e-testing' }).click();
    await expect(item).not.toHaveClass(/sel/);
  });

  test('סקיל מותקן מציג את הפרויקט שבו יושם', async ({ page }) => {
    await openCatalog(page);
    await page.fill('#skq', 'make-interfaces-feel-better');
    const item = page.locator('.sk-item.inst:visible').first();
    await expect(item).toBeVisible();
    await expect(item.locator('.sk-inst')).toContainText('agency-hq');
  });
});
