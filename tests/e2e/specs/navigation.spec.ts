import { test, expect } from '@playwright/test';
import { AppShell } from '../pages/AppShell';

// ניווט ראשי BOS: תווית לשונית → אלמנט מזהה במסך
type Check = [label: string, assert: (page: import('@playwright/test').Page) => Promise<void>];
const TABS: Check[] = [
  ['היום', async (p) => { await expect(p.getByRole('heading', { name: /^היום$/ })).toBeVisible(); }],
  ['מכירות', async (p) => { await expect(p.locator('.tabs2 button', { hasText: 'הזדמנויות' })).toBeVisible(); }],
  ['לקוחות', async (p) => { await expect(p.getByRole('heading', { name: /^לקוחות$/ })).toBeVisible(); }],
  ['עבודה', async (p) => { await expect(p.locator('.tabs2 button', { hasText: 'פרויקטים' })).toBeVisible(); }],
  ['כספים', async (p) => { await expect(p.locator('.tabs2 button', { hasText: 'סקירה' })).toBeVisible(); }],
  ['צמיחה', async (p) => { await expect(p.locator('.tabs2 button', { hasText: 'מרכזי רווח' })).toBeVisible(); }],
];

test.describe('ניווט ראשי (BOS)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app');
    await new AppShell(page).waitReady();
  });

  for (const [label, assertFn] of TABS) {
    test(`לשונית "${label}" נטענת ומסומנת כפעילה`, async ({ page }) => {
      const app = new AppShell(page);
      await app.openTab(label);
      await assertFn(page);
      await expect(app.nav.getByRole('button', { name: label, exact: true })).toHaveClass(/on/);
    });
  }
});
