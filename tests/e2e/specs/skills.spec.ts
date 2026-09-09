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
    // 286 סקילז ECC + 94 פקודות + 214 סקילז Skills IL
    expect(await items.count()).toBeGreaterThan(550);
    expect(await page.locator('.sk-item.il').count()).toBeGreaterThan(200);
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

  test('מסנן "Skills IL" מציג רק סקילז ישראליים, וכל אחד עם נתיב גישה', async ({ page }) => {
    await openCatalog(page);
    await page.getByRole('button', { name: /Skills IL/ }).click();
    await expect(page.locator('.sk-item.skill:visible')).toHaveCount(0);
    await expect(page.locator('.sk-item.cmd:visible')).toHaveCount(0);
    const first = page.locator('.sk-item.il:visible').first();
    await expect(first).toBeVisible();
    // נתיב הגישה: skills-il/<ריפו>/<שם> — קישור ל-GitHub
    await expect(first.locator('.sk-src')).toContainText(/skills-il\/[a-z-]+\/[a-z0-9-]+/);
    await expect(first.locator('.sk-src a')).toHaveAttribute('href', /github\.com\/skills-il\//);
  });

  test('חיפוש לפי נתיב גישה מוצא סקיל של Skills IL', async ({ page }) => {
    await openCatalog(page);
    await page.fill('#skq', 'skills-il/localization/hebrew-i18n');
    const visible = page.locator('.sk-item:visible');
    await expect(visible).toHaveCount(1);
    await expect(visible.first()).toContainText('hebrew-i18n');
    await expect(visible.first()).toHaveClass(/il/);
  });

  test('קטגוריה של Skills IL בבורר מציגה רק אותה', async ({ page }) => {
    await openCatalog(page);
    await page.selectOption('#skCat', 'il-localization');
    const secs = page.locator('#view .sk-sec:visible');
    await expect(secs).toHaveCount(1);
    await expect(secs.first()).toContainText('לוקליזציה');
  });

  test('חבילה מוכנה בוחרת כמה סקילז בבת אחת', async ({ page }) => {
    await openCatalog(page);
    await page.getByRole('button', { name: /ערכת כלים למפתחים ישראלים/ }).click();
    const tray = page.locator('#skTray');
    await expect(tray).toHaveClass(/open/);
    await expect(tray).toContainText('hebrew-i18n');
    await expect(tray).toContainText('israeli-id-validator');
    expect(await page.locator('.sk-item.il.sel').count()).toBeGreaterThanOrEqual(4);
  });

  test('"העתק וסמן" על סקיל של Skills IL רושם שימוש עם המקור', async ({ page }) => {
    await openCatalog(page);
    await page.fill('#skq', 'israeli-phone-formatter');
    const item = page.locator('.sk-item.il:visible').first();
    await item.click();
    const tray = page.locator('#skTray');
    await tray.getByRole('button', { name: /העתק/ }).click();
    await expect(page.locator('.modal')).toContainText('Skills IL');
    await page.fill('#sk_copy_free', 'qa-sandbox-il');
    await page.getByRole('button', { name: /העתק וסמן/ }).click();
    await expect(page.locator('#toast .toast', { hasText: 'סומנו' })).toBeVisible();
    await page.fill('#skq', 'israeli-phone-formatter');
    await expect(page.locator('.sk-item.il.inst:visible .sk-use', { hasText: 'qa-sandbox-il' }).first()).toBeVisible();
    // ה-API מחזיר את המקור ואת נתיב הגישה
    // דרך ה-API של האפליקציה (עם טוקן המנהל)
    const usage = await page.evaluate("apiGet('/skills/usage')");
    const rows = usage['skills-il:israeli-phone-formatter'] || [];
    expect(rows.some((r: any) => r.systemName === 'qa-sandbox-il' && r.sourceRef === 'skills-il/developer-tools/israeli-phone-formatter')).toBe(true);
  });

  test('סקיל עברי שכבר מותקן מוצג תחת Skills IL עם המערכת', async ({ page }) => {
    await openCatalog(page);
    await page.fill('#skq', 'hebrew-content-writer');
    const item = page.locator('.sk-item.il.inst:visible').first();
    await expect(item).toBeVisible();
    await expect(item.locator('.sk-use')).toContainText('agency-hq');
  });

  test('סקיל שסומן מציג את המערכת שהשתמשה בו', async ({ page }) => {
    await openCatalog(page);
    await page.fill('#skq', 'make-interfaces-feel-better');
    const item = page.locator('.sk-item.inst:visible').first();
    await expect(item).toBeVisible();
    await expect(item.locator('.sk-use')).toContainText('agency-hq');
  });
});
