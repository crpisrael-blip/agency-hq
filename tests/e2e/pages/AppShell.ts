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

  /** ממתין שהאפליקציה תעלה (אחרי כניסה מוצלחת) */
  async waitReady() {
    await expect(this.app).toBeVisible();
    await expect(this.heading('לוח בקרה')).toBeVisible();
  }

  /** ניווט לפי תווית בלשונית (התאמה חלקית, כדי לתמוך גם בתוויות עם אמוג׳י) */
  async openTab(label: string | RegExp) {
    await this.nav.getByRole('button', { name: label }).click();
  }

  heading(name: string | RegExp): Locator {
    return this.page.getByRole('heading', { name });
  }

  /** טוסט (הודעת מערכת) לפי טקסט */
  toast(text: string | RegExp): Locator {
    return this.page.locator('#toast .toast', { hasText: text });
  }
}
