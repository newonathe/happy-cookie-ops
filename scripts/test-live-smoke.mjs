/**
 * B1 live smoke suite against the LOCAL Supabase stack: the live static export
 * (NEXT_PUBLIC_APP_MODE=live), signed in as an owner, driven by headless Chromium only.
 *
 * `pnpm test:e2e` and the visual suite build without a database, where the sign-in gate is off
 * and the app is the demo. This script is where the signed-in live app is exercised end to end:
 * every tab, sub-tab and entry of the function map, every route by its address, and one Bazaar
 * sale online, two with no network (one of them after a reload), all three in the database once.
 *
 * Slice S2 (bazaar days) changed the Bazaar part: the stall's day is planned on the Bazaar page (a booking, then
 * day 1 with its own float, cookies and price), started with signal, and sold at that price.
 *
 * Slice S3 added the rest of the event: day 1 is reviewed from "Close out" (a loss recorded, every figure openable, an
 * unknown cost in words), closed with cookies carried over; a cost, a fee and a target are typed on the event page; day 2
 * starts with the carried cookies, sells through a reload with no network (the drawer float comes back), and closes; the
 * event is closed; and the books hold the bazaar back until then and count it after. The figures on screen are held to
 * the run's own sums.
 *
 * Bazaar v2 slice U2 added one step on day 1: the owner leaves the till for Home and comes back (the day, its stock and the
 * open sale stay), a flavour that sells out leaves the grid and returns after a void, two cookies are added from the till (they
 * change the day's carried count and its cookie cost, which the later sums include), and the till's expense "Add" opens the
 * day's fee form.
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
 *   - one more booking, added through the events hub's sheet (U3), and
 *   - one booking with its two days, their five sales, one loss, one fee, a typed cost and a target, closed as an event:
 *     its rent, fee and drawer difference are in the ledger, its stock use is taken (shortfalls recorded), and one cookie
 *     is written as a batch when the flavour has a recipe. Repeated runs add one booking each; `pnpm db:reset` clears them.
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
  bazaar: 'Bazaar',
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
// S2: day 1's own plan. The price is not the menu's, so a sale at the menu price would fail the check below.
const DAY_PRICE_PESOS = 150;
const DAY_FLOAT_PESOS = 500;
const DAY_COOKIES = 6;
// U2: cookies added to the table from the till on day 1, after the plan was saved and the day started.
const ADDED_COOKIES = 2;
// One booking a run, named for it, so a run on a database a run has been on before finds its own.
const bookingId = randomUUID();
const BOOKING_NAME = 'Smoke bazaar ' + bookingId.slice(0, 8);
/** Today on the business clock, as YYYY-MM-DD. */
const manilaToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
const manilaPlus = (days) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(
    new Date(Date.now() + days * 86_400_000)
  );
// U3: the event added through the hub's sheet, a month ahead so it sits under Upcoming on any run.
const ADDED_NAME = 'Smoke added ' + bookingId.slice(0, 8);
const ADDED_DAY = manilaPlus(30);

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
  // S2: the booking whose day 1 the stall sells (today to tomorrow, so its day is inside its dates on any run).
  ok(
    'bazaar booking',
    await admin.from('scheduled_events').insert({
      id: bookingId,
      name: BOOKING_NAME,
      starts_on: manilaToday(),
      ends_on: manilaPlus(1),
      place: 'Smoke hall',
      rent_cents: 100000,
      active: true
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
            if (entry.label === 'Bazaar events') {
              // U3: the sub-tab opens the hub; the multi-row form is the hub's "Edit or switch off events".
              await page.getByRole('button', { name: 'Edit or switch off events' }).click();
              await sheetShown(page, at);
              await closeSheet(page);
            }
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

  // U3: one event added from the hub's sheet. It is a second booking, far enough ahead to sit under Upcoming.
  await step(
    'Bazaar: an event is added in the sheet, listed under Upcoming, and saved once',
    async () => {
      await page.goto(`${base}/bazaar`, { waitUntil: 'networkidle' });
      await check(page, 'Bazaar events hub', 'Bazaar');
      await page.getByRole('button', { name: 'Add an event' }).click();
      const sheet = page.getByRole('dialog', { name: 'Add an event' });
      await sheet.waitFor();
      // Saved empty, it points at the fields and sends nothing.
      await sheet.getByRole('button', { name: 'Save the event' }).click();
      await page.getByText('There is a problem').waitFor();
      assert(
        (await sheet.getByLabel('Name', { exact: true }).getAttribute('aria-invalid')) === 'true',
        'The empty name is not marked invalid.'
      );
      await sheet.getByLabel('Name', { exact: true }).fill(ADDED_NAME);
      await sheet.getByLabel('Place', { exact: true }).fill('Smoke court');
      await sheet.getByLabel('First day', { exact: true }).fill(ADDED_DAY);
      assert(
        (await sheet.getByLabel('Last day', { exact: true }).inputValue()) === ADDED_DAY,
        'The last day did not follow the first.'
      );
      await sheet.getByLabel('Stall rent', { exact: true }).fill('1,250.50');
      await sheet.getByRole('button', { name: 'Save the event' }).click();
      await sheet.waitFor({ state: 'detached' });
      await page
        .getByRole('list', { name: 'Upcoming events' })
        .getByRole('button', { name: new RegExp(ADDED_NAME) })
        .waitFor();
      const saved = await admin.from('scheduled_events').select('*').eq('name', ADDED_NAME);
      assert(!saved.error && saved.data.length === 1, `scheduled_events: ${saved.error?.message}`);
      const added = saved.data[0];
      assert(
        added.place === 'Smoke court' &&
          added.starts_on === ADDED_DAY &&
          added.ends_on === ADDED_DAY &&
          Number(added.rent_cents) === 125050 &&
          added.active === true &&
          added.event_id === null,
        `The saved event is not what was typed: ${JSON.stringify(added)}`
      );
    }
  );

  await step(
    'Bazaar: day 1 is planned, started at its own price and stock, and one sale goes through',
    async () => {
      await page.goto(`${base}/bazaar`, { waitUntil: 'networkidle' });
      await check(page, 'Bazaar bookings', 'Bazaar');
      // The ported start list is gone: no prototype event, no one-tap start.
      assert(
        (await page.getByText('Start without a booking').count()) === 0 &&
          (await page.getByText('Start an event').count()) === 0,
        'The old start is still offered.'
      );
      await page.getByRole('button', { name: new RegExp(BOOKING_NAME) }).click();
      await page.getByRole('heading', { level: 1, name: BOOKING_NAME }).waitFor();
      await check(page, 'Bazaar event page', 'Bazaar');
      // Day 1 is today: the first date still without a plan.
      await page.locator('[aria-labelledby="bazaar-plan"] button').first().click();
      const form = page.getByRole('form', { name: /^Plan for / });
      await form.waitFor();
      assert(
        (await form.getByLabel('Carried over').count()) === 0,
        'Day 1 offers cookies carried over.'
      );
      await check(page, 'Bazaar day plan', 'Bazaar day plan');
      await form.getByLabel('Drawer float (₱)').fill(String(DAY_FLOAT_PESOS));
      const card = form
        .getByText(flavour.short_name, { exact: true })
        .locator('xpath=ancestor::li[1]');
      await card.getByLabel('Made').fill(String(DAY_COOKIES));
      await card.getByLabel('Price (₱)').fill(String(DAY_PRICE_PESOS));
      await form.getByRole('button', { name: 'Save the plan' }).click();
      await page.getByText(`${DAY_COOKIES} cookies on the table`).waitFor();
      const planned = await admin
        .from('bazaar_days')
        .select('id, float_cents, event_id, bazaar_day_lines(product_id, made_qty, price_cents)')
        .eq('scheduled_id', bookingId);
      assert(!planned.error && planned.data.length === 1, `bazaar_days: ${planned.error?.message}`);
      const planRow = planned.data[0];
      assert(
        planRow.event_id === null &&
          Number(planRow.float_cents) === DAY_FLOAT_PESOS * 100 &&
          planRow.bazaar_day_lines.length === 1 &&
          Number(planRow.bazaar_day_lines[0].price_cents) === DAY_PRICE_PESOS * 100 &&
          planRow.bazaar_day_lines[0].made_qty === DAY_COOKIES,
        `The saved plan is not what was typed: ${JSON.stringify(planRow)}`
      );
      await check(page, 'Bazaar planned day', 'Bazaar');
      const bakedBefore = await page.evaluate(
        (id) => window.__hcOps.state.baked?.[id] ?? 0,
        FLAVOUR
      );
      await page.getByRole('button', { name: 'Start this day', exact: true }).click();
      await page.waitForFunction(() => window.__hcOps.state.event?.dayId);
      await page.locator('[data-screen-label="Bazaar Mode"]').waitFor();
      eventId = await page.evaluate(() => window.__hcOps.state.event.id);
      const started = await page.evaluate((id) => {
        const s = window.__hcOps.state;
        return {
          stage: s.event.stage,
          day: s.event.dayId,
          price: s.eventPrices[id],
          stock: s.eventStock[id],
          baked: s.baked?.[id] ?? 0,
          float: s.drawer?.float
        };
      }, FLAVOUR);
      assert(
        started.stage === 'selling' &&
          started.day === planRow.id &&
          started.price === DAY_PRICE_PESOS &&
          started.stock === DAY_COOKIES &&
          started.float === DAY_FLOAT_PESOS,
        `The started day is not the planned one: ${JSON.stringify(started)}`
      );
      assert(
        started.baked === bakedBefore,
        "The day's cookies were taken from the shop's baked stock."
      );
      const opened = await admin
        .from('events')
        .select('id, price_snapshot')
        .eq('id', eventId)
        .single();
      assert(!opened.error, `events: ${opened.error?.message}`);
      // With an event on the phone, the Bazaar screen is the ported till: no strip, no planning.
      assert((await row(page, 'places').count()) === 0, 'The strip is drawn over an open event.');
      assert(
        (await page.getByRole('button', { name: 'Start this day' }).count()) === 0,
        'Planning is drawn over the till.'
      );
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
    // Day 1's own price, not the menu's.
    const cents = DAY_PRICE_PESOS * 100;
    const settled = async (when) => {
      const rows = await salesInDb(eventId);
      assert(rows.length === 3, `${when}: ${rows.length} sales in the database, wanted 3.`);
      assert(
        rows.every((r) => Number(r.total_cents) === cents),
        `${when}: sale totals differ from the day's price: ${JSON.stringify(rows)}`
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

  // S3: day 1 is closed from its review with cookies carried over, day 2 sells them (through a reload with no
  // network), the event is closed, and only then do the books count it. The figures on screen are held to this
  // run's own sums: 3 cookies at day 1's price, 2 at day 2's, the rent, one fee, a typed cost and ₱5 over.
  const DAY2_PRICE_PESOS = 140;
  const DAY2_FLOAT_PESOS = 300;
  const DAY2_MADE = 4;
  const COST_PESOS = 40;
  const FEE_PESOS = 100;
  const RENT_PESOS = 1000;
  const CARRIED = DAY_COOKIES + ADDED_COOKIES - 3 - 1; // made and added, less the three sold and the one lost
  const pesoOf = (pesos) =>
    (pesos < 0 ? '-₱' : '₱') +
    Math.abs(pesos).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  // A figure is a row of its list whose text begins with its label; its parts stay hidden until it is opened.
  const figure = (list, label) =>
    page
      .getByRole('list', { name: list, exact: true })
      .locator(':scope > li')
      .filter({ hasText: new RegExp('^' + label) });
  const figureSays = async (list, label, wanted) => {
    const text = (await figure(list, label).innerText()).replace(/\s+/g, ' ');
    assert(text.includes(wanted), `${list} › ${label} reads "${text}", wanted ${wanted}.`);
    return text;
  };
  const review = page.locator('[data-screen-label="Bazaar day review"]');
  /** S3: the review and the event page, as the stock screens are held: no serious axe violation, and no sideways scroll at 320 px with the text at 200%. */
  const bazaarFits = async (at, label) => {
    await page.evaluate(
      readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8')
    );
    const found = await page.evaluate(async (screenLabel) => {
      const region = document.querySelector(`[data-screen-label="${screenLabel}"]`);
      const result = await window.axe.run(region, { resultTypes: ['violations'] });
      return result.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.impact} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
    }, label);
    assert(found.length === 0, `${at}: axe found ${found.join(' | ')}`);
    await page.setViewportSize({ width: 320, height: 640 });
    if (process.env.SMOKE_SHOTS)
      await page.screenshot({
        path: `${process.env.SMOKE_SHOTS}/${label.replace(/ /g, '-')}.png`,
        fullPage: true
      });
    await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
    await page.waitForTimeout(250);
    const wide = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    await page.evaluate(() => (document.documentElement.style.fontSize = ''));
    await page.setViewportSize({ width: 390, height: 844 });
    assert(wide <= 0, `${at}: scrolls sideways at 320 px and 200% text (${wide} px).`);
  };
  /** Whether the books say this run's bazaar is in progress (its sales held back). Leaves the Bazaar page. */
  const booksHoldIt = async () => {
    await page.getByRole('button', { name: 'Money', exact: true }).click();
    await chip(page, 'places', 'Expenses').click();
    await sheetShown(page, 'Money › Expenses › Books & costs');
    const held =
      (await page.getByText('Bazaar in progress: not counted yet').count()) > 0 &&
      (await page.getByText(BOOKING_NAME, { exact: true }).count()) > 0;
    await closeSheet(page);
    return held;
  };
  const openBooking = async () => {
    await page.goto(`${base}/bazaar`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: new RegExp(BOOKING_NAME) }).click();
    await page.getByRole('heading', { level: 1, name: BOOKING_NAME }).waitFor();
  };
  let day1 = '';
  /** The bazaar as the database works it out (`get_bazaar`), read as the owner on a connection of its own. */
  const summaryNow = async () => {
    const db = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const signed = await db.auth.signInWithPassword({ email: owner.email, password: secret });
    assert(!signed.error, `owner sign-in for the summary: ${signed.error?.message}`);
    const read = await db.rpc('get_bazaar', { p_booking: bookingId });
    // Only this connection's session: the default scope would sign the owner out of the browser too.
    await db.auth.signOut({ scope: 'local' });
    assert(!read.error && read.data?.summary, `get_bazaar: ${read.error?.message}`);
    return read.data.summary;
  };

  // U2: the owner leaves the till and comes back to it, a flavour that sells out leaves the grid and returns after a void,
  // cookies are added from the till, and the till's expense "Add" opens the day's fee form. Day 1 still has three cookies and
  // three sales; the sale and its void net to zero, and the void is sent before the review reads the day.
  await step(
    'Bazaar: leave the till and come back, sold out hidden then back after a void, Add cookies, the fee form',
    async () => {
      const till = page.locator('[data-screen-label="Bazaar Mode"]');
      const tile = till.getByRole('button', { name: new RegExp(flavour.short_name) });
      const stockOf = () => page.evaluate((id) => window.__hcOps.state.eventStock[id], FLAVOUR);
      assert((await stockOf()) === DAY_COOKIES - 3, 'Day 1 does not hold the three cookies left.');

      // Home: the day, its stock and the cart stay; Home shows the selling card; the way back is the card's button.
      await tile.first().click();
      await page.getByRole('button', { name: '← Home' }).click();
      await page.waitForFunction(() => window.__hcOps.state.screen === 'today');
      await check(page, 'Home, a day selling', 'Home');
      const held = await page.evaluate(() => ({
        day: window.__hcOps.state.event?.dayId ?? null,
        cart: window.__hcOps.state.cart
      }));
      assert(held.day, 'Leaving the till let go of the day: ' + JSON.stringify(held));
      assert(Object.values(held.cart).reduce((a, n) => a + n, 0) === 1, 'The open sale was lost.');
      const card = page.getByRole('region', { name: 'Bazaar' });
      await card.getByText(BOOKING_NAME, { exact: true }).waitFor();
      await card.getByText(pesoOf(DAY_PRICE_PESOS * 3)).waitFor();
      assert((await stockOf()) === DAY_COOKIES - 3, 'Leaving the till moved the stock.');
      // Another screen carries the banner, not the card.
      await page.evaluate(() => window.__hcOps.go('pnl'));
      await page.getByRole('button', { name: 'Back to the till', exact: true }).waitFor();
      assert(
        (await page.getByRole('region', { name: 'Bazaar' }).count()) === 0,
        'Card on P and L.'
      );
      await page.getByRole('button', { name: 'Back to the till', exact: true }).click();
      await till.waitFor();
      assert(
        (await page.evaluate(() => window.__hcOps.state.screen)) === 'bazaar' &&
          (await tile.count()) > 0,
        'Back to the till did not return to the same till.'
      );
      // Put the cookie back: the cart was only there to prove it survived.
      await till.getByRole('button', { name: 'One less' }).first().click();

      // Sold out: three cookies in one sale empty the table, the tile leaves the grid and the till says so.
      for (let i = 0; i < 3; i++) await tile.first().click();
      await page.getByRole('button', { name: 'Charge', exact: true }).click();
      await page.getByRole('button', { name: /^Cash/ }).last().click();
      await page.waitForFunction(() => (window.__hcOps.state.sales ?? []).length === 4);
      await page.getByText('Everything on the table is sold').waitFor();
      assert((await tile.count()) === 0, 'A sold-out flavour is still on the grid.');
      await page.getByRole('button', { name: 'Show sold out (1)' }).click();
      await till.getByText('Sold out', { exact: true }).waitFor();
      assert((await tile.count()) > 0, 'Show sold out did not bring the tile back.');
      await check(page, 'Bazaar, sold out shown', 'Bazaar Mode');
      await page.getByRole('button', { name: 'Hide sold out' }).click();
      assert((await tile.count()) === 0, 'Hide sold out left the tile on the grid.');

      // A void gives the cookies back: the tile returns on its own, and the empty state goes.
      await till.getByRole('button', { name: 'Void' }).first().click();
      await page.waitForFunction(() => (window.__hcOps.state.sales ?? []).length === 3);
      await page.getByText('Everything on the table is sold').waitFor({ state: 'detached' });
      await tile.first().waitFor();
      assert((await stockOf()) === DAY_COOKIES - 3, 'The void did not return the cookies.');
      // The void goes up before anything reads the day: its sale is flagged on the database.
      await assertEventually(async () => {
        const rows = await admin.from('event_sales').select('voided_at').eq('event_id', eventId);
        return !rows.error && rows.data.filter((r) => r.voided_at !== null).length === 1;
      }, 'the void of the sold-out sale');

      // Add cookies from the till: the day holds them on the database and the table has them.
      await page.getByRole('button', { name: 'Add cookies', exact: true }).first().click();
      const adding = page.getByRole('dialog', { name: 'Add cookies' });
      const addForm = adding.getByRole('form', { name: 'Add stock' });
      await addForm.waitFor();
      await addForm.getByLabel('How many').fill(String(ADDED_COOKIES));
      await addForm.getByRole('button', { name: 'Add to the table' }).click();
      await page.waitForFunction(
        ([id, want]) => window.__hcOps.state.eventStock[id] === want,
        [FLAVOUR, DAY_COOKIES - 3 + ADDED_COOKIES]
      );
      const dayRow = await admin
        .from('bazaar_day_lines')
        .select('made_qty, carried_qty')
        .eq('day_id', held.day)
        .eq('product_id', FLAVOUR)
        .single();
      assert(
        !dayRow.error && dayRow.data.made_qty === DAY_COOKIES + ADDED_COOKIES,
        `The day does not hold the added cookies: ${JSON.stringify(dayRow)}`
      );
      await adding.getByRole('button', { name: 'Done' }).click();
      await adding.waitFor({ state: 'detached' });

      // The expense "Add" opens the day's fee form, never the old expense sheet.
      await till.getByRole('button', { name: 'Add', exact: true }).click();
      const fees = page.getByRole('dialog', { name: 'Event fees' });
      await fees.getByRole('form', { name: 'Add a fee' }).waitFor();
      assert(
        (await page.evaluate(() => window.__hcOps.state.sheet?.kind ?? null)) === null,
        'The old expense sheet opened on a bazaar day.'
      );
      await fees.getByText(/^Total ₱/).waitFor();
      await fees.getByRole('button', { name: 'Done' }).click();
      await fees.waitFor({ state: 'detached' });
      await check(page, 'Bazaar, after Add cookies', 'Bazaar Mode');
    }
  );

  await step(
    'Bazaar: day 1 is reviewed, a loss is recorded, and it closes with cookies carried over',
    async () => {
      day1 = await page.evaluate(() => window.__hcOps.state.event.dayId);
      const bakedBefore = await page.evaluate(
        (id) => window.__hcOps.state.baked?.[id] ?? 0,
        FLAVOUR
      );
      await page.getByRole('button', { name: 'Close out', exact: true }).click();
      await review.waitFor();
      await check(page, 'Bazaar day review', 'Bazaar day review');
      assert(
        (await page.evaluate(() => window.__hcOps.state.sheet?.kind ?? null)) !== 'closeout',
        'The old close-out opened on a bazaar day.'
      );
      const taken = DAY_PRICE_PESOS * 3;
      await figureSays('This day', 'Revenue', pesoOf(taken));
      await figureSays('This day', 'Cash expected in the drawer', pesoOf(DAY_FLOAT_PESOS + taken));
      // Every figure opens into its parts.
      await figure('This day', 'Revenue').locator('summary').click();
      await figure('This day', 'Revenue').getByText('Before discounts and freebies').waitFor();
      // A flavour with no cost per cookie: profit is pending, in words, never a zero.
      const costs = await admin
        .from('bazaar_costs')
        .select('recipe_cents, typed_cents')
        .eq('scheduled_id', bookingId)
        .eq('product_id', FLAVOUR)
        .single();
      assert(!costs.error, `bazaar_costs: ${costs.error?.message}`);
      if (costs.data.recipe_cents === null && costs.data.typed_cents === null) {
        const profit = await figureSays('Event so far', 'Profit', 'Cost pending');
        assert(
          !/₱0(\.00)?(?![\d,])/.test(profit),
          `An unknown profit is shown as a zero: "${profit}".`
        );
      }

      const loss = page.getByRole('form', { name: 'Record a loss' });
      await loss.getByLabel('How many').fill('1');
      await loss.getByLabel('What happened').fill('Dropped at the stall');
      await loss.getByRole('button', { name: 'Record the loss' }).click();
      await review.getByText(/Dropped at the stall/).waitFor();
      const lost = await admin.from('bazaar_losses').select('qty, product_id').eq('day_id', day1);
      assert(
        !lost.error && lost.data.length === 1 && lost.data[0].qty === 1,
        `bazaar_losses: ${lost.error?.message ?? JSON.stringify(lost.data)}`
      );
      assert(
        (await page.evaluate((id) => window.__hcOps.state.eventStock[id], FLAVOUR)) === CARRIED,
        'The till still offers the cookie that was lost.'
      );

      const close = page.getByRole('form', { name: 'Close the day' });
      await close.getByLabel('Left', { exact: true }).fill(String(CARRIED));
      await close.getByLabel('Carried over', { exact: true }).fill(String(CARRIED));
      await close.getByLabel('Cash counted (₱)').fill(String(DAY_FLOAT_PESOS + taken));
      await close.getByRole('button', { name: 'Close the day', exact: true }).click();
      await page.waitForFunction(() => !window.__hcOps.state.event);
      await review.getByText('Closed', { exact: true }).waitFor();
      await figureSays('This day', 'Cash', 'Exact');
      await check(page, 'Bazaar day review, closed', 'Bazaar day review');
      const closed = await admin
        .from('events')
        .select('closed_at, counted_cents, variance_cents')
        .eq('id', eventId)
        .single();
      assert(
        !closed.error &&
          closed.data.closed_at !== null &&
          Number(closed.data.counted_cents) === (DAY_FLOAT_PESOS + taken) * 100 &&
          Number(closed.data.variance_cents) === 0,
        `The day did not close as counted: ${JSON.stringify(closed.data)}`
      );
      const counted = await admin
        .from('bazaar_day_lines')
        .select('left_qty, carry_next_qty, to_shop_qty, written_off_qty')
        .eq('day_id', day1)
        .single();
      assert(
        !counted.error &&
          counted.data.left_qty === CARRIED &&
          counted.data.carry_next_qty === CARRIED &&
          counted.data.to_shop_qty === 0 &&
          counted.data.written_off_qty === 0,
        `Her count was not stored as typed: ${JSON.stringify(counted.data)}`
      );
      // The phone let go of the day, and what was left did not go into the shop's baked stock.
      const after = await page.evaluate(
        (id) => ({
          saved: localStorage.getItem('hc-live-bazaar'),
          baked: window.__hcOps.state.baked?.[id] ?? 0
        }),
        FLAVOUR
      );
      assert(after.saved === null, 'The closed day is still saved on the phone.');
      assert(
        after.baked === bakedBefore,
        "The day's leftovers were put into the shop's baked stock."
      );
    }
  );

  await step(
    'the books hold the open bazaar back; day 2 carries the cookies in and sells through an offline reload',
    async () => {
      assert(await booksHoldIt(), 'The books do not say this bazaar is in progress.');
      await openBooking();
      await check(page, 'Bazaar event page, day 1 closed', 'Bazaar');
      const cost = page.getByRole('form', { name: /^Cost per cookie for / });
      await cost.getByLabel('Your cost per cookie (₱)').fill(String(COST_PESOS));
      await cost.getByRole('button', { name: 'Save the cost' }).click();
      await page.getByText(`${pesoOf(COST_PESOS)} per cookie · typed by you`).waitFor();
      const fee = page.getByRole('form', { name: 'Add a fee' });
      await fee.getByLabel('What for').fill('Permit');
      await fee.getByLabel('Amount (₱)').fill(String(FEE_PESOS));
      await fee.getByRole('button', { name: 'Add the fee' }).click();
      await page.getByText(/Permit · Whole event/).waitFor();
      const target = page.getByRole('form', { name: 'Target profit' });
      await target.getByLabel('Target (₱)').fill('500');
      await target.getByRole('button', { name: 'Save the target' }).click();
      await assertEventually(async () => {
        const { data } = await admin
          .from('scheduled_events')
          .select('target_profit_cents')
          .eq('id', bookingId)
          .single();
        return Number(data?.target_profit_cents) === 50000;
      }, 'the target profit');

      await page.locator('[aria-labelledby="bazaar-plan"] button').first().click();
      const form = page.getByRole('form', { name: /^Plan for / });
      await form.waitFor();
      const card = form
        .getByText(flavour.short_name, { exact: true })
        .locator('xpath=ancestor::li[1]');
      assert(
        (await card.getByLabel('Carried over').inputValue()) === String(CARRIED),
        'Day 2 does not start from what day 1 set aside.'
      );
      await form.getByLabel('Drawer float (₱)').fill(String(DAY2_FLOAT_PESOS));
      await card.getByLabel('Made').fill(String(DAY2_MADE));
      await card.getByLabel('Price (₱)').fill(String(DAY2_PRICE_PESOS));
      await form.getByRole('button', { name: 'Save the plan' }).click();
      // Day 1 also had this many on its table: read day 2's own card.
      await page
        .getByRole('list', { name: 'Days', exact: true })
        .locator(':scope > li')
        .nth(1)
        .getByText(`${DAY2_MADE + CARRIED} cookies on the table`)
        .waitFor();
      await page.getByRole('button', { name: 'Start this day', exact: true }).click();
      await page.waitForFunction((d) => {
        const event = window.__hcOps.state.event;
        return !!event?.dayId && event.dayId !== d;
      }, day1);
      await page.locator('[data-screen-label="Bazaar Mode"]').waitFor();
      const day2Event = await page.evaluate(() => window.__hcOps.state.event.id);
      assert(day2Event !== eventId, "Day 2 is selling on day 1's event.");
      const started = await page.evaluate(
        (id) => ({
          stock: window.__hcOps.state.eventStock[id],
          price: window.__hcOps.state.eventPrices[id],
          float: window.__hcOps.state.drawer?.float
        }),
        FLAVOUR
      );
      assert(
        started.stock === DAY2_MADE + CARRIED &&
          started.price === DAY2_PRICE_PESOS &&
          started.float === DAY2_FLOAT_PESOS,
        `Day 2 did not start as planned: ${JSON.stringify(started)}`
      );
      await sellOne(1);
      await assertEventually(async () => (await salesInDb(day2Event)).length === 1, "day 2's sale");

      offline = true;
      await context.setOffline(true);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('[data-screen-label="Bazaar Mode"]').waitFor();
      await page.waitForFunction(() => (window.__hcOps?.state.sales ?? []).length === 1);
      // The saved copy of the bazaar does not keep the drawer: the float comes back from the day.
      assert(
        (await page.evaluate(() => window.__hcOps.state.drawer?.float)) === DAY2_FLOAT_PESOS,
        'The drawer float was lost in the reload.'
      );
      await sellOne(2);
      await check(page, 'Bazaar day 2, offline after a reload', 'Bazaar Mode');
      await context.setOffline(false);
      offline = false;
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await assertEventually(
        async () => (await salesInDb(day2Event)).length === 2,
        "day 2's offline sale"
      );
      await page.waitForFunction(() => window.__hcOps.state.unsynced === 0);
      eventId = day2Event;
    }
  );

  await step('day 2 closes, the event is closed, and only then do the books count it', async () => {
    const recipe = await admin.from('recipes').select('product_id').eq('product_id', FLAVOUR);
    assert(!recipe.error, `recipes: ${recipe.error?.message}`);
    // A flavour is sent to the shop only when it has a recipe: the cookies become a batch of the drop.
    const toShop = recipe.data.length ? 1 : 0;
    const left = DAY2_MADE + CARRIED - 2;
    const taken = DAY2_PRICE_PESOS * 2;
    await page.goto(`${base}/bazaar`, { waitUntil: 'networkidle' });
    await page.locator('[data-screen-label="Bazaar Mode"]').waitFor();
    await page.getByRole('button', { name: 'Close out', exact: true }).click();
    await review.waitFor();
    const close = page.getByRole('form', { name: 'Close the day' });
    await close.waitFor();
    await bazaarFits('Bazaar day review, open', 'Bazaar day review');
    // The day's figures on screen are the database's own, to the centavo.
    const open = (await summaryNow()).days.find((d) => d.state === 'open');
    await figureSays('This day', 'Revenue', pesoOf(open.revenue_cents / 100));
    await figureSays(
      'This day',
      'Cash expected in the drawer',
      pesoOf(open.cash_expected_cents / 100)
    );
    await figureSays('This day', 'Fees for this day', pesoOf(open.fees_cents / 100));
    assert(
      (await close.getByLabel('Carried over', { exact: true }).count()) === 0,
      "The booking's last day offers a carry-over."
    );
    await close.getByLabel('Left', { exact: true }).fill(String(left));
    await close.getByLabel('To the shop', { exact: true }).fill(String(toShop));
    await close.getByLabel('Written off', { exact: true }).fill(String(left - toShop));
    await close.getByLabel('Cash counted (₱)').fill(String(DAY2_FLOAT_PESOS + taken + 5));
    await close.getByRole('button', { name: 'Close the day', exact: true }).click();
    await page.waitForFunction(() => !window.__hcOps.state.event);
    // The phone lets go of the day at once; the review shows the closed day once it has been read again.
    await review.getByText('Closed', { exact: true }).waitFor();
    await figureSays('This day', 'Cash', pesoOf(5) + ' over');
    await page.getByRole('button', { name: /Back to the event/ }).click();
    await page.getByRole('heading', { level: 1, name: BOOKING_NAME }).waitFor();
    await check(page, 'Bazaar event page, both days closed', 'Bazaar');

    // The event, against this run's own sums.
    const revenue = DAY_PRICE_PESOS * 3 + taken;
    const fees = RENT_PESOS + FEE_PESOS;
    const cookieCost = (DAY_COOKIES + ADDED_COOKIES + DAY2_MADE - toShop) * COST_PESOS;
    const profit = revenue - fees - cookieCost + 5;
    await figureSays('The event', 'Revenue', pesoOf(revenue));
    await figureSays('The event', 'Fees', pesoOf(fees));
    await figureSays('The event', 'Cookie cost', pesoOf(cookieCost));
    await figureSays('The event', 'Profit', pesoOf(profit));
    await figureSays(
      'The event',
      'Against the target',
      profit < 500 ? pesoOf(500 - profit) + ' under the target' : pesoOf(profit - 500) + ' over'
    );

    // Each figure on screen is the database's own summary, to the centavo, and that summary equals this run's sums.
    const sum = await summaryNow();
    assert(
      sum.revenue.revenue_cents === revenue * 100 &&
        sum.fees.total_cents === fees * 100 &&
        sum.cookie_cost.cents === cookieCost * 100 &&
        sum.profit.cents === profit * 100,
      `The database's summary differs from this run's sums: ${JSON.stringify({ revenue: sum.revenue.revenue_cents, fees: sum.fees.total_cents, cost: sum.cookie_cost.cents, profit: sum.profit.cents })}`
    );
    await figureSays('The event', 'Revenue', pesoOf(sum.revenue.revenue_cents / 100));
    await figureSays('The event', 'Fees', pesoOf(sum.fees.total_cents / 100));
    await figureSays('The event', 'Cookie cost', pesoOf(sum.cookie_cost.cents / 100));
    await figureSays('The event', 'Profit', pesoOf(sum.profit.cents / 100));
    const before = await admin
      .from('ledger_entries')
      .select('id')
      .eq('category', 'Bazaar rent')
      .like('memo', BOOKING_NAME + '%');
    assert(
      !before.error && before.data.length === 0,
      'The rent reached the books before the event was closed.'
    );
    await page.getByRole('button', { name: 'Close the event', exact: true }).click();
    await page.getByRole('button', { name: 'Yes, close the event', exact: true }).click();
    await page.getByText(/This event is closed\./).waitFor();
    await check(page, 'Bazaar event page, closed', 'Bazaar');
    await bazaarFits('Bazaar event page, closed', 'Bazaar');
    const booked = await admin
      .from('scheduled_events')
      .select('finalised_at, final_hash')
      .eq('id', bookingId)
      .single();
    assert(
      !booked.error &&
        booked.data.finalised_at !== null &&
        /^[0-9a-f]{64}$/.test(booked.data.final_hash),
      `The event was not closed: ${JSON.stringify(booked.data)}`
    );
    const rent = await admin
      .from('ledger_entries')
      .select('amount_cents')
      .eq('category', 'Bazaar rent')
      .like('memo', BOOKING_NAME + '%');
    assert(
      !rent.error &&
        rent.data.length === 1 &&
        Number(rent.data[0].amount_cents) === -RENT_PESOS * 100,
      `The rent is not in the books once: ${JSON.stringify(rent.data)}`
    );
    // U6 (A4): the drawer difference is booked in its own category, never as a sale.
    const drawer = await admin
      .from('ledger_entries')
      .select('kind, category, memo')
      .like('memo', BOOKING_NAME + '%drawer%');
    assert(
      !drawer.error &&
        drawer.data.every((l) => l.category === 'Cash variance' && l.kind !== 'sale'),
      `The drawer difference is not in its own category: ${JSON.stringify(drawer.data)}`
    );
    if (toShop) {
      const batch = await admin
        .from('production_records')
        .select('kind, qty')
        .eq('ref', 'bazaar:' + bookingId)
        .eq('kind', 'batch');
      assert(
        !batch.error && batch.data.length === 1 && Number(batch.data[0].qty) === toShop,
        `The cookies sent to the shop are not a batch: ${JSON.stringify(batch.data)}`
      );
    }
    // The books: nothing held back any more, and the bazaar's lines are counted.
    assert(!(await booksHoldIt()), 'The books still hold the closed bazaar back.');
    const counted = await page.evaluate(
      (name) =>
        (window.__hcOps.state.ledger ?? []).filter((l) => String(l.label).includes(name)).length,
      BOOKING_NAME
    );
    assert(
      counted >= 2,
      `The closed bazaar's rent and fee are not in the books (${counted} lines).`
    );
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
