import { expect, test } from '@playwright/test';
import { initializeFixture, requireScreen } from './fixture';

test('browser Back and Forward retain the current runtime and route content', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await initializeFixture(page);
  await page.evaluate(() => {
    (window as Window & { __hcRuntimeBefore?: unknown }).__hcRuntimeBefore = window.__hcOps;
  });

  await page.getByRole('button', { name: 'Orders', exact: true }).click();
  await expect(page).toHaveURL('/orders');
  await requireScreen(page, 'Orders');
  await page.getByRole('button', { name: 'Inventory', exact: true }).click();
  await expect(page).toHaveURL('/inventory');
  await requireScreen(page, 'Inventory');

  await page.goBack();
  await expect(page).toHaveURL('/orders');
  await requireScreen(page, 'Orders');
  await page.goForward();
  await expect(page).toHaveURL('/inventory');
  await requireScreen(page, 'Inventory');

  await page.goBack();
  await expect(page).toHaveURL('/orders');
  expect(await page.evaluate(() => window.__hcOps?.state.history)).toEqual(['today']);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL('/');
  await requireScreen(page, 'Home');
  expect(await page.evaluate(() => window.__hcOps?.state.history)).toEqual([]);
  await page.goBack();
  await expect(page).toHaveURL('/orders');
  await page.goForward();
  await expect(page).toHaveURL('/');
  await requireScreen(page, 'Home');

  expect(
    await page.evaluate(
      () =>
        window.__hcOps === (window as Window & { __hcRuntimeBefore?: unknown }).__hcRuntimeBefore
    )
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('bake action without a navigation tick retains the Bake plan browser entry', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/bake');
  await initializeFixture(page);
  await requireScreen(page, 'Bake plan');
  const beforeTick = await page.evaluate(() => window.__hcOps?.state.navTick);

  await page.getByRole('button', { name: 'Start production' }).click();
  await expect(page).toHaveURL('/batch');
  await requireScreen(page, 'Production focus');
  expect(await page.evaluate(() => window.__hcOps?.state.navTick)).toBe(beforeTick);

  await page.goBack();
  await expect(page).toHaveURL('/bake');
  await requireScreen(page, 'Bake plan');
  await page.goForward();
  await expect(page).toHaveURL('/batch');
  await requireScreen(page, 'Production focus');
  expect(errors).toEqual([]);
});
