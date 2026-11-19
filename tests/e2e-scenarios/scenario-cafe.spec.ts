import { expect, test } from '@playwright/test';
import { ensureOwner, signInAsOwner, sql } from './stack';

/**
 * SCENARIO CAFÉ: the owner enters a café order at café prices through the live Sell > Orders screen, it is stored at the prices
 * sent with the server's total, counts toward the week by default, and is marked paid through the existing button. Server truth is
 * read straight from the stack's database. Run like scenarios A and C (docs/TESTING.md); needs migrations 91 and 94.
 */
const manilaDate = (offsetDays: number): string => {
  const now = new Date(Date.now() + 8 * 3_600_000 + offsetDays * 86_400_000);
  return now.toISOString().slice(0, 10);
};

test('SCENARIO CAFÉ: a café order at café prices, counted, then paid', async ({ browser }) => {
  await ensureOwner();
  sql(`delete from public.orders where channel = 'cafe'`);
  sql(`delete from public.product_cafe_prices`);
  sql(`update public.cafe_order_settings set count_toward_limit = true`);
  const first = sql(
    `select id || '|' || price_cents from public.products where archived_at is null and price_cents >= 1000 order by sort_order, id limit 1`
  ).split('|');
  const [productId, retail] = [first[0]!, Number(first[1])];
  const defaultCafe = Math.floor((retail * 7) / 10 / 500) * 500;
  const ownPrice = defaultCafe - 500;
  sql(
    `insert into public.product_cafe_prices (product_id, price_cents) values ('${productId}', ${ownPrice})`
  );

  const page = await (
    await browser.newContext({ viewport: { width: 390, height: 844 } })
  ).newPage();
  await signInAsOwner(page);
  await page.goto('/orders');
  await page.getByRole('button', { name: 'New café order' }).click();

  // The form starts at the café price (hers here), not the order form's price.
  const qty = page.getByRole('textbox', { name: /^Quantity of / }).first();
  await expect(qty).toBeVisible();
  const priceField = page.getByRole('textbox', { name: /^Price of / }).first();
  await expect(priceField).toHaveValue(String(ownPrice / 100));
  await page.screenshot({ path: 'build/cafe-form-390.png', fullPage: true });

  await page.getByRole('textbox', { name: /Café or customer name/ }).fill('Scenario Café');
  await page.getByLabel('Pickup date').fill(manilaDate(14));
  await qty.fill('10');
  const agreed = ownPrice - 500;
  await priceField.fill(String(agreed / 100));
  await page.getByRole('button', { name: 'Save café order' }).click();
  await expect(page.getByText(/Café order HC-\d+ saved/)).toBeVisible();
  const row = sql(
    `select id, state, pay_state, total_cents, phone, channel from public.orders where channel = 'cafe'`
  ).split('|');
  const orderNo = row[0]!;
  expect(row.slice(1)).toEqual(['Payment review', 'unpaid', String(10 * agreed), '', 'cafe']);
  expect(
    sql(
      `select unit_price_cents || '|' || qty || '|' || capacity_weight from public.order_items where order_id = '${orderNo}'`
    )
  ).toMatch(new RegExp(`^${agreed}\\|10\\|[1-9]`));
  // The order form's price is untouched.
  expect(sql(`select price_cents from public.products where id = '${productId}'`)).toBe(
    String(retail)
  );

  // It is in the list, and is marked paid with the existing button.
  await page.screenshot({ path: 'build/cafe-saved-390.png', fullPage: true });
  await page.getByRole('button', { name: new RegExp(`Scenario Café.*${orderNo}`) }).click();
  await page.screenshot({ path: 'build/cafe-order-390.png', fullPage: true });
  await page.getByRole('button', { name: 'Confirm payment' }).click();
  await expect(page.getByText('Payment confirmed')).toBeVisible();
  expect(
    sql(
      `select state || '|' || pay_state || '|' || paid_cents from public.orders where id = '${orderNo}'`
    )
  ).toBe(`Confirmed|confirmed|${10 * agreed}`);

  // Wide screen.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/orders');
  await page.getByRole('button', { name: 'New café order' }).click();
  await expect(page.getByRole('textbox', { name: /^Quantity of / }).first()).toBeVisible();
  await page.screenshot({ path: 'build/cafe-form-1440.png', fullPage: true });
});
