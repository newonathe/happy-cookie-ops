// Synthetic check (owner preview, fake data): horizontal overflow, touch targets >= 44x44, clipped text.
// Usage: node tools/owner-preview/check-touch-targets.cjs  (env: BASE, WIDTHS, PAGES). Exit 1 on any failure.
const { chromium } = require('@playwright/test');
const EXE = 'C:/Users/ethan/AppData/Local/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-win64/chrome-headless-shell.exe';
const BASE = process.env.BASE ?? 'http://127.0.0.1:4186/';
const PAGES = (process.env.PAGES ?? 'today,bazaar,orders,reconcile,drops,recipes,products,bake,inventory,grocery,suppliers,pnl,sales,settings,health,more').split(',');
const WIDTHS = (process.env.WIDTHS ?? '320,390,768,1024').split(',').map(Number);
const MIN = 44;

function measure(min) {
  const out = [];
  const label = (el) => {
    const t = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls.slice(0, 40) : ''}${t ? ` "${t}"` : ''}`;
  };
  const visible = (el) => {
    if (el.closest('[aria-hidden="true"]')) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth) out.push(['OVERFLOW', `document`, `${de.scrollWidth - de.clientWidth}px over`]);
  // Elements poking out past the viewport edge even when the document itself does not scroll.
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right <= de.clientWidth + 1 && r.left >= -1) continue;
    let p = el.parentElement, scrolls = false;
    while (p && p !== document.body) {
      if (/auto|scroll|hidden|clip/.test(getComputedStyle(p).overflowX)) { scrolls = true; break; }
      p = p.parentElement;
    }
    if (!scrolls && getComputedStyle(el).position !== 'fixed') out.push(['OVERFLOW', label(el), `edge ${Math.round(r.left)}..${Math.round(r.right)}`]);
  }
  for (const el of document.querySelectorAll('button, a[href], [role=button], input, select, summary')) {
    if (!visible(el)) continue;
    if (el.tagName === 'INPUT' && (el.type === 'file' || el.type === 'hidden')) continue;
    // A visually hidden control whose label is the hit area: judge the label instead.
    let target = el;
    if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) {
      const lab = el.closest('label');
      if (lab && visible(lab)) target = lab;
    }
    const r = target.getBoundingClientRect();
    if (r.width < min - 0.5 || r.height < min - 0.5) out.push(['TARGET', label(el), `${Math.round(r.width)}x${Math.round(r.height)}`]);
  }
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || el.children.length > 0 && !el.matches('span,p,div,a,button,li,td,th,h1,h2,h3,h4,label,strong,em')) continue;
    const cs = getComputedStyle(el);
    if (el.getBoundingClientRect().width <= 1 || cs.clip !== 'auto' || /rect\(/.test(cs.clipPath)) continue; // sr-only
    const clips = /hidden|clip/.test(cs.overflowX) || cs.textOverflow === 'ellipsis';
    if (!clips) continue;
    if (el.scrollWidth > el.clientWidth + 1 && (el.textContent || '').trim()) {
      // Only text-bearing leaves or text blocks (skip scroll containers that are meant to scroll).
      if (/auto|scroll/.test(cs.overflowX)) continue;
      // Ported markup (src/components/screens/all-tools.tsx) truncates its subtitles by design and is locked.
      if (el.closest("[data-screen-label='All tools']")) continue;
      out.push(['CLIP', label(el), `${el.scrollWidth}>${el.clientWidth}`]);
    }
  }
  return out;
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EXE });
  const lines = [];
  const counts = { OVERFLOW: 0, TARGET: 0, CLIP: 0 };
  const report = (width, key, found) => {
    const seen = new Set();
    for (const [kind, what, size] of found) {
      const line = `${width} ${key} ${kind} ${what} ${size}`;
      if (seen.has(line)) continue;
      seen.add(line);
      counts[kind]++;
      lines.push(line);
    }
  };
  for (const width of WIDTHS) {
    const open = async (entry) => {
      const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 } });
      const page = await context.newPage();
      page.on('pageerror', (e) => lines.push(`${width} - PAGEERROR ${e.message}`));
      await page.route('**/*', (r) => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
      await page.goto(BASE + entry, { waitUntil: 'domcontentloaded', timeout: 90000 });
      if (!entry) await page.getByRole('heading', { name: 'Inventory', exact: true }).waitFor({ timeout: 90000 });
      return { context, page };
    };
    const { context, page } = await open('');
    for (const key of PAGES) {
      await page.evaluate((k) => window.__hcOps.go(k), key);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(700);
      report(width, key, await page.evaluate(measure, MIN));
    }
    // Menu and flavours list, the product editor, then the selling till with a cart.
    try {
      await page.evaluate(() => window.__hcOps.go('products'));
      await page.waitForTimeout(500);
      await page.evaluate(() => window.__hcOps.openFlavourList());
      await page.getByRole('button', { name: 'Add a flavour' }).waitFor({ timeout: 15000 });
      await page.waitForTimeout(500);
      report(width, 'sheet-flavours', await page.evaluate(measure, MIN));
      const ice = page.getByText('Vanilla ice cream', { exact: false }).first();
      if (await ice.count()) {
        await ice.click();
        await page.getByRole('button', { name: 'Save product' }).waitFor({ timeout: 15000 });
        await page.waitForTimeout(500);
        report(width, 'sheet-editor-item', await page.evaluate(measure, MIN));
      }
    } catch (e) { lines.push(`${width} sheets - SETUP ${String(e.message).split(String.fromCharCode(10))[0]}`); }
    try {
      await page.evaluate(() => {
        const r = window.__hcOps;
        r.setState({ sheet: null, event: { id: 'e1', name: 'QA market', stage: 'selling', dayId: 'd1' },
          eventLoaded: { dcf: 12, hc: 12, wcb: 6 }, eventStock: { dcf: 9, hc: 12, wcb: 2 }, eventPrices: { dcf: 130, hc: 140, wcb: 150 },
          cart: { dcf: 2, hc: 1 }, sales: [] });
        r.go('bazaar');
      });
      await page.getByRole('button', { name: /^Charge/ }).first().waitFor({ timeout: 30000 });
      await page.waitForTimeout(700);
      report(width, 'till-selling', await page.evaluate(measure, MIN));
    } catch (e) { lines.push(`${width} till-selling - SETUP ${String(e.message).split(String.fromCharCode(10))[0]}`); }
    await context.close();
    // Bazaar event scenarios (history fixture): event list, the event, then each screen reached from it.
    const ACTIONS = ['', 'Sun, 25 Oct', 'Review and close that day', 'Review and close', 'Change a price', 'Transfer from kitchen'];
    for (const action of ACTIONS) {
      const b = await open('bazaar');
      const key = action ? 'bazaar-' + action.toLowerCase().replace(/[^a-z]+/g, '-') : 'bazaar-event';
      try {
        await b.page.getByRole('heading', { name: 'Bazaar events', exact: true }).waitFor({ timeout: 60000 });
        await b.page.getByText('Reading your events…', { exact: true }).waitFor({ state: 'hidden', timeout: 15000 });
        const past = b.page.getByRole('button', { name: /Past/ });
        if (await past.count()) await past.click();
        await b.page.waitForTimeout(700);
        if (!action) report(width, 'bazaar-events', await b.page.evaluate(measure, MIN));
        await b.page.getByText('Katipunan market', { exact: true }).first().click();
        await b.page.getByRole('heading', { name: 'Katipunan market', exact: true }).waitFor({ timeout: 30000 });
        await b.page.getByText('Reading this event…', { exact: true }).waitFor({ state: 'hidden', timeout: 15000 });
        if (action) await b.page.getByRole('button', { name: new RegExp('^' + action) }).first().click();
        await b.page.waitForTimeout(900);
        report(width, key, await b.page.evaluate(measure, MIN));
      } catch (e) { lines.push(`${width} ${key} - SETUP ${String(e.message).split(String.fromCharCode(10))[0]}`); }
      await b.context.close();
    }
  }
  await browser.close();
  const total = counts.OVERFLOW + counts.TARGET + counts.CLIP;
  lines.push(`SUMMARY overflow=${counts.OVERFLOW} target=${counts.TARGET} clip=${counts.CLIP} total=${total}`);
  console.log(lines.join('\n'));
  process.exitCode = total > 0 ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
