// HCB-038 browser check, SYNTHETIC: the real owner app on the owner preview's fake data (no database, no network), with
// RouteSync mounted as in the app (`window.qaRouteSync`). An unsaved recipe edit made before a reload is offered back
// ("Restore changes" / "Discard") and Restore puts it back; it is never applied silently.
// `pnpm preview:owner`, then `node tools/owner-preview/check-recipe-draft.cjs [outDir]`. Screenshots `synthetic-draft-*`.
const { mkdirSync } = require('node:fs');
const { chromium } = require('playwright');

const out = process.argv[2] ?? 'build/owner-preview-recipe-draft';
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
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/*', (r) =>
      new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()
    );
    await page.addInitScript(() => {
      window.qaRouteSync = true;
    });
    await page.goto(`http://127.0.0.1:${port}/recipes`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await ready(page);
    await page.evaluate(() =>
      window.__hcOps.setState({ liveRecipeTarget: 'dcf' }, () => window.__hcOps.go('recipes'))
    );
    await page.waitForTimeout(800);
    const edit = page.getByRole('button', { name: /Cost, history & edit/ });
    if (!(await edit.count())) {
      fail('no "Cost, history & edit" on the recipe page');
    } else {
      await edit.first().click();
      await page.waitForTimeout(800);
      // Cost, history & edit opens the product's page; Edit recipe opens the recipe editor with its lines.
      const editRecipe = page.getByRole('button', { name: /^Edit recipe/ });
      if (await editRecipe.count()) {
        await editRecipe.first().click();
        await page.waitForTimeout(800);
      }
      const field = page.locator('ul[aria-label="Recipe lines"] input:not([disabled])').first();
      if (!(await field.count())) fail('no amount field in the recipe editor');
      else {
        await field.fill('999');
        await field.blur();
        await page.waitForTimeout(600);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
        await ready(page);
        const text = await page.evaluate(() => (document.body.textContent ?? '').replace(/\s+/g, ' '));
        if (!/unsaved changes/i.test(text)) fail('after the reload, no offer to restore the unsaved changes');
        await page.screenshot({ path: `${out}/synthetic-draft-offer-${width}.png` });
        const restore = page.getByRole('button', { name: /Restore changes/ });
        if (await restore.count()) {
          await restore.first().click();
          await page.waitForTimeout(800);
          const values = await page.evaluate(() =>
            [...document.querySelectorAll('input')].map((i) => i.value)
          );
          if (!values.includes('999')) fail('Restore changes did not put the edit back');
          await page.screenshot({ path: `${out}/synthetic-draft-restored-${width}.png` });
        } else fail('no "Restore changes" button');
      }
    }
    if (errors.length) fail(`page errors: ${errors[0]}`);
    console.log(
      JSON.stringify({
        label: LABEL,
        size: `${width}x${height}`,
        failures: failures.filter((f) => f.startsWith(`${width}x`)).length
      })
    );
    await context.close();
  }
  await browser.close();
  if (failures.length) {
    console.log(`Recipe draft check FAILED (${LABEL}):\n - ${failures.join('\n - ')}`);
    process.exitCode = 1;
  } else console.log(`Recipe draft check passed at 390x844 and 1440x900 (${LABEL})`);
})();
