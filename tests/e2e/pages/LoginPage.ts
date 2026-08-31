import { Page, Locator, expect } from '@playwright/test';

/** מסך הכניסה (PIN) של Agency HQ. */
export class LoginPage {
  readonly page: Page;
  readonly card: Locator;
  readonly pin: Locator;
  readonly submit: Locator;
  readonly error: Locator;
  readonly subtitle: Locator;

  constructor(page: Page) {
    this.page = page;
    this.card = page.locator('.login-card');
    this.pin = page.locator('#pin');
    this.submit = page.locator('#loginBtn');
    this.error = page.locator('#loginErr');
    this.subtitle = page.locator('#loginSub');
  }

  async goto() {
    await this.page.goto('/app');
    await expect(this.card).toBeVisible();
  }

  /** האם המסך במצב "הגדרת קוד ראשוני" (אין עדיין PIN) */
  async isFirstTimeSetup(): Promise<boolean> {
    const res = await this.page.request.get('/api/auth/status');
    const body = await res.json();
    return body.setup === false;
  }

  async submitPin(pin: string) {
    await this.pin.fill(pin);
    await this.submit.click();
  }
}
