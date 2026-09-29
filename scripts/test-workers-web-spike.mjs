/** Local Workerd acceptance for the Workers static-assets alternative. */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { analyzeHtml } from './pages-spike-headers.mjs';

const root = await realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const spike = path.join(root, 'spikes', 'workers-web');
const output = path.join(root, 'build', 'pages-spike', 'public');
const state = path.join(root, 'build', 'workers-web', 'state');
const wrangler = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const manifest = JSON.parse(await readFile(path.join(root, 'build', 'pages-spike', 'manifest.json'), 'utf8'));
if (manifest.selectedCurrent !== 'public' || manifest.missingPages.length ||
    manifest.emittedPages.some(page => !page.emitted) ||
    (await lstat(output)).isSymbolicLink() || await realpath(output) !== output) {
  throw new Error('Current Pages export is missing or invalid.');
}
if ((await readdir(spike)).some(name => name.startsWith('.dev.vars') || name.startsWith('.env'))) {
  throw new Error('Workers comparator must not contain local environment files.');
}
const headersText = await readFile(path.join(output, '_headers'), 'utf8');
if (!headersText.includes('Content-Security-Policy:')) throw new Error('Generated CSP is missing.');

const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    if (!address || typeof address === 'string') return reject(new Error('No local port.'));
    server.close(error => error ? reject(error) : resolve(address.port));
  });
});
const allowedEnv = ['APPDATA', 'COMSPEC', 'LOCALAPPDATA', 'PATH', 'PATHEXT', 'SYSTEMROOT',
  'TEMP', 'TMP', 'USERPROFILE', 'WINDIR'];
const env = Object.fromEntries(allowedEnv.flatMap(name => process.env[name] === undefined ? [] : [[name, process.env[name]]]));
const child = spawn(process.execPath, [wrangler, 'dev', '--local', '--ip', '127.0.0.1',
  '--port', String(port), '--persist-to', state, '--log-level', 'error',
  '--show-interactive-dev-session=false'], {
  cwd: spike, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...env, CI: '1', NO_PROXY: '127.0.0.1,localhost', WRANGLER_SEND_METRICS: 'false',
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false' }
});
let logs = ''; let spawnError;
child.on('error', error => { spawnError = error; });
child.stdout.on('data', chunk => { logs += chunk; });
child.stderr.on('data', chunk => { logs += chunk; });

async function request(pathname, options) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    ...options, signal: AbortSignal.timeout(5000)
  });
  return { status: response.status, headers: response.headers, body: await response.text() };
}
async function ready() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (spawnError || child.exitCode !== null) throw new Error(`Local Worker exited: ${spawnError?.message ?? logs.slice(-400)}`);
    try { if ((await request('/api/v1/health')).status === 200) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Local Worker did not become ready. ${logs.slice(-400)}`);
}
function assert(condition, reason) { if (!condition) throw new Error(reason); }

try {
  await ready();
  const health = await request('/api/v1/health');
  const head = await request('/api/v1/health', { method: 'HEAD' });
  const method = await request('/api/v1/health', { method: 'POST' });
  const sync = await request('/api/sync', { method: 'POST', body: '{"clientId":"must-not-ack"}' });
  const session = await request('/api/v1/session', { headers: { 'x-hc-request': '1' } });
  const shop = await request('/shop');
  const defaultAsset = await request('/assets/logo-full.png');
  const unknown = await request('/no-such-worker-route');
  async function firstStaticFile(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isFile()) return path.join(directory, entry.name);
      if (entry.isDirectory()) {
        const found = await firstStaticFile(path.join(directory, entry.name));
        if (found) return found;
      }
    }
  }
  const staticFile = await firstStaticFile(path.join(output, '_next', 'static'));
  assert(staticFile, 'static_asset_missing');
  const asset = await request(`/${path.relative(output, staticFile).split(path.sep).join('/')}`);
  assert(health.status === 200 && health.body.includes('"readiness":false'), 'health_liveness_invalid');
  assert(head.status === 200 && head.body === '', 'health_head_invalid');
  assert(method.status === 405 && method.headers.get('allow') === 'GET, HEAD', 'health_method_invalid');
  assert(sync.status === 503 && !sync.body.includes('must-not-ack'), 'sync_must_fail_closed');
  assert(session.status === 503 && session.body.includes('dependency_unavailable'), 'session_must_fail_closed');
  assert(shop.status === 200 &&
    shop.headers.get('content-security-policy') === manifest.staticHeaders.contentSecurityPolicy &&
    shop.headers.get('cache-control') === 'public, max-age=0, must-revalidate', 'static_policy_invalid');
  assert(asset.status === 200 &&
    asset.headers.get('cache-control') === 'public, max-age=31536000, immutable', 'static_asset_cache_invalid');
  assert(defaultAsset.status === 200 &&
    defaultAsset.headers.get('cache-control') === 'public, max-age=0, must-revalidate', 'default_asset_cache_invalid');
  assert(unknown.status === 404, 'unknown_route_invalid');
  for (const response of [health, head, method, sync, session, shop, asset, defaultAsset, unknown]) {
    assert(response.headers.get('x-content-type-options') === 'nosniff' &&
      response.headers.get('x-frame-options') === 'DENY', 'security_headers_missing');
  }
  const csp = manifest.staticHeaders.contentSecurityPolicy;
  const hashes = new Set(manifest.staticHeaders.scriptHashes);
  // Exact directive values, not substrings: includes("connect-src 'self'") would also pass 'self' *.
  const directives = new Map(csp.split(';').map((part) => part.trim().split(/\s+/)).map(([name, ...values]) => [name, values.join(' ')]));
  const supabaseOrigin = manifest.staticHeaders.supabaseOrigin;
  assert((supabaseOrigin === null || /^https?:\/\/[^/\s;*]+$/.test(supabaseOrigin)) && directives.get('form-action') === "'self'" &&
    directives.get('connect-src') === (supabaseOrigin ? `'self' ${supabaseOrigin}` : "'self'") &&
    directives.get('img-src') === (supabaseOrigin ? `'self' ${supabaseOrigin}` : "'self'"), 'csp_connect_or_form_action_invalid');
  let checkedRoutes = 0;
  for (const page of manifest.emittedPages) {
    const route = page.html === 'index.html' ? '/' : `/${page.html.slice(0, -'.html'.length)}`;
    const response = route === '/shop' ? shop : await request(route);
    assert(response.status === 200 && response.headers.get('content-security-policy') === csp &&
      response.headers.get('cache-control') === 'public, max-age=0, must-revalidate', 'route_policy_invalid');
    const scripts = analyzeHtml(response.body, page.html);
    assert(scripts.length > 0 && scripts.every(script =>
      hashes.has(`'sha256-${createHash('sha256').update(script, 'utf8').digest('base64')}'`)),
    'route_script_hash_invalid');
    checkedRoutes++;
  }
  assert(checkedRoutes === manifest.emittedPages.length && checkedRoutes >= 26, 'route_inventory_incomplete');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    let consoleErrors = 0; let pageErrors = 0;
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors++;
    });
    page.on('pageerror', () => { pageErrors++; });
    await page.addInitScript(() => {
      window.__workersCspViolations = [];
      window.addEventListener('securitypolicyviolation', event => {
        window.__workersCspViolations.push(event.violatedDirective);
      });
    });
    await page.goto(`http://127.0.0.1:${port}/shop`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-screen-label="Customer shop"]').waitFor({ state: 'visible', timeout: 10_000 });
    const violations = await page.evaluate(() => window.__workersCspViolations.length);
    assert(violations === 0 && consoleErrors === 0 && pageErrors === 0, 'browser_csp_or_hydration_error');
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify({ status: 'PASS', checks: {
    health: health.status, head: head.status, method: method.status, sync: sync.status,
    session: session.status, shop: shop.status, asset: asset.status, defaultAsset: defaultAsset.status,
    unknown: unknown.status, routes: checkedRoutes, staticCsp: true, browserHydration: true, deployed: false } }));
} finally {
  if (child.exitCode === null && child.pid) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', timeout: 5000 });
    else child.kill('SIGTERM');
  }
  if (child.exitCode === null && !spawnError) await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.stdout.destroy(); child.stderr.destroy(); child.unref(); reject(new Error('Local Worker termination timeout.')); }, 5000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
}
