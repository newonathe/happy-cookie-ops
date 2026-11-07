// With preview:owner running. Real UI, synthetic RPCs only; no external network.
const { chromium } = require('@playwright/test');
const { mkdirSync } = require('node:fs');
const out = process.argv[2] ?? 'build/owner-preview-recipe-handoff';
mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true });
  try { for (const width of [390, 1440]) for (const reducedMotion of ['no-preference', 'reduce']) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    const ready = async () => page.waitForFunction(() => window.__hcOps?.state.screen === 'inventory', undefined, { timeout: 90000 });
    const recipe = async () => {
      await page.evaluate(() => window.__hcOps.setState({ screen: 'recipes', liveRecipeTarget: 'dcf' }));
      await page.getByLabel('Cookies to make', { exact: true }).fill('48');
      await page.getByRole('button', { name: 'Start production', exact: true }).click();
    };
    await page.goto('http://127.0.0.1:4186/', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await ready();
    await recipe();
    const kind = () => page.getByLabel('Production type', { exact: true });
    const quantity = () => page.getByRole('spinbutton', { name: /Cookies planned for/ });
    if (await kind().inputValue() !== 'choose' || await quantity().inputValue() !== '48') throw Error('Recipe quantity/type lost');
    if (await page.getByRole('button', { name: 'Review 1 product', exact: true }).isEnabled()) throw Error('Unchosen type can be reviewed');
    await kind().selectOption('batch');
    await page.getByRole('button', { name: 'Review 1 product', exact: true }).click();
    await page.getByRole('button', { name: 'Start 1 production item', exact: true }).click();
    await page.evaluate(() => window.__hcOps.renderVals().liveProduction.inProgress[0].open());
    await page.getByLabel('Cookies made, including rejects', { exact: true }).fill('13');
    await page.getByLabel('Rejects', { exact: true }).fill('2');
    await page.evaluate(() => window.__hcOps.go('bake'));
    await page.getByRole('button', { name: 'Start production', exact: true }).click();
    const name = await page.evaluate(() => window.__hcOps.renderVals().liveProduction.start.products.find(p => p.id === 'dcf').name);
    await page.getByRole('checkbox', { name, exact: true }).check();
    await kind().selectOption('batch');
    await quantity().fill('8');
    await recipe();
    await page.getByRole('region', { name: 'Incoming recipe plan' }).waitFor();
    if (await quantity().inputValue() !== '8') throw Error('Conflict overwrote setup');
    await page.waitForTimeout(400); // Let the visible page transition settle for the screenshot.
    await page.screenshot({ path: `${out}/conflict-${width}-${reducedMotion}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Keep existing setup', exact: true }).click();
    if (await quantity().inputValue() !== '8') throw Error('Keep changed setup');
    await recipe();
    await page.getByRole('button', { name: 'Use incoming recipe plan', exact: true }).click();
    if (await kind().inputValue() !== 'choose' || await quantity().inputValue() !== '48') throw Error('Resolution lost quantity/type');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready();
    await page.evaluate(() => window.__hcOps.go('bake'));
    await page.getByRole('region', { name: 'Production plan entry' }).waitFor();
    if (await kind().inputValue() !== 'choose' || await quantity().inputValue() !== '48') throw Error('Reload lost setup');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/retained-${width}-${reducedMotion}.png`, fullPage: true });
    await page.evaluate(() => window.__hcOps.renderVals().liveProduction.inProgress[0].open());
    const facts = await page.evaluate(() => ({
      actual: window.__hcOps.renderVals().liveBatchCounts.actual,
      rejects: window.__hcOps.renderVals().liveBatchCounts.rejects,
      writes: window.qaCalls.filter(name => !name.startsWith('get_')),
      overflow: document.documentElement.scrollWidth > innerWidth
    }));
    if (facts.actual !== '13' || facts.rejects !== '2' || facts.writes.length || facts.overflow || errors.length) throw Error(JSON.stringify({ facts, errors }));
    console.log(JSON.stringify({ width, reducedMotion, transferred: 48, explicitType: true, conflict: 'keep/use', reloadRetained: true, ...facts, errors }));
    await context.close();
  }} finally { await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
