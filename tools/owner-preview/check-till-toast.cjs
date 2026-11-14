// Run after preview:owner. Synthetic data only (HCB-005): a toast must never sit on top of the till's Charge button,
// the payment sheet's buttons or its reference field, and its Undo must stay tappable.
const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const out = process.argv[2] ?? 'build/owner-preview-till-toast';
fs.mkdirSync(out, { recursive: true });
const SIZES = (process.env.TILL_TOAST_SIZES ?? '320x640,390x844,768x1024,1024x768')
  .split(',')
  .map((size) => size.split('x').map(Number));
const OFFLINE = 'Offline. Keep selling — every sale is saved on this phone.';

// What is on top at the middle of a control: the control itself (or a child of it), or what covers it.
const topAt = (page, selector, index) =>
  page.evaluate(
    ({ selector, index }) => {
      const nodes = [...document.querySelectorAll(selector)].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      const el = nodes[index];
      if (!el) return { found: false };
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const top = document.elementFromPoint(x, y);
      const inView = y >= 0 && y <= innerHeight && x >= 0 && x <= innerWidth;
      return {
        found: true,
        inView,
        ok: !!top && (top === el || el.contains(top)),
        covering: top ? (top.closest('[role="alert"],[role="status"]') ? 'toast' : top.tagName) : null
      };
    },
    { selector, index }
  );

(async () => {
  const browser = await chromium.launch({ headless: true });
  const failures = [];
  try {
    for (const [width, height] of SIZES) {
      const label = `${width}x${height}`;
      const fail = (what) => failures.push(`${label}: ${what}`);
      const context = await browser.newContext({ viewport: { width, height } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('**/*', (route) =>
        new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort()
      );
      await page.goto('http://127.0.0.1:4186/', { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.getByRole('heading', { name: 'Inventory', exact: true }).waitFor({ timeout: 90000 });
      await page.evaluate(() => {
        const r = window.__hcOps;
        r.setState({
          event: { id: 'e1', name: 'QA market', stage: 'selling', dayId: 'd1' },
          eventLoaded: { dcf: 12, hc: 12 },
          eventStock: { dcf: 12, hc: 12 },
          eventPrices: { dcf: 130, hc: 140 },
          cart: { dcf: 2, hc: 1 },
          sales: []
        });
        r.go('bazaar');
      });
      await page.getByRole('button', { name: /^Charge/ }).first().waitFor({ timeout: 30000 });
      await page.waitForTimeout(800);
      const device = await page.evaluate(() => window.__hcOps.state.device);

      // 1. The engine's offline toast, with a sale in hand: Charge stays the element at its own centre.
      await page.evaluate((msg) => window.__hcOps.toast(msg, 'warn'), OFFLINE);
      await page.getByRole('alert').first().waitFor({ timeout: 5000 });
      await page.waitForTimeout(400);
      const charge = page.getByRole('button', { name: /^Charge/ }).filter({ visible: true }).first();
      const chargeBox = await charge.boundingBox();
      if (!chargeBox) fail('no visible Charge button');
      else {
        const hit = await page.evaluate(({ x, y }) => {
          const el = document.elementFromPoint(x, y);
          return {
            button: el?.closest('button')?.textContent?.trim() ?? null,
            toast: !!el?.closest('[role="alert"],[role="status"]')
          };
        }, { x: chargeBox.x + chargeBox.width / 2, y: chargeBox.y + chargeBox.height / 2 });
        if (!/^Charge/.test(hit.button ?? '')) fail(`Charge is covered at its centre (${hit.toast ? 'by the toast' : hit.button})`);
      }
      await page.screenshot({ path: `${out}/till-${width}.png` });

      // 2. Undo on a toast raised over the till is still the element at its own centre.
      await page.evaluate(() => window.__hcOps.toast('Sale removed.', 'ok', () => {}));
      await page.getByRole('button', { name: 'Undo', exact: true }).waitFor({ timeout: 5000 });
      await page.waitForTimeout(400);
      const undo = await topAt(page, '[role="status"] button, [role="alert"] button', 0);
      if (!undo.found || !undo.ok) fail('Undo is not the element at its own centre on the till');

      // 3. Charge opens the payment sheet.
      await page.evaluate((msg) => window.__hcOps.toast(msg, 'warn'), OFFLINE);
      await page.waitForTimeout(300);
      if (chargeBox) await page.mouse.click(chargeBox.x + chargeBox.width / 2, chargeBox.y + chargeBox.height / 2);
      const opened = await page
        .waitForFunction(() => window.__hcOps.state.sheet?.kind === 'pay', undefined, { timeout: 3000 })
        .then(() => true, () => false);
      if (!opened) {
        fail('clicking Charge did not open the payment sheet');
        await page.screenshot({ path: `${out}/pay-${width}-blocked.png` });
        // Open it directly, so the sheet's own toast is still checked.
        await page.evaluate(() => window.__hcOps.sheet('pay'));
      }
      await page.getByText('Last 4 of their reference', { exact: true }).waitFor({ timeout: 5000 });
      await page.evaluate(() => window.__hcOps.setState({ toast: null }));

      // 4. Wallet tap with no reference: the toast shows, and no payment control sits under it.
      const controls = async () =>
        page.evaluate(() => {
          const root = document.getElementById('hc-sale-ref')?.closest('label')?.parentElement;
          if (!root) return [];
          const tag = (el, i) => {
            el.setAttribute('data-till-check', String(i));
            return { i, text: (el.id ? '#' + el.id : el.textContent || '').trim().slice(0, 24) };
          };
          // The sheet's Close too (review note): a wrapped toast at the top must not reach it.
          const close = [...document.querySelectorAll('button')].filter((b) =>
            /^close/i.test(b.getAttribute('aria-label') || '')
          );
          return [...new Set([...root.querySelectorAll('button, input'), ...close])].map(tag);
        });
      const list = await controls();
      if (!list.length) fail('payment sheet controls not found');
      for (const wallet of ['GCash', 'Maya', 'GoTyme']) {
        const button = page.getByRole('button', { name: new RegExp(`^${wallet}`) });
        if (!(await button.count())) continue;
        await button.first().scrollIntoViewIfNeeded();
        await button.first().click();
        const toast = page.getByRole('alert').filter({ hasText: 'last 4 digits' });
        try {
          await toast.waitFor({ state: 'visible', timeout: 3000 });
        } catch {
          fail(`${wallet}: the reference toast is not visible`);
          continue;
        }
        await page.waitForTimeout(350);
        const toastBox = await toast.first().boundingBox();
        if (!toastBox || toastBox.y < -1 || toastBox.y + toastBox.height > height + 1 || toastBox.x < -1 || toastBox.x + toastBox.width > width + 1)
          fail(`${wallet}: the toast is not wholly on screen`);
        for (const c of list) {
          const hit = await topAt(page, `[data-till-check="${c.i}"]`, 0);
          if (hit.found && hit.inView && !hit.ok)
            fail(`${wallet}: "${c.text}" is covered by ${hit.covering} at its centre`);
        }
        await page.screenshot({ path: `${out}/pay-${width}-${wallet}.png` });
        // Undo in this sheet too.
        // A long message with Undo wraps to its tallest; nothing in the sheet may sit under it either.
        await page.evaluate(() =>
          window.__hcOps.toast(
            'Sale removed. Every sale is saved on this phone and sent when the signal is back.',
            'ok',
            () => {}
          )
        );
        await page.getByRole('button', { name: 'Undo', exact: true }).waitFor({ timeout: 5000 });
        await page.waitForTimeout(350);
        const sheetUndo = await topAt(page, '[role="status"] button, [role="alert"] button', 0);
        if (!sheetUndo.found || !sheetUndo.ok) fail(`${wallet}: Undo is not the element at its own centre in the sheet`);
        for (const c of list) {
          const hit = await topAt(page, `[data-till-check="${c.i}"]`, 0);
          if (hit.found && hit.inView && !hit.ok)
            fail(`${wallet} (Undo toast): "${c.text}" is covered by ${hit.covering} at its centre`);
        }
        await page.evaluate(() => window.__hcOps.setState({ toast: null }));
      }
      if (errors.length) fail(`page errors: ${errors.slice(0, 2).join(' | ')}`);
      console.log(JSON.stringify({ size: label, device, controls: list.length, failures: failures.filter((f) => f.startsWith(label)).length }));
      await context.close();
    }
  } finally {
    await browser.close();
  }
  if (failures.length) {
    console.error('Till toast check FAILED:\n' + failures.map((f) => ' - ' + f).join('\n'));
    process.exit(1);
  }
  console.log('Till toast check passed at', SIZES.map(([w, h]) => `${w}x${h}`).join(', '));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
