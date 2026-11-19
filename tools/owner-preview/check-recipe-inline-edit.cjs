// Recipe page inline edit, SYNTHETIC (owner preview, fake data). `pnpm preview:owner`, then
// `node tools/owner-preview/check-recipe-inline-edit.cjs [outDir]`. Screenshots `synthetic-inline-*`.
const { mkdirSync } = require('node:fs');
const { chromium } = require('playwright');
const out = process.argv[2] ?? 'build/owner-preview-recipe-inline';
const port = process.env.PREVIEW_PORT ?? '4186';
(async () => {
  mkdirSync(out, { recursive: true });
  const failures = [];
  const browser = await chromium.launch();
  for (const [width, height] of [[390, 844], [1440, 900]]) {
    const fail = (why) => failures.push(`${width}: ${why}`);
    const page = await (await browser.newContext({ viewport: { width, height } })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/*', (r) => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
    await page.goto(`http://127.0.0.1:${port}/recipes`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => typeof window.__hcOps?.go === 'function', null, { timeout: 90000 });
    await page.waitForTimeout(3500);
    await page.evaluate(() => window.__hcOps.setState({ liveRecipeTarget: 'dcf' }, () => window.__hcOps.go('recipes')));
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/synthetic-inline-read-${width}.png` });
    const edit = page.getByRole('button', { name: 'Edit recipe', exact: true });
    if (!(await edit.count())) { fail('no Edit recipe button'); continue; }
    await page.getByLabel('Cookies to make').fill('28');
    await edit.click();
    await page.waitForTimeout(600);
    if (await page.getByLabel('Cookies to make').count()) fail('scaled box still shown while editing');
    const qty = page.getByLabel('Quantity').first();
    const before = await qty.inputValue();
    await qty.fill('999');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/synthetic-inline-edit-${width}.png` });
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.waitForTimeout(500);
    if (!(await page.getByLabel('Cookies to make').count())) fail('read page not back after Cancel');
    await edit.click();
    await page.waitForTimeout(400);
    const again = await page.getByLabel('Quantity').first().inputValue();
    if (again !== before) fail(`cancel did not restore: ${before} vs ${again}`);
    await page.getByLabel('Quantity').first().fill('777');
    await page.getByRole('button', { name: 'Save new version' }).click();
    await page.waitForTimeout(1500);
    const text = await page.evaluate(() => document.body.textContent.replace(/\s+/g, ' '));
    await page.screenshot({ path: `${out}/synthetic-inline-saved-${width}.png` });
    console.log(width, 'saved view mentions Version:', /Version \d/.exec(text)?.[0], 'edit mode closed:', !!(await edit.count()));
    if (errors.length) fail(errors[0]);
  }
  await browser.close();
  console.log(failures.length ? 'FAIL\n' + failures.join('\n') : 'OK');
  process.exitCode = failures.length ? 1 : 0;
})();
