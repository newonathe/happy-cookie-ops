// Events read time limit, browser check, SYNTHETIC: the real owner app on the owner preview's fake data (no database, no
// network). The bookings read never answers (`window.qaHoldRpcs`); after the read limit Bazaar events must say the events
// could not be read, with Try again, not "Reading your events…" for ever.
// `pnpm preview:owner`, then `node tools/owner-preview/check-events-timeout.cjs [outDir]`. Screenshots `synthetic-events-timeout-*`.
const { mkdirSync } = require('node:fs');
const { chromium } = require('playwright');

const out = process.argv[2] ?? 'build/owner-preview-events-timeout';
const port = process.env.PREVIEW_PORT ?? '4186';
const LABEL = 'SYNTHETIC (owner preview, fake data, not a connected database)';
const WAIT_MS = 17000; // the read limit is 15 s
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
      window.qaHoldRpcs = ['get_scheduled_events'];
    });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => typeof window.__hcOps?.go === 'function', null, { timeout: 90000 });
    await page.evaluate(() => window.__hcOps.go('bazaar'));
    await page.waitForTimeout(WAIT_MS);
    // Once the read gives up, the preview's own load chain finishes and opens Inventory: go back to the events.
    await page.evaluate(() => window.__hcOps.go('bazaar'));
    await page.waitForTimeout(800);
    const text = await page.evaluate(() => (document.body.textContent ?? '').replace(/\s+/g, ' '));
    if (/Reading your events/.test(text)) fail('still "Reading your events…" after the read limit');
    if (!/Your events could not be read/.test(text)) fail('no "Your events could not be read."');
    if (!(await page.getByRole('button', { name: 'Try again' }).count())) fail('no Try again');
    await page.screenshot({ path: `${out}/synthetic-events-timeout-${width}.png` });
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
    console.log(`Events timeout check FAILED (${LABEL}):\n - ${failures.join('\n - ')}`);
    process.exitCode = 1;
  } else console.log(`Events timeout check passed at 390x844 and 1440x900 (${LABEL})`);
})();
