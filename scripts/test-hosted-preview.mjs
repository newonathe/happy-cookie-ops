// Checks a deployed static preview (Workers static assets + direct Supabase) from the outside.
// Usage: node scripts/test-hosted-preview.mjs <https://preview-url>
// Reads NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (the public values the
// bundle already carries). Uses no secret, creates no account and signs nobody in, so every
// check here is what an anonymous visitor can see.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { analyzeHtml, supabaseConnectOrigin } from './pages-spike-headers.mjs';

const base = (process.argv[2] ?? '').replace(/\/+$/, '');
if (!/^https:\/\/[^/\s]+$/.test(base))
  throw new Error('Pass the preview origin, e.g. https://name.sub.workers.dev');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const supabaseOrigin = supabaseConnectOrigin(supabaseUrl);
if (!supabaseOrigin || !key.startsWith('sb_publishable_'))
  throw new Error('Set the preview Supabase URL and publishable key.');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'build', 'pages-spike', 'public');
const manifest = JSON.parse(
  await readFile(path.join(root, 'build', 'pages-spike', 'manifest.json'), 'utf8')
);
const csp = manifest.staticHeaders.contentSecurityPolicy;
const hashes = new Set(manifest.staticHeaders.scriptHashes);
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};
const sha = (data) => createHash('sha256').update(data).digest('base64');

// 1. Every emitted route: status, exact CSP, security headers, revalidating HTML, hashed scripts.
const directives = new Map(
  csp
    .split(';')
    .map((part) => part.trim().split(/\s+/))
    .map(([name, ...values]) => [name, values.join(' ')])
);
check(
  directives.get('connect-src') === `'self' ${supabaseOrigin}` &&
    directives.get('form-action') === "'self'",
  'manifest CSP connect-src/form-action is not exactly self plus the preview Supabase origin'
);
let routes = 0;
for (const page of manifest.emittedPages) {
  const route = page.html === 'index.html' ? '/' : `/${page.html.slice(0, -'.html'.length)}`;
  const response = await fetch(base + route, { redirect: 'manual' });
  const body = await response.text();
  const h = response.headers;
  check(response.status === 200, `${route}: status ${response.status}`);
  check(h.get('content-security-policy') === csp, `${route}: served CSP differs from the manifest`);
  check(
    h.get('cache-control') === 'public, max-age=0, must-revalidate',
    `${route}: cache-control ${h.get('cache-control')}`
  );
  check(
    h.get('x-content-type-options') === 'nosniff' &&
      h.get('x-frame-options') === 'DENY' &&
      Boolean(h.get('referrer-policy')) &&
      Boolean(h.get('permissions-policy')),
    `${route}: security headers missing`
  );
  const scripts = analyzeHtml(body, page.html);
  check(
    scripts.length > 0 && scripts.every((script) => hashes.has(`'sha256-${sha(script)}'`)),
    `${route}: inline script not covered by CSP hashes`
  );
  routes++;
}

// 2. Immutable caching on fingerprinted assets only, and a real 404.
const shopHtml = await (await fetch(`${base}/shop`)).text();
const asset = shopHtml.match(/\/_next\/static\/chunks\/[^"']+\.js/)?.[0];
const assetResponse = asset ? await fetch(base + asset) : null;
check(
  assetResponse?.status === 200 &&
    assetResponse.headers.get('cache-control') === 'public, max-age=31536000, immutable',
  'fingerprinted asset is not immutable'
);
check(
  (await fetch(`${base}/definitely-not-a-route-${Date.now()}`)).status === 404,
  'unknown route is not 404'
);

// 3. The served payment QR images are the local placeholders, not a real payment code.
for (const name of ['qr-gcash.png', 'qr-maya.png', 'qr-gotyme.png']) {
  const served = Buffer.from(await (await fetch(`${base}/assets/${name}`)).arrayBuffer());
  const local = await readFile(path.join(output, 'assets', name));
  // A rebuild copies the real QR back into the build output, so matching the build alone
  // proves nothing: the served image must also differ from the real one in public/.
  const real = await readFile(path.join(root, 'public', 'assets', name));
  check(sha(served) !== sha(real), `${name}: the REAL payment QR is being served`);
  check(
    sha(served) === sha(local),
    `${name}: served image differs from the placeholder in the build`
  );
}

// 4. Anonymous Supabase access with the public key: private tables show nothing.
const rest = (p, init = {}) =>
  fetch(`${supabaseOrigin}/rest/v1/${p}`, {
    ...init,
    headers: { apikey: key, 'Content-Type': 'application/json', ...(init.headers ?? {}) }
  });
const privateTables = [
  'audit_log',
  'bake_batches',
  'drops',
  'erasure_requests',
  'event_sale_items',
  'event_sales',
  'events',
  'inventory_items',
  'ledger_entries',
  'order_items',
  'orders',
  'products',
  'profiles',
  'rate_limits',
  'recipe_ingredients',
  'recipes',
  'settings',
  'supplier_prices',
  'suppliers'
];
const anonRows = {};
for (const table of privateTables) {
  const response = await rest(`${table}?select=*&limit=5`);
  const data = await response.json().catch(() => null);
  anonRows[table] = response.ok
    ? Array.isArray(data)
      ? data.length
      : 'non-array'
    : `denied ${response.status}`;
  check(
    !response.ok || (Array.isArray(data) && data.length === 0),
    `anon can read rows from ${table}`
  );
}
for (const view of ['shop_products', 'shop_drops']) {
  const response = await rest(`${view}?select=*`);
  check(response.ok, `anon cannot read public view ${view} (${response.status})`);
}
const insert = await rest('products', {
  method: 'POST',
  body: JSON.stringify({ id: 'x', name: 'x', short_name: 'x', price_cents: 1, kind: 'x' })
});
check(!insert.ok, 'anon could insert into products');
const serviceOnly = {
  lookup_order: { p_order_id: 'HC-1', p_phone: '0' },
  consume_rate_limit: { p_key: 'k', p_limit: 1, p_window_s: 60 },
  settings_effective: {},
  bff_session_read: { p_session_hash: '0'.repeat(64) },
  prune_personal_data: {}
};
const rpcStatus = {};
for (const [fn, args] of Object.entries(serviceOnly)) {
  const response = await rest(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
  rpcStatus[fn] = response.status;
  check(!response.ok, `anon can execute service-only function ${fn}`);
}
const isOwner = await rest('rpc/is_owner', { method: 'POST', body: '{}' });
check(isOwner.ok && (await isOwner.json()) === false, 'is_owner() is not false for anon');

// 5. Browser: /shop hydrates with no CSP violation or JS error; connect-src allows Supabase and blocks others.
const browser = await chromium.launch({ headless: true });
let browserState;
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (event) =>
      window.__csp.push(event.violatedDirective + ' ' + event.blockedURI)
    );
  });
  await page.goto(`${base}/shop`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-screen-label="Customer shop"]', { timeout: 15000 });
  const beforeProbe = await page.evaluate(() => window.__csp.slice());
  const probe = await page.evaluate(
    async ({ origin, apikey }) => {
      const allowed = await fetch(`${origin}/auth/v1/health`, { headers: { apikey } }).then(
        (r) => r.status,
        (e) => String(e)
      );
      const blocked = await fetch('https://example.com/', { mode: 'no-cors' }).then(
        () => 'fetched',
        () => 'blocked'
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
      return { allowed, blocked, violations: window.__csp.slice() };
    },
    { origin: supabaseOrigin, apikey: key }
  );
  browserState = { hydrated: true, cspViolationsOnLoad: beforeProbe, jsErrors: errors, ...probe };
  check(beforeProbe.length === 0, `CSP violations on /shop load: ${beforeProbe.join('; ')}`);
  check(errors.length === 0, `JS errors on /shop: ${errors.join('; ')}`);
  check(probe.allowed === 200, `connect-src did not allow the Supabase origin (${probe.allowed})`);
  check(
    probe.blocked === 'blocked' && probe.violations.some((v) => v.startsWith('connect-src')),
    'connect-src did not block an unrelated origin'
  );

  // No review harness, and the app fills the screen at phone, tablet and desktop widths.
  browserState.viewports = {};
  for (const width of [390, 834, 1280]) {
    const sized = await browser.newPage({ viewport: { width, height: 800 } });
    await sized.goto(`${base}/shop`, { waitUntil: 'networkidle' });
    await sized.waitForSelector('[data-screen-label="Customer shop"]', { timeout: 15000 });
    await sized.waitForTimeout(300);
    const layout = await sized.evaluate(() => ({
      harnessText: /Interactive prototype|Free roam|mock data|Back to ops|Preview · customer view/.test(document.body.innerText),
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth
    }));
    browserState.viewports[width] = layout;
    check(!layout.harnessText, `${width}px: review-harness text is visible`);
    check(layout.scrollWidth <= layout.innerWidth, `${width}px: page scrolls sideways`);
    await sized.close();
  }
} finally {
  await browser.close();
}

// 6. Auth settings visible to anyone (informational: self-signup must be switched off by Ethan).
const auth = await (
  await fetch(`${supabaseOrigin}/auth/v1/settings`, { headers: { apikey: key } })
).json();

const report = {
  status: failures.length ? 'FAIL' : 'PASS',
  base,
  routes,
  anonRows,
  rpcStatus,
  browser: browserState,
  auth: { disable_signup: auth.disable_signup, mailer_autoconfirm: auth.mailer_autoconfirm },
  failures
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exit(1);
