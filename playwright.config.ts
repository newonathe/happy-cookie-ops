import { defineConfig, devices } from '@playwright/test';

/**
 * The app is used on a phone in a kitchen, so the phone profile is the default and the
 * desktop run is the secondary check.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:3140', trace: 'retain-on-failure', serviceWorkers: 'block', timezoneId: 'Asia/Manila', reducedMotion: 'reduce' },

  expect: {
    toHaveScreenshot: {
      // Subpixel font rendering differs between runs even on one machine. 1% absorbs
      // that; it is nowhere near enough to hide a broken layout.
      maxDiffPixelRatio: 0.01,
      animations: 'disabled'
    }
  },

  // A missing baseline must fail loudly in CI rather than writing itself and passing —
  // a self-seeding baseline is a test that can never fail.
  updateSnapshots: 'none',

  projects: [
    { name: 'phone', testIgnore: /(visual|fidelity-evidence)\.spec\.ts/, use: { ...devices['Pixel 7'] } },
    { name: 'webkit', testIgnore: /(visual|fidelity-evidence)\.spec\.ts/, use: { ...devices['iPhone 13'], defaultBrowserType: 'webkit' } },
    { name: 'evidence', testMatch: /fidelity-evidence\.spec\.ts/, use: { viewport: { width: 390, height: 844 } } },
    { name: 'desktop', testIgnore: /(visual|fidelity-evidence)\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    {
      // Its own project so `pnpm test:visual` can run alone, and so the baselines are
      // tied to one viewport. Baselines are only valid for the environment that made
      // them — regenerate inside Docker, never on a laptop (docs/TESTING.md).
      name: 'visual',
      testMatch: /visual\.spec\.ts/,
      use: { ...devices['Pixel 7'] }
    },
    { name: 'visual-tablet', testMatch: /visual\.spec\.ts/, use: { viewport: { width: 834, height: 1112 } } },
    { name: 'visual-desktop', testMatch: /visual\.spec\.ts/, use: { viewport: { width: 1440, height: 900 } } }
  ],

  webServer: {
    command: 'pnpm start --port 3140 --hostname localhost',
    url: 'http://localhost:3140',
    reuseExistingServer: false,
    timeout: 180_000
  }
});
