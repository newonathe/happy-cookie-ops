// Batch A low items, browser check, SYNTHETIC: the real owner app on the owner preview's fake data (no database, no
// network). `pnpm preview:owner`, then `node tools/owner-preview/check-low-items.cjs [outDir]`.
// 1 HCB-014: the till's Settings button is announced by its visible word. 2 A failed first recipe read says "could not be
// read". 3 Payments with an unreadable order claims no "Everything matched", and Tick all claims no agreement. 4 The
// payment review footer does not say nothing is reserved (D1: an order in review holds its slots). 5 Start production
// is not offered on Products while the catalogue read has failed. Screenshots are named `synthetic-low-*`.
const { mkdirSync } = require('node:fs');
const { chromium } = require('playwright');

const out = process.argv[2] ?? 'build/owner-preview-low-items';
const port = process.env.PREVIEW_PORT ?? '4186';
const LABEL = 'SYNTHETIC (owner preview, fake data, not a connected database)';
const SIZES = [
  [390, 844],
  [1440, 900]
];

async function open(browser, width, height, init) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', (r) =>
    new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()
  );
  if (init) await page.addInitScript(init.fn, init.arg);
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => typeof window.__hcOps?.go === 'function', null, { timeout: 90000 });
  await page.waitForTimeout(3000);
  return { page, errors };
}
const body = (page) => page.evaluate(() => (document.body.textContent ?? '').replace(/\s+/g, ' '));

(async () => {
  mkdirSync(out, { recursive: true });
  const failures = [];
  const browser = await chromium.launch();
  for (const [width, height] of SIZES) {
    const fail = (why) => failures.push(`${width}x${height}: ${why}`);
    const shot = (page, name) => page.screenshot({ path: `${out}/synthetic-low-${name}-${width}.png` });

    // 1. HCB-014
    {
      const { page, errors } = await open(browser, width, height);
      await page.evaluate(() => {
        const r = window.__hcOps;
        r.setState({
          event: { id: 'e1', name: 'QA market', stage: 'selling', dayId: 'd1' },
          eventLoaded: { dcf: 12 },
          eventStock: { dcf: 12 },
          eventPrices: { dcf: 130 },
          cart: {},
          sales: []
        });
        r.go('bazaar');
      });
      await page.waitForTimeout(1200);
      if (await page.getByRole('button', { name: 'Till menu', exact: true }).count())
        fail('HCB-014: a button is still announced as "Till menu"');
      if (!(await page.getByRole('button', { name: /^Settings/ }).count()))
        fail('HCB-014: no button announced starting with "Settings"');
      await shot(page, 'till');
      if (errors.length) fail(`till page errors: ${errors[0]}`);
      await page.close();
    }
    // 2. Recipe page, first read failed
    {
      const { page } = await open(browser, width, height, {
        fn: () => {
          window.qaFailRpcs = ['get_recipes'];
        }
      });
      await page.evaluate(() =>
        window.__hcOps.setState({ liveRecipeTarget: 'dcf' }, () => window.__hcOps.go('recipes'))
      );
      await page.waitForTimeout(1000);
      const text = await body(page);
      if (!/The recipe could not be read\./.test(text)) fail('recipe: no "The recipe could not be read."');
      if (/could not be refreshed/.test(text)) fail('recipe: says "refreshed" on a first read');
      await shot(page, 'recipe');
      await page.close();
    }
    // 3. Payments with an unreadable order
    {
      const { page } = await open(browser, width, height, {
        fn: () => {
          window.qaMalformedOrder = true;
        }
      });
      await page.evaluate(() => window.__hcOps.go('reconcile'));
      await page.waitForTimeout(1000);
      let text = await body(page);
      if (!/could not be read/i.test(text)) fail('payments: no dropped-order warning');
      if (/Everything matched/.test(text)) fail('payments: "Everything matched" beside a dropped order');
      const tickAll = page.getByRole('button', { name: 'Tick all', exact: true });
      if (await tickAll.count()) {
        await tickAll.first().click();
        await page.waitForTimeout(500);
        text = await body(page);
        if (/Your wallet and your books agree/.test(text))
          fail('payments: Tick all claims the wallet and books agree with a dropped order');
        if (/Everything matched/.test(text))
          fail('payments: "Everything matched" after Tick all with a dropped order');
        if (/Every reference is accounted for/.test(text))
          fail('payments: "Every reference is accounted for" with a dropped order');
      }
      await shot(page, 'payments');
      await page.close();
    }
    // 4. Payment review footer (D1)
    {
      const { page } = await open(browser, width, height);
      await page.evaluate(() => window.__hcOps.go('order', { orderId: 'HC-1101' }));
      await page.waitForTimeout(1000);
      const text = await body(page);
      if (/Nothing is reserved until you confirm/.test(text))
        fail('review footer: says nothing is reserved (contradicts D1)');
      await shot(page, 'review-footer');
      await page.close();
    }
    // 5. Start production after a failed catalogue read
    {
      const { page } = await open(browser, width, height, {
        fn: () => {
          window.qaFlavoursFail = true;
        }
      });
      await page.evaluate(() => window.__hcOps.go('products'));
      await page.waitForTimeout(1000);
      const start = page.getByRole('button', { name: 'Start production' });
      if ((await start.count()) && (await start.first().isEnabled()))
        fail('products: Start production is enabled after a failed catalogue read');
      await shot(page, 'products');
      await page.close();
    }
    console.log(
      JSON.stringify({
        label: LABEL,
        size: `${width}x${height}`,
        failures: failures.filter((f) => f.startsWith(`${width}x`)).length
      })
    );
  }
  await browser.close();
  if (failures.length) {
    console.log(`Low-items check FAILED (${LABEL}):\n - ${failures.join('\n - ')}`);
    process.exitCode = 1;
  } else console.log(`Low-items check passed at 390x844 and 1440x900 (${LABEL})`);
})();
