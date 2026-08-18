import { test, expect } from '@playwright/test';
import { AppShell } from '../pages/AppShell';
import { ClientsPage } from '../pages/ClientsPage';

test.describe('לקוחות', () => {
  test('יצירת לקוח חדש מופיעה ברשימה', async ({ page }) => {
    const app = new AppShell(page);
    await page.goto('/');
    await app.waitReady();

    await app.openTab('לקוחות ומערכות');
    const clients = new ClientsPage(page);
    await clients.open();

    const name = `בדיקת E2E ${Date.now()}`;
    await clients.createClient(name);

    await expect(app.toast(/נשמר/)).toBeVisible();
    await expect(clients.row(name)).toBeVisible();
  });
});
