// Breadth-first explorer over the real UI at one width. Discovers views and control outcomes; writes crawl.json.
// node crawl.mjs <out.json> [maxNodes] [workers]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageHelpers } from './page-helpers.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const { chromium } = createRequire(repo + '/package.json')('@playwright/test');
const out = process.argv[2];
const MAX_NODES = Number(process.argv[3] ?? 500);
const WORKERS = Number(process.argv[4] ?? 6);
const WIDTH = Number(process.env.CRAWL_WIDTH ?? 1440);
const BASE = 'http://127.0.0.1:4196';
const STARTS = process.env.CRAWL_STARTS
  ? JSON.parse(process.env.CRAWL_STARTS)
  : [
      '/',
      '/bazaar',
      '/orders',
      '/reconcile',
      '/drops',
      '/products',
      '/recipes',
      '/bake',
      '/batch',
      '/inventory',
      '/grocery',
      '/suppliers',
      '/pnl',
      '/sales',
      '/settings',
      '/health',
      '/notifications',
      '/shop',
      '/checkout',
      '/status',
      '/lookup',
      '/more',
      '/formqueue',
      '/stocktake',
      '/order',
      '/sign-in'
    ]
      .map((p) => ({ path: p, config: {} }))
      .concat([{ path: '/bazaar', config: { bazaar: 'planned' } }]);
const SKIP = /^(sign out|sign out anyway)$/i;
const GLOBAL = new Set([
  'Home',
  'Bazaar',
  'Sell',
  'Make',
  'Stock',
  'Money',
  'Notifications',
  'Account',
  'Sign out'
]);
const browser = await chromium.launch({ headless: true });
const nodes = new Map();
const families = new Map();
const queue = [];
const norm = (s) =>
  s
    .replace(/[0-9][0-9,.:]*/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
function enqueue(start, steps, sig) {
  if (nodes.has(sig.key) || nodes.size >= MAX_NODES) return;
  const f = families.get(sig.family) ?? 0;
  if (f >= 2) return;
  families.set(sig.family, f + 1);
  const node = {
    key: sig.key,
    family: sig.family,
    start,
    steps,
    sig,
    controls: [],
    status: 'queued'
  };
  nodes.set(sig.key, node);
  queue.push(node);
}
const sigOf = async (p) => {
  const s = await p.evaluate(() => window.__capSig());
  const h = s.heads.map(norm).sort().join(';');
  return {
    ...s,
    key: [s.screen, norm(s.h1), norm(s.dt), h, s.inputs].join('|'),
    family: [s.screen, norm(s.dt), s.heads.slice(1).map(norm).sort().join(';'), s.inputs].join('|')
  };
};
async function open(start) {
  const c = await browser.newContext({
    viewport: { width: WIDTH, height: 900 },
    timezoneId: 'Asia/Manila',
    locale: 'en-PH',
    serviceWorkers: 'block'
  });
  await c.addCookies([{ name: 'sb-synthetic-auth-token', value: 'fake', url: BASE }]);
  const p = await c.newPage();
  await p.clock.setFixedTime(new Date('2026-11-10T02:00:00.000Z'));
  await p.addInitScript(pageHelpers);
  await p.addInitScript((cfg) => {
    window.__captureConfig = cfg;
  }, start.config ?? {});
  await p.route('**/*', (r) =>
    new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()
  );
  p.on('dialog', (d) => d.dismiss().catch(() => {}));
  await p.goto(BASE + start.path, { waitUntil: 'load' });
  await p.waitForTimeout(start.wait ?? 1100);
  return { c, p };
}
async function doStep(p, step) {
  if (step.fill) {
    await p.evaluate(() => window.__capFill());
    await p.waitForTimeout(120);
    return true;
  }
  const at = await p.evaluate(([l, i]) => window.__capClick(l, i), [step.label, step.idx]);
  if (!at) return false;
  await p.mouse.click(at.x, at.y);
  await p.waitForTimeout(450);
  return true;
}
async function replay(node) {
  const { c, p } = await open(node.start);
  for (const st of node.steps) {
    if (!(await doStep(p, st))) {
      await c.close();
      return null;
    }
  }
  return { c, p };
}
async function visit(node) {
  const first = await replay(node);
  if (!first) {
    node.status = 'replay-failed';
    return;
  }
  node.sig = await sigOf(first.p);
  const controls = (await first.p.evaluate(() => window.__capControls())).filter(
    (x) => !SKIP.test(x.label)
  );
  const inputs = await first.p.evaluate(() => window.__capInputs());
  node.inputs = inputs;
  await first.c.close();
  const hasInputs = inputs.some((i) => !['checkbox', 'radio', 'search', 'file'].includes(i.type));
  const local =
    node.steps.length === 0
      ? controls
      : controls.filter((x) => !(x.rail && GLOBAL.has(x.label.replace(/\s*\d+$/, ''))));
  const seenKinds = {};
  const trimmed = local.filter((x) => {
    const m =
      /^(Fewer|More|Tick|Compare prices for|Add to inventory:|Recipe for|Edit product|Take|Open customer|Change the price of|Remove one|Add one)/.exec(
        x.label
      );
    if (!m) return true;
    seenKinds[m[1]] = (seenKinds[m[1]] ?? 0) + 1;
    return seenKinds[m[1]] <= 2;
  });
  for (const ctl of trimmed.slice(0, 32)) {
    const rec = { label: ctl.label, idx: ctl.idx, tag: ctl.tag, disabled: ctl.disabled };
    node.controls.push(rec);
    if (ctl.disabled && !hasInputs) {
      rec.empty = 'disabled';
      continue;
    }
    for (const mode of hasInputs ? ['empty', 'filled'] : ['empty']) {
      const run = await replay(node);
      if (!run) {
        rec[mode] = 'replay-failed';
        continue;
      }
      try {
        const steps = [...node.steps];
        if (mode === 'filled') {
          await run.p.evaluate(() => window.__capFill());
          await run.p.waitForTimeout(120);
          steps.push({ fill: true });
        }
        const step = { label: ctl.label, idx: ctl.idx };
        if (!(await doStep(run.p, step))) {
          rec[mode] = 'not-clickable';
          continue;
        }
        const after = await sigOf(run.p);
        if (after.key === node.key)
          rec[mode] = after.alerts.length ? { stays: true, says: after.alerts } : 'stays';
        else {
          rec[mode] = { to: after.key, h1: after.h1, dt: after.dt, says: after.alerts };
          enqueue(node.start, [...steps, step], after);
        }
        const writes = await run.p.evaluate(
          () => window.__capture?.writes?.map((w) => w.name) ?? []
        );
        if (writes.length) rec[mode + 'Writes'] = writes;
      } catch (e) {
        rec[mode] = 'error:' + e.message.split('\n')[0].slice(0, 100);
      } finally {
        await run.c.close();
      }
    }
  }
  node.status = 'done';
}
for (const start of STARTS) {
  const { c, p } = await open(start);
  const s = await sigOf(p);
  enqueue(start, [], s);
  const n = nodes.get(s.key);
  if (n) n.entry = start.path;
  await c.close();
}
const save = () => fs.writeFileSync(out, JSON.stringify([...nodes.values()]));
let active = 0;
await new Promise((resolve) => {
  const pump = () => {
    while (active < WORKERS && queue.length) {
      const n = queue.shift();
      active++;
      visit(n)
        .catch((e) => {
          n.status = 'error:' + e.message.slice(0, 120);
        })
        .finally(() => {
          active--;
          save();
          const done = [...nodes.values()].filter((x) => x.status === 'done').length;
          console.log(`${done}/${nodes.size} queue=${queue.length} ${n.sig?.h1 ?? ''}`);
          pump();
        });
    }
    if (!active && !queue.length) resolve();
  };
  pump();
});
save();
await browser.close();
console.log('CRAWL DONE', nodes.size);
