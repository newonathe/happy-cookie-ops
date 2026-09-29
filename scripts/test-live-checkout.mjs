/**
 * B2 happy path against the LOCAL Supabase stack: the live static export (NEXT_PUBLIC_APP_MODE=live),
 * served the way scripts/test-pages-spike.mjs serves it, driven by headless Chromium only.
 *
 * `pnpm test:e2e` serves `pnpm start`, which is demo mode, so the live checkout never renders there;
 * this script is where the customer's order, status page, lookup and waiting list are proven end to end.
 *
 * Run `pnpm db:reset` first (the long-running dev stack may have stale grants), then, in one shell:
 *   eval "$(supabase status -o env)"   # bash; the keys stay in the environment, never in a file
 *   NEXT_PUBLIC_SUPABASE_URL=$API_URL NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$PUBLISHABLE_KEY \
 *     SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY pnpm test:live:checkout
 *
 * The service-role key seeds the world (a published flavour, an active payment method, an ordering window that is
 * open now in Asia/Manila) and reads the resulting rows back. It is used against a local address only.
 */
import { createServer } from 'node:net';
import { readFile, readdir, realpath } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const root = await realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const output = path.join(root, 'build', 'pages-spike', 'public');
const config = path.join(root, 'spikes', 'pages', 'wrangler.jsonc');
const wrangler = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !publishable || !service) {
  console.error(
    'Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY (see the header of this file).'
  );
  process.exit(2);
}
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname)) {
  console.error(
    'Refusing to run: the service-role key is used against a local Supabase address only.'
  );
  process.exit(2);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const steps = [];
async function step(name, run) {
  const started = Date.now();
  await run();
  steps.push(name);
  console.log(`  ok  ${name} (${Date.now() - started} ms)`);
}

// ---------------------------------------------------------------- build and serve
console.log('Building the live static export against the local stack…');
const build = spawnSync(process.execPath, [path.join(root, 'scripts', 'build-pages-spike.mjs')], {
  cwd: root,
  env: process.env,
  stdio: ['ignore', 'ignore', 'inherit']
});
assert(build.status === 0, 'build:pages:spike failed.');

const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    if (!address || typeof address === 'string')
      return reject(new Error('Could not reserve a local port.'));
    server.close((error) => (error ? reject(error) : resolve(address.port)));
  });
});
const base = `http://127.0.0.1:${port}`;
// The emulator gets no secrets: the browser bundle carries the publishable key, the server needs none.
const allowedEnv = [
  'APPDATA',
  'COMSPEC',
  'LOCALAPPDATA',
  'PATH',
  'PATHEXT',
  'SYSTEMROOT',
  'TEMP',
  'TMP',
  'USERPROFILE',
  'WINDIR'
];
const localEnv = Object.fromEntries(
  allowedEnv.flatMap((key) => (process.env[key] === undefined ? [] : [[key, process.env[key]]]))
);
const state = path.join(root, 'build', 'pages-spike', 'wrangler-state');
assert(
  !(await readdir(path.dirname(config))).some(
    (name) => name.startsWith('.dev.vars') || name.startsWith('.env')
  ),
  'Local fixture directory must contain no environment files.'
);
const child = spawn(
  process.execPath,
  [
    wrangler,
    'pages',
    'dev',
    output,
    '--ip',
    '127.0.0.1',
    '--port',
    String(port),
    '--persist-to',
    state,
    '--log-level',
    'error'
  ],
  {
    cwd: path.dirname(config),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...localEnv,
      CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
      CI: '1',
      NO_PROXY: '127.0.0.1,localhost',
      WRANGLER_SEND_METRICS: 'false'
    }
  }
);
let logs = '';
child.stdout.on('data', (chunk) => (logs += chunk));
child.stderr.on('data', (chunk) => (logs += chunk));
async function ready() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Emulator exited early: ${logs.slice(-500)}`);
    try {
      const response = await fetch(`${base}/api/v1/health`, { signal: AbortSignal.timeout(1000) });
      if (response.status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Wrangler Pages emulator did not become ready. ${logs.slice(-500)}`);
}

// ---------------------------------------------------------------- the world, set through the service role
const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const FLAVOUR = 'dcf';
const manilaDow = new Date(Date.now() + 8 * 3_600_000).getUTCDay();
const phone = '09' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
const PHONE_TYPED = phone.slice(0, 4) + ' ' + phone.slice(4, 7) + ' ' + phone.slice(7);

async function seedWorld() {
  const ok = (label, { error }) => assert(!error, `${label}: ${error?.message}`);
  // Open now in Asia/Manila, across midnight: opens today 00:00, closes tomorrow 23:59.
  ok(
    'settings',
    await admin.from('settings').upsert([
      { key: 'openDow', int_value: manilaDow },
      { key: 'openH', int_value: 0 },
      { key: 'openM', int_value: 0 },
      { key: 'closeDow', int_value: (manilaDow + 1) % 7 },
      { key: 'closeH', int_value: 23 },
      { key: 'closeM', int_value: 59 },
      { key: 'extendH', int_value: 0 }
    ])
  );
  ok(
    'publish flavour',
    await admin.from('products').update({ published: true, active: true }).eq('id', FLAVOUR)
  );
  ok(
    'payment method',
    await admin.from('payment_methods').upsert({
      id: 'gcash',
      label: 'GCash',
      account_number: '0999 000 0000',
      account_name: 'E2E Owner',
      qr_path: '',
      active: true,
      sort_order: 0
    })
  );
  const { data, error } = await admin
    .from('products')
    .select('short_name, name, price_cents')
    .eq('id', FLAVOUR)
    .single();
  assert(!error && data, `flavour row: ${error?.message}`);
  return data;
}

let browser;
let failure;
try {
  await ready();
  const flavour = await seedWorld();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    timezoneId: 'Asia/Manila'
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  const problems = [];
  const foreign = new Set();
  const tokenInUrl = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`page: ${error.message}`));
  page.on('request', (request) => {
    const origin = new URL(request.url()).origin;
    if (origin !== base && origin !== new URL(url).origin) foreign.add(origin);
    if (/[0-9a-f]{64}/.test(request.url())) tokenInUrl.push(request.url());
  });
  await page.addInitScript(() => {
    window.__csp = [];
    window.addEventListener('securitypolicyviolation', (event) =>
      window.__csp.push(`${event.violatedDirective}: ${event.blockedURI}`)
    );
  });

  let orderNo = '';
  let statusLink = '';
  let token = '';

  await step('the shop shows the published flavour', async () => {
    await page.goto(`${base}/shop`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-screen-label="Customer shop"]');
    await page.getByText(flavour.short_name, { exact: false }).first().waitFor();
    // An anonymous customer's engine runs on the default schedule, so off Monday to Thursday its own banner says
    // closed. The server is the authority (the window seeded above), so open the shop the way the review tool does.
    await page.evaluate(() => window.__hcOps.setState({ shopOverride: 'open' }));
  });

  await step('two cookies go to the checkout, which is the live form', async () => {
    const add = page.getByRole('button', { name: 'Add one' }).first();
    await add.click();
    await add.click();
    await page.getByRole('button', { name: /^Continue/ }).click();
    await page.getByText('Almost yours').waitFor();
    const text = await page.locator('[data-screen-label="Customer checkout"]').innerText();
    for (const gone of [
      'Email',
      'Amount you sent',
      'Payment screenshot',
      'Submit order',
      'Cine verifies'
    ])
      assert(!text.includes(gone), `The live checkout still shows "${gone}".`);
    await page
      .getByRole('button', { name: /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), / })
      .first()
      .waitFor();
  });

  let chosenLabel = '';
  await step('the form is filled and the order is placed', async () => {
    await page.locator('#lc-name').fill('Ana Test');
    await page.locator('#lc-ig').fill('@ana.test');
    await page.locator('#lc-mobile').fill(PHONE_TYPED);
    const dateButton = page
      .getByRole('button', { name: /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), / })
      .first();
    chosenLabel = (await dateButton.innerText()).trim();
    await dateButton.click();
    await page.locator('select').selectOption('10:30');
    await page.getByRole('button', { name: /GCash/ }).click();
    await page.getByRole('button', { name: 'Place order' }).click();
    await page.getByText('Order received').waitFor();
    orderNo = (await page.getByText(/^Order no\. HC-\d+/).innerText())
      .replace('Order no. ', '')
      .trim();
    statusLink = await page.locator('a[href*="/status#t="]').first().getAttribute('href');
    token = statusLink.split('#t=')[1];
    assert(/^HC-\d{4,9}$/.test(orderNo), `Unexpected order number ${orderNo}.`);
    assert(
      /^[0-9a-f]{64}$/.test(token) && !statusLink.includes('?'),
      `Status link is not a fragment token: ${statusLink}`
    );
  });

  await step('the database holds one unpaid, server-priced order for that phone', async () => {
    const { data: order, error } = await admin
      .from('orders')
      .select('*')
      .eq('id', orderNo)
      .single();
    assert(!error && order, `order row: ${error?.message}`);
    assert(
      order.state === 'Payment review' && order.pay_state === 'unpaid',
      `state ${order.state}/${order.pay_state}`
    );
    assert(order.phone === phone, `phone stored as ${order.phone}, wanted ${phone}`);
    assert(
      order.ig === '@ana.test' && order.pay_method === 'GCash' && order.pickup_window === '10:30',
      'order fields differ'
    );
    assert(
      Number(order.total_cents) === 2 * Number(flavour.price_cents),
      `total ${order.total_cents}, wanted ${2 * flavour.price_cents}`
    );
    const day = new Date(order.pickup_date + 'T00:00:00Z');
    const isoDow = day.getUTCDay() === 0 ? 7 : day.getUTCDay();
    assert([1, 4].includes(isoDow), `pickup day ${order.pickup_date} is not a Monday or Thursday`);
    assert(
      chosenLabel.startsWith(
        day.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short' })
      ),
      `date ${order.pickup_date} vs picked "${chosenLabel}"`
    );
    const { data: items } = await admin
      .from('order_items')
      .select('product_id, qty, unit_price_cents')
      .eq('order_id', orderNo);
    assert(
      items?.length === 1 &&
        items[0].product_id === FLAVOUR &&
        items[0].qty === 2 &&
        Number(items[0].unit_price_cents) === Number(flavour.price_cents),
      'order_items differ'
    );
    const { count } = await admin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('phone', phone);
    assert(count === 1, `${count} orders for the phone, wanted 1`);
  });

  await step('"See my order" shows the status page, and the link survives a reload', async () => {
    await page.getByRole('button', { name: 'See my order' }).click();
    await page.waitForSelector('[data-screen-label="Customer order status"]');
    await page.getByText(orderNo).first().waitFor();
    assert(page.url().endsWith('/status#t=' + token), `Address bar is ${page.url()}`);
    const text = await page.locator('[data-screen-label="Customer order status"]').innerText();
    assert(
      !/Invoice|payment proof|Pickup code/.test(text),
      'The status page still shows ported invoice or proof text.'
    );
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('[data-screen-label="Customer order status"]');
    await page.getByText(orderNo).first().waitFor();
    await page.getByText('Order received').first().waitFor();
  });

  await step(
    'Find my order finds it by number and phone, and a wrong phone finds nothing',
    async () => {
      await page.goto(`${base}/shop`, { waitUntil: 'networkidle' });
      await page.getByText(flavour.short_name, { exact: false }).first().waitFor();
      await page.getByRole('button', { name: /Find my order/ }).click();
      await page.locator('input[placeholder="HC-1042"]').fill(orderNo);
      await page.locator('input[placeholder="09XX XXX XXXX"]').fill('0917 000 0000');
      await page.getByRole('button', { name: 'Find it' }).click();
      await page.getByText('Nothing matches that.').waitFor();
      await page.locator('input[placeholder="09XX XXX XXXX"]').fill(PHONE_TYPED);
      await page.getByRole('button', { name: 'Find it' }).click();
      await page.waitForSelector('[data-screen-label="Customer order status"]');
      await page.getByText(orderNo).first().waitFor();
      assert(
        page.url().endsWith('/status#t=' + token),
        `Address bar after lookup is ${page.url()}`
      );
    }
  );

  await step('the waiting list takes an entry', async () => {
    await page.goto(`${base}/shop`, { waitUntil: 'networkidle' });
    await page.getByText(flavour.short_name, { exact: false }).first().waitFor();
    await page.getByRole('button', { name: 'Join the waiting list' }).click();
    const form = page.locator('form');
    await form.locator('input').nth(0).fill('Ben Waiting');
    await form.locator('input').nth(2).fill(PHONE_TYPED);
    const wanted = new Date(Date.now() + 8 * 3_600_000 + 7 * 86_400_000).toISOString().slice(0, 10);
    await form.locator('input[type="date"]').fill(wanted);
    await form.getByRole('button', { name: 'Join the waiting list' }).click();
    await page.getByText('You are on the waiting list.').waitFor();
    const { data } = await admin
      .from('waitlist_entries')
      .select('name, phone, wanted_date')
      .eq('phone', phone);
    assert(
      data?.length === 1 && data[0].name === 'Ben Waiting' && data[0].wanted_date === wanted,
      'waitlist row differs'
    );
  });

  await step(
    'no errors, no CSP violations, no foreign origin, and the token never travelled in a URL',
    async () => {
      const csp = await page.evaluate(() => window.__csp);
      assert(csp.length === 0, `CSP violations: ${JSON.stringify(csp)}`);
      assert(problems.length === 0, `Browser errors: ${JSON.stringify(problems)}`);
      assert(
        foreign.size === 0,
        `Requests left the app and the local stack: ${[...foreign].join(', ')}`
      );
      assert(
        tokenInUrl.length === 0,
        `The status token appeared in a request URL: ${tokenInUrl.join(', ')}`
      );
    }
  );
} catch (error) {
  failure = error;
} finally {
  await browser?.close();
  if (child.exitCode === null && child.pid) {
    if (process.platform === 'win32')
      spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
}
if (failure) {
  console.error(`\nFAILED after ${steps.length} step(s): ${failure.message}`);
  process.exit(1);
}
console.log(
  `\nLive checkout happy path passed: ${steps.length} steps against ${new URL(url).origin}.`
);
