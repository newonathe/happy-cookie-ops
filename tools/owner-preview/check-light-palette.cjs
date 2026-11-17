// SYNTHETIC only. Compare unchanged owner geometry/content and verify the restored historical light palette.
// Capture: node tools/owner-preview/check-light-palette.cjs before <url> <output-directory>
// Compare: node tools/owner-preview/check-light-palette.cjs after <url> <output-directory> <before-directory>
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync, readFileSync } = require('node:fs');
const { chromium } = require('@playwright/test');
const [mode = 'after', base = 'http://127.0.0.1:4198', out = 'build/light-palette', before] = process.argv.slice(2);
const pages = ['today', 'pnl', 'inventory', 'grocery', 'suppliers', 'orders', 'reconcile', 'drops', 'bake', 'bazaar', 'settings'];
async function sample(page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  return page.evaluate(() => {
    const selectors = 'aside, header, main, nav, main h1, main h2, main section, main [role="group"], main button, main input';
    return [...document.querySelectorAll(selectors)].flatMap(el => {
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) return [];
      const s = getComputedStyle(el);
      return [{ tag: el.tagName, role: el.getAttribute('role'), label: el.getAttribute('aria-label'), text: (el.innerText ?? '').trim().replace(/\s+/g, ' ').slice(0, 180), rect: [r.x + scrollX, r.y + scrollY, r.width, r.height].map(n => Math.round(n * 10) / 10), font: [s.fontFamily, s.fontSize, s.fontWeight, s.lineHeight], radius: s.borderRadius }];
    });
  });
}
async function checkPaint(page) {
  const paint = await page.evaluate(() => {
    const root = document.querySelector('main').closest('[data-refined-frame]') ?? document.querySelector('main').closest('[class*="workspace"]');
    const s = getComputedStyle(root); const h = document.querySelector('main h1');
    return { ink: s.getPropertyValue('--color-owner-ink').trim(), ground: s.getPropertyValue('--color-on-ground').trim(), background: s.backgroundColor, image: s.backgroundImage, body: getComputedStyle(document.body).backgroundColor, heading: h && getComputedStyle(h).color };
  });
  assert.equal(paint.ink.toLowerCase(), '#24262b', 'historical owner ink');
  assert.equal(paint.background, 'rgb(244, 245, 247)', 'historical light ground');
  assert.equal(paint.image, 'none', 'no espresso gradient');
  assert.equal(paint.body, 'rgb(244, 245, 247)', 'light overscroll');
  if (paint.heading) assert.equal(paint.heading, 'rgb(36, 38, 43)', 'dark heading on light ground');
  return paint;
}
function sameLayout(actual, expected, label) {
  assert.equal(actual.length, expected.length, `${label}: element count`);
  actual.forEach((row, i) => {
    const old = expected[i];
    for (const key of ['tag', 'role', 'label', 'text', 'font', 'radius']) assert.deepEqual(row[key], old[key], `${label} ${i}: ${key}`);
    row.rect.forEach((n, j) => assert(Math.abs(n - old.rect[j]) <= 0.6, `${label} ${i}: geometry ${row.rect} != ${old.rect}`));
  });
}
(async () => {
  assert(['before', 'after'].includes(mode)); if (mode === 'after') assert(before, 'before directory required');
  mkdirSync(out, { recursive: true }); const browser = await chromium.launch();
  try {
    for (const width of [390, 1920]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await context.addInitScript(() => {
        const Original = Date; const fixed = Original.parse('2026-11-16T10:00:00Z');
        window.Date = class extends Original { constructor(...args) { super(...(args.length ? args : [fixed])); } static now() { return fixed; } };
      });
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', r => new URL(r.request().url()).origin === base ? r.continue() : r.abort());
      await page.goto(base); await page.waitForFunction(() => window.qaCalls?.includes('get_scheduled_events'));
      await page.evaluate(() => document.fonts.ready);
      const results = {};
      for (const screen of pages) {
        await page.evaluate(s => window.__hcOps.go(s), screen);
        await page.waitForFunction(s => document.querySelector('main')?.getAttribute('data-screen') === s, screen);
        results[screen] = await sample(page);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${screen}: overflow`);
        if (mode === 'after') {
          await checkPaint(page);
          const baseline = JSON.parse(readFileSync(`${before}/geometry-${width}.json`, 'utf8'));
          sameLayout(results[screen], baseline[screen], `${width} ${screen}`);
        }
        if (['today', 'pnl', 'inventory', 'orders', 'reconcile', 'drops', 'bake', 'bazaar', 'settings'].includes(screen))
          await page.screenshot({ path: `${out}/synthetic-${width}-${screen}.png`, fullPage: true, animations: 'disabled' });
      }
      await page.evaluate(() => { window.__hcOps.go('orders'); window.__hcOps.sheet('customers'); });
      await page.waitForFunction(() => document.querySelector('main')?.getAttribute('data-screen') === 'customers');
      results.customers = await sample(page);
      if (mode === 'after') { await checkPaint(page); sameLayout(results.customers, JSON.parse(readFileSync(`${before}/geometry-${width}.json`, 'utf8')).customers, `${width} customers`); }
      await page.screenshot({ path: `${out}/synthetic-${width}-customers.png`, fullPage: true, animations: 'disabled' });
      await page.evaluate(() => window.__hcOps.closeSheet());
      await page.evaluate(() => window.__hcOps.sheet('dropState'));
      await page.waitForFunction(() => document.querySelector('main')?.getAttribute('data-screen') === 'form');
      results.form = await sample(page);
      if (mode === 'after') { await checkPaint(page); sameLayout(results.form, JSON.parse(readFileSync(`${before}/geometry-${width}.json`, 'utf8')).form, `${width} form`); }
      await page.screenshot({ path: `${out}/synthetic-${width}-form.png`, fullPage: true, animations: 'disabled' });
      assert.deepEqual(errors, []);
      writeFileSync(`${out}/geometry-${width}.json`, JSON.stringify(results));
      console.log(`PASS SYNTHETIC ${mode} ${width}px: ${Object.keys(results).length} views; ${mode === 'after' ? 'paint restored, content/layout/typography retained' : 'baseline recorded'}`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
