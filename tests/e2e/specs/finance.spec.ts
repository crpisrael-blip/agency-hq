import { test, expect } from '@playwright/test';
import { AppShell } from '../pages/AppShell';

/**
 * מרכז השליטה הפיננסי (Finance Control).
 * מוודא שמסך "כספים" נפתח בלשונית "שליטה", מציג KPIs וגרף תחזית, ושמעבר בין
 * לשוניות המשנה החדשות מרנדר תוכן אמיתי (מחובר ל-API, לא Mock).
 */
test.describe('כספים — מרכז שליטה', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app');
    await new AppShell(page).waitReady();
    await new AppShell(page).openTab('כספים');
  });

  test('לשונית שליטה מציגה KPIs, מצב עסק וגרף תחזית', async ({ page }) => {
    // ברירת המחדל של כספים היא "שליטה"
    await expect(page.locator('.tabs2 button', { hasText: 'שליטה' })).toHaveClass(/on/);
    // באנר מצב העסק
    await expect(page.locator('.fin-status')).toBeVisible();
    // לפחות כמה KPIs לחיצים עם הסבר
    await expect(page.locator('.kpi.clk').first()).toBeVisible();
    await expect(page.locator('.kpi.clk')).toHaveCount(10);
    // גרף תחזית (SVG)
    await expect(page.locator('svg.fin-chart').first()).toBeVisible();
    // KPI פותח הסבר "איך חושב?" (מודאל עם הסבר וכפתור סגירה)
    await page.locator('.kpi.clk').first().click();
    await expect(page.locator('.overlay')).toBeVisible();
    await expect(page.locator('.overlay').getByRole('button', { name: 'סגירה' })).toBeVisible();
  });

  test('מעבר בין לשוניות המשנה מרנדר תוכן אמיתי', async ({ page }) => {
    const app = new AppShell(page);
    await app.openSubTab('הכנסות');
    await expect(page.getByRole('heading', { name: /גיול חייבים/ })).toBeVisible();

    await app.openSubTab('הוצאות');
    await expect(page.locator('.tabs2 button', { hasText: 'הוצאות' })).toHaveClass(/on/);

    await app.openSubTab('תחזית');
    await expect(page.getByRole('heading', { name: /3 תרחישים/ })).toBeVisible();
    await expect(page.locator('svg.fin-chart').first()).toBeVisible();

    await app.openSubTab('רווחיות');
    await expect(page.getByRole('heading', { name: /רווחיות העסק/ })).toBeVisible();

    // "סקירה" נשמר (תאימות למסך הישן) — בדיקת הניווט הראשי מסתמכת עליו
    await app.openSubTab('סקירה');
    await expect(page.locator('.tabs2 button', { hasText: 'סקירה' })).toHaveClass(/on/);
  });

  test('סרגל לשוניות-המשנה נשמר גם במסכים הוותיקים (תזרים/מחשבון) — אין מלכודת ניווט', async ({ page }) => {
    const app = new AppShell(page);
    // מעבר ללשונית "תזרים" (מסך ותיק, מסך מלא) — הסרגל חייב להישאר
    await app.openSubTab('תזרים');
    await expect(page.locator('#view > .tabs2')).toBeVisible();
    await expect(page.locator('.tabs2 button', { hasText: 'שליטה' })).toBeVisible();
    // מהמסך הוותיק אפשר לנווט חזרה ללשונית אחרת
    await app.openSubTab('הכנסות');
    await expect(page.getByRole('heading', { name: /גיול חייבים/ })).toBeVisible();
    // מעבר ל"מחשבון" (מסך ותיק נוסף) — שוב הסרגל נשאר וניתן לחזור ל"שליטה"
    await app.openSubTab('מחשבון');
    await expect(page.locator('#view > .tabs2')).toBeVisible();
    await app.openSubTab('שליטה');
    await expect(page.locator('.kpi.clk').first()).toBeVisible();
  });

  test('תרחיש What-if מריץ סימולציה חיה ומראה פער מהבסיס', async ({ page }) => {
    const app = new AppShell(page);
    await app.openSubTab('תרחישים');
    await expect(page.getByRole('heading', { name: /בונה תרחיש/ })).toBeVisible();
    // הוספת התאמה: לקוח חדש
    await page.getByRole('button', { name: '+ לקוח חדש' }).first().click();
    await expect(page.locator('.overlay')).toBeVisible();
    await page.locator('#sca_amt').fill('7000');
    await page.locator('.overlay').getByRole('button', { name: 'הוספה' }).click();
    // תוצאת סימולציה: KPI שינוי MRR + טבלת השוואה
    await expect(page.locator('.kpi', { hasText: 'שינוי MRR' })).toBeVisible();
    await expect(page.locator('.kpi', { hasText: 'שינוי MRR' })).toContainText('7,000');
    await expect(page.locator('.fin-tbl')).toBeVisible();
  });

  test('עדכון יתרה נוכחית נשמר ומזין את התחזית', async ({ page }) => {
    const app = new AppShell(page);
    await page.getByRole('button', { name: 'עדכן יתרה' }).click();
    await expect(page.locator('.overlay')).toBeVisible();
    await page.locator('#fb_amt').fill('123456');
    await page.locator('.overlay').getByRole('button', { name: 'שמירה' }).click();
    await expect(app.toast(/עודכנה/)).toBeVisible();
    // היתרה הנוכחית משתקפת ב-KPI
    await expect(page.locator('.kpi.clk').filter({ hasText: 'יתרה נוכחית' })).toContainText('123,456');
  });
});
