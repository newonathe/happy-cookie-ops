import { defineConfig, devices } from '@playwright/test';

/**
 * Browser scenarios A and C against a throwaway LOCAL Supabase stack and a LIVE-mode build
 * of the app (docs/TESTING.md, "Browser scenarios"). Not part of `pnpm test:e2e` or CI.
 * The stack and build are prepared by hand; this config only points the browser at them.
 */
const appUrl = process.env.HC_SCN_APP_URL ?? 'http://localhost:3150';

export default defineConfig({
  testDir: './tests/e2e-scenarios',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: 'list',
  use: {
    baseURL: appUrl,
    trace: 'retain-on-failure',
    serviceWorkers: 'allow',
    timezoneId: 'Asia/Manila',
    reducedMotion: 'reduce'
  },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }]
});
