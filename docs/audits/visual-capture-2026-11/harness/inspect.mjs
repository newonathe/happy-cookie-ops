// Exploration helper: load one path, run optional clicks, print heading, controls and harness facts.
// node inspect.mjs '<json>' {path, width, height, config, clicks:[...], shot, wait}
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const { chromium } = createRequire(repo + '/package.json')('@playwright/test');
const a = JSON.parse(process.argv[2] ?? '{}');
const b = await chromium.launch({ headless: true });
const c = await b.newContext({
  viewport: { width: a.width ?? 1440, height: a.height ?? 900 },
  timezoneId: 'Asia/Manila',
  locale: 'en-PH',
  serviceWorkers: 'block'
});
await c.addCookies([
  {
    name: 'sb-synthetic-auth-token',
    value: 'fake',
    url: 'http://127.0.0.1:' + (process.env.CAPTURE_PORT ?? 4196) + ''
  }
]);
const p = await c.newPage();
await p.clock.setFixedTime(new Date('2026-11-10T02:00:00.000Z'));
await p.addInitScript((cfg) => {
  window.__captureConfig = cfg;
}, a.config ?? {});
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
p.on('console', (m) => {
  if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300));
});
p.on('requestfailed', (r) => console.log('REQFAIL', r.url().slice(0, 140)));
await p.route('**/*', (r) =>
  new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()
);
await p.goto('http://127.0.0.1:' + (process.env.CAPTURE_PORT ?? 4196) + '' + (a.path ?? '/'), {
  waitUntil: 'load'
});
await p.waitForTimeout(a.wait ?? 1500);
for (const step of a.clicks ?? []) {
  try {
    if (typeof step === 'string') {
      const loc = step.startsWith('text=')
        ? p.getByText(step.slice(5), { exact: false })
        : p.getByRole('button', { name: step, exact: false });
      await loc.first().click({ timeout: 4000 });
    } else if (step.fill)
      await p.getByLabel(step.fill, { exact: false }).first().fill(String(step.value));
    else if (step.eval) console.log('EVAL', JSON.stringify(await p.evaluate(step.eval)));
    await p.waitForTimeout(a.stepWait ?? 500);
  } catch (e) {
    console.log('STEPFAIL', JSON.stringify(step), e.message.split('\n')[0]);
  }
}
const facts = await p.evaluate(() => {
  const vis = (e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
  };
  const lab = (e) =>
    (e.getAttribute('aria-label') || e.innerText || e.value || e.placeholder || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 70);
  return {
    url: location.pathname + location.search,
    title: document.title,
    screen: window.__hcOps?.state?.screen,
    heads: [...document.querySelectorAll('h1,h2')]
      .filter(vis)
      .map((e) => e.tagName + ':' + e.innerText.trim().slice(0, 60)),
    btn: [...document.querySelectorAll('button,a[href],[role=button],[role=tab]')]
      .filter(vis)
      .map(lab)
      .filter(Boolean),
    inputs: [...document.querySelectorAll('input,select,textarea')]
      .filter(vis)
      .map(
        (e) =>
          e.tagName +
          ':' +
          (e.type || '') +
          ':' +
          (
            e.labels?.[0]?.innerText ||
            e.getAttribute('aria-label') ||
            e.name ||
            e.placeholder ||
            ''
          )
            .trim()
            .slice(0, 50)
      ),
    text: a_text(),
    unhandled: window.__capture?.unhandled,
    writes: window.__capture?.writes?.map((w) => w.name),
    overflow: document.documentElement.scrollWidth - innerWidth
  };
  function a_text() {
    return document.body.innerText.replace(/\s+/g, ' ').slice(0, 1400);
  }
});
if (a.terse) delete facts.text;
console.log(JSON.stringify(facts, null, 0));
if (a.shot) await p.screenshot({ path: a.shot, fullPage: a.full ?? false });
await b.close();
