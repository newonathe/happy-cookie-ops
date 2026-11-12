// HCB-002 probe, SYNTHETIC: the real owner app on the owner preview's fake data (no database, no network). For each owner
// screen the register lists, the screen's own read fails (`window.qaFailRpcs`) from page load, and the probe records what
// the owner reads: a failure sentence, a Try again, a loading line, or a sentence that would mean "you have none".
// `pnpm preview:owner`, then `node tools/owner-preview/probe-failed-reads.cjs [outDir] [width]`.
// Screenshots are named `synthetic-failed-read-<case>-<width>.png`. A judgement aid, not a pass/fail gate.
const { mkdirSync } = require('node:fs');
const { chromium } = require('playwright');

const out = process.argv[2] ?? 'build/owner-preview-failed-reads';
const width = Number(process.argv[3] ?? 390);
const port = process.env.PREVIEW_PORT ?? '4186';
const LABEL = 'SYNTHETIC (owner preview, fake data, not a connected database)';
const CASES = [
  { id: '002b-inventory', screen: 'inventory', fail: ['get_stock_catalogue'] },
  { id: '002c-money', screen: 'pnl', fail: ['get_books'] },
  { id: '002d-payments', screen: 'reconcile', fail: ['get_staff_orders', 'get_last_paid'] },
  { id: '002e-events', screen: 'bazaar', fail: ['get_scheduled_events'] },
  { id: '002f-shopping', screen: 'grocery', fail: ['get_stock_catalogue'] },
  { id: '002f-suppliers', screen: 'suppliers', fail: ['get_stock_catalogue'] },
  { id: '002g-sales', screen: 'sales', fail: ['get_books'] },
  { id: '002g-recipes', screen: 'recipes', fail: ['get_recipes'] },
  // One product's recipe page: the list above comes from the catalogue, this page from the recipe read itself.
  { id: '002g-recipe-page', screen: 'recipes', target: 'dcf', fail: ['get_recipes'] },
  { id: '002h-order-rules', screen: 'settings', open: 'openOrderRules', fail: ['get_order_rules'] },
  { id: '002h-boxes', screen: 'settings', open: 'openOrderExtras', fail: ['get_order_extras'] },
  {
    id: '002i-home',
    screen: 'today',
    fail: ['get_books', 'get_stock_catalogue', 'get_staff_orders', 'get_production']
  }
];
// `PROBE_CASES=002d-payments,...` limits the run to those cases.
const ONLY = (process.env.PROBE_CASES ?? '').split(',').filter(Boolean);
const FAILURE = /could not|couldn['’]t|not be read|not read|failed|no connection|offline/i;
const LOADING = /loading|reading…|reading\.\.\./i;
const EMPTY =
  /no orders|nothing (to|yet|here)|none yet|no events|no suppliers|no items|no sales|no records|no recipes|0 orders|all caught up|is empty/i;

(async () => {
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  for (const c of CASES.filter((x) => !ONLY.length || ONLY.includes(x.id))) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/*', (r) =>
      new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()
    );
    await page.addInitScript((fail) => {
      window.qaFailRpcs = fail;
    }, c.fail);
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => typeof window.__hcOps?.go === 'function', null, { timeout: 90000 });
    await page.waitForTimeout(3000);
    await page.evaluate(
      ({ screen, target }) =>
        target
          ? window.__hcOps.setState({ liveRecipeTarget: target }, () => window.__hcOps.go(screen))
          : window.__hcOps.go(screen),
      { screen: c.screen, target: c.target ?? null }
    );
    await page.waitForTimeout(900);
    if (c.open) {
      await page.evaluate((m) => window.__hcOps[m]?.(), c.open);
      await page.waitForTimeout(900);
    }
    const seen = await page.evaluate(() => {
      const main = document.querySelector('main') ?? document.body;
      const text = (main.textContent ?? '').replace(/\s+/g, ' ').trim();
      const toast = [...document.querySelectorAll('[role="alert"],[role="status"]')]
        .map((n) => (n.textContent ?? '').trim())
        .filter(Boolean);
      const retry = [...document.querySelectorAll('button')].filter((b) =>
        /try again|retry/i.test(b.textContent ?? '')
      ).length;
      return { text, toast, retry, screen: window.__hcOps.state.screen, sheet: window.__hcOps.state.sheet?.kind ?? null };
    });
    const fileName = `${out}/synthetic-failed-read-${c.id}-${width}.png`;
    await page.screenshot({ path: fileName });
    console.log(
      JSON.stringify({
        label: LABEL,
        case: c.id,
        failing: c.fail,
        screen: seen.screen,
        sheet: seen.sheet,
        saysFailure: FAILURE.test(seen.text),
        saysLoading: LOADING.test(seen.text),
        saysEmpty: (seen.text.match(EMPTY) ?? [null])[0],
        retryButtons: seen.retry,
        toast: seen.toast.slice(0, 2),
        failureLine: (seen.text.match(new RegExp(`[^.]{0,80}(${FAILURE.source})[^.]{0,80}`, 'i')) ?? [null])[0],
        errors: errors.slice(0, 2)
      })
    );
    await page.close();
  }
  await browser.close();
})();
