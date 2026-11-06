// node repro-head.cjs <outDir>   (scratch preview serving REPO on PREVIEW_PORT, default 4191)
const { createRequire } = require('node:module');
const req = createRequire(process.env.REPO + '/package.json');
const { chromium } = req('@playwright/test');
const { mkdirSync, writeFileSync } = require('node:fs');
const out = process.argv[2];
const port = process.env.PREVIEW_PORT ?? '4191';
const SCENARIOS = (process.env.ONLY ? process.env.ONLY.split(',') : null) ?? [
  'pickup',
  'ordersFail',
  'flavoursFail',
  'flavoursMalformed',
  'helperHome',
  'rejectFirstPress'
];

async function open(browser, width, flags, soft) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    timezoneId: 'Asia/Manila'
  });
  const page = await context.newPage();
  await page.clock.install({ time: new Date('2026-11-10T02:00:00Z') });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', (r) =>
    new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()
  );
  await page.addInitScript((f) => Object.assign(window, f), flags);
  await page.goto(`http://127.0.0.1:${port}/?baseline`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000
  });
  if (soft) await page.waitForTimeout(20000);
  else
    await page.waitForFunction(
      () =>
        window.__hcOps?.state.screen === 'inventory' &&
        window.qaCalls.includes('get_scheduled_events'),
      null,
      { timeout: 120000 }
    );
  return { context, page, errors };
}
const text = (page) =>
  page.evaluate(() => document.querySelector('main')?.innerText ?? document.body.innerText);

(async () => {
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const report = [];
  try {
    for (const width of [390, 1440]) {
      for (const name of SCENARIOS) {
        const flags =
          {
            ordersFail: { qaOrdersFail: true },
            flavoursFail: { qaFlavoursFail: true },
            flavoursMalformed: { qaFlavoursMalformed: true }
          }[name] ?? {};
        const { context, page, errors } = await open(
          browser,
          width,
          flags,
          name === 'flavoursMalformed'
        );
        const r = { width, name };
        if (name === 'pickup') {
          await page.evaluate(() => window.__hcOps.go('orders'));
          await page.waitForTimeout(400);
          r.list = await page.evaluate(() =>
            window.__hcOps.renderVals().orderList.map((o) => o.id + '=' + o.pickup)
          );
          await page.evaluate(() => window.__hcOps.go('order', { orderId: 'HC-1101' }));
          await page.waitForTimeout(300);
          r.detail = await page.evaluate(() => window.__hcOps.renderVals().od?.pickup);
        } else if (name === 'ordersFail') {
          await page.evaluate(() => window.__hcOps.go('orders'));
          await page.waitForTimeout(400);
          const t = await text(page);
          r.saysNoMatch = t.includes('No orders match this filter');
          r.mentionsFailure = /could not|not loaded|try again|retry/i.test(t);
        } else if (name === 'flavoursMalformed') {
          r.reachedStart = await page.evaluate(() => window.__hcOps?.state.screen ?? null);
          r.calls = await page.evaluate(() => window.qaCalls.slice(0, 12));
          r.bodyTextLength = (await page.evaluate(() => document.body.innerText)).trim().length;
        } else if (name === 'flavoursFail') {
          await page.evaluate(() => window.__hcOps.go('products'));
          await page.waitForTimeout(600);
          const t = await text(page);
          r.textLength = t.trim().length;
          r.showsBuiltIn130 = t.includes('₱130');
          r.showsFixture125 = t.includes('₱125');
          r.hasEditControls = /Edit|Hide/.test(t);
          r.mentionsFailure = /could not|not loaded|try again|retry/i.test(t);
        } else if (name === 'helperHome') {
          await page.evaluate(() => {
            window.__hcOps.setRole('helper');
            window.__hcOps.go('today');
          });
          await page.waitForTimeout(500);
          r.liveHomeNull = await page.evaluate(() => window.__hcOps.renderVals().liveHome === null);
          const t = await text(page);
          r.mainText = t.trim().slice(0, 160);
        } else if (name === 'rejectFirstPress') {
          await page.evaluate(() => window.__hcOps.go('order', { orderId: 'HC-1101' }));
          await page.waitForTimeout(400);
          await page.evaluate(() => (window.qaCalls.length = 0));
          await page.getByRole('button', { name: 'Reject', exact: true }).first().click();
          await page.waitForTimeout(300);
          r.dialogShown =
            (await page.getByRole('dialog').count()) +
              (await page.getByRole('alertdialog').count()) >
            0;
          r.sentReject = await page.evaluate(() => window.qaCalls.includes('staff_reject_payment'));
        }
        await page.screenshot({ path: `${out}/${name}-${width}.png`, fullPage: false });
        r.errors = errors;
        report.push(r);
        console.log(JSON.stringify(r));
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  writeFileSync(`${out}/facts.json`, JSON.stringify(report, null, 1));
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
