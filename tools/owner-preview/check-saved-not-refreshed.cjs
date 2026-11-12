// HCB-006 browser check, SYNTHETIC: the real owner app on the owner preview's fake data (no database, no network).
// `pnpm preview:owner`, then `node tools/owner-preview/check-saved-not-refreshed.cjs [outDir]`.
// On order HC-1101 (payment review) the fake server acknowledges Confirm payment with its row and then every orders read
// fails. The page must not offer Confirm payment again; it says the change was saved and the list could not be refreshed,
// with Try again. (The fake server keeps no state, so what a retry shows here is not checked: the unit tests cover it.)
// Screenshots are named `synthetic-saved-*`.
const { mkdirSync } = require('node:fs');
const { chromium } = require('playwright');

const out = process.argv[2] ?? 'build/owner-preview-saved';
const port = process.env.PREVIEW_PORT ?? '4186';
const SIZES = [
  [390, 844],
  [1440, 900]
];
const LABEL = 'SYNTHETIC (owner preview, fake data, not a connected database)';
const SAVED = 'Saved. Could not refresh the list.';

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
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.getByRole('heading', { name: 'Inventory', exact: true }).waitFor({ timeout: 90000 });
    await page.evaluate(() => {
      window.qaStaffAck = true;
      window.qaFailReadAfterAck = true;
      window.__hcOps.go('order', { orderId: 'HC-1101' });
    });
    const confirm = page.getByRole('button', { name: 'Confirm payment', exact: true });
    await confirm.waitFor({ timeout: 15000 });
    await page.evaluate(() => {
      window.qaCalls.length = 0;
    });
    await confirm.click();
    // A reference warning may ask once more before confirming; answer it the way the owner would.
    const anyway = page.getByRole('button', { name: /confirm anyway|confirm payment/i }).last();
    await page.waitForTimeout(500);
    const calls = () =>
      page.evaluate(() => window.qaCalls.filter((n) => n === 'staff_confirm_payment').length);
    if ((await calls()) === 0 && (await anyway.isVisible().catch(() => false))) await anyway.click();
    await page.waitForTimeout(1200);
    const sent = await calls();
    if (sent !== 1) fail(`staff_confirm_payment sent ${sent} times`);
    const reads = await page.evaluate(() => window.qaCalls.filter((n) => n === 'get_staff_orders').length);
    if (reads < 1) fail('no orders read was attempted after the change');
    if (await confirm.isVisible().catch(() => false)) fail('Confirm payment is offered again');
    if (!(await page.getByText(SAVED, { exact: false }).first().isVisible().catch(() => false)))
      fail(`the page does not say "${SAVED}"`);
    if (!(await page.getByRole('button', { name: /try again/i }).first().isVisible().catch(() => false)))
      fail('no Try again on the page');
    await page.screenshot({ path: `${out}/synthetic-saved-${width}.png` });
    if (errors.length) fail(`page errors: ${errors.slice(0, 2).join(' | ')}`);
    console.log(
      JSON.stringify({
        label: LABEL,
        size: `${width}x${height}`,
        confirmSent: sent,
        failures: failures.filter((f) => f.startsWith(`${width}x`)).length
      })
    );
    await page.close();
  }
  await browser.close();
  if (failures.length) {
    console.log(`Saved-not-refreshed check FAILED (${LABEL}):\n - ${failures.join('\n - ')}`);
    process.exitCode = 1;
  } else console.log(`Saved-not-refreshed check passed at 390x844 and 1440x900 (${LABEL})`);
})();
