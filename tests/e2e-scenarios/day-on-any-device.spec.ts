import { expect, test, type Page } from '@playwright/test';
import { ensureOwner, signInAsOwner, sql } from './stack';
import { seedScenarioA } from './fixture-a';
import { resetScenarioC } from './fixture-c';

/**
 * S2 (19 November 2026): a bazaar selling day belongs to the account, not the device. The owner opens the same day in two
 * separate browser profiles (two devices: each has its own storage and device id), sees every sale and the true table stock in
 * both, and sells from both. Local stack and a live-mode build only (docs/TESTING.md, "Browser scenarios").
 */
const sold = (page: Page) => page.getByRole('button', { name: /^Sale \d+,/ });
const oat = (page: Page) => page.getByRole('button', { name: /^Oat, / });
const choc = (page: Page) => page.getByRole('button', { name: /^Choc, / });

async function charge(page: Page, items: Array<'oat' | 'choc'>): Promise<void> {
  for (const item of items) await (item === 'oat' ? oat(page) : choc(page)).click();
  await page
    .getByRole('button', { name: /^Charge/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Cash', exact: true }).click();
}

test('SCENARIO D: one selling day, two devices, one account', async ({ browser }) => {
  await ensureOwner();
  seedScenarioA();
  resetScenarioC();
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await signInAsOwner(a);

  // ---- device A plans and starts the day: 10 Oat and 5 Choc on the table
  await a.goto('/bazaar');
  await a.getByRole('button', { name: 'Add an event' }).click();
  await a.getByLabel('Name').fill('SD Fair');
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  await a.getByLabel('First day').fill(today);
  await a.getByLabel('Stall rent').fill('300');
  await a.getByRole('button', { name: 'Review event' }).click();
  await a.getByRole('button', { name: 'Save event' }).click();
  await a
    .getByRole('button', { name: /Open event/ })
    .first()
    .click();
  await a
    .getByRole('button', { name: /^[A-Z][a-z]{2}, \d+ [A-Z][a-z]{2}/ })
    .first()
    .click();
  for (let i = 0; i < 5; i++) await a.getByRole('button', { name: 'More Drawer float' }).click();
  for (let i = 0; i < 10; i++) await a.getByRole('button', { name: 'More Oat made' }).click();
  for (let i = 0; i < 5; i++) await a.getByRole('button', { name: 'More Choc made' }).click();
  await a.getByRole('button', { name: /^Save the plan/ }).click();
  await expect(a.getByText('Plan saved.')).toBeVisible();
  await a.getByRole('button', { name: /^Start the day/ }).click();
  await a.getByRole('button', { name: /^Resume selling/ }).click();

  // ---- device A sells two: 2 Oat + 1 Choc, then 1 Oat
  await charge(a, ['oat', 'oat', 'choc']);
  await expect(a.getByText('₱370 sale recorded.')).toBeVisible();
  await charge(a, ['oat']);
  await expect(sold(a)).toHaveCount(2);
  await expect
    .poll(() => sql(`select count(*) from public.event_sales`), { timeout: 20000 })
    .toBe('2');

  // ---- device B: a second browser profile, signed in as the same account, opens the same day
  await signInAsOwner(b);
  await b.goto('/bazaar');
  await b
    .getByRole('button', { name: /Open event/ })
    .first()
    .click();
  // The till may come up at once, or ask for the day and "Sell on this device"; either way nothing is moved.
  const dayButton = b.getByRole('button', { name: /^[A-Z][a-z]{2}, \d+ [A-Z][a-z]{2}/ }).first();
  const takeOver = b.getByRole('button', { name: 'Sell on this device' });
  await expect(oat(b).or(dayButton).or(takeOver)).toBeVisible({ timeout: 20000 });
  if (!(await oat(b).isVisible()) && (await dayButton.isVisible())) await dayButton.click();
  await expect(oat(b).or(takeOver)).toBeVisible({ timeout: 20000 });
  if (!(await oat(b).isVisible())) await takeOver.click();
  // Both sales, with the table stock the server works out: 10 - 3 = 7 Oat, 5 - 1 = 4 Choc.
  await expect(sold(b)).toHaveCount(2);
  await expect(oat(b)).toContainText('7');
  await expect(choc(b)).toContainText('4');
  // Opening it here moved nothing: the day's record still names A's device as the one that started it.
  expect(sql(`select count(*) from public.audit_log where action = 'event.device_changed'`)).toBe(
    '0'
  );

  // ---- device B sells one; both devices sell the same day with no duplicate
  await charge(b, ['choc']);
  await expect(sold(b)).toHaveCount(3);
  await expect
    .poll(
      () => sql(`select count(*) || '|' || count(distinct client_id) from public.event_sales`),
      {
        timeout: 20000
      }
    )
    .toBe('3|3');

  // ---- device A, back in the foreground, shows all three and the new stock (no reload)
  await a.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(sold(a)).toHaveCount(3, { timeout: 20000 });
  await expect(choc(a)).toContainText('3');

  // ---- device A voids the sale that B rang: it goes from both, once
  await sold(a).first().click();
  await a.getByRole('button', { name: 'Void this sale' }).click();
  await a.getByRole('button', { name: 'Confirm void' }).click();
  await expect
    .poll(() => sql(`select count(*) from public.event_sales where voided_at is not null`))
    .toBe('1');
  await b.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(sold(b)).toHaveCount(2, { timeout: 20000 });
  await expect(choc(b)).toContainText('4');

  // ---- a reload of A rebuilds the same day from the server
  await a.reload();
  await expect(sold(a)).toHaveCount(2, { timeout: 20000 });
  // A reload must not send anything again: still three sales, once each, after the retry timers have had their chance.
  await a.waitForTimeout(5000);
  expect(sql(`select count(*) || '|' || count(distinct client_id) from public.event_sales`)).toBe(
    '3|3'
  );
});
