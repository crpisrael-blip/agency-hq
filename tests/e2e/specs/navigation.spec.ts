import { test, expect } from '@playwright/test';
import { AppShell } from '../pages/AppShell';

// תווית הלשונית → כותרת המסך (התאמה מדויקת)
const TABS: Array<[string, string]> = [
  ['לקוחות', 'לקוחות'],
  ['מערכות', 'מערכות'],
  ['תזרים', 'תזרים'],
  ['מרכזי רווח', 'מרכזי רווח'],
  ['משימות', 'משימות'],
];

test.describe('ניווט בין מסכים', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await new AppShell(page).waitReady();
  });

  for (const [label, heading] of TABS) {
    test(`מעבר ללשונית "${label}" מציג את הכותרת הנכונה`, async ({ page }) => {
      const app = new AppShell(page);
      await app.openTab(label);
      await expect(
        page.getByRole('heading', { name: new RegExp(`^${heading}$`) }),
      ).toBeVisible();
      // הלשונית הפעילה מסומנת
      await expect(app.nav.getByRole('button', { name: label, exact: true })).toHaveClass(/on/);
    });
  }
});
