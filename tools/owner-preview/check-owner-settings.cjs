// Synthetic owner settings QA. Requires `PREVIEW_PORT=4210 pnpm preview:owner`.
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');

const out = path.resolve(process.argv[2] ?? 'C:/Users/ethan/dev/happy-cookie-client-settings-qa');
assert(!out.startsWith(path.resolve(__dirname, '../..') + path.sep), 'artifacts must stay outside the repo');
mkdirSync(out, { recursive: true });
const base = 'http://127.0.0.1:4210';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64'
);

async function capture(page, name) {
  const facts = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches
  }));
  assert(facts.scrollWidth <= facts.width, `${name}: horizontal overflow ${facts.scrollWidth}/${facts.width}`);
  assert(facts.reduced, `${name}: reduced motion is not active`);
  await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true, animations: 'disabled' });
}

async function main() {
  const browser = await chromium.launch();
  try {
    for (const [width, height] of [[390, 844], [1920, 1080]]) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route =>
        new URL(route.request().url()).origin === base ? route.continue() : route.abort()
      );
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__hcOps?.renderVals && window.qaCalls?.includes('get_scheduled_events'), null, { timeout: 90000 });
      await page.evaluate(async () => {
        const row = { id: 'qa-gcash', label: 'QA GCash', account_number: '0900000000', account_name: 'QA Owner', qr_path: '', active: true, sort_order: 0, updated_at: '2026-11-17T00:00:00.000Z' };
        window.qaUploads = [];
        const client = {
          rpc: async name => name === 'get_shop_payment_info'
            ? { data: { methods: [{ id: row.id, label: row.label, number: row.account_number, name: row.account_name, qr: '' }], texts: { registration_badge: '', tin_line: '', invoice_note: '', allergen_note: '' } }, error: null }
            : name === 'get_payment_methods' ? { data: [row], error: null }
            : { data: [{ id: row.id, updated_at: row.updated_at }], error: null },
          storage: { from: bucket => ({ upload: async (path, file) => { window.qaUploads.push({ bucket, path, type: file.type, size: file.size }); return { error: null }; } }) }
        };
        await window.__hcOps.loadShopPayment(client);
        window.__hcOps.go('products');
      });
      const mainRegion = page.locator('main');
      await mainRegion.getByRole('button', { name: 'Settings' }).click();
      await page.getByRole('heading', { name: 'Make settings' }).waitFor();
      await capture(page, `${width}-make-settings`);
      await page.getByRole('button', { name: /Products and prices/ }).click();
      await page.getByRole('heading', { name: 'Products', level: 1 }).waitFor();
      assert.equal(await page.getByRole('heading', { name: 'Make settings' }).count(), 0);
      await capture(page, `${width}-products-return`);

      await page.evaluate(() => window.__hcOps.go('more'));
      await page.getByRole('button', { name: /Payment methods/ }).click();
      await page.getByRole('heading', { name: 'Payment methods' }).waitFor();
      assert(await page.getByText('Upload QR').count(), 'new method row lacks Upload QR');
      await capture(page, `${width}-payment-methods`);
      await page.getByRole('button', { name: /QA GCash/ }).click();
      assert.equal(await page.locator('input[name=label]').inputValue(), 'QA GCash');
      const chooserPromise = page.waitForEvent('filechooser');
      await page.getByLabel(/Upload a QR image/).click();
      const chooser = await chooserPromise;
      await chooser.setFiles({ name: 'synthetic-qr.png', mimeType: 'image/png', buffer: png });
      await page.getByText('Image uploaded. Save changes to keep it.').waitFor();
      const uploaded = await page.evaluate(() => window.qaUploads);
      assert.equal(uploaded.length, 1);
      assert.equal(uploaded[0].bucket, 'shop-media');
      assert.equal(uploaded[0].type, 'image/png');
      await capture(page, `${width}-payment-edit-uploaded`);

      await page.evaluate(() => window.__hcOps.go('more'));
      await page.getByRole('button', { name: /Boxes & add-ons/ }).click();
      await page.getByRole('heading', { name: 'Boxes & add-ons' }).waitFor();
      const samplerId = page.locator('input[type=hidden][name=samplerProductId]');
      assert.equal(await page.locator('select[name=samplerProductId]').count(), 0);
      assert.equal(await samplerId.inputValue(), 'sampler');
      await capture(page, `${width}-sampler`);
      const samplerToggle = page.getByRole('switch', { name: 'Offer sampler box' });
      await samplerToggle.click();
      assert.equal(await samplerId.inputValue(), 'sampler');
      await samplerToggle.click();
      assert.equal(await samplerId.inputValue(), 'sampler');
      assert.deepEqual(errors, [], `page errors: ${errors.join('; ')}`);
      await context.close();
      console.log(`PASS SYNTHETIC ${width}px/reduced: Make route, QR chooser/upload, sampler selection, no horizontal overflow`);
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
