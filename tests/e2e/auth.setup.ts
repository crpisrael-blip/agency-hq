import { test as setup, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { AppShell } from './pages/AppShell';

/**
 * מריץ פעם אחת לפני כל שאר הבדיקות (project "setup").
 * נכנס עם PIN (או מגדיר אותו בהרצה הראשונה על DB מקומי ריק) ושומר את
 * מצב-ההתחברות, כדי ששאר המסכים יתחילו כבר מחוברים.
 *
 * ה-PIN ניתן להגדרה דרך E2E_PIN. חשוב: הבדיקות מניחות DB מקומי משלהן;
 * אם כבר הוגדר PIN אחר, הרץ מחדש עם E2E_PIN התואם.
 */
const PIN = process.env.E2E_PIN || '4321';
const authFile = 'tests/e2e/.auth/user.json';

setup('authenticate', async ({ page }) => {
  const login = new LoginPage(page);
  const app = new AppShell(page);

  await login.goto();
  // בין אם זו הגדרה ראשונית ובין אם כניסה רגילה — אותו PIN קבוע לבדיקות.
  await login.submitPin(PIN);

  await app.waitReady();
  await page.context().storageState({ path: authFile });
});
