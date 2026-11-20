import { expect, test, type Page } from '@playwright/test';
import { ensureOwner, signInAsOwner, sql } from './stack';
import { seedScenarioA } from './fixture-a';
import { resetScenarioC } from './fixture-c';

/**
 * S3 (20 November 2026): a helper Cine registers. The owner starts a bazaar day and adds a helper with an expiry (the Edge Function
 * `create-helper-account` served locally by `supabase functions serve`); the helper signs in, chooses their own password, lands on
 * the open day, sells, takes back their own sale, adds a stall expense and closes the day, and reaches nothing else. An expired
 * helper is told "Your access has ended". Local stack and a live-mode build only (docs/TESTING.md, "Browser scenarios").
 * Screenshots go to HC_SCN_SHOTS (default: none); HC_SCN_VIEWPORT=WxH sets the size (phone 390x844, wide 1440x900).
 */
const HELPER_EMAIL = 'helper.qa@example.test';
const NEW_PASSWORD = 'qa-helper-own-password';
const oat = (page: Page) => page.getByRole('button', { name: /^Oat, / });
const choc = (page: Page) => page.getByRole('button', { name: /^Choc, / });
const sold = (page: Page) => page.getByRole('button', { name: /^Sale \d+,/ });
const shots = process.env.HC_SCN_SHOTS;
// HC_SCN_VIEWPORT=390x844 runs the whole scenario at that size (default: the desktop project's).
const size = /^(\d+)x(\d+)$/.exec(process.env.HC_SCN_VIEWPORT ?? '');
const viewport = size ? { width: Number(size[1]), height: Number(size[2]) } : undefined;
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: false });
};

async function charge(page: Page, items: Array<'oat' | 'choc'>): Promise<void> {
  for (const item of items) await (item === 'oat' ? oat(page) : choc(page)).click();
  await page
    .getByRole('button', { name: /^Charge/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Cash', exact: true }).click();
}

test('SCENARIO H: a helper with an expiry sells the open day, closes it, and reaches nothing else', async ({
  browser
}) => {
  await ensureOwner();
  seedScenarioA();
  resetScenarioC();
  sql(`delete from public.helper_invites`);
  const closedByHelperBefore = Number(
    sql(
      `select count(*) from public.audit_log where action = 'bazaar.day_closed' and (detail->>'by_helper') = 'true'`
    )
  );
  sql(`delete from auth.users where email = '${HELPER_EMAIL}'`);
  const owner = await (await browser.newContext({ viewport })).newPage();
  const helper = await (await browser.newContext({ viewport })).newPage();
  await signInAsOwner(owner);

  // ---- the owner plans and starts today's day: 20 Oat and 10 Choc on the table
  await owner.goto('/bazaar');
  await owner.getByRole('button', { name: 'Add an event' }).click();
  await owner.getByLabel('Name').fill('Helper Fair');
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
  await charge(owner, ['oat']);
  await expect
    .poll(() => sql(`select count(*) from public.event_sales`), { timeout: 20000 })
    .toBe('1');

  // ---- the owner adds a helper for 3 days, on the People page
  await owner.goto('/settings');
  await owner.getByText('People & access').first().click();
  await owner.getByRole('button', { name: 'Open Who can see what' }).click();
  await expect(
    owner.getByRole('heading', { name: 'Helpers' }).or(owner.getByText('Helpers').first())
  ).toBeVisible();
  await owner.getByLabel('Email').fill(HELPER_EMAIL);
  await owner.getByLabel('Lasts').fill('3');
  await owner.getByLabel('Unit').selectOption('days');
  await shot(owner, 'owner-people-add');
  await owner.getByRole('button', { name: 'Add helper' }).click();
  const shown = owner.getByTestId('temporary-password');
  await expect(shown).toBeVisible({ timeout: 20000 });
  const temporary = (await shown.textContent()) ?? '';
  expect(temporary).toHaveLength(14);
  await shot(owner, 'owner-people-password');
  // The profile is a helper with an expiry about three days away, and the invite is gone.
  expect(
    sql(
      `select p.role || '|' || p.active || '|' || (p.access_expires_at > now() + interval '2 days 23 hours' and p.access_expires_at < now() + interval '3 days 1 hour') from public.profiles p join auth.users u on u.id = p.id where u.email = '${HELPER_EMAIL}'`
    )
  ).toBe('helper|true|true');
  expect(sql(`select count(*) from public.helper_invites`)).toBe('0');
  await owner.getByRole('button', { name: 'Done' }).click();
  await expect(owner.getByText(HELPER_EMAIL)).toBeVisible();
  await expect(owner.getByText(/^Ends in 3 days$|^Ends in 72 hours$/)).toBeVisible();

  // ---- the helper signs in with the temporary password: they must choose their own before anything opens
  await helper.goto('/sign-in');
  await helper.getByLabel('Email').fill(HELPER_EMAIL);
  await helper.getByLabel('Password', { exact: true }).fill(temporary);
  await helper.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(helper.getByText('Choose your own password')).toBeVisible({ timeout: 20000 });
  await shot(helper, 'helper-set-password');
  await helper.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
  await helper.getByLabel('New password again').fill(NEW_PASSWORD);
  await helper.getByRole('button', { name: 'Save password' }).click();

  // ---- and lands straight on the open day: the till, with the sale the owner rang
  await expect(helper).toHaveURL(/\/bazaar/);
  await expect(oat(helper)).toBeVisible({ timeout: 30000 });
  await expect(sold(helper)).toHaveCount(1, { timeout: 20000 });
  await shot(helper, 'helper-till');
  // No way to the rest of the app: not Home, not the events list.
  await helper.goto('/orders');
  await expect(oat(helper)).toBeVisible({ timeout: 30000 });
  await helper.goto('/pnl');
  await expect(oat(helper)).toBeVisible({ timeout: 30000 });
  // The till's own "Settings" button is the till's panel (not the app's Settings), and "Back to selling" returns to the till.
  await helper.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(helper.getByRole('heading', { name: 'Selling settings' })).toBeVisible();
  await helper.getByRole('button', { name: 'Back to selling' }).click();
  await expect(oat(helper)).toBeVisible({ timeout: 30000 });
  for (const owner of ['Main navigation', 'Account'])
    await expect(helper.getByRole('navigation', { name: owner })).toHaveCount(0);
  await expect(helper.getByRole('heading', { name: /People|Orders|Money|Stock/ })).toHaveCount(0);
  await expect(helper.getByRole('button', { name: 'Add an event' })).toHaveCount(0);

  // ---- the helper sells, then takes back their own sale
  await charge(helper, ['choc', 'choc']);
  await expect(sold(helper)).toHaveCount(2, { timeout: 20000 });
  await expect
    .poll(
      () =>
        sql(
          `select count(*) from public.event_sales where recorded_by = (select id from auth.users where email = '${HELPER_EMAIL}')`
        ),
      { timeout: 20000 }
    )
    .toBe('1');
  await sold(helper).first().click();
  await helper.getByRole('button', { name: 'Void this sale' }).click();
  await helper.getByRole('button', { name: 'Confirm void' }).click();
  await expect
    .poll(() => sql(`select count(*) from public.event_sales where voided_at is not null`), {
      timeout: 20000
    })
    .toBe('1');
  await shot(helper, 'helper-after-void');

  // ---- the helper closes the day with a count
  await helper.getByRole('button', { name: 'Close day', exact: true }).click();
  await expect(
    helper
      .getByRole('heading', { name: /Close the day/ })
      .or(helper.getByText('Close the day').first())
  ).toBeVisible();
  await shot(helper, 'helper-close');
  await helper.getByRole('button', { name: 'Close the day' }).last().click();
  await expect
    .poll(() => sql(`select count(*) from public.events where closed_at is not null`), {
      timeout: 30000
    })
    .toBe('1');
  await expect(helper.getByText('No bazaar day is open right now')).toBeVisible({ timeout: 30000 });
  await shot(helper, 'helper-no-day');
  expect(
    sql(
      `select count(*) from public.audit_log where action = 'bazaar.day_closed' and (detail->>'by_helper') = 'true'`
    )
  ).toBe(String(closedByHelperBefore + 1));

  // ---- the owner's access ends: the helper is told so
  sql(
    `update public.profiles set access_expires_at = now() - interval '1 minute' where id = (select id from auth.users where email = '${HELPER_EMAIL}')`
  );
  await helper.reload();
  await expect(helper.getByText('Your access has ended')).toBeVisible({ timeout: 30000 });
  await shot(helper, 'helper-ended');
  // The owner extends it again from the People page and the helper is back in.
  await owner.reload();
  await owner.goto('/settings');
  await owner.getByText('People & access').first().click();
  await owner.getByRole('button', { name: 'Open Who can see what' }).click();
  await expect(
    owner.getByText('Ended 1 hour ago').or(owner.getByText(/^Ended \d+ hours? ago$/))
  ).toBeVisible({ timeout: 20000 });
  await owner.getByRole('button', { name: 'Give more time' }).click();
  await owner.getByLabel('Lasts').first().fill('2');
  await owner.getByRole('button', { name: 'Save expiry' }).click();
  await expect(
    owner.getByText('Ends in 2 days').or(owner.getByText(/^Ends in 48 hours$/))
  ).toBeVisible({ timeout: 20000 });
  await helper.reload();
  await expect(helper.getByText('Your access has ended')).toHaveCount(0, { timeout: 30000 });
});
