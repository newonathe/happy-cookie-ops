// Audit harness only. Does not modify product source or visual baselines.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const scratch = fs.readFileSync(path.join(__dirname, 'scratch-location.txt'), 'utf8').trim();
const { chromium, webkit } = createRequire(path.join(scratch, 'package.json'))('@playwright/test');
const routes = ['/', '/sales', '/orders', '/order', '/lookup', '/reconcile', '/bake', '/batch', '/inventory', '/stocktake', '/more', '/grocery', '/bazaar', '/pnl', '/formqueue', '/health', '/products', '/notifications', '/shop', '/checkout', '/status', '/recipes', '/drops', '/suppliers', '/settings', '/sign-in'];
const driven = process.argv.includes('--drive-engine');
const profiles = [
  { name: 'chromium-phone', browser: chromium, viewport: { width: 390, height: 844 } },
  { name: 'chromium-tablet', browser: chromium, viewport: { width: 834, height: 1112 } },
  { name: 'chromium-desktop', browser: chromium, viewport: { width: 1440, height: 900 } },
  { name: 'webkit-phone', browser: webkit, viewport: { width: 390, height: 844 } }
];
(async () => {
  const results = [];
  for (const profile of profiles) {
    let browser;
    try { browser = await profile.browser.launch({ headless: true }); }
    catch (error) { results.push({ profile: profile.name, launchError: String(error) }); continue; }
    const context = await browser.newContext({ viewport: profile.viewport, timezoneId: 'Asia/Manila', reducedMotion: 'reduce', serviceWorkers: 'block' });
    const dir = path.join(__dirname, driven ? 'ui-driven' : 'ui', profile.name); fs.mkdirSync(dir, { recursive: true });
    for (const [index, route] of routes.entries()) {
      const page = await context.newPage(); const errors = []; const failedRequests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
      const result = { profile: profile.name, route, errors, failedRequests };
      try {
        const response = await page.goto('http://localhost:3137' + route, { waitUntil: 'domcontentloaded', timeout: 120000 });
        result.status = response?.status();
        await page.locator('body').waitFor();
        await page.waitForTimeout(1000);
        if (route !== '/sign-in') await page.waitForFunction(() => Boolean(window.__hcOps), undefined, { timeout: 45000 });
        if (driven && route !== '/sign-in') {
          await page.waitForFunction(() => Boolean(window.__hcOps));
          await page.evaluate(({ route, profile }) => {
            const engine = window.__hcOps;
            engine.setState({ device: profile.includes('desktop') ? 'desktop' : profile.includes('tablet') ? 'tablet' : 'mobile', now: new Date('2026-03-04T09:30:00+08:00').getTime() });
            engine.go(route === '/' ? 'today' : route.slice(1));
          }, { route, profile: profile.name });
          await page.waitForTimeout(300);
        }
        await page.evaluate(() => document.fonts.ready);
        result.dom = await page.evaluate(() => ({ title: document.title, url: location.pathname, text: document.body.innerText, width: innerWidth, scrollWidth: document.documentElement.scrollWidth, brokenImages: [...document.images].filter(i => !i.complete || i.naturalWidth === 0).map(i => i.getAttribute('src')), inputs: [...document.querySelectorAll('input')].map(i => ({ type: i.type, placeholder: i.placeholder, label: i.getAttribute('aria-label') })) }));
        result.screenshot = path.relative(__dirname, path.join(dir, `${String(index + 1).padStart(2, '0')}-${route.slice(1) || 'home'}.png`));
        await page.screenshot({ path: path.join(__dirname, result.screenshot), fullPage: true, timeout: 30000 });
      } catch (error) { result.error = String(error); }
      results.push(result);
      fs.writeFileSync(path.join(__dirname, driven ? 'ui-driven-results.json' : 'ui-results.json'), JSON.stringify(results, null, 2));
      process.stdout.write(`${profile.name} ${route} HTTP=${result.status} errors=${errors.length} overflow=${result.dom ? result.dom.scrollWidth - result.dom.width : '?'}\n`);
      await page.close();
    }
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
