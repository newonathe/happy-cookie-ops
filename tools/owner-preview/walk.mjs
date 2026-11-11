// Screenshots every page of the owner preview: `pnpm preview:owner`, then `node tools/owner-preview/walk.mjs [width] [outDir]`.
// Fake data only, and every request outside this computer is blocked.
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const width = Number(process.argv[2] ?? 1400);
const out = process.argv[3] ?? 'build/owner-preview-shots';
const PAGES = [
  'today',
  'bazaar',
  'orders',
  'order',
  'reconcile',
  'drops',
  'recipes',
  'products',
  'bake',
  'inventory',
  'grocery',
  'suppliers',
  'pnl',
  'sales',
  'settings',
  'health',
  'notifications',
  'shop',
  'checkout',
  'status'
];

mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width, height: 900 } });
const page = await context.newPage();
page.on('pageerror', (error) => console.log('PAGE ERROR', error.message));
await page.route('**/*', (route) =>
  new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort()
);
await page.goto('http://127.0.0.1:4186/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.getByRole('heading', { name: 'Inventory', exact: true }).waitFor({ timeout: 90000 });
for (const key of PAGES) {
  await page.evaluate((name) => window.__hcOps.go(name), key);
  await page.waitForTimeout(700);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${out}/${key}-${width}.png`, fullPage: true });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  console.log(key, overflow > 0 ? `OVERFLOW ${overflow}px` : 'ok');
}
await browser.close();
