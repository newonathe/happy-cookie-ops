/**
 * B1 live smoke suite against the LOCAL Supabase stack: the live static export
 * (NEXT_PUBLIC_APP_MODE=live), signed in as an owner, driven by headless Chromium only.
 *
 * `pnpm test:e2e` and the visual suite build without a database, where the sign-in gate is off
 * and the app is the demo. This script is where the signed-in live app is exercised end to end:
 * every tab, sub-tab and entry of the function map, every route by its address, and one Bazaar
 * sale online, two with no network (one of them after a reload), all three in the database once.
 *
 * Slice B2 added: no prototype value on any page it visits (`PROTOTYPE`, below); the signed-in
 * person's own name on Home and on every sale, the offline ones included; the owner's shop
 * details saved through the form and shown to a signed-out customer; and a control in every
 * form that section 6.7 of the plan says exists today.
 *
 * It is run by hand, never in CI: CI has no database. Run `pnpm db:reset` first for a clean
 * stack, then, in one shell (the keys stay in the environment, never in a file):
 *   eval "$(pnpm exec supabase status -o env)"
 *   NEXT_PUBLIC_SUPABASE_URL=$API_URL NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$PUBLISHABLE_KEY \
 *     SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY pnpm test:live:smoke
 *
 * The service-role key is used against a local address only (scripts/lib/live-stack.mjs
 * refuses anything else). It makes one owner account with a random password that is never
 * printed or stored, and reads rows back. The account is removed at the end.
 *
 * What a run changes in the local database, and leaves there (`pnpm db:reset` clears it):
 *   - the flavour `dcf` is set published and on the order form (the only existing row it changes);
 *   - one `production_records` batch row, written directly so the stall has baked stock: no
 *     ingredients are taken for it;
 *   - one event, left open, and its three sales. Repeated runs add one open event each.
 * It deletes nothing but the account it made and the shop details it saved.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { assert, localStack, serveLiveBuild } from './lib/live-stack.mjs';
import { PLACES, TABS } from '../src/lib/nav/function-map.ts';

const { url, service } = localStack();
const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const steps = [];
async function step(name, run) {
  const started = Date.now();
  await run();
  steps.push(name);
  console.log(`  ok  ${name} (${Date.now() - started} ms)`);
}

// What each route shows. `order` and `batch` open on whatever the engine has selected.
const SCREEN_LABEL = {
  today: 'Home',
  sales: 'Sales log',
  orders: 'Orders',
  order: 'Order detail',
  lookup: 'Find my order',
  reconcile: 'Payments',
  bake: 'Bake plan',
  batch: 'Production focus',
  inventory: 'Inventory',
  stocktake: 'Inventory',
  more: 'All tools',
  grocery: 'Grocery list',
  bazaar: 'Bazaar Mode',
  pnl: 'P and L',
  formqueue: 'Form queue',
  health: 'System health',
  products: 'Products',
  notifications: 'Notifications',
  shop: 'Customer shop',
  checkout: 'Customer checkout',
  status: 'Customer order status',
  recipes: 'Recipes',
  drops: 'Drops',
  suppliers: 'Suppliers',
  settings: 'Settings'
};
const ROUTES = PLACES.flatMap((place) => place.routes);
const pathOf = (route) => (route === 'today' ? '/' : '/' + route);
const FLAVOUR = 'dcf';
const BATCH_REF = 'B1 smoke suite';
const OWNER_NAME = 'Smoke Owner Reyes';
const DETAILS = { name: 'Smoke Test Bakes', tagline: 'Checked by the smoke suite, 137 ways.' };

// Values of the prototype that must be on no live page (audit H1 to H6, H14, and the ported
// payment channels). The local seed holds none of them as a real record; two that it does
// make true (its six flavours are four permanent and two rotating, and it has eight
// suppliers) are left to the unit test tests/unit/no-prototype-values.test.tsx, which has the
// full list, built from the engine itself, and shops of its own.
const PROTOTYPE = [
  'Cine',
  'Kristian',
  'Francine',
  'Cervo',
  'Misty',
  'Proof required',
  'Courier pickup',
  '2 temporary',
  'Google Form bridge',
  '4 classics',
  '0917 ••• 4421',
  'Happy Cookie order'
];
// A form from the plan's inventory (section 6.7, "Today: yes") must offer something to change.
const FORMS_OF_6_7 = [
  'Menu & flavours',
  'Recipe drafts',
  'Stock items',
  'Suppliers & prices',
  'Boxes & add-ons',
  'Order rules',
  'Payment methods',
  'Shop texts',
  'Bazaar events',
  'Shop status',
  'Books & costs'
];

// ---------------------------------------------------------------- the world, set through the service role
const owner = { email: `b1-smoke-${randomUUID().slice(0, 8)}@example.test`, id: null };
const secret = randomBytes(24).toString('base64url');

async function seedWorld() {
  const ok = (label, { error }) => assert(!error, `${label}: ${error?.message}`);
  const made = await admin.auth.admin.createUser({
    email: owner.email,
    password: secret,
    email_confirm: true
  });
  assert(!made.error && made.data.user, `owner account: ${made.error?.message}`);
  owner.id = made.data.user.id;
  ok(
    'owner profile',
    await admin
      .from('profiles')
      .upsert({ id: owner.id, role: 'owner', display_name: OWNER_NAME, active: true })
  );
  ok(
    'publish flavour',
    await admin.from('products').update({ published: true, active: true }).eq('id', FLAVOUR)
  );
  // Baked stock for the stall: one batch record, the way the app's own bake writes it.
  ok(
    'baked stock',
    await admin.from('production_records').insert({
      id: randomUUID(),
      kind: 'batch',
      product_id: FLAVOUR,
      ref: BATCH_REF,
      qty: 12,
      target: 12,
      recipe_version: 1,
      at: new Date().toISOString(),
      payload_hash: randomBytes(32).toString('hex')
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

async function removeDetails() {
  const { error } = await admin.from('shop_identity').delete().eq('id', true);
  if (error) console.log(`  note: the smoke shop details were not removed (${error.message}).`);
}

async function removeOwner() {
  if (!owner.id) return;
  const { error } = await admin.auth.admin.deleteUser(owner.id);
  console.log(
    error
      ? `  note: the smoke owner could not be removed (${error.message}); pnpm db:reset clears it.`
      : '  the smoke owner account was removed.'
  );
}

// ---------------------------------------------------------------- build and serve
const { base, stop, reused } = await serveLiveBuild();

let browser;
let failure;
let where = async () => '';
try {
  const flavour = await seedWorld();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    timezoneId: 'Asia/Manila',
    serviceWorkers: 'allow'
  });
  const problems = [];
  const refused = [];
  // While the network is off, a failed request is the expected result, not a defect. Those
  // lines are counted apart; a page error, or any other console error, still fails the run.
  let offline = false;
  let offlineNoise = 0;
  const NETWORK_FAILURE = /net::ERR_|Failed to fetch|Failed to load resource|NetworkError/;
  const foreign = new Set();
  const watch = (page, name) => {
    page.setDefaultTimeout(20_000);
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      if (offline && NETWORK_FAILURE.test(message.text())) return void (offlineNoise += 1);
      // The address without its query string: a request can carry a key or a token there.
      const from = (message.location()?.url ?? '').split(/[?#]/)[0];
      problems.push(`${name} console: ${message.text()} ${from}`);
    });
    page.on('pageerror', (error) => problems.push(`${name} page: ${error.message}`));
    page.on('response', (response) => {
      if (response.status() >= 400)
        refused.push(`${response.status()} ${new URL(response.url()).pathname}`);
    });
    page.on('request', (request) => {
      const origin = new URL(request.url()).origin;
      if (origin !== base && origin !== new URL(url).origin) foreign.add(origin);
    });
  };
  await context.addInitScript(() => {
    window.__csp = [];
    window.addEventListener('securitypolicyviolation', (event) =>
      window.__csp.push(`${event.violatedDirective}: ${event.blockedURI}`)
    );
  });
  const page = await context.newPage();
  watch(page, 'phone');
  // On a failure: where the browser was and what it showed, with no account detail.
  where = async () =>
    `at ${new URL(page.url()).pathname}: ` +
    (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 240) +
    (problems.length ? ` | ${problems.slice(0, 3).join(' | ')}` : '') +
    (refused.length ? ` | refused: ${refused.slice(-6).join(', ')}` : '');

  /** The screen on show, with nothing broken on it: no "undefined", no "NaN", no error so far. */
  const check = async (target, where, label) => {
    const shown = target.locator('[data-screen-label]').first();
    await shown.waitFor();
    if (label) await target.locator(`[data-screen-label="${label}"]`).first().waitFor();
    const text = await target.locator('body').innerText();
    const bad = text.match(/\b(undefined|NaN)\b/);
    assert(!bad, `${where}: "${bad?.[0]}" is on screen.`);
    const spoken = await target.evaluate(() =>
      [...document.querySelectorAll('[aria-label], [title], [alt], [placeholder]')]
        .flatMap((el) =>
          ['aria-label', 'title', 'alt', 'placeholder'].map((a) => el.getAttribute(a))
        )
        .filter(Boolean)
        .join(' | ')
    );
    const fake = PROTOTYPE.find((term) => (text + ' | ' + spoken).includes(term));
    assert(!fake, `${where}: the prototype's "${fake}" is on screen.`);
    scanned += 1;
    const csp = await target.evaluate(() => window.__csp);
    assert(csp.length === 0, `${where}: CSP violations ${JSON.stringify(csp)}`);
    assert(problems.length === 0, `${where}: ${JSON.stringify(problems)}`);
    return shown.getAttribute('data-screen-label');
  };
  let scanned = 0;
  const formsSeen = new Set();
  // Several sheets read from the database before they open and again once open. Wait for
  // the sheet itself, let its reads finish, then require content in it: a blank sheet, or
  // one that turns to "undefined" a moment after opening, must not pass.
  const sheetShown = async (target, at) => {
    await target
      .waitForFunction(() => !!window.__hcOps.state.sheet)
      .catch(() => assert(false, `${at}: no sheet opened.`));
    const close = target.getByRole('button', { name: 'Close', exact: true }).first();
    await close.waitFor();
    await target.waitForLoadState('networkidle');
    await target.waitForTimeout(250);
    const sheet = close.locator('xpath=ancestor::div[2]');
    const text = (await sheet.innerText()).replace(/\s+/g, ' ').trim();
    assert(text.length >= 12, `${at}: the sheet is empty ("${text}").`);
    const bad = text.match(/\b(undefined|NaN)\b/);
    assert(!bad, `${at}: "${bad?.[0]}" is in the sheet.`);
    const form = FORMS_OF_6_7.find((label) => at.endsWith(label));
    if (form) {
      // Something to change, besides the way out.
      const controls = await sheet.evaluate(
        (el) =>
          [...el.querySelectorAll('input, select, textarea, button')].filter(
            (c) => (c.getAttribute('aria-label') || c.textContent || '').trim() !== 'Close'
          ).length
      );
      assert(controls > 0, `${at}: the form offers nothing to change.`);
      formsSeen.add(form);
    }
  };
  const closeSheet = async (target) => {
    await target.getByRole('button', { name: 'Close', exact: true }).first().click();
    await target.waitForFunction(() => !window.__hcOps.state.sheet);
  };
  const row = (target, kind) => target.locator(`[data-sub-tabs="${kind}"]`);
  // A chip's name is its label, followed by its count when it carries one.
  const chip = (target, kind, name) =>
    row(target, kind).getByRole('button', {
      name: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '( \\d+)?$')
    });

  await step('the owner signs in and lands on Home', async () => {
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    // The form must be live before it is filled: a submit before that is a plain page reload.
    await page.waitForFunction(() => {
      const input = document.querySelector('input[type="email"]');
      return !!input && Object.keys(input).some((key) => key.startsWith('__reactFiber'));
    });
    await page.locator('input[type="email"]').fill(owner.email);
    await page.locator('input[type="password"]').fill(secret);
    await page.locator('button[type="submit"]').click();
    await page.locator('[data-screen-label="Home"]').waitFor();
    assert(
      (await page.evaluate(() => window.__hcOps.state.role)) === 'owner',
      'The signed-in role is not the owner.'
    );
    await check(page, 'Home after sign-in', 'Home');
    // The name comes from the profile, a moment after the gate opens.
    await page.getByRole('heading', { name: new RegExp(', ' + OWNER_NAME + '\\.$') }).waitFor();
  });

  await step(
    'the phone dock shows the five tabs, labelled, and each opens its first place',
    async () => {
      for (const tab of TABS) {
        const button = page.getByRole('button', { name: tab.label, exact: true });
        await button.click();
        assert((await button.innerText()).includes(tab.label), `${tab.label} has no label.`);
        await check(page, `tab ${tab.label}`, SCREEN_LABEL[tab.screen]);
        const open = await chip(page, 'places', PLACES.find((p) => p.home === tab.id).label);
        assert(
          (await open.getAttribute('aria-current')) === 'page',
          `${tab.label}: place not marked.`
        );
      }
      // The dock's buttons are the ones that carry their label as title too. Exactly the five.
      const onDock = await page
        .locator('button[aria-label][title]')
        .evaluateAll((buttons) =>
          buttons
            .filter((b) => b.getAttribute('aria-label') === b.getAttribute('title'))
            .map((b) => b.getAttribute('title'))
        );
      assert(
        JSON.stringify(onDock) === JSON.stringify(TABS.map((tab) => tab.label)),
        `The dock shows ${JSON.stringify(onDock)}.`
      );
    }
  );

  let visited = 0;
  await step(
    'every sub-tab and every entry under the five tabs and Account opens clean',
    async () => {
      for (const place of PLACES.filter((p) => !['bell', 'customer', 'retired'].includes(p.home))) {
        const tab = TABS.find((t) => t.id === place.home) ?? TABS[0];
        const where = `${tab.label} › ${place.label}`;
        await page.getByRole('button', { name: tab.label, exact: true }).click();
        await chip(page, 'places', place.label).click();
        if (!place.screen) {
          // No screen of its own yet: the chip opens its one entry, a sheet.
          await sheetShown(page, `${where} › ${place.entries[0].label}`);
          await check(page, where);
          await closeSheet(page);
          visited += 1;
          continue;
        }
        await check(page, where, SCREEN_LABEL[place.screen]);
        visited += 1;
        if (place.entries.length < 2) continue;
        for (const entry of place.entries) {
          const at = `${where} › ${entry.label}`;
          await chip(page, 'entries', entry.label).click();
          visited += 1;
          if (entry.screen) {
            await check(page, at, SCREEN_LABEL[entry.screen]);
          } else if (entry.label.startsWith('Preview')) {
            // A preview leaves the staff app for a customer page, which has no strip: come back.
            await page.waitForFunction(() =>
              ['shop', 'checkout', 'status'].includes(window.__hcOps.state.screen)
            );
            await check(page, at);
            assert(
              (await row(page, 'places').count()) === 0,
              `${at}: the strip is on a customer page.`
            );
            await page.goto(base + pathOf(place.screen), { waitUntil: 'networkidle' });
            await page.locator(`[data-screen-label="${SCREEN_LABEL[place.screen]}"]`).waitFor();
          } else {
            await sheetShown(page, at);
            await check(page, at);
            await closeSheet(page);
          }
        }
      }
      await page.getByRole('button', { name: 'Notifications', exact: true }).click();
      await check(page, 'the bell', 'Notifications');
      const missing = FORMS_OF_6_7.filter((label) => !formsSeen.has(label));
      assert(missing.length === 0, `Forms of section 6.7 not found: ${missing.join(', ')}.`);
    }
  );

  await step('the owner saves her shop details, and a signed-out customer sees them', async () => {
    await page.getByRole('button', { name: 'Sell', exact: true }).click();
    await chip(page, 'places', 'Shop').click();
    await chip(page, 'entries', 'Shop texts').click();
    await sheetShown(page, 'Shop texts');
    // Nothing is filled in for her: the four fields start empty.
    for (const name of ['shopName', 'ownerName', 'contactLine', 'tagline'])
      assert(
        (await page.locator(`input[name="${name}"]`).inputValue()) === '',
        `${name} is pre-filled.`
      );
    await page.locator('input[name="shopName"]').fill(DETAILS.name);
    await page.locator('input[name="tagline"]').fill(DETAILS.tagline);
    await page.getByRole('button', { name: 'Save shop details', exact: true }).click();
    await assertEventually(async () => {
      const { data } = await admin.from('shop_identity').select('shop_name, tagline').maybeSingle();
      return data?.shop_name === DETAILS.name && data?.tagline === DETAILS.tagline;
    }, 'the shop details in the database');
    await closeSheet(page);
    const visitor = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const shop = await visitor.newPage();
    await shop.goto(`${base}/shop`, { waitUntil: 'networkidle' });
    await shop.getByText(DETAILS.tagline, { exact: true }).waitFor();
    const said = await shop.locator('body').innerText();
    assert(!said.includes('4 classics'), 'The customer shop still shows the ported tagline.');
    await visitor.close();
  });

  await step(`all ${ROUTES.length} routes open by address on a phone`, async () => {
    assert(ROUTES.length === 25, `${ROUTES.length} routes in the map, wanted 25.`);
    for (const route of ROUTES) {
      await page.goto(base + pathOf(route), { waitUntil: 'networkidle' });
      const exact = ['order', 'batch'].includes(route) ? undefined : SCREEN_LABEL[route];
      await check(page, `phone ${pathOf(route)}`, exact);
      const body = await page.evaluate(() => document.documentElement.scrollWidth);
      assert(body <= 390, `phone ${pathOf(route)}: the page is ${body} px wide.`);
    }
  });

  await step('the desktop sidebar shows the same five, and all routes open there too', async () => {
    const desk = await context.newPage();
    watch(desk, 'desktop');
    await desk.setViewportSize({ width: 1280, height: 800 });
    await desk.goto(`${base}/`, { waitUntil: 'networkidle' });
    await desk.locator('[data-screen-label="Home"]').waitFor();
    for (const tab of TABS) {
      // In the sidebar a tab's name is its label, followed by its count when it carries one.
      await desk
        .getByRole('button', { name: new RegExp('^' + tab.label + '( \\d+)?$') })
        .first()
        .click();
      await check(desk, `desktop tab ${tab.label}`, SCREEN_LABEL[tab.screen]);
    }
    for (const route of ROUTES) {
      await desk.goto(base + pathOf(route), { waitUntil: 'networkidle' });
      const exact = ['order', 'batch'].includes(route) ? undefined : SCREEN_LABEL[route];
      await check(desk, `desktop ${pathOf(route)}`, exact);
    }
    await desk.close();
  });

  const salesInDb = async (eventId) => {
    const { data, error } = await admin
      .from('event_sales')
      .select('client_id, total_cents, clerk')
      .eq('event_id', eventId);
    assert(!error, `event_sales: ${error?.message}`);
    return data;
  };
  const sellOne = async (wanted) => {
    await page
      .getByRole('button', { name: new RegExp(flavour.short_name) })
      .first()
      .click();
    await page.getByRole('button', { name: 'Charge', exact: true }).click();
    await page.getByRole('button', { name: /^Cash/ }).last().click();
    await page.waitForFunction((n) => (window.__hcOps.state.sales ?? []).length === n, wanted);
  };
  let eventId = '';

  await step(
    'Bazaar Mode: an event opens on the server, the table is loaded, one sale goes through',
    async () => {
      // The app counts as baked what was baked for its current drop. The seeded batch is given
      // that number here: on a freshly reset database nothing else carries it, and the table
      // would have nothing to load.
      const dropNo = await page.evaluate(() => window.__hcOps.state.dropNo);
      const stamped = await admin
        .from('production_records')
        .update({ drop_no: dropNo })
        .eq('ref', BATCH_REF);
      assert(!stamped.error, `baked stock drop: ${stamped.error?.message}`);
      await page.goto(`${base}/bazaar`, { waitUntil: 'networkidle' });
      await check(page, 'Bazaar bookings', 'Bazaar Mode');
      await page.getByText('Start without a booking').click();
      await page.waitForFunction(() => window.__hcOps.state.event?.id);
      eventId = await page.evaluate(() => window.__hcOps.state.event.id);
      // With an event on the phone, the Bazaar screen is exactly as before B1: no strip.
      assert((await row(page, 'places').count()) === 0, 'The strip is drawn over an open event.');
      await page.getByLabel(`Cookies on the table for ${flavour.name}`).fill('6');
      await page.getByRole('button', { name: /^Open the table/ }).click();
      await page.waitForFunction(() => window.__hcOps.state.event?.stage === 'selling');
      await sellOne(1);
      await check(page, 'Bazaar selling', 'Bazaar Mode');
      await assertEventually(
        async () => (await salesInDb(eventId)).length === 1,
        'the online sale'
      );
    }
  );

  await step('with no network it still sells, survives a reload, and sells again', async () => {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => document.documentElement.dataset.hcOfflineReady === 'true');
    offline = true;
    await context.setOffline(true);
    await sellOne(2);
    await check(page, 'Bazaar, offline', 'Bazaar Mode');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-screen-label="Bazaar Mode"]').waitFor();
    await page.waitForFunction(() => (window.__hcOps?.state.sales ?? []).length === 2);
    assert(
      (await page.evaluate(() => window.__hcOps.state.event?.stage)) === 'selling',
      'The event is not still selling after the offline reload.'
    );
    await check(page, 'Bazaar, after the offline reload', 'Bazaar Mode');
    await sellOne(3);
    await check(page, 'Bazaar, third sale offline', 'Bazaar Mode');
    // Long enough for a retry to have gone out if the network were not really off.
    await page.waitForTimeout(3000);
    assert((await salesInDb(eventId)).length === 1, 'An offline sale reached the database.');
    assert(offlineNoise > 0, 'No request failed while offline: the network was not off.');
  });

  await step('back online, all three sales are in the database, each once', async () => {
    // The next customer, mid-payment when the signal returns: a cookie in the cart and the
    // payment sheet open, not paid.
    await page
      .getByRole('button', { name: new RegExp(flavour.short_name) })
      .first()
      .click();
    await page.getByRole('button', { name: 'Charge', exact: true }).click();
    await page.waitForFunction(() => window.__hcOps.state.sheet?.kind === 'pay');
    await context.setOffline(false);
    offline = false;
    // Stands in for the browser's own event, which headless Chromium does not always fire.
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await assertEventually(async () => (await salesInDb(eventId)).length === 3, 'the queued sales');
    const cents = Number(flavour.price_cents);
    const settled = async (when) => {
      const rows = await salesInDb(eventId);
      assert(rows.length === 3, `${when}: ${rows.length} sales in the database, wanted 3.`);
      assert(
        rows.every((r) => Number(r.total_cents) === cents),
        `${when}: sale totals differ from the menu price: ${JSON.stringify(rows)}`
      );
      // Two of the three were rung up with no network, one of those after a reload.
      assert(
        rows.every((r) => r.clerk === OWNER_NAME),
        `${when}: a sale was not recorded under the signed-in name: ${rows.map((r) => r.clerk)}`
      );
    };
    // A sale sent twice under a new id would arrive late: give every retry timer time to run,
    // then reload online, which sends whatever the phone still thinks is unsent.
    await page.waitForTimeout(5000);
    await settled('after the queue was sent');
    // Where the app is once signal is back: still selling, the payment sheet still open. (On
    // 6 October the sign-in gate re-applied the role here, and the engine's setRole closed
    // the sheet and went Home.) The reload below drops the unpaid cart.
    const after = await page.evaluate(() => ({
      screen: window.__hcOps.state.screen,
      sheet: window.__hcOps.state.sheet?.kind ?? null
    }));
    assert(
      after.screen === 'bazaar' && after.sheet === 'pay',
      `When signal returned after the offline reload the app left the sale in hand: ` +
        `screen "${after.screen}", sheet "${after.sheet}".`
    );
    await check(page, 'Bazaar, signal back mid-payment', 'Bazaar Mode');
    await page.goto(`${base}/bazaar`, { waitUntil: 'networkidle' });
    await page.locator('[data-screen-label="Bazaar Mode"]').waitFor();
    await page.waitForTimeout(4000);
    await settled('after an online reload');
    assert(
      (await page.evaluate(() => (window.__hcOps.state.sales ?? []).length)) === 3,
      'The phone no longer shows three sales.'
    );
    await check(page, 'Bazaar, back online', 'Bazaar Mode');
  });

  // B5: the New Stock screens, in a real browser. axe finds what jsdom cannot (real colour contrast), and the
  // layout is held to 320 px wide at 200% text with no sideways scroll. Skip with SMOKE_SKIP_STOCK_A11Y=1, so a
  // build without these screens cannot fail the checks above. The scan is limited to the screen's own region.
  if (process.env.SMOKE_SKIP_STOCK_A11Y === '1') {
    console.log(
      '  skip  the New Stock screens: accessibility and layout (SMOKE_SKIP_STOCK_A11Y=1)'
    );
  } else {
    const axeSource = readFileSync(
      new URL('../node_modules/axe-core/axe.min.js', import.meta.url),
      'utf8'
    );
    /** Serious or critical axe violations inside the open screen's region, as short lines. */
    const axeProblems = async (at, label) => {
      await page.evaluate(axeSource);
      const found = await page.evaluate(async (screenLabel) => {
        const region = document.querySelector(`[data-screen-label="${screenLabel}"]`);
        const result = await window.axe.run(region, { resultTypes: ['violations'] });
        return result.violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => `${v.impact} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
      }, label);
      assert(found.length === 0, `${at}: axe found ${found.join(' | ')}`);
    };
    /** No sideways scroll at 320 px wide with the text at 200%. */
    const fitsNarrow = async (at) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
      await page.waitForTimeout(250);
      const wide = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        body: document.body.scrollWidth - document.documentElement.clientWidth
      }));
      await page.evaluate(() => (document.documentElement.style.fontSize = ''));
      await page.setViewportSize({ width: 390, height: 844 });
      assert(
        wide.page <= 0 && wide.body <= 0,
        `${at}: scrolls sideways at 320 px and 200% text (${JSON.stringify(wide)}).`
      );
    };
    /** Opens a screen by its address and waits for the new screen, not the ported one, with its stock read in. */
    const openStock = async (route, label, mark) => {
      await page.goto(`${base}/${route}`, { waitUntil: 'networkidle' });
      await page.locator(`[data-screen-label="${label}"]`).waitFor();
      await page.locator(mark).first().waitFor();
      await page.getByText('Stock is loading.').waitFor({ state: 'detached' });
    };

    await step(
      'Inventory and Grocery: no serious axe violation, and they fit 320 px at 200% text',
      async () => {
        await openStock('inventory', 'Inventory', '[aria-label="Stock counts"]');
        await axeProblems('Inventory list', 'Inventory');
        await fitsNarrow('Inventory list');
        const first = page.locator('[aria-label="Stock items"] button').first();
        if ((await first.count()) > 0) {
          await first.click();
          await page.getByRole('button', { name: 'Back to all items' }).waitFor();
          await axeProblems('Inventory item page', 'Inventory');
          await fitsNarrow('Inventory item page');
        } else {
          console.log('      the stock catalogue is empty: the item page was not scanned.');
        }
        await openStock('grocery', 'Grocery list', '[aria-label="Totals"]');
        await axeProblems('Grocery list', 'Grocery list');
        await fitsNarrow('Grocery list');
      }
    );
  }

  await step('no errors, no CSP violations and no foreign origin, start to finish', async () => {
    assert(problems.length === 0, `Browser errors: ${JSON.stringify(problems)}`);
    const csp = await page.evaluate(() => window.__csp);
    assert(csp.length === 0, `CSP violations: ${JSON.stringify(csp)}`);
    assert(
      foreign.size === 0,
      `Requests left the app and the local stack: ${[...foreign].join(', ')}`
    );
    console.log(
      `      ${visited} places and entries opened; ${ROUTES.length} routes at two widths; ` +
        `${offlineNoise} failed requests while offline, as expected.`
    );
    console.log('      when signal returned the selling screen and the payment sheet stayed open.');
    console.log(
      `      ${scanned} page checks found no prototype value; all three sales carry the ` +
        `signed-in name; ${formsSeen.size} forms of section 6.7 offer a control.`
    );
  });
} catch (error) {
  failure = error;
  failure.where = await where().catch(() => '');
} finally {
  // Each on its own, the account first: one failing must not leave the others undone.
  await removeOwner().catch((error) =>
    console.log(`  note: account removal threw: ${error.message}`)
  );
  await removeDetails().catch(() => {});
  await browser?.close().catch(() => {});
  stop();
}

async function assertEventually(test, what) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (await test()) return;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Timed out waiting for ${what}.`);
}

if (failure) {
  // A browser call log can echo what was typed into a field: never print the account.
  const plain = (text) =>
    String(text).split(secret).join('<password>').split(owner.email).join('<email>');
  console.error(`\nFAILED after ${steps.length} step(s): ${plain(failure.message)}`);
  if (failure.where) console.error(`  ${plain(failure.where)}`);
  process.exit(1);
}
console.log(
  `\nLive smoke suite passed: ${steps.length} steps against ${new URL(url).origin}.` +
    (reused ? ' REUSED BUILD: not evidence for the current tree.' : '')
);
