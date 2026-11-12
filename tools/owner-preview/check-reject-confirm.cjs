// HCB-007 browser check, SYNTHETIC: the real owner app on the owner preview's fake data (no database, no network).
// `pnpm preview:owner`, then `node tools/owner-preview/check-reject-confirm.cjs [outDir]`.
// On order HC-1101 (payment review): one press on Reject sends nothing and asks first; Keep order sends nothing;
// Reject and cancel order sends `staff_reject_payment` exactly once. Screenshots are named `synthetic-reject-*`.
const { mkdirSync } = require('node:fs');
const { chromium } = require('playwright');

const out = process.argv[2] ?? 'build/owner-preview-reject';
const port = process.env.PREVIEW_PORT ?? '4186';
const SIZES = [
  [390, 844],
  [1440, 900]
];
const LABEL = 'SYNTHETIC (owner preview, fake data, not a connected database)';

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
    const open = async () => {
      await page.evaluate(() => window.__hcOps.go('order', { orderId: 'HC-1101' }));
      await page.getByRole('button', { name: 'Reject', exact: true }).waitFor({ timeout: 15000 });
    };
    const rejects = () =>
      page.evaluate(() => window.qaCalls.filter((name) => name === 'staff_reject_payment').length);
    const dialog = page.getByRole('dialog', { name: 'Reject this payment?' });

    await open();
    await page.screenshot({ path: `${out}/synthetic-reject-review-${width}.png` });
    // 1. One press asks first and sends nothing.
    await page.getByRole('button', { name: 'Reject', exact: true }).click();
    await page.waitForTimeout(600);
    if ((await rejects()) !== 0) fail('the first press on Reject sent staff_reject_payment');
    if (!(await dialog.isVisible().catch(() => false))) fail('no "Reject this payment?" dialog');
    else {
      const text = (await dialog.textContent()) ?? '';
      if (!/HC-1101/.test(text)) fail('the dialog does not name the order');
      await page.screenshot({ path: `${out}/synthetic-reject-dialog-${width}.png` });
      // 2. Keep order sends nothing and closes.
      await dialog.getByRole('button', { name: 'Keep order', exact: true }).click();
      await page.waitForTimeout(400);
      if ((await rejects()) !== 0) fail('Keep order sent staff_reject_payment');
      if (await dialog.isVisible().catch(() => false)) fail('Keep order left the dialog open');
      // 3. Confirm sends exactly once.
      await page.getByRole('button', { name: 'Reject', exact: true }).click();
      await dialog.getByRole('button', { name: 'Reject and cancel order', exact: true }).click();
      await page.waitForTimeout(800);
      if ((await rejects()) !== 1) fail(`Confirm sent staff_reject_payment ${await rejects()} times`);
      await page.screenshot({ path: `${out}/synthetic-reject-confirmed-${width}.png` });
    }
    if (errors.length) fail(`page errors: ${errors.slice(0, 2).join(' | ')}`);
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
    console.log(`Reject confirmation check FAILED (${LABEL}):\n - ${failures.join('\n - ')}`);
    process.exitCode = 1;
  } else console.log(`Reject confirmation check passed at 390x844 and 1440x900 (${LABEL})`);
})();
