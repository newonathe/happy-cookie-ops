// Capture runner. Replays declared scenarios and flows through the real UI and writes screenshots plus measurements.
// Results are written per shot, so a rerun skips finished work. Usage:
//   node capture.mjs [--only=<regex>] [--force] [--workers=6] [--kind=scenarios|flows|all]
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageHelpers } from './page-helpers.mjs';
import { auditHelpers } from './audit-helpers.mjs';
import { SCENARIOS, VIEWPORTS } from './scenarios.mjs';
import { FLOWS } from './flows.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../..');
const req = createRequire(repo + '/package.json');
const { chromium, webkit } = req('@playwright/test');
const sharp = createRequire(req.resolve('next/package.json'))('sharp');
const root = path.join(repo, 'build', process.env.CAPTURE_ROOT ?? 'visual-capture-output');
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);
const BASE = `http://127.0.0.1:${process.env.CAPTURE_PORT ?? 4196}`;
const T0 = new Date('2026-11-10T02:00:00.000Z');
const RESULTS = path.join(root, 'results');
fs.mkdirSync(RESULTS, { recursive: true });
const only = args.only ? new RegExp(args.only) : null;
const WORKERS = Number(args.workers ?? 6);
const WEBP = { quality: 82, effort: 4, smartSubsample: true };
const browser = await chromium.launch({ headless: true });
let webkitBrowser = null;

const QR = await sharp({
  create: { width: 240, height: 240, channels: 3, background: '#ffffff' }
})
  .composite([
    {
      input: Buffer.from(
        '<svg width="240" height="240" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="228" height="228" fill="none" stroke="#333" stroke-width="4" stroke-dasharray="10 8"/><text x="120" y="112" font-family="Arial" font-size="28" text-anchor="middle" fill="#333">SAMPLE QR</text><text x="120" y="146" font-family="Arial" font-size="16" text-anchor="middle" fill="#666">not a real account</text></svg>'
      )
    }
  ])
  .png()
  .toBuffer();

async function openContext(spec, vp, engine = browser) {
  const motion = spec.motion ?? 'no-preference';
  const c = await engine.newContext({
    viewport: { width: vp.w, height: vp.h },
    deviceScaleFactor: 1,
    hasTouch: vp.w < 768,
    isMobile: false,
    timezoneId: 'Asia/Manila',
    locale: 'en-PH',
    reducedMotion: motion,
    serviceWorkers: 'block'
  });
  if (spec.config?.session !== false)
    await c.addCookies([{ name: 'sb-synthetic-auth-token', value: 'fake', url: BASE }]);
  const p = await c.newPage();
  p.setDefaultTimeout(7000);
  await p.clock.setFixedTime(T0);
  await p.addInitScript(pageHelpers);
  await p.addInitScript(auditHelpers);
  await p.addInitScript((cfg) => {
    window.__captureConfig = cfg;
  }, spec.config ?? {});
  if (spec.seed) await p.addInitScript(spec.seed.fn, spec.seed.arg);
  const log = { pageErrors: [], consoleErrors: [], failedRequests: [], external: [] };
  p.on('pageerror', (e) => log.pageErrors.push(e.message.slice(0, 300)));
  p.on('console', (m) => {
    if (m.type() === 'error') log.consoleErrors.push(m.text().slice(0, 300));
  });
  p.on('requestfailed', (r) => log.failedRequests.push(r.url().slice(0, 160)));
  p.on('dialog', (d) => {
    log.dialog = d.message().slice(0, 200);
    d.accept().catch(() => {});
  });
  await p.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.hostname === '127.0.0.1') return r.continue();
    log.external.push(u.hostname);
    if (u.hostname === 'synthetic-audit.invalid')
      return r.fulfill({ status: 200, contentType: 'image/png', body: QR });
    return r.abort();
  });
  if (spec.transparency) {
    const cdp = await c.newCDPSession(p);
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }]
    });
  }
  return { c, p, log };
}

async function clickLabel(p, target, idx = 0) {
  const re = target instanceof RegExp ? target : null;
  const point = await p.evaluate(
    ([src, flags, text, i]) => {
      const matcher = src ? new RegExp(src, flags) : null;
      const ctls = window.__capControls();
      const hit = ctls.filter((c) => (matcher ? matcher.test(c.label) : c.label === text));
      const pick = hit[i] ?? (matcher ? null : ctls.filter((c) => c.label.startsWith(text))[i]);
      return pick ? window.__capClick(pick.label, pick.idx) : null;
    },
    [re?.source ?? null, re?.flags ?? '', re ? null : String(target), idx]
  );
  if (!point) throw new Error('No control: ' + String(target));
  await p.mouse.click(point.x, point.y);
}

async function settle(p) {
  await p
    .evaluate(
      () =>
        new Promise((resolve) => {
          const sig = () =>
            `${window.__capture?.calls?.length ?? 0}:${document.body.innerText.length}:${location.pathname}`;
          let last = sig();
          let same = 0;
          let n = 0;
          const t = setInterval(() => {
            const now = sig();
            same = now === last ? same + 1 : 0;
            last = now;
            if (same >= 3 || ++n > 25) {
              clearInterval(t);
              resolve();
            }
          }, 100);
        })
    )
    .catch(() => {});
}

async function runStep(p, c, step, ctx) {
  await runStepInner(p, c, step, ctx);
  if (!step || !step.shot) await settle(p);
}

async function runStepInner(p, c, step, ctx) {
  if (typeof step === 'string' || step instanceof RegExp) {
    await clickLabel(p, step);
    await p.waitForTimeout(ctx.stepWait ?? 350);
    return;
  }
  if (step.clock) {
    await p.clock.setFixedTime(new Date(step.clock));
    return;
  }
  if (step.goto) {
    await p.goto(BASE + step.goto, { waitUntil: 'load' });
    await p.waitForTimeout(step.wait ?? 1500);
    return;
  }
  if (step.click) {
    await clickLabel(p, step.click, step.idx ?? 0);
    await p.waitForTimeout(step.wait ?? 450);
  } else if (step.text) {
    await p
      .getByText(step.text, { exact: step.exact ?? false })
      .nth(step.idx ?? 0)
      .click();
    await p.waitForTimeout(step.wait ?? 450);
  } else if (step.fill !== undefined) {
    await p
      .getByLabel(step.fill, { exact: step.exact ?? false })
      .nth(step.idx ?? 0)
      .fill(String(step.value));
    await p.waitForTimeout(80);
  } else if (step.fillRole) {
    await p
      .getByRole(step.fillRole, { name: step.name, exact: step.exact ?? false })
      .nth(step.idx ?? 0)
      .fill(String(step.value));
    await p.waitForTimeout(80);
  } else if (step.select) {
    await p
      .getByLabel(step.select, { exact: step.exact ?? false })
      .nth(step.idx ?? 0)
      .selectOption(step.value);
    await p.waitForTimeout(120);
  } else if (step.check) {
    await p
      .getByLabel(step.check, { exact: step.exact ?? false })
      .nth(step.idx ?? 0)
      .check();
    await p.waitForTimeout(150);
  } else if (step.fillAll) {
    await p.evaluate(() => window.__capFill());
    await p.waitForTimeout(150);
  } else if (step.wait) {
    await p.waitForTimeout(step.wait);
  } else if (step.waitText) {
    await p
      .getByText(step.waitText, { exact: false })
      .first()
      .waitFor({ timeout: step.timeout ?? 6000 });
  } else if (step.fail) {
    await p.evaluate((f) => Object.assign(window.__capture.fail, f), step.fail);
  } else if (step.clearFail) {
    await p.evaluate(() => {
      window.__capture.fail = {};
    });
  } else if (step.offline !== undefined) {
    await c.setOffline(!!step.offline);
    await p.evaluate(
      (off) => window.dispatchEvent(new Event(off ? 'offline' : 'online')),
      step.offline
    );
    await p.waitForTimeout(400);
  } else if (step.key) {
    for (let i = 0; i < (step.times ?? 1); i++) await p.keyboard.press(step.key);
    await p.waitForTimeout(150);
  } else if (step.hover) {
    const pt = await p.evaluate((l) => {
      const hit = window.__capControls().find((x) => x.label.startsWith(l));
      return hit ? window.__capClick(hit.label, hit.idx) : null;
    }, step.hover);
    if (!pt) throw new Error('No control to hover: ' + step.hover);
    await p.mouse.move(pt.x, pt.y);
    await p.waitForTimeout(220);
  } else if (step.press) {
    const pt = await p.evaluate((l) => {
      const hit = window.__capControls().find((x) => x.label.startsWith(l));
      return hit ? window.__capClick(hit.label, hit.idx) : null;
    }, step.press);
    if (!pt) throw new Error('No control to press: ' + step.press);
    await p.mouse.move(pt.x, pt.y);
    await p.mouse.down();
    await p.waitForTimeout(180);
    ctx.mouseDown = true;
  } else if (step.reload) {
    await p.reload({ waitUntil: 'load' });
    await p.waitForTimeout(1200);
  } else if (step.scroll) {
    await p.evaluate(
      (s) => window.scrollTo(0, s === 'bottom' ? document.documentElement.scrollHeight : Number(s)),
      step.scroll
    );
    await p.waitForTimeout(150);
  } else if (step.inject) {
    await p.evaluate(step.inject, step.arg);
    await p.waitForTimeout(step.wait ?? 400);
  } else if (step.setState) {
    await p.evaluate((s) => new Promise((r) => window.__hcOps.setState(s, r)), step.setState);
    await p.waitForTimeout(300);
  } else if (step.tryClick) {
    await clickLabel(p, step.tryClick, step.idx ?? 0).catch(() => {});
    await p.waitForTimeout(step.wait ?? 450);
  } else if (!step.shot) {
    throw new Error('Unknown step ' + JSON.stringify(step));
  }
}

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
async function saveShot(buf, rel) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const webp = await sharp(buf).webp(WEBP).toBuffer();
  fs.writeFileSync(file, webp);
  return { path: rel.replace(/\\/g, '/'), bytes: webp.length, hash: sha(buf) };
}

async function snap(p, relBase, full, log, wantMeasure) {
  await p.evaluate(() => window.__capSettled()).catch(() => {});
  const audit = await p.evaluate(() => window.__capAudit());
  const shots = [];
  const vbuf = await p.screenshot({ animations: 'disabled', caret: 'hide' });
  shots.push({ kind: 'viewport', ...(await saveShot(vbuf, relBase + '.webp')) });
  const vh = await p.evaluate(() => window.innerHeight);
  if (full && audit.docHeight > vh + 8) {
    const fbuf = await p.screenshot({ animations: 'disabled', caret: 'hide', fullPage: true });
    shots.push({ kind: 'full', ...(await saveShot(fbuf, relBase + '.full.webp')) });
  }
  const measures = wantMeasure ? await p.evaluate(() => window.__capMeasure()) : null;
  const controls = wantMeasure ? await p.evaluate(() => window.__capControls()) : null;
  const inputs = wantMeasure ? await p.evaluate(() => window.__capInputs()) : null;
  const text = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 900));
  return { shots, audit, measures, controls, inputs, text, log: JSON.parse(JSON.stringify(log)) };
}

async function runScenario(sc, vpKey) {
  const vp = VIEWPORTS[vpKey];
  const id = `${sc.id}@${vpKey}`;
  const resFile = path.join(RESULTS, id.replace(/[^a-zA-Z0-9@._-]/g, '_') + '.json');
  if (!args.force && fs.existsSync(resFile)) return 'skip';
  const started = Date.now();
  const engine =
    sc.engine === 'webkit' ? (webkitBrowser ??= await webkit.launch({ headless: true })) : browser;
  const { c, p, log } = await openContext(sc, vp, engine);
  const result = {
    id: sc.id,
    viewport: vpKey,
    width: vp.w,
    height: vp.h,
    status: 'captured',
    engine: sc.engine ?? 'chromium'
  };
  try {
    await p.goto(BASE + (sc.path ?? '/'), { waitUntil: 'load' });
    await p.waitForTimeout(sc.wait ?? 1300);
    const ctx = {};
    for (const step of sc.steps ?? []) {
      if (step && step.optionalAt && !step.optionalAt.includes(vpKey)) continue;
      if (step && step.soft) {
        await runStep(p, c, step, ctx).catch(() => {});
        continue;
      }
      await runStep(p, c, step, ctx);
    }
    if (
      sc.expect &&
      !(await p
        .getByText(sc.expect, { exact: false })
        .first()
        .isVisible()
        .catch(() => false))
    ) {
      result.status = 'failed';
      result.reason = 'Expected text not visible: ' + sc.expect;
    }
    const relBase = path.join('screenshots', sc.section, sc.view, sc.state, vpKey);
    const out = await snap(p, relBase, sc.full !== false, log, sc.measure !== false);
    Object.assign(result, out);
    if (ctx.mouseDown) await p.mouse.up();
    result.writes = await p.evaluate(() => window.__capture?.writes?.map((w) => w.name) ?? []);
    result.unhandled = await p.evaluate(() => window.__capture?.unhandled ?? []);
    if (sc.crop) {
      const el = p.locator(sc.crop).first();
      if (await el.count()) {
        const buf = await el.screenshot({ animations: 'disabled', caret: 'hide' });
        result.shots.push({ kind: 'crop', ...(await saveShot(buf, relBase + '.crop.webp')) });
      }
    }
  } catch (e) {
    result.status = 'failed';
    result.reason = e.message.split('\n')[0].slice(0, 240);
    result.log = log;
    const relBase = path.join('screenshots', sc.section, sc.view, sc.state, vpKey + '.failed');
    if (args.debugshots) {
      const buf = await p.screenshot().catch(() => null);
      if (buf) await saveShot(buf, relBase + '.webp');
    }
  } finally {
    result.ms = Date.now() - started;
    await c.close();
  }
  fs.writeFileSync(resFile, JSON.stringify(result));
  return result.status;
}

async function runFlow(flow, vpKey) {
  const vp = VIEWPORTS[vpKey];
  const id = `flow-${flow.id}@${vpKey}`;
  const resFile = path.join(RESULTS, id + '.json');
  if (!args.force && fs.existsSync(resFile)) return 'skip';
  const { c, p, log } = await openContext(flow, vp);
  const result = {
    flow: flow.id,
    viewport: vpKey,
    width: vp.w,
    height: vp.h,
    status: 'captured',
    steps: []
  };
  try {
    await p.goto(BASE + (flow.path ?? '/'), { waitUntil: 'load' });
    await p.waitForTimeout(flow.wait ?? 1300);
    const ctx = {};
    let n = 0;
    for (const step of flow.steps) {
      if (step && step.only && !step.only.includes(vpKey)) continue;
      if (step && step.shot) {
        n += 1;
        const rel = path.join(
          'flows',
          flow.id,
          `${String(n).padStart(2, '0')}-${step.shot}`,
          vpKey
        );
        const out = await snap(p, rel, step.full !== false, log, false);
        const facts = await p.evaluate(() => ({
          url: location.pathname + location.search,
          screen: window.__hcOps?.state?.screen ?? null,
          h1: document.querySelector('h1')?.innerText?.trim().slice(0, 70) ?? null,
          alerts: [...document.querySelectorAll('[role=alert],[role=status]')]
            .map((e) => e.innerText.trim().slice(0, 120))
            .filter(Boolean)
            .slice(0, 3),
          writes: window.__capture?.writes?.map((w) => w.name) ?? []
        }));
        result.steps.push({
          n,
          name: step.shot,
          note: step.note ?? '',
          ...facts,
          shots: out.shots,
          audit: {
            overflowX: out.audit.overflowX,
            offenders: out.audit.offenders.length,
            covered: out.audit.covered.length
          }
        });
        continue;
      }
      try {
        await runStep(p, c, step, ctx);
      } catch (e) {
        if (step && step.soft) {
          result.steps.push({
            note: 'Optional step not available: ' + JSON.stringify(step).slice(0, 100)
          });
          continue;
        }
        throw e;
      }
    }
  } catch (e) {
    result.status = 'partial';
    result.reason = e.message.split('\n')[0].slice(0, 240);
    const rel = path.join('flows', flow.id, `stopped-here`, vpKey);
    const buf = await p.screenshot({ animations: 'disabled' }).catch(() => null);
    if (buf) result.stoppedAt = await saveShot(buf, rel + '.webp');
  } finally {
    result.log = log;
    result.writes = await p
      .evaluate(() => window.__capture?.writes?.map((w) => w.name) ?? [])
      .catch(() => []);
    await c.close();
  }
  fs.writeFileSync(resFile, JSON.stringify(result));
  return result.status;
}

const jobs = [];
const kind = args.kind ?? 'all';
if (kind !== 'flows')
  for (const sc of SCENARIOS)
    for (const vp of sc.viewports)
      if (!only || only.test(`${sc.id}@${vp}`))
        jobs.push(() => runScenario(sc, vp).then((s) => [`${sc.id}@${vp}`, s]));
if (kind !== 'scenarios')
  for (const fl of FLOWS)
    for (const vp of fl.viewports)
      if (!only || only.test(`flow-${fl.id}@${vp}`))
        jobs.push(() => runFlow(fl, vp).then((s) => [`flow-${fl.id}@${vp}`, s]));

console.log('jobs', jobs.length);
let done = 0;
const tally = {};
await Promise.all(
  Array.from({ length: WORKERS }, async () => {
    while (jobs.length) {
      const job = jobs.shift();
      const [id, status] = await job().catch((e) => ['?', 'crash:' + e.message.slice(0, 200)]);
      tally[status] = (tally[status] ?? 0) + 1;
      done++;
      if (status !== 'skip') console.log(`${done} ${status} ${id}`);
    }
  })
);
await browser.close();
if (webkitBrowser) await webkitBrowser.close();
console.log('CAPTURE DONE', JSON.stringify(tally));
