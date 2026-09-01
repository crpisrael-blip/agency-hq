import { Page, Locator, expect } from '@playwright/test';

/** מסך הלקוחות + טופס יצירת/עריכת לקוח. */
export class ClientsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly addButton: Locator;
  readonly search: Locator;
  // שדות הטופס (מודאל)
  readonly nameInput: Locator;
  readonly phoneInput: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    // מסך "לקוחות ומערכות" המלא (אקורדיון) — הכותרת היא "לקוחות"
    this.heading = page.getByRole('heading', { name: 'לקוחות', exact: true });
    this.addButton = page.getByRole('button', { name: '+ לקוח' });
    this.search = page.locator('#pfS');
    this.nameInput = page.locator('#f_name');
    this.phoneInput = page.locator('#f_phone');
    this.saveButton = page.getByRole('button', { name: 'שמירה' });
  }

  async open() {
    await expect(this.heading).toBeVisible();
  }

  async createClient(name: string, phone = '050-0000000') {
    await this.addButton.click();
    await expect(this.nameInput).toBeVisible();
    await this.nameInput.fill(name);
    await this.phoneInput.fill(phone);
    // הבקשה בפועל ל-API; ממתינים לתגובה כדי להימנע ממרוץ מצבים
    await Promise.all([
      this.page.waitForResponse(
        (r) => r.url().includes('/api/clients') && r.request().method() === 'POST',
      ),
      this.saveButton.click(),
    ]);
  }

  // במסך המאוחד כל לקוח הוא קבוצת-אקורדיון
  row(name: string): Locator {
    return this.page.locator('.pf-group', { hasText: name });
  }
}
