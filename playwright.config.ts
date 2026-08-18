import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E config for Agency HQ.
 * - baseURL defaults to the local `wrangler pages dev` server (port 8790).
 * - `webServer` applies local D1 migrations, then boots the dev server.
 * - A `setup` project authenticates once (PIN) and stores the session, so the
 *   real specs start already logged in.
 * - In this managed environment Chromium is pre-installed; point at it with
 *   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium. In CI, `npx playwright install`
 *   provides the bundled browser and the override is simply omitted.
 */
const BASE_URL = process.env.BASE_URL || 'http://localhost:8790';
const CHROMIUM = process.env.PW_CHROMIUM_PATH; // e.g. /opt/pw-browsers/chromium
const launchOptions = CHROMIUM ? { executablePath: CHROMIUM } : undefined;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  outputDir: 'test-results',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/, use: { launchOptions } },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/.auth/user.json',
        launchOptions,
      },
      dependencies: ['setup'],
    },
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
        storageState: 'tests/e2e/.auth/user.json',
        launchOptions,
      },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: 'npm run e2e:serve',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
