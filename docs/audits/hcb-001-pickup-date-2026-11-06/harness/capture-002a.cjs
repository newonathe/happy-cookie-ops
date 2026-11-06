// node capture-002a.cjs <outDir>   (scratch preview of REPO on PREVIEW_PORT)
const { createRequire } = require('node:module');
const req = createRequire(process.env.REPO + '/package.json');
const { chromium } = req('@playwright/test');
const { mkdirSync, writeFileSync } = require('node:fs');
const out = process.argv[2];
const port = process.env.PREVIEW_PORT;
const SCEN = {
  failedFirst: { qaOrdersFail: true },
  stale: { qaOrdersFailAfterFirst: true },
  dropped: { qaOrdersBadRow: true },
  read: {}
};
(async () => {
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const report = [];
  for (const width of [320, 390, 768, 1440])
    for (const [name, flags] of Object.entries(SCEN)) {
      const ctx = await browser.newContext({
        viewport: { width, height: 900 },
        timezoneId: 'America/Los_Angeles',
        deviceScaleFactor: 1
      });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.clock.install({ time: new Date('2026-11-10T02:00:00Z') });
      await page.route('**/*', (r) =>
        new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()
      );
      await page.addInitScript((f) => Object.assign(window, f), flags);
      await page.goto(`http://127.0.0.1:${port}/?baseline`, {
        waitUntil: 'domcontentloaded',
        timeout: 120000
      });
      await page.waitForFunction(
        () =>
          window.__hcOps?.state.screen === 'inventory' &&
          window.qaCalls.includes('get_staff_orders'),
        null,
        { timeout: 120000 }
      );
      if (name === 'stale') {
        await page.clock.setFixedTime(new Date('2026-11-10T03:30:00Z'));
        await page.evaluate(() => window.__hcOps.reloadOrders());
      }
      await page.evaluate(() => window.__hcOps.go('orders', { orderFilter: 'all' }));
      await page.waitForTimeout(500);
      const text = await page.evaluate(
        () => document.querySelector('main')?.innerText ?? document.body.innerText
      );
      await page.screenshot({ path: `${out}/${name}-${width}.png`, fullPage: true });
      report.push({
        width,
        name,
        noMatch: text.includes('No orders match this filter'),
        failed: text.includes('could not be read. Nothing is shown'),
        stale: text.includes('Showing orders as of'),
        staleTime: (text.match(/as of ([^.]+)\./) || [])[1] ?? null,
        dropped: text.includes('1 order could not be read'),
        notRead: text.includes('have not been read yet'),
        chips: text.includes('All '),
        errors,
        overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        writes: await page.evaluate(() => window.qaCalls.filter((n) => !n.startsWith('get_')))
      });
      await ctx.close();
    }
  await browser.close();
  writeFileSync(`${out}/facts.json`, JSON.stringify(report, null, 1));
  for (const r of report) console.log(JSON.stringify(r));
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
