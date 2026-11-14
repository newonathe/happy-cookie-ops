// HCB-012 / HCB-013 browser check, SYNTHETIC: the real owner app on the owner preview's fake data (no database, no
// network), with RouteSync mounted as in the app (`window.qaRouteSync`).
// HCB-012: Shopping › Compare prices › Back returns to Shopping, not the Inventory list.
// HCB-013: a reload on a product's recipe page stays on that recipe, not the Recipe book.
// `pnpm preview:owner`, then `node tools/owner-preview/check-back-and-reload.cjs [outDir]`. Screenshots `synthetic-nav-*`.
const { mkdirSync } = require('node:fs');
const { chromium } = require('playwright');

const out = process.argv[2] ?? 'build/owner-preview-back-reload';
const port = process.env.PREVIEW_PORT ?? '4186';
const LABEL = 'SYNTHETIC (owner preview, fake data, not a connected database)';
const SIZES = [
  [390, 844],
  [1440, 900]
];

async function ready(page) {
  await page.waitForFunction(() => typeof window.__hcOps?.go === 'function', null, { timeout: 90000 });
  await page.waitForTimeout(3500);
}

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
      window.qaRouteSync = true;
    });

    // HCB-012
    await page.goto(`http://127.0.0.1:${port}/grocery`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await ready(page);
    await page.evaluate(() => window.__hcOps.go('grocery'));
    await page.waitForTimeout(800);
    const compare = page.getByRole('button', { name: /^Compare prices/ }).first();
    if (!(await compare.count())) fail('HCB-012: no Compare prices on Shopping');
    else {
      await compare.click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${out}/synthetic-nav-prices-${width}.png` });
      // The page's own Back ("Back to …") if it has one, else the header's back arrow, as the owner would press.
      const own = page.getByRole('button', { name: /^Back to/ });
      const back = (await own.count()) ? own.first() : page.getByRole('button', { name: /^Back$|^Go back/i }).first();
      if (!(await back.count())) fail('HCB-012: no Back on the prices page');
      else {
        await back.click();
        await page.waitForTimeout(800);
        const screen = await page.evaluate(() => window.__hcOps.state.screen);
        if (screen !== 'grocery') fail(`HCB-012: Back from Compare prices landed on "${screen}", not Shopping`);
      }
      await page.screenshot({ path: `${out}/synthetic-nav-after-back-${width}.png` });
    }

    // HCB-013
    await page.evaluate(() =>
      window.__hcOps.setState({ liveRecipeTarget: 'dcf' }, () => window.__hcOps.go('recipes'))
    );
    await page.waitForTimeout(1000);
    const before = page.url();
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
    await ready(page);
    const after = await page.evaluate(() => ({
      screen: window.__hcOps.state.screen,
      target: window.__hcOps.state.liveRecipeTarget ?? null,
      text: (document.body.textContent ?? '').replace(/\s+/g, ' ')
    }));
    if (after.screen !== 'recipes') fail(`HCB-013: reload landed on "${after.screen}"`);
    if (after.target !== 'dcf' || !/Back to Products/.test(after.text))
      fail(`HCB-013: reload did not keep the recipe page (address was ${before})`);
    await page.screenshot({ path: `${out}/synthetic-nav-recipe-reload-${width}.png` });
    if (errors.length) fail(`page errors: ${errors[0]}`);
    console.log(
      JSON.stringify({
        label: LABEL,
        size: `${width}x${height}`,
        recipeAddress: before.replace(/^https?:\/\/[^/]+/, ''),
        failures: failures.filter((f) => f.startsWith(`${width}x`)).length
      })
    );
    await page.close();
  }
  await browser.close();
  if (failures.length) {
    console.log(`Back and reload check FAILED (${LABEL}):\n - ${failures.join('\n - ')}`);
    process.exitCode = 1;
  } else console.log(`Back and reload check passed at 390x844 and 1440x900 (${LABEL})`);
})();
