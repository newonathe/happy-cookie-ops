// SYNTHETIC: actual owner components, fake RPCs only. No hosted reads/writes or real customer data.
// PREVIEW_PORT=4198 pnpm preview:owner; node tools/owner-preview/check-sell-glass.cjs [output]
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { chromium } = require('@playwright/test');
const out = process.argv[2] ?? 'build/sell-glass';
const base = `http://127.0.0.1:${process.env.PREVIEW_PORT ?? 4198}`;
const go = (page, screen) => page.evaluate(s => window.__hcOps.go(s), screen);
const open = (page, form) => page.evaluate(s => window.__hcOps.sheet(s), form);
const close = page => page.evaluate(() => window.__hcOps.closeSheet());
async function fits(page) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow');
  assert(!(await page.locator('main').innerText()).includes('\uFFFD'), 'corrupted copy');
}
async function ready(page) {
  await page.goto(base);
  await page.waitForFunction(() => window.qaCalls?.includes('get_scheduled_events'));
}
async function capture(page, name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true, animations: 'disabled' });
}
async function sheet(page, value) {
  await page.waitForFunction(v => document.querySelector('main')?.getAttribute('data-screen') === v, value);
  assert.equal(await page.locator('main').getAttribute('data-screen'), value);
  const background = await page.locator('main').evaluate(el => getComputedStyle(el).backgroundImage);
  assert.equal(background === 'none', value !== 'form', `wrong ${value} surface`);
}
(async () => {
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const width of [390, 1920]) for (const motion of ['no-preference', 'reduce']) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: motion });
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', r => new URL(r.request().url()).origin === base ? r.continue() : r.abort());
      await ready(page);
      for (const screen of ['orders', 'reconcile', 'drops']) {
        await go(page, screen); await sheet(page, screen); await fits(page);
        if (motion === 'no-preference') await capture(page, `synthetic-${width}-${screen}`);
      }
      // Search/filter counts must describe the actual visible rows.
      await go(page, 'orders');
      const stages = page.getByRole('group', { name: 'Orders by stage', exact: true });
      await page.getByRole('searchbox', { name: 'Search orders' }).fill('Miguel');
      await stages.getByText('1 order shown', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Clear', exact: true }).click();
      await stages.getByText('5 orders shown', { exact: true }).waitFor();
      await page.getByRole('group', { name: 'Show orders', exact: true }).getByRole('button', { name: /^To review/ }).click();
      await stages.getByText('1 order shown', { exact: true }).waitFor();
      await page.getByRole('group', { name: 'Show orders', exact: true }).getByRole('button', { name: /^All/ }).click();
      await page.getByRole('button', { name: /Miguel Santos/ }).click();
      await sheet(page, 'order');
      assert(await page.locator('main [class*="subpage"]').count(), 'order needs a light subpage');
      if (motion === 'no-preference') await capture(page, `synthetic-${width}-order`);
      // Ticks are the local wallet-check controls, not payment acknowledgement.
      await go(page, 'reconcile');
      await page.getByRole('button', { name: 'Tick all', exact: true }).click();
      assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 5);
      await fits(page);
      await page.getByRole('button', { name: 'Start over', exact: true }).click();
      assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 0);
      // Customers has an explicit ground on every origin; every other form stays frosted.
      for (const screen of ['today', 'pnl', 'inventory', 'orders', 'reconcile', 'drops', 'bazaar', 'settings']) {
        await go(page, screen); await open(page, 'customers'); await sheet(page, 'customers');
        assert.equal(await page.getByRole('heading', { name: 'Customers/Waitlist', exact: true }).evaluate(el => getComputedStyle(el).color), 'rgb(255, 241, 230)');
        await fits(page); await close(page);
        for (const form of ['dropState', 'rules']) { await open(page, form); await sheet(page, 'form'); await fits(page); await close(page); }
      }
      await go(page, 'orders'); await open(page, 'customers');
      if (motion === 'no-preference') await capture(page, `synthetic-${width}-customers`);
      await page.getByRole('button', { name: /Open customer Bea/ }).click();
      assert(await page.locator('main [class*="subpage"]').count(), 'customer detail needs a light card');
      await page.getByRole('button', { name: 'Prepare message', exact: true }).click();
      assert(await page.locator('main [class*="subpage"]').count(), 'message needs a light card');
      await page.getByRole('button', { name: 'Back to customer', exact: true }).click();
      await page.getByRole('button', { name: 'Back to customers', exact: true }).click();
      await close(page);
      await go(page, 'drops');
      await page.getByRole('button', { name: 'Open Opening schedule & drop', exact: true }).click();
      await fits(page);
      await page.getByRole('button', { name: 'Back to Shop', exact: true }).click();
      // Reuse the same synthetic client to retain a stale read, then recover and drop a malformed row.
      await page.evaluate(async () => { window.qaStaffOrdersFail = true; await window.__hcOps.loadOrders(null); });
      await go(page, 'reconcile');
      assert.equal(await page.getByRole('group', { name: 'References at a glance', exact: true }).count(), 0);
      assert.equal(await page.getByRole('heading', { name: 'Everything matched', exact: true }).count(), 0);
      await page.evaluate(async () => { window.qaStaffOrdersFail = false; window.qaMalformedOrder = true; await window.__hcOps.loadOrders(null); });
      await go(page, 'reconcile');
      assert.equal(await page.getByRole('group', { name: 'References at a glance', exact: true }).count(), 0);
      await fits(page);
      assert.deepEqual(errors, []);
      console.log(`PASS SYNTHETIC ${width}px ${motion}: Sell flows, Customers origins, frosted forms, stale/dropped reads`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
