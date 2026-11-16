// SYNTHETIC only: real components, fake ledger and RPCs, no hosted data or credentials.
// PREVIEW_PORT=4197 pnpm preview:owner; node tools/owner-preview/check-glass-stability.cjs [output]
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { chromium } = require('@playwright/test');
const out = process.argv[2] ?? 'build/glass-stability';
const base = `http://127.0.0.1:${process.env.PREVIEW_PORT ?? 4197}`;
const cases = [
  ['negative', [160.15, 0, 0, 0, 0, 0, -420.42], '−₱260.27'],
  ['refund-only', [0, 0, 0, 0, 0, 0, -0.01], '−₱0.01'],
  ['zero', [0.1, 0.2, -0.3, 0, 0, 0, 0], '₱0.00'],
  ['large', [12345678.91, 0, 0, 0, 0, 0, -0.01], '₱12,345,678.90']
];
(async () => {
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const width of [390, 1920]) {
      for (const reducedMotion of ['no-preference', 'reduce']) {
        const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.route('**/*', (r) => new URL(r.request().url()).origin === base ? r.continue() : r.abort());
        await page.goto(base);
        await page.waitForFunction(() => window.qaCalls?.includes('get_scheduled_events'));
        await page.evaluate(() => window.__hcOps.go('today'));
        await page.waitForFunction(() => window.__hcOps?.renderVals().liveHome?.week?.length === 7).catch(async (error) => {
          console.error({ width, reducedMotion, errors, state: await page.evaluate(() => ({ text: document.body.innerText.slice(0, 500), calls: window.qaCalls, home: window.__hcOps?.renderVals().liveHome })) });
          throw error;
        });
        const fits = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow');
        for (const [name, amounts, expected] of cases) {
          await page.evaluate((values) => {
            const r = window.__hcOps;
            const now = Date.now();
            r.setState({ now, ledger: values.map((amount, i) => ({ id: `synthetic-${i}`, kind: amount < 0 ? 'refund' : 'revenue', cat: 'Drops', label: 'Synthetic', amount: Math.abs(amount), at: now - (6 - i) * 86400000 })) });
            r.go('today');
          }, amounts);
          const card = page.getByRole('region', { name: 'Sales this week', exact: true });
          const figure = card.locator('span.font-mono').first();
          await figure.getByText(expected, { exact: true }).first().waitFor();
          await page.waitForTimeout(reducedMotion === 'reduce' ? 100 : 1100);
          assert.equal(await figure.getByText(expected, { exact: true }).count(), 2, `${name}: visual and accessible net`);
          if (amounts.some((n) => n < 0)) {
            assert(await card.getByText('Below the line: refunds exceed sales.').isVisible());
            const bars = await card.locator('[data-net-cents^="-"]').evaluateAll((els) => els.map((el) => ({ top: el.offsetTop, height: el.getBoundingClientRect().height, plot: el.parentElement.clientHeight, animation: getComputedStyle(el).animationName })));
            assert(bars.length > 0 && bars.every((b) => b.top >= b.plot / 2 - 1 && b.height > 0), 'refunds below zero');
            if (reducedMotion === 'reduce') assert(bars.every((b) => b.animation === 'none'));
          }
          await fits();
          await card.screenshot({ path: `${out}/synthetic-${width}-${reducedMotion}-${name}.png` });
        }
        for (const screen of ['today', 'pnl', 'inventory', 'orders']) {
          for (const form of ['dropState', 'rules', 'users', 'customers']) {
            await page.evaluate(({ screen, form }) => { window.__hcOps.go(screen); window.__hcOps.sheet(form); }, { screen, form });
            await page.locator('main[data-screen="form"]').waitFor();
            assert(await page.locator('main').evaluate((el) => { const s = getComputedStyle(el); return s.backgroundImage !== 'none' || s.backgroundColor !== 'rgba(0, 0, 0, 0)'; }), 'form sheet missing');
            await fits();
            if (screen === 'today') await page.screenshot({ path: `${out}/synthetic-${width}-${reducedMotion}-${form}.png`, fullPage: true });
            await page.evaluate(() => window.__hcOps.closeSheet());
            assert.equal(await page.locator('main').getAttribute('data-screen'), screen);
          }
        }
        assert.deepEqual(errors, []);
        console.log(`PASS SYNTHETIC ${width}px ${reducedMotion}: 4 weekly cases, 16 form round trips`);
        await context.close();
      }
    }
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
