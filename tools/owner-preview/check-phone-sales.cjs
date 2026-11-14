// Sales recorded on this phone while the books are unread, browser check, SYNTHETIC: the real owner app on the owner
// preview's fake data (no database, no network). The books read fails (`window.qaFailRpcs`) and this phone holds one
// event sale; Money > Sales must show the books-not-loaded panel and, under it, that sale "Recorded on this phone", with
// no "sales recorded" count and no "No sales recorded yet".
// `pnpm preview:owner`, then `node tools/owner-preview/check-phone-sales.cjs [outDir]`. Screenshots `synthetic-phone-sales-*`.
const { mkdirSync } = require('node:fs');
const { chromium } = require('playwright');

const out = process.argv[2] ?? 'build/owner-preview-phone-sales';
const port = process.env.PREVIEW_PORT ?? '4186';
const LABEL = 'SYNTHETIC (owner preview, fake data, not a connected database)';
const SIZES = [
  [390, 844],
  [1440, 900]
];

(async () => {
  mkdirSync(out, { recursive: true });
  const failures = [];
  const browser = await chromium.launch();
  for (const [width, height] of SIZES) {
    const fail = (why) => failures.push(`${width}x${height}: ${why}`);
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/*', (r) =>
      new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()
    );
    await page.addInitScript(() => {
      window.qaFailRpcs = ['get_books'];
    });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => typeof window.__hcOps?.go === 'function', null, { timeout: 90000 });
    await page.waitForTimeout(3000);
    await page.evaluate(() => {
      const r = window.__hcOps;
      r.setState({
        event: { id: 'e1', name: 'QA market', stage: 'selling', dayId: 'd1' },
        sales: [
          { id: 's1', items: { dcf: 2 }, total: 260, at: Date.now() - 600000, method: 'Cash', synced: false }
        ]
      });
      r.go('sales');
    });
    await page.waitForTimeout(1000);
    const text = await page.evaluate(() => (document.body.textContent ?? '').replace(/\s+/g, ' '));
    if (!/Books not loaded yet/.test(text)) fail('no books-not-loaded panel');
    if (!/Recorded on this phone/.test(text)) fail('the sale recorded on this phone is not shown');
    if (!/260/.test(text)) fail("the phone sale's amount is not shown");
    if (/\d+ sales? recorded/.test(text)) fail('a "sales recorded" count is claimed while the books are unread');
    if (/No sales recorded yet/.test(text)) fail('"No sales recorded yet" while the books are unread');
    await page.screenshot({ path: `${out}/synthetic-phone-sales-${width}.png` });
    if (errors.length) fail(`page errors: ${errors[0]}`);
    console.log(
      JSON.stringify({
        label: LABEL,
        size: `${width}x${height}`,
        failures: failures.filter((f) => f.startsWith(`${width}x`)).length
      })
    );
    await page.close();
  }
  await browser.close();
  if (failures.length) {
    console.log(`Phone sales check FAILED (${LABEL}):\n - ${failures.join('\n - ')}`);
    process.exitCode = 1;
  } else console.log(`Phone sales check passed at 390x844 and 1440x900 (${LABEL})`);
})();
