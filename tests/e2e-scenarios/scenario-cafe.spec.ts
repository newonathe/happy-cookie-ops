import { expect, test } from '@playwright/test';
import { ensureOwner, signInAsOwner, sql } from './stack';

/**
 * SCENARIO CAFÉ: the owner logs a café sale at café prices through the live Sell > Orders > Café sales view. It is stored at the prices
 * sent with the server's total, paid and handed over on its date, counted toward the week by default, in the books on that date, and it
 * is NOT among the orders. Server truth is read straight from the stack's database. Run like scenarios A and C (docs/TESTING.md);
 * needs migrations 91, 94 and 96.
 */
const manilaDate = (offsetDays: number): string => {
  const now = new Date(Date.now() + 8 * 3_600_000 + offsetDays * 86_400_000);
  return now.toISOString().slice(0, 10);
};

test('SCENARIO CAFÉ: a café sale at café prices, paid, counted, and kept out of the orders', async ({
  browser
}) => {
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
  await page.getByRole('button', { name: 'Café sales' }).click();
  await expect(page.getByText(/No café sales logged yet/)).toBeVisible();
  await page.screenshot({ path: 'build/cafe-sales-empty-390.png', fullPage: true });
  await page.getByRole('button', { name: 'Log café sale' }).click();

  // The form starts at the café price (hers here), today, Cash, taking stock.
  const qty = page.getByRole('textbox', { name: /^Quantity of / }).first();
  await expect(qty).toBeVisible();
  const priceField = page.getByRole('textbox', { name: /^Price of / }).first();
  await expect(priceField).toHaveValue(String(ownPrice / 100));
  await expect(page.getByLabel('Sale date')).toHaveValue(manilaDate(0));
  await expect(page.getByLabel('Paid by')).toHaveValue('Cash');
  await page.screenshot({ path: 'build/cafe-sale-form-390.png', fullPage: true });

  await page.getByRole('textbox', { name: /Café name/ }).fill('Scenario Café');
  await page.getByLabel('Sale date').fill(manilaDate(-3));
  await qty.fill('10');
  const agreed = ownPrice - 500;
  await priceField.fill(String(agreed / 100));
  await page.getByRole('button', { name: 'Save café sale' }).click();
  await expect(page.getByText(/Café sale HC-\d+ logged/)).toBeVisible();
  const row = sql(
    `select id, state, pay_state, total_cents, paid_cents, phone, channel, pay_method, pickup_date from public.orders where channel = 'cafe'`
  ).split('|');
  const orderNo = row[0]!;
  expect(row.slice(1)).toEqual([
    'Completed',
    'confirmed',
    String(10 * agreed),
    String(10 * agreed),
    '',
    'cafe',
    'Cash',
    manilaDate(-3)
  ]);
  expect(
    sql(
      `select unit_price_cents || '|' || qty || '|' || capacity_weight from public.order_items where order_id = '${orderNo}'`
    )
  ).toMatch(new RegExp(`^${agreed}\\|10\\|[1-9]`));
  expect(sql(`select price_cents from public.products where id = '${productId}'`)).toBe(
    String(retail)
  );

  // It is in the log with its café, cookies and method,
  await page.screenshot({ path: 'build/cafe-sale-saved-390.png', fullPage: true });
  await expect(page.getByText('Scenario Café')).toBeVisible();
  await expect(page.getByText(/10 cookies · Cash/)).toBeVisible();

  // ...(the books' revenue on the sale date is proved in SQL: tests/integration/security/cafe-sale-log.sql)...

  // ...and not among the orders.
  await page.getByRole('button', { name: 'Back to orders' }).click();
  await expect(page.getByText(orderNo)).toHaveCount(0);
  await expect(page.getByText('Scenario Café')).toHaveCount(0);

  // Wide screen.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/orders');
  await page.getByRole('button', { name: 'Café sales' }).click();
  await expect(page.getByText('Scenario Café')).toBeVisible();
  await page.screenshot({ path: 'build/cafe-sales-1440.png', fullPage: true });
  await page.getByRole('button', { name: 'Log café sale' }).click();
  await expect(page.getByRole('textbox', { name: /^Quantity of / }).first()).toBeVisible();
  await page.screenshot({ path: 'build/cafe-sale-form-1440.png', fullPage: true });
});
