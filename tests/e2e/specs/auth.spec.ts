import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { AppShell } from '../pages/AppShell';

// בדיקות הכניסה רצות ללא מצב-התחברות שמור (מתחילות מהמסך הנעול)
test.use({ storageState: { cookies: [], origins: [] } });

const PIN = process.env.E2E_PIN || '4321';

test.describe('כניסה ואימות', () => {
  test('קוד שגוי משאיר במסך הכניסה עם הודעת שגיאה', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.submitPin('000000');
    await expect(login.error).toHaveText(/קוד שגוי|שגיאה/);
    await expect(login.card).toBeVisible();
  });

  test('כניסה תקינה פותחת את הלוח, ויציאה חוזרת למסך הכניסה', async ({ page }) => {
    const login = new LoginPage(page);
    const app = new AppShell(page);

    await login.goto();
    await login.submitPin(PIN);
    await app.waitReady();

    await app.logoutButton.click();
    await expect(login.card).toBeVisible();
  });
});
