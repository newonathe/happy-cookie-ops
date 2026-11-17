// Synthetic pickup settings persistence and checkout-label check; requires preview on 4211.
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');

const base = 'http://127.0.0.1:4211';
const out = path.resolve(process.argv[2] ?? 'C:/Users/ethan/dev/happy-cookie-pickup-qa');
assert(!out.startsWith(path.resolve(__dirname, '../..') + path.sep), 'screenshots must stay outside the repo');
mkdirSync(out, { recursive: true });

async function main() {
  const browser = await chromium.launch();
  try {
    for (const width of [390, 1920]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await context.addInitScript(() => {
        const NativeDate = Date, fixed = NativeDate.parse('2026-11-17T02:00:00Z');
        window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [fixed])); } static now() { return fixed; } };
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__hcOps?.go && window.qaCalls?.includes('get_scheduled_events'));
      await page.evaluate(async () => {
        const r = window.__hcOps, original = r.shopClient;
        if (!original?.rpc) throw new Error('preview owner RPC client not ready');
        window.qaPickupCalls = []; window.qaPickupWrites = [];
        window.qaPickupRules = {
          campus_label: 'Campus', campus_from: '14:00', campus_to: '15:30',
          pickup_days: [1, 2, 3, 4, 5, 6, 7], lead_min_days: 1, lead_max_days: 14,
          pickup_from_hour: 9, pickup_cutoff_hour: 18, unpaid_hold_hours: 24,
          max_unpaid_per_phone: 2, updated_at: '2026-11-17T02:00:00.000Z'
        };
        const fallback = original.rpc.bind(original), client = {
          rpc: async (name, args) => {
            window.qaPickupCalls.push(name);
            const rules = window.qaPickupRules;
            if (name === 'get_order_rules') return { data: [{ ...rules }], error: null };
            if (name === 'save_order_rules') {
              window.qaPickupWrites.push({ name, args });
              Object.assign(rules, args?.p_rules, { updated_at: '2026-11-17T02:01:00.000Z' });
              return { data: null, error: null };
            }
            if (name === 'get_shop_order_rules') return { data: { ...rules }, error: null };
            return fallback(name, args);
          }
        };
        r.shopClient = client;
        await r.loadShopOrders(client);
      });

      await page.evaluate(() => window.__hcOps.go('settings'));
      await page.getByRole('heading', { name: 'Account' }).waitFor();
      await page.getByRole('button', { name: /Shop settings/ }).click();
      await page.getByRole('button', { name: /Collection options/ }).click();
      await page.getByRole('heading', { name: 'Order rules' }).waitFor();
      const label = page.locator('input[name="campusLabel"]');
      await label.fill('JSEC Ateneo');
      await page.locator('input[name="campusFrom"]').fill('14:30');
      await page.locator('input[name="campusTo"]').fill('16:00');
      await page.screenshot({ path: path.join(out, `pickup-owner-${width}.png`), fullPage: true, animations: 'disabled' });
      const form = page.locator('form').filter({ has: label });
      await form.getByRole('button', { name: /Save/ }).click();
      await page.waitForFunction(() => window.qaPickupWrites?.length === 1 && !window.__hcOps.state.sheet);
      const saved = await page.evaluate(() => window.qaPickupWrites[0]);
      assert.equal(saved.name, 'save_order_rules');
      assert.equal(saved.args.p_expected_updated_at, '2026-11-17T02:00:00.000Z');
      assert.deepEqual(saved.args.p_rules.pickup_days, [1, 2, 3, 4, 5, 6, 7]);
      assert.equal(saved.args.p_rules.max_unpaid_per_phone, 2, 'retain the anti-abuse cap');
      assert.deepEqual(
        { label: saved.args.p_rules.campus_label, from: saved.args.p_rules.campus_from, to: saved.args.p_rules.campus_to },
        { label: 'JSEC Ateneo', from: '14:30', to: '16:00' }
      );

      await page.getByRole('button', { name: /Collection options/ }).click();
      await page.getByRole('heading', { name: 'Order rules' }).waitFor();
      assert.equal(await label.inputValue(), 'JSEC Ateneo');
      assert.equal(await page.locator('input[name="campusFrom"]').inputValue(), '14:30');
      assert.equal(await page.locator('input[name="campusTo"]').inputValue(), '16:00');
      await page.evaluate(async () => window.__hcOps.loadShopOrders(window.__hcOps.shopClient));
      await page.evaluate(() => window.__hcOps.go('shop'));
      await page.evaluate(() => window.__hcOps.custAdd('dcf', 1));
      await page.evaluate(() => window.__hcOps.go('checkout'));
      await page.waitForFunction(() => window.__hcOps.renderVals().liveCheckout?.rulesState === 'ready');
      const date = await page.evaluate(() => window.__hcOps.renderVals().liveCheckout.dates[0]);
      assert(date.value > '2026-11-17', `checkout date should be future: ${date.value}`);
      await page.getByText(date.label, { exact: true }).click();
      const time = page.locator('label').filter({ hasText: 'Pickup time' }).locator('select');
      await time.selectOption('campus');
      assert.equal(await time.inputValue(), 'campus');
      const option = await time.locator('option[value="campus"]').textContent();
      assert(option?.includes('JSEC Ateneo') && option.includes('2:30') && option.includes('4:00'), option ?? 'missing configured pickup label/time');
      assert(!(await page.evaluate(() => window.qaPickupCalls.includes('place_order'))), 'did not submit an order');
      await page.screenshot({ path: path.join(out, `pickup-checkout-${width}.png`), fullPage: true, animations: 'disabled' });
      assert.deepEqual(errors, [], `page errors: ${errors.join('; ')}`);
      console.log(`PASS SYNTHETIC ${width}px/reduced: settings save/reopen, campus wire value, no order submitted`);
      await context.close();
    }
  } finally { await browser.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
