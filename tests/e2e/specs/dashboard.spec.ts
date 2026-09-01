import { test, expect } from '@playwright/test';
import { AppShell } from '../pages/AppShell';

test.describe('לוח בקרה', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app');
    const app = new AppShell(page);
    await app.waitReady();
    // לוח הבקרה הישן נגיש כעת דרך תפריט "עוד"
    await app.openTab('לוח בקרה (ישן)');
    await expect(page.getByRole('heading', { name: /לוח בקרה/ })).toBeVisible();
  });

  test('רצועת ההכנסה מציגה MRR כמדד-על', async ({ page }) => {
    await expect(page.locator('.rev-hero .lbl')).toContainText('MRR');
    await expect(page.locator('.rev-hero .val')).toBeVisible();
    // ARR מוצג כהקשר בשורת ההערה
    await expect(page.locator('.rev-hero .note')).toContainText('בשנה');
    await page.screenshot({ path: 'test-results/dashboard.png' });
  });

  test('רצועת "טעון טיפול" מציגה 4 אותות וקליק מנווט למסך', async ({ page }) => {
    const items = page.locator('.att-item');
    await expect(items).toHaveCount(4);
    // האות הראשון (מערכות בפיתוח) מנווט למסך המאוחד "לקוחות ומערכות"
    await items.first().click();
    await expect(page.getByRole('heading', { name: /לקוחות ומערכות/ })).toBeVisible();
  });
});
