import { Page, Locator, expect } from '@playwright/test';

/** מעטפת האפליקציה: סרגל עליון + ניווט בין מסכים. */
export class AppShell {
  readonly page: Page;
  readonly app: Locator;
  readonly nav: Locator;
  readonly view: Locator;
  readonly skillsButton: Locator;
  readonly logoutButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.app = page.locator('#app');
    this.nav = page.locator('#nav');
    this.view = page.locator('#view');
    // כפתור קבוע בסרגל העליון
    this.skillsButton = page.locator('.topbar-in').getByRole('button', { name: /סקילז/ });
    this.logoutButton = page.locator('.topbar-in').getByRole('button', { name: 'יציאה' });
  }

  /** ממתין שהאפליקציה תעלה (אחרי כניסה מוצלחת) — ברירת המחדל היא מסך "היום" */
  async waitReady() {
    await expect(this.app).toBeVisible();
    await expect(this.nav.getByRole('button').first()).toBeVisible();
    await expect(this.page.getByRole('heading', { name: 'היום', exact: true })).toBeVisible();
  }

  /**
   * ניווט לפי תווית. אם הלשונית בניווט הראשי — לחיצה ישירה; אחרת דרך תפריט "עוד".
   */
  async openTab(label: string | RegExp) {
    const primary = this.nav.getByRole('button', { name: label, exact: typeof label === 'string' });
    if (await primary.count()) {
      await primary.first().click();
      return;
    }
    await this.nav.getByRole('button', { name: /עוד/ }).click();
    await this.page.locator('.overlay').getByRole('button', { name: label }).click();
  }

  /** ניווט ללשונית משנה (tabs2) בתוך מסך קבוצתי (מכירות/עבודה/כספים/צמיחה) */
  async openSubTab(label: string | RegExp) {
    await this.page.locator('.tabs2 button', { hasText: label }).click();
  }

  heading(name: string | RegExp): Locator {
    return this.page.getByRole('heading', { name });
  }

  /** טוסט (הודעת מערכת) לפי טקסט */
  toast(text: string | RegExp): Locator {
    return this.page.locator('#toast .toast', { hasText: text });
  }
}
