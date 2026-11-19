import { expect, test } from '@playwright/test';
import { ensureOwner, signInAsOwner, sql } from './stack';
import { seedScenarioA } from './fixture-a';
import { resetScenarioC } from './fixture-c';
import { readSales } from '../e2e/fixture';

test('SCENARIO C: bazaar event to books, with an offline sale, through the live owner screens', async ({
  browser
}) => {
  await ensureOwner();
  seedScenarioA(); // the two SA products (Oat, Choc) and the shelves they use
  resetScenarioC();
  const context = await browser.newContext();
  const page = await context.newPage();
  await signInAsOwner(page);

  // ---- event and day plan
  await page.goto('/bazaar');
  await page.getByRole('button', { name: 'Add an event' }).click();
  await page.getByLabel('Name').fill('SC Fair');
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  await page.getByLabel('First day').fill(today);
  await page.getByLabel('Stall rent').fill('300');
  await page.getByRole('button', { name: 'Review event' }).click();
  await page.getByRole('button', { name: 'Save event' }).click();
  await page
    .getByRole('button', { name: /Open event/ })
    .first()
    .click();
  await page
    .getByRole('button', { name: /^[A-Z][a-z]{2}, \d+ [A-Z][a-z]{2}/ })
    .first()
    .click();
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'More Drawer float' }).click();
  for (let i = 0; i < 10; i++) await page.getByRole('button', { name: 'More Oat made' }).click();
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'More Choc made' }).click();
  await page.getByRole('button', { name: /^Save the plan/ }).click();
  await expect(page.getByText('Plan saved.')).toBeVisible();
  expect(sql(`select name from public.scheduled_events`)).toBe('SC Fair');
  await page.getByRole('button', { name: /^Start the day/ }).click();
  await page.getByRole('button', { name: /^Resume selling/ }).click();

  // ---- sale 1: 2 Oat + 1 Choc, cash
  await page.getByRole('button', { name: /^Oat, / }).click();
  await page.getByRole('button', { name: /^Oat, / }).click();
  await page.getByRole('button', { name: /^Choc, / }).click();
  await page
    .getByRole('button', { name: /^Charge/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Cash', exact: true }).click();
  await expect(page.getByText('₱370 sale recorded.')).toBeVisible();
  expect(sql(`select total_cents from public.event_sales`)).toBe('37000');

  // ---- sale 2: 3 Oat, GCash, ₱20 off
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /^Oat, / }).click();
  await page
    .getByRole('button', { name: /^Charge/ })
    .first()
    .click();
  await page.getByRole('button', { name: '₱20 off' }).click();
  await page.getByPlaceholder('Needed for GCash, Maya and GoTyme').fill('1234');
  await page.getByRole('button', { name: /^GCash/ }).click();
  await expect(page.getByText(/sale recorded/).last()).toBeVisible();

  // ---- offline: service worker serves the till, a sale is queued, a reload keeps it
  await page.evaluate(() => navigator.serviceWorker.ready);
  expect(await page.evaluate(() => document.documentElement.dataset.hcOfflineReady)).toBe('true');
  await context.setOffline(true);
  await page.getByRole('button', { name: /^Choc, / }).click();
  await page
    .getByRole('button', { name: /^Charge/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Cash', exact: true }).click();
  await expect(page.getByText('Waiting to send')).toBeVisible();
  const queued = (await readSales(page)).find((sale) => sale.state === 'pending');
  expect(queued?.total).toBe(130);
  expect(sql(`select count(*) from public.event_sales`)).toBe('2'); // the offline sale is not on the server yet
  await page.reload(); // offline: the service worker serves the app, the device keeps the queue
  await expect(page.getByText('Waiting to send')).toBeVisible();
  const afterReload = (await readSales(page)).find((sale) => sale.clientId === queued?.clientId);
  expect(afterReload).toMatchObject({ state: 'pending', total: 130 });
  expect(sql(`select count(*) from public.event_sales`)).toBe('2');
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect
    .poll(() => sql(`select count(*) from public.event_sales`), { timeout: 30000 })
    .toBe('3');
  await page.waitForTimeout(1500);
  // a second reconnect changes nothing: each sale is on the server exactly once, by client id
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(1500);
  expect(sql(`select count(*) || '|' || count(distinct client_id) from public.event_sales`)).toBe(
    '3|3'
  );
  expect(
    sql(`select string_agg(total_cents::text, ',' order by sold_at) from public.event_sales`)
  ).toBe('37000,34000,13000');
  expect(
    sql(`select count(*) from public.event_sales where client_id = '${queued?.clientId}'`)
  ).toBe('1');
  await expect
    .poll(async () => (await readSales(page)).every((s) => s.state === 'sent'))
    .toBe(true);

  // ---- void sale 2
  await page.getByRole('button', { name: /^Sale 2,/ }).click();
  await page.getByRole('button', { name: 'Void this sale' }).click();
  await page.getByRole('button', { name: 'Confirm void' }).click();
  await expect
    .poll(() => sql(`select count(*) from public.event_sales where voided_at is not null`))
    .toBe('1');
  expect(sql(`select total_cents from public.event_sales where voided_at is not null`)).toBe(
    '34000'
  );

  // ---- close the day
  await page.getByRole('button', { name: 'Close day' }).click();
  await page.getByLabel('Cash counted (₱)').fill('995');
  await page.getByRole('button', { name: 'Close the day', exact: true }).click();
  await expect(page.getByText('Day closed.')).toBeVisible();
  expect(sql(`select closed_review->>'state' from public.bazaar_days`)).toBe('closed');

  // ---- finalise the event
  await page.getByRole('button', { name: 'Back to the event' }).click();
  await page.getByRole('button', { name: 'Close the event' }).click();
  await expect(page.getByText(/has no cost per cookie/).first()).toBeVisible();
  const costs = page.getByRole('textbox');
  await costs.nth(0).fill('45');
  await costs.nth(1).fill('65');
  await page.getByRole('button', { name: 'Save and close' }).click();
  await expect
    .poll(() => sql(`select finalised_at is not null from public.scheduled_events`), {
      timeout: 20000
    })
    .toBe('t');
  expect(
    sql(
      `select (final_summary->'revenue'->>'revenue_cents') || '|' || (final_summary->'fees'->>'total_cents') || '|' || (final_summary->'cash'->>'short_cents') || '|' || (final_summary->'profit'->>'cents') from public.scheduled_events`
    )
  ).toBe('50000|30000|500|-2500');

  // ---- books
  await page
    .getByRole('button', { name: /^Money/ })
    .first()
    .click();
  await expect(page.getByText('SC Fair — Stall rent')).toHaveCount(1);
  await expect(page.getByText(/SC Fair .* — drawer short/)).toHaveCount(1);
  await expect(page.getByText(/^Stall sale ·/)).toHaveCount(3);
  await expect(page.getByText(/^Void of stall sale ·/)).toHaveCount(1);
  // the server books: sales 370 + 340 + 130, one void of 340, rent 300, short 5 - each exactly once
  expect(
    sql(
      `select string_agg(kind || ':' || category || ':' || n || ':' || s, ',' order by kind, category) from (select kind, category, count(*) n, sum(amount_cents) s from public.ledger_entries group by 1, 2) t`
    )
  ).toBe('sale:Bazaar:4:50000,cost:Bazaar rent:1:-30000,cost:Cash variance:1:-500');
});
