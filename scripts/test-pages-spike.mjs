import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { analyzeHtml } from './pages-spike-headers.mjs';

const root = await realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const output = path.join(root, 'build', 'pages-spike', 'public');
const config = path.join(root, 'spikes', 'pages', 'wrangler.jsonc');
const wrangler = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    if (!address || typeof address === 'string') return reject(new Error('Could not reserve a local port.'));
    server.close((error) => error ? reject(error) : resolve(address.port));
  });
});

await mkdir(path.join(root, 'build', 'pages-spike'), { recursive: true });
for (const target of [path.join(root, 'build'), path.join(root, 'build', 'pages-spike')]) {
  if ((await lstat(target)).isSymbolicLink() || await realpath(target) !== target) throw new Error('Artifact directories must not be links.');
}
const state = path.join(root, 'build', 'pages-spike', 'wrangler-state');
if ((await readdir(path.dirname(config))).some((name) => name.startsWith('.dev.vars') || name.startsWith('.env'))) {
  throw new Error('Local fixture directory must contain no environment files.');
}
const allowedEnv = ['APPDATA', 'COMSPEC', 'LOCALAPPDATA', 'PATH', 'PATHEXT', 'SYSTEMROOT', 'TEMP', 'TMP', 'USERPROFILE', 'WINDIR'];
const localEnv = Object.fromEntries(allowedEnv.flatMap((key) => process.env[key] === undefined ? [] : [[key, process.env[key]]]));
const child = spawn(process.execPath, [wrangler, 'pages', 'dev', output, '--ip', '127.0.0.1', '--port', String(port), '--persist-to', state, '--log-level', 'error'], {
  cwd: path.dirname(config), stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...localEnv, CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false', CI: '1', NO_PROXY: '127.0.0.1,localhost', WRANGLER_SEND_METRICS: 'false' }
});
let logs = '';
let spawnError;
child.on('error', (error) => { spawnError = error; });
child.stdout.on('data', (chunk) => { logs += chunk; });
child.stderr.on('data', (chunk) => { logs += chunk; });

async function request(pathname, options) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { ...options, signal: AbortSignal.timeout(5000) });
  return { status: response.status, headers: Object.fromEntries(['allow', 'cache-control', 'content-security-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'permissions-policy'].map((name) => [name, response.headers.get(name)])), body: await response.text() };
}

async function ready() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (spawnError || child.exitCode !== null) throw new Error(`Emulator exited early: ${spawnError?.message ?? logs.slice(-500)}`);
    try { const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`, { signal: AbortSignal.timeout(1000) }); if (response.status === 200) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Wrangler Pages emulator did not become ready. ${logs.slice(-500)}`);
}

function assert(condition, message) { if (!condition) throw new Error(message); }

let browser;
try {
  await ready();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const browserErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`); });
  page.on('pageerror', (error) => browserErrors.push(`page: ${error.message}`));
  await page.addInitScript(() => {
    window.__pagesCspViolations = [];
    window.addEventListener('securitypolicyviolation', (event) => {
      window.__pagesCspViolations.push(`${event.violatedDirective}: ${event.blockedURI}`);
    });
  });
  const browserResponse = await page.goto(`http://127.0.0.1:${port}/shop`, { waitUntil: 'networkidle', timeout: 15_000 });
  assert(browserResponse?.status() === 200, `Headless Playwright failed to load /shop: ${browserResponse?.status()}.`);
  await page.waitForSelector('[data-screen-label="Customer shop"]', { timeout: 10_000 });
  const browserState = await page.evaluate(() => ({
    title: document.title,
    hydratedScreen: document.querySelector('[data-screen-label="Customer shop"]') !== null,
    visibleText: document.body?.innerText?.trim() ?? '',
    cspViolations: window.__pagesCspViolations,
    loadedScripts: [...document.scripts].filter((script) => script.src).length
  }));
  assert(browserState.hydratedScreen && browserState.visibleText.length > 0 && browserState.loadedScripts > 0,
    'Headless browser did not hydrate the Customer shop screen and load its scripts.');
  assert(browserState.cspViolations.length === 0 && browserErrors.length === 0,
    `Headless browser reported CSP or JavaScript errors: ${JSON.stringify({ cspViolations: browserState.cspViolations, browserErrors })}.`);
  const health = await request('/api/v1/health');
  assert(health.status === 200 && health.body.includes('not-checked') && health.body.includes('"readiness":false'), 'GET health was not liveness-only.');
  const head = await request('/api/v1/health', { method: 'HEAD' });
  assert(head.status === 200 && head.body === '', 'HEAD health did not return an empty liveness response.');
  const method = await request('/api/v1/health', { method: 'POST' });
  assert(method.status === 405 && method.headers.allow === 'GET, HEAD', 'POST health did not reject with 405 and Allow.');
  const sync = await request('/api/sync', { method: 'POST', body: '{"clientId":"must-not-be-acknowledged"}' });
  assert(sync.status === 503 && !sync.body.includes('must-not-be-acknowledged'), 'POST sync was not safely unavailable.');
  const session = await request('/api/v1/session', { headers: { 'x-hc-request': '1' } });
  assert(session.status === 503 && session.body.includes('dependency_unavailable'), 'Unconfigured session route did not fail closed.');
  const shop = await request('/shop');
  assert(shop.status === 200 && shop.headers['cache-control'] === 'public, max-age=0, must-revalidate', 'Static HTML did not revalidate by default.');
  const manifest = JSON.parse(await readFile(path.join(root, 'build', 'pages-spike', 'manifest.json'), 'utf8'));
  const headersText = await readFile(path.join(output, '_headers'), 'utf8');
  const ruleCount = headersText.split(/\r?\n/).filter((line) => line && !/^\s/.test(line) && !line.startsWith('#')).length;
  assert(ruleCount <= 100 && headersText.split(/\r?\n/).every((line) => line.length <= 2000), 'Generated Pages _headers violates Cloudflare rule or line limits.');
  assert((headersText.match(/^\s*Cache-Control:/gmi) ?? []).length === 2 &&
    (headersText.match(/^\s*! Cache-Control$/gmi) ?? []).length === 1, 'Cache rules do not detach the broad default before setting the immutable override.');
  const csp = shop.headers['content-security-policy'];
  assert(csp && csp === manifest.staticHeaders.contentSecurityPolicy && csp.includes("style-src 'self' 'unsafe-inline'") &&
    !csp.includes("script-src 'self' 'unsafe-inline'") && csp.length + 'Content-Security-Policy: '.length <= 2000, 'Served CSP is missing, stale, oversized or permits inline scripts.');
  // Exact directive values, not substrings: includes("connect-src 'self'") would also pass 'self' *.
  const directives = new Map(csp.split(';').map((part) => part.trim().split(/\s+/)).map(([name, ...values]) => [name, values.join(' ')]));
  const supabaseOrigin = manifest.staticHeaders.supabaseOrigin;
  assert((supabaseOrigin === null || /^https?:\/\/[^/\s;*]+$/.test(supabaseOrigin)) && directives.get('form-action') === "'self'" &&
    directives.get('connect-src') === (supabaseOrigin ? `'self' ${supabaseOrigin}` : "'self'"), 'Served CSP form-action/connect-src is not exactly self plus the configured Supabase origin.');
  const servedHashes = new Set([...csp.matchAll(/'sha256-([^']+)'/g)].map((match) => match[1]));
  let actualInlineScripts = 0;
  async function htmlFiles(directory, prefix = '') {
    const files = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) files.push(...await htmlFiles(path.join(directory, entry.name), relative));
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) files.push(relative);
    }
    return files;
  }
  const allHtmlFiles = await htmlFiles(output);
  assert(manifest.emittedPages.every((page) => allHtmlFiles.includes(page.html)), 'An application page is absent from the built static HTML inventory.');
  for (const relative of allHtmlFiles) {
    const html = relative === 'shop.html' ? shop.body : await readFile(path.join(output, relative), 'utf8');
    const inlineScripts = analyzeHtml(html, relative);
    actualInlineScripts += inlineScripts.length;
    assert(inlineScripts.length > 0 && inlineScripts.every((script) => {
      const hash = awaitHash(script);
      return servedHashes.has(hash);
    }), `Generated CSP hashes do not cover the actual inline scripts in ${relative}.`);
  }
  assert(manifest.staticHeaders.htmlFiles === allHtmlFiles.length &&
    manifest.staticHeaders.inlineScripts === actualInlineScripts && manifest.staticHeaders.htmlFiles > 0 &&
    manifest.staticHeaders.staticFiles > 0 && manifest.staticHeaders.scriptHashes.length > 0, 'Manifest indicates a stale or incomplete static-header artifact.');
  const staticRoot = path.join(output, '_next', 'static');
  async function firstFile(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isFile()) return path.join(directory, entry.name);
      if (entry.isDirectory()) { const found = await firstFile(path.join(directory, entry.name)); if (found) return found; }
    }
  }
  const staticFile = await firstFile(staticRoot);
  assert(staticFile, 'No Next static file available for cache-policy verification.');
  const staticUrl = `/${path.relative(output, staticFile).split(path.sep).join('/')}`;
  const asset = await request(staticUrl);
  assert(asset.status === 200 && asset.headers['cache-control'] === 'public, max-age=31536000, immutable', 'Fingerprint-versioned Next static asset did not receive immutable caching.');
  const defaultAssetPath = (await readdir(path.join(output, 'assets'))).find((name) => name.endsWith('.png'));
  assert(defaultAssetPath, 'No non-fingerprinted static asset available for default cache-policy verification.');
  const defaultAsset = await request(`/assets/${defaultAssetPath}`);
  assert(defaultAsset.status === 200 && defaultAsset.headers['cache-control'] === 'public, max-age=0, must-revalidate', 'Non-fingerprinted static asset did not use safe revalidation.');
  const missing = await request('/not-a-real-route');
  assert(missing.status === 404 && missing.headers['x-content-type-options'] === 'nosniff', 'Unknown static route did not retain a protected 404.');
  for (const response of [health, head, method, sync, session]) {
    assert(response.headers['cache-control'] === 'no-store' && response.headers['x-content-type-options'] === 'nosniff' &&
      response.headers['x-frame-options'] === 'DENY' &&
      response.headers['referrer-policy'] === (response === session ? 'no-referrer' : 'strict-origin-when-cross-origin') &&
      response.headers['permissions-policy'] === 'camera=(), microphone=(), geolocation=()', 'Security headers missing on a served response.');
  }
  for (const response of [shop, asset, defaultAsset, missing]) {
    assert(response.headers['x-content-type-options'] === 'nosniff' && response.headers['x-frame-options'] === 'DENY' &&
      response.headers['referrer-policy'] === 'strict-origin-when-cross-origin' &&
      response.headers['permissions-policy'] === 'camera=(), microphone=(), geolocation=()',
    `Static security headers missing on a served response: ${JSON.stringify(response.headers)}.`);
  }
  const result = { status: 'passed', port, checks: { health: health.status, head: head.status, method: method.status, sync: sync.status, session: session.status, shop: shop.status, asset: asset.status, defaultAsset: defaultAsset.status, unknown: missing.status, cspHashes: manifest.staticHeaders.scriptHashes.length,
    playwright: { page: '/shop', status: browserResponse.status(), hydratedCustomerShop: browserState.hydratedScreen,
      scripts: browserState.loadedScripts, cspViolations: browserState.cspViolations.length, javascriptErrors: browserErrors.length } } };
  await mkdir(path.join(root, 'build', 'pages-spike'), { recursive: true });
  await writeFile(path.join(root, 'build', 'pages-spike', 'emulator-test.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser?.close();
  if (child.exitCode === null && !child.killed && child.pid) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', timeout: 5000 });
    } else child.kill('SIGTERM');
  }
  if (child.exitCode === null && !spawnError) await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.stdout.destroy(); child.stderr.destroy(); child.unref(); reject(new Error('Emulator termination exceeded 5 seconds.')); }, 5000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
}

function awaitHash(script) {
  return createHash('sha256').update(script, 'utf8').digest('base64');
}
