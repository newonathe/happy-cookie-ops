import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  HELPER_EMAIL,
  admin,
  HELPER_PASSWORD,
  createHelperViaRpc,
  endHelperAccess,
  ensureOwner,
  serverSales,
  signInAsOwner
} from './stack';
import { seedScenarioA } from './fixture-a';
import { resetScenarioC } from './fixture-c';

/**
 * Scenario D (S4 follow-up, 20 November 2026): the bazaar day on several devices and for a helper, in real browsers on the local stack
 * (docs/TESTING.md, "Browser scenarios"). Five tests, each starting from an empty bazaar:
 *   1. the owner on two devices (two browser profiles) sells the same day;
 *   2. a helper registered through the owner RPCs sells, takes back their own sale only, reaches nothing else, and closes the day;
 *   2b. a refused void leaves the owner's sale and the table count intact;
 *   3. a helper's offline sale, stamped before the owner closed the day, is accepted once when it replays after the close;
 *   4. a helper whose access has ended is told so.
 * The Edge Function is not deployed locally, so `createHelperViaRpc` (stack.ts) plays it with the service key after the owner's
 * `add_helper` call. Server rows are read with the service role, never from app code.
 */
const oat = (page: Page) => page.getByRole('button', { name: /^Oat, / });
const choc = (page: Page) => page.getByRole('button', { name: /^Choc, / });
const sold = (page: Page) => page.getByRole('button', { name: /^Sale \d+,/ });

async function charge(page: Page, items: Array<'oat' | 'choc'>): Promise<void> {
  for (const item of items) await (item === 'oat' ? oat(page) : choc(page)).click();
  await page
    .getByRole('button', { name: /^Charge/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Cash', exact: true }).click();
}

async function resetBazaar(): Promise<void> {
  await ensureOwner();
  seedScenarioA();
  resetScenarioC();
}

/** The owner plans today's day (20 Oat, 10 Choc on the table), starts it and lands on the till. */
async function startDay(owner: Page, name: string): Promise<void> {
  await owner.goto('/bazaar');
  await owner.getByRole('button', { name: 'Add an event' }).click();
  await owner.getByLabel('Name').fill(name);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  await owner.getByLabel('First day').fill(today);
  await owner.getByLabel('Stall rent').fill('300');
  await owner.getByRole('button', { name: 'Review event' }).click();
  await owner.getByRole('button', { name: 'Save event' }).click();
  await owner
    .getByRole('button', { name: /Open event/ })
    .first()
    .click();
  await owner
    .getByRole('button', { name: /^[A-Z][a-z]{2}, \d+ [A-Z][a-z]{2}/ })
    .first()
    .click();
  for (let i = 0; i < 5; i++)
    await owner.getByRole('button', { name: 'More Drawer float' }).click();
  for (let i = 0; i < 20; i++) await owner.getByRole('button', { name: 'More Oat made' }).click();
  for (let i = 0; i < 10; i++) await owner.getByRole('button', { name: 'More Choc made' }).click();
  await owner.getByRole('button', { name: /^Save the plan/ }).click();
  await expect(owner.getByText('Plan saved.')).toBeVisible();
  await owner.getByRole('button', { name: /^Start the day/ }).click();
  await owner.getByRole('button', { name: /^Resume selling/ }).click();
  await expect(oat(owner)).toBeVisible();
}

async function closeDay(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Close day', exact: true }).click();
  await page.getByRole('button', { name: 'Close the day' }).last().click();
}

async function signInAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
}

async function newDevice(browser: Browser): Promise<{
  context: BrowserContext;
  page: Page;
}> {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

test.describe.configure({ mode: 'serial' });

test('SCENARIO D1: the owner on two devices sells one day', async ({ browser }) => {
  await resetBazaar();
  const a = (await newDevice(browser)).page;
  const b = (await newDevice(browser)).page;
  await signInAsOwner(a);
  await startDay(a, 'D1 Fair');

  // ---- device A sells two: 2 Oat + 1 Choc, then 1 Oat. Table stock: 20 - 3 = 17 Oat, 10 - 1 = 9 Choc.
  await charge(a, ['oat', 'oat', 'choc']);
  await expect(a.getByText('₱370 sale recorded.')).toBeVisible();
  await charge(a, ['oat']);
  await expect(sold(a)).toHaveCount(2);
  await expect.poll(async () => (await serverSales()).length, { timeout: 20000 }).toBe(2);

  // ---- device B (same owner, other profile) opens the day and sees both sales and the reduced stock
  await signInAsOwner(b);
  await b.goto('/bazaar');
  await b
    .getByRole('button', { name: /Open event/ })
    .first()
    .click();
  const dayButton = b.getByRole('button', { name: /^[A-Z][a-z]{2}, \d+ [A-Z][a-z]{2}/ }).first();
  const takeOver = b.getByRole('button', { name: 'Sell on this device' });
  await expect(oat(b).or(dayButton).or(takeOver)).toBeVisible({ timeout: 20000 });
  if (!(await oat(b).isVisible()) && (await dayButton.isVisible())) await dayButton.click();
  await expect(oat(b).or(takeOver)).toBeVisible({ timeout: 20000 });
  if (!(await oat(b).isVisible())) await takeOver.click();
  await expect(sold(b)).toHaveCount(2);
  await expect(oat(b)).toContainText('17');
  await expect(choc(b)).toContainText('9');

  // ---- B sells one; A, reloaded, shows three
  await charge(b, ['choc']);
  await expect(sold(b)).toHaveCount(3);
  await expect.poll(async () => (await serverSales()).length, { timeout: 20000 }).toBe(3);
  await a.reload();
  await expect(sold(a)).toHaveCount(3, { timeout: 20000 });
  await expect(choc(a)).toContainText('8');
  const sales = await serverSales();
  expect(new Set(sales.map((s) => s.client_id)).size).toBe(3);
});

test('SCENARIO D2: a helper sells, takes back only their own sale, reaches nothing else, and closes the day', async ({
  browser
}) => {
  await resetBazaar();
  const ownerPage = (await newDevice(browser)).page;
  await signInAsOwner(ownerPage);
  await startDay(ownerPage, 'D2 Fair');
  await charge(ownerPage, ['oat']);
  await expect.poll(async () => (await serverSales()).length, { timeout: 20000 }).toBe(1);
  const ownerSale = (await serverSales())[0];

  const helperId = await createHelperViaRpc(2);
  const helper = (await newDevice(browser)).page;
  await signInAs(helper, HELPER_EMAIL, HELPER_PASSWORD);

  // ---- lands on Bazaar, on the open day only: the till with the owner's sale
  await expect(helper).toHaveURL(/\/bazaar/);
  await expect(oat(helper)).toBeVisible({ timeout: 30000 });
  await expect(sold(helper)).toHaveCount(1, { timeout: 20000 });
  await expect(helper.getByRole('button', { name: 'Add an event' })).toHaveCount(0);
  await expect(helper.getByRole('button', { name: /Open event/ })).toHaveCount(0);

  // ---- no way to Home, Sell, Money or past events: each address brings the till back
  for (const path of ['/', '/sales', '/pnl', '/orders', '/settings']) {
    await helper.goto(path);
    await expect(oat(helper)).toBeVisible({ timeout: 30000 });
    await expect(helper.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0);
  }

  // ---- the helper sells, then takes back their own sale
  await charge(helper, ['choc', 'choc']);
  await expect(sold(helper)).toHaveCount(2, { timeout: 20000 });
  await expect.poll(async () => (await serverSales()).length, { timeout: 20000 }).toBe(2);
  const own = (await serverSales()).find((s) => s.recorded_by === helperId);
  expect(own).toBeDefined();
  expect(ownerSale.recorded_by).not.toBe(helperId);

  // Their own sale (the two Choc, ₱260) can be.
  await helper.getByRole('button', { name: /^Sale \d+, ₱260/ }).click();
  await helper.getByRole('button', { name: 'Void this sale' }).click();
  await helper.getByRole('button', { name: 'Confirm void' }).click();
  await expect
    .poll(async () => (await serverSales()).filter((s) => s.voided_at).map((s) => s.client_id), {
      timeout: 20000
    })
    .toEqual([own?.client_id]);
  expect((await serverSales()).find((s) => s.client_id === ownerSale.client_id)?.voided_at).toBe(
    null
  );

  // ---- the helper closes the day
  await closeDay(helper);
  await expect(helper.getByText('No bazaar day is open right now')).toBeVisible({
    timeout: 30000
  });
});

test('SCENARIO D2b: a helper cannot take back the owner sale, and the till stays true to the server', async ({
  browser
}) => {
  await resetBazaar();
  const ownerPage = (await newDevice(browser)).page;
  await signInAsOwner(ownerPage);
  await startDay(ownerPage, 'D2b Fair');
  await charge(ownerPage, ['oat']);
  await expect.poll(async () => (await serverSales()).length, { timeout: 20000 }).toBe(1);
  await createHelperViaRpc(2);
  const helper = (await newDevice(browser)).page;
  await signInAs(helper, HELPER_EMAIL, HELPER_PASSWORD);
  await expect(sold(helper)).toHaveCount(1, { timeout: 30000 });
  await helper.getByRole('button', { name: /^Sale \d+, ₱120/ }).click();
  await helper.getByRole('button', { name: 'Void this sale' }).click();
  await helper.getByRole('button', { name: 'Confirm void' }).click();
  await expect(helper.getByText('The server declined a void.', { exact: false })).toBeVisible();
  await expect(sold(helper)).toHaveCount(1);
  await expect(oat(helper)).toContainText('19');
  expect((await serverSales()).filter((s) => s.voided_at)).toHaveLength(0);
  await helper.reload();
  await expect(sold(helper)).toHaveCount(1, { timeout: 20000 });
  await expect(oat(helper)).toContainText('19');
});

test('SCENARIO D3: a helper sale rung offline before the owner closed is accepted once after the close', async ({
  browser
}) => {
  await resetBazaar();
  const ownerPage = (await newDevice(browser)).page;
  await signInAsOwner(ownerPage);
  await startDay(ownerPage, 'D3 Fair');

  await createHelperViaRpc(2);
  const { context, page: helper } = await newDevice(browser);
  await signInAs(helper, HELPER_EMAIL, HELPER_PASSWORD);
  await expect(oat(helper)).toBeVisible({ timeout: 30000 });
  // (The helper's app does not install the offline service worker - a known S3 limit - so the page stays open while offline.)

  // ---- offline: the helper rings a sale; it waits on the phone and nothing reaches the server
  await context.setOffline(true);
  await charge(helper, ['oat']);
  await expect(helper.getByText('Waiting to send')).toBeVisible();
  expect(await serverSales()).toHaveLength(0);

  // ---- the owner closes the day while the helper is still offline
  await closeDay(ownerPage);
  await expect(ownerPage.getByRole('heading', { name: /^Review · / })).toBeVisible({
    timeout: 30000
  });
  const closedRow = async () =>
    (await admin().from('events').select('closed_at').not('closed_at', 'is', null)).data?.[0]
      ?.closed_at as string | undefined;
  await expect.poll(closedRow, { timeout: 30000 }).toBeTruthy();
  const closedAt = (await closedRow()) as string;

  // ---- the helper reconnects: the sale (stamped before the close) is accepted, once, by client id
  await context.setOffline(false);
  await helper.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(async () => (await serverSales()).length, { timeout: 30000 }).toBe(1);
  await helper.waitForTimeout(1500);
  await helper.evaluate(() => window.dispatchEvent(new Event('online')));
  await helper.waitForTimeout(1500);
  const after = await serverSales();
  expect(after).toHaveLength(1);
  expect(new Date(after[0].sold_at).getTime()).toBeLessThanOrEqual(new Date(closedAt).getTime());
  expect(after[0].voided_at).toBeNull();
});

test('SCENARIO D4: a helper whose access has ended is told so', async ({ browser }) => {
  await resetBazaar();
  const ownerPage = (await newDevice(browser)).page;
  await signInAsOwner(ownerPage);
  await startDay(ownerPage, 'D4 Fair');

  const helperId = await createHelperViaRpc(2);
  const helper = (await newDevice(browser)).page;
  await signInAs(helper, HELPER_EMAIL, HELPER_PASSWORD);
  await expect(oat(helper)).toBeVisible({ timeout: 30000 });

  // `set_helper_expiry` refuses a past time by design, so the end is set with the service role.
  await endHelperAccess(helperId);
  await helper.reload();
  await expect(helper.getByText('Your access has ended')).toBeVisible({ timeout: 30000 });
});
