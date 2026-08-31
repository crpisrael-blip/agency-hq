import { test, expect } from '@playwright/test';
import { AppShell } from '../pages/AppShell';

const OR_NAME = 'מערכת ניהול חדרי ניתוח — כללית אסתטיקה';

async function openProcesses(page: import('@playwright/test').Page) {
  const app = new AppShell(page);
  await page.goto('/app');
  await app.waitReady();
  await app.openTab('תהליכים');
  await expect(app.heading(/תהליכים ומסעות לקוח/)).toBeVisible();
}

test.describe('תהליכים — מפת ניהול חדרי ניתוח', () => {
  test('מפת התהליך של כללית אסתטיקה מופיעה עם 24 שלבים', async ({ page }) => {
    await openProcesses(page);
    const card = page.locator('.card', { hasText: OR_NAME });
    await expect(card).toBeVisible();
    await expect(card).toContainText('24 שלבים');
  });

  test('פתיחת המפה מציגה שלבים עם אירוע מפעיל ותוצר/מדד', async ({ page }) => {
    await openProcesses(page);
    await page.locator('.card', { hasText: OR_NAME }).click();
    const modal = page.locator('#modal, .modal').first();
    await expect(page.locator('#stepsList .pstep').first()).toBeVisible();
    // שדה כותרת שלב ראשון כולל את סימון השלב הראשי
    await expect(page.locator('#stepsList input.grow').first()).toHaveValue(/①/);
    // קיים שדה אירוע מפעיל וגם שדה תוצר/מדד
    await expect(page.locator('#stepsList input[placeholder*="אירוע מפעיל"]').first()).toBeVisible();
    await expect(page.locator('#stepsList input[placeholder*="תוצר"]').first()).toBeVisible();
    // מספר השלבים שנטענו לעריכה = 24
    expect(await page.locator('#stepsList .pstep').count()).toBe(24);
  });
});
