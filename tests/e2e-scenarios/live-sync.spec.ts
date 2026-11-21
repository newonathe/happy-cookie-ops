import { expect, test, type Page } from '@playwright/test';
import { ensureOwner, signInAsOwner, sql } from './stack';
import { seedScenarioA } from './fixture-a';
import { resetScenarioC } from './fixture-c';

/**
 * S4 (20 November 2026): live sync. The owner has the same selling day open on two devices (two browser profiles). A sale rung on one
 * appears on the other within seconds with NO reload and NO visibility nudge (S2's scenario D had to nudge); so do a void and the
 * stock; a device that was offline catches up when its signal returns. Needs Realtime in the local stack and a live-mode build
 * (docs/TESTING.md, "Browser scenarios").
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

test('SCENARIO F: one selling day, two devices, changes arrive live', async ({ browser }) => {
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
  await expect(a.getByRole('button', { name: /^Start the day/ })).toBeVisible({ timeout: 20000 });
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
  const dayButton = b.getByRole('button', { name: /^[A-Z][a-z]{2}, \d+ [A-Z][a-z]{2}/ }).first();
  const takeOver = b.getByRole('button', { name: 'Sell on this device' });
  await expect(oat(b).or(dayButton).or(takeOver)).toBeVisible({ timeout: 20000 });
  if (!(await oat(b).isVisible()) && (await dayButton.isVisible())) await dayButton.click();
  await expect(oat(b).or(takeOver)).toBeVisible({ timeout: 20000 });
  if (!(await oat(b).isVisible())) await takeOver.click();
  await expect(sold(b)).toHaveCount(2);
  await expect(oat(b)).toContainText('7');

  // ---- A sells another; B shows it within a few seconds, with no reload and no nudge
  const started = Date.now();
  await charge(a, ['choc']);
  await expect(sold(a)).toHaveCount(3);
  await expect(sold(b)).toHaveCount(3, { timeout: 10000 });
  await expect(choc(b)).toContainText('3');
  console.log(`a sale reached the other device in ${Date.now() - started} ms`);

  // ---- A voids that sale; B drops it and puts the cookie back, live
  await sold(a).first().click();
  await a.getByRole('button', { name: 'Void this sale' }).click();
  await a.getByRole('button', { name: 'Confirm void' }).click();
  await expect(sold(b)).toHaveCount(2, { timeout: 10000 });
  await expect(choc(b)).toContainText('4');

  // ---- B loses signal; A sells twice meanwhile; B's signal returns and it catches up, once each
  await b.context().setOffline(true);
  await charge(a, ['oat']);
  await charge(a, ['choc']);
  await expect(sold(a)).toHaveCount(4);
  await b.waitForTimeout(2000);
  console.log(`device B showed ${await sold(b).count()} sales while it had no signal (A has 4)`);
  await b.context().setOffline(false);
  await expect(sold(b)).toHaveCount(4, { timeout: 30000 });
  await expect(oat(b)).toContainText('6');
  await expect(choc(b)).toContainText('3');
  expect(
    sql(
      `select count(*) || '|' || count(distinct client_id) from public.event_sales where voided_at is null`
    )
  ).toBe('4|4');

  // ---- B sells while A is looking: it appears on A, live
  await charge(b, ['oat']);
  await expect(sold(a)).toHaveCount(5, { timeout: 10000 });
  await expect(oat(a)).toContainText('5');

  // Confirm the final sale reached the server before changing the fixture's closure marker.
  await expect
    .poll(() => sql('select count(*) from public.event_sales where voided_at is null'))
    .toBe('5');
  await b.bringToFront();
  // The close changes events.closed_at, outside the Realtime publication. The foreground till must still let go.
  expect(sql('select count(*) from public.events where closed_at is null')).toBe('1');
  sql('update public.events set closed_at = now() where closed_at is null');
  await expect(oat(b)).toHaveCount(0, { timeout: 20000 });
  await expect(sold(b)).toHaveCount(0);
});
