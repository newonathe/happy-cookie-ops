// With preview:owner running: node tools/owner-preview/check-events.cjs [screenshot-directory]
const { chromium } = require('@playwright/test');
const { mkdirSync } = require('node:fs');
const out = process.argv[2] ?? 'build/owner-preview-events';
(async () => {
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const { width, entry } of [390, 1440].flatMap(width => [{ width, entry: '/' }, { width, entry: '/bazaar' }])) {
      const context = await browser.newContext({ viewport: { width, height: 950 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
      await page.goto(`http://127.0.0.1:4186${entry}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForFunction(expected => window.__hcOps?.state.screen === expected && window.qaCalls.includes('get_scheduled_events'), entry === '/' ? 'inventory' : 'bazaar', { timeout: 90000 });
      if (entry === '/') {
        const nav = page.getByRole('button', { name: 'Bazaar', exact: true });
        if (await nav.count()) await nav.first().click();
        else await page.getByRole('link', { name: 'Bazaar', exact: true }).first().click();
      }
      await page.getByRole('heading', { name: 'Bazaar events', exact: true }).waitFor();
      await page.getByText('Reading your events…', { exact: true }).waitFor({ state: 'hidden', timeout: 15000 });
      const past = page.getByRole('button', { name: /Past/ });
      if (await past.count()) await past.click();
      const event = page.getByText('Katipunan market', { exact: true }).first();
      await event.waitFor();
      await page.waitForTimeout(500); // Let the page transition finish before capturing the visible result.
      await page.screenshot({ path: `${out}/events-fixed-${width}.png`, fullPage: true });
      await event.click();
      await page.waitForFunction(() => window.qaCalls.includes('get_bazaar'));
      await page.getByText('Reading this event…', { exact: true }).waitFor({ state: 'hidden', timeout: 15000 });
      await page.getByRole('heading', { name: 'Katipunan market', exact: true }).waitFor();
      const facts = await page.evaluate(() => ({ calls: window.qaCalls.filter(name => name === 'get_scheduled_events' || name === 'get_bazaar'), writes: window.qaCalls.filter(name => !name.startsWith('get_')), overflow: document.documentElement.scrollWidth > innerWidth }));
      if (errors.length || facts.overflow || facts.writes.length) throw new Error(JSON.stringify({ width, errors, facts }));
      console.log(JSON.stringify({ width, entry, loadedDirectory: true, loadedEvent: true, ...facts }));
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
