// node capture.cjs <outDir> [timezoneId]  (preview served on PREVIEW_PORT, default 4190)
const { createRequire } = require('node:module');
const req = createRequire(process.env.REPO + '/package.json');
const { chromium } = req('@playwright/test');
const { mkdirSync, writeFileSync } = require('node:fs');
const out = process.argv[2];
const tz = process.argv[3] ?? 'Asia/Manila';
const port = process.env.PREVIEW_PORT ?? '4190';
const IDS = ['HC-1101', 'HC-1102', 'HC-1103', 'HC-1104', 'HC-1105'];
(async () => {
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const report = [];
  try {
    for (const width of [320, 390, 768, 1440]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        timezoneId: tz,
        deviceScaleFactor: 1
      });
      const page = await context.newPage();
      // Tuesday 10 November 2026, 10:00 in Manila: the audit's clock.
      await page.clock.install({ time: new Date('2026-11-10T02:00:00Z') });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('**/*', (r) =>
        new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()
      );
      const facts = { width, tz };
      for (const pass of ['first', 'reload']) {
        if (pass === 'reload') await page.reload({ waitUntil: 'domcontentloaded' });
        else
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
        await page.evaluate(() => window.__hcOps.go('orders', { orderFilter: 'all' }));
        await page.waitForTimeout(400);
        const vals = await page.evaluate(() => {
          const v = window.__hcOps.renderVals();
          return (v.orderList ?? []).map((o) => ({ id: o.id, pickup: o.pickup }));
        });
        facts[pass + 'List'] = vals;
        if (pass === 'first')
          await page.screenshot({ path: `${out}/orders-${width}.png`, fullPage: true });
        const detail = {};
        for (const id of IDS) {
          await page.evaluate((orderId) => window.__hcOps.go('order', { orderId }), id);
          await page.waitForTimeout(250);
          detail[id] = await page.evaluate(() => window.__hcOps.renderVals().od?.pickup ?? null);
          if (pass === 'first' && (id === 'HC-1101' || width === 390))
            await page.screenshot({ path: `${out}/order-${id}-${width}.png`, fullPage: true });
        }
        facts[pass + 'Detail'] = detail;
      }
      facts.overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      facts.writes = await page.evaluate(() => window.qaCalls.filter((n) => !n.startsWith('get_')));
      facts.errors = errors;
      report.push(facts);
      await context.close();
    }
  } finally {
    await browser.close();
  }
  writeFileSync(`${out}/facts.json`, JSON.stringify(report, null, 1));
  for (const f of report)
    console.log(
      JSON.stringify({
        width: f.width,
        tz: f.tz,
        list: f.firstList.map((o) => o.id + '=' + o.pickup),
        detail: f.firstDetail,
        reloadSame:
          JSON.stringify(f.firstDetail) === JSON.stringify(f.reloadDetail) &&
          JSON.stringify(f.firstList) === JSON.stringify(f.reloadList),
        overflow: f.overflow,
        writes: f.writes,
        errors: f.errors
      })
    );
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
