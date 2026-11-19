import { expect, test, type Page } from '@playwright/test';
import { ensureOwner, signInAsOwner, sql } from './stack';
import { resetScenarioA, seedScenarioA } from './fixture-a';

/** Server truth, read straight from the stack's database (never from the app under test). */
const onHand = (name: string) =>
  Number(sql(`select on_hand from public.inventory_items where name = '${name}' and active`));

async function openOwner(page: Page, tab: string, place?: string): Promise<void> {
  await page
    .getByRole('button', { name: new RegExp(`^${tab}`) })
    .first()
    .click();
  if (place) await page.getByRole('button', { name: place, exact: true }).click();
}

test('SCENARIO A: customer order to books, through the live owner screens', async ({ browser }) => {
  await ensureOwner();
  seedScenarioA();
  resetScenarioA();

  // ---- order: a customer places it on the shop
  const customer = await (await browser.newContext()).newPage();
  await customer.goto('/shop');
  const add = customer.getByRole('button', { name: 'Add one' });
  for (let i = 0; i < 4; i++) await add.nth(0).click();
  for (let i = 0; i < 2; i++) await add.nth(1).click();
  await customer
    .getByRole('button', { name: /^Continue/ })
    .first()
    .click();
  await customer.getByLabel('Name').fill('Scenario Buyer');
  await customer.getByLabel('Instagram handle').fill('@scenario.buyer');
  await customer.getByLabel('Contact number').fill('09170000555');
  await customer
    .getByRole('button', { name: /^Mon, / })
    .first()
    .click();
  await customer
    .getByLabel('Pickup time')
    .selectOption({ label: 'JSEC Ateneo · 2:00 PM – 3:30 PM' });
  await customer.getByRole('button', { name: 'More Box of 6' }).click();
  await customer.getByRole('button', { name: /SA GCash/ }).click();
  await customer.getByRole('button', { name: 'Place order' }).click();
  await expect(customer.getByText('Order received')).toBeVisible();
  await expect(customer.getByText(/Order no\. HC-\d+/)).toBeVisible();
  const row = sql(
    `select id, state, pay_state, total_cents, coalesce(paid_cents,0) from public.orders`
  ).split('|');
  const orderNo = row[0];
  expect(row.slice(1)).toEqual(['Payment review', 'unpaid', '74000', '0']);
  expect(sql(`select count(*) from public.order_items where order_id = '${orderNo}'`)).toBe('2');

  // ---- payment: the owner confirms it
  const page = await (await browser.newContext()).newPage();
  await signInAsOwner(page);
  await page.goto('/orders');
  await page.getByText(orderNo).first().click();
  await page.getByRole('button', { name: 'Confirm payment' }).click();
  await expect(page.getByText('Payment confirmed')).toBeVisible();
  expect(sql(`select state || '|' || pay_state || '|' || paid_cents from public.orders`)).toBe(
    'Confirmed|confirmed|74000'
  );

  // ---- kitchen: dough for the order (the stock page loads the ingredient list first)
  await openOwner(page, 'Stock');
  await expect(page.getByText('Stock health')).toBeVisible();
  await openOwner(page, 'Make', 'Production');
  await page.getByRole('button', { name: 'Mix 4' }).click();
  await page.getByRole('button', { name: 'Full recipe' }).click();
  await page.getByLabel('Actual dough balls made').fill('12');
  await page.getByRole('button', { name: 'Review dough' }).click();
  await page.getByRole('button', { name: 'Confirm dough' }).click();
  await expect(page.getByText('Dough in the fridge: 12 balls')).toBeVisible();
  expect([onHand('SA Flour'), onHand('SA Butter'), onHand('SA Egg')]).toEqual([700, 400, 19]);
  await page.getByRole('button', { name: 'Bake 4' }).click();
  await page.getByLabel('Cookies made, including rejects').fill('12');
  await page.getByLabel('Rejects', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Review production' }).click();
  await page.getByRole('button', { name: 'Confirm production' }).click();
  await expect(page.getByText(/11 good/).first()).toBeVisible();
  expect(
    sql(
      `select qty || '/' || rejects || '/' || dough_used from public.production_records where kind = 'batch'`
    )
  ).toBe('11/1/12');

  await page.getByRole('button', { name: 'Mix 2' }).click();
  await page.getByRole('button', { name: 'Full recipe' }).click();
  await page.getByLabel('Actual dough balls made').fill('6');
  await page.getByRole('button', { name: 'Review dough' }).click();
  await page.getByRole('button', { name: 'Confirm dough' }).click();
  await expect(page.getByText('Dough in the fridge: 6 balls')).toBeVisible();
  expect([onHand('SA Flour'), onHand('SA Cocoa')]).toEqual([600, 150]);
  await page.getByRole('button', { name: 'Bake 2' }).click();
  await page.getByLabel('Cookies made, including rejects').fill('6');
  await page.getByRole('button', { name: 'Review production' }).click();
  await page.getByRole('button', { name: 'Confirm production' }).click();
  await expect
    .poll(() => sql(`select count(*) from public.production_records where kind = 'batch'`))
    .toBe('2');
  // baking takes no ingredient
  expect([onHand('SA Flour'), onHand('SA Butter'), onHand('SA Egg'), onHand('SA Cocoa')]).toEqual([
    600, 400, 19, 150
  ]);

  // ---- pickup: pack, ready, collected
  await openOwner(page, 'Sell');
  await page.getByText(orderNo).first().click();
  await page.getByRole('button', { name: 'Mark packed' }).click();
  await expect(page.getByRole('button', { name: 'Mark picked up' })).toBeVisible();
  expect([onHand('Box of 6'), onHand('Brand sticker'), onHand('Thank-you card')]).toEqual([
    9, 19, 9
  ]);
  expect(sql(`select count(*) from public.production_records where kind = 'pack'`)).toBe('1');
  expect(sql(`select state from public.orders`)).toBe('Ready');
  await page.getByRole('button', { name: 'Mark picked up' }).click();
  await expect
    .poll(() => sql(`select state || '|' || (collected_at is not null) from public.orders`))
    .toBe('Completed|true');

  // ---- books: Money shows the order once, and still once after a reload
  await openOwner(page, 'Money');
  await expect(page.getByText(`Order ${orderNo} · Scenario Buyer`)).toHaveCount(1);
  await expect(page.getByText('+₱740.00').first()).toBeVisible();
  await page.reload();
  await expect(page.getByText(`Order ${orderNo} · Scenario Buyer`)).toHaveCount(1);
  expect(sql(`select count(*) || '|' || sum(paid_cents) from public.orders`)).toBe('1|74000');
  expect(sql(`select count(*) from public.production_records where kind = 'dough'`)).toBe('2');
});
