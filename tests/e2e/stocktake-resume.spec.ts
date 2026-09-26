import { expect, test } from '@playwright/test';
import { initializeFixture, selectPrerequisites, waitForHydration } from './fixture';

test('direct stocktake can pause and resume after reload', async ({ page }) => {
  await page.goto('/stocktake');
  await initializeFixture(page);
  await selectPrerequisites(page, '/stocktake');
  await expect(page.locator('[data-screen-label="Inventory"]')).toContainText('Weekly count');
  await expect(page).toHaveURL('/stocktake');

  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByText('Continue where you left off')).toBeVisible();

  await page.reload();
  await waitForHydration(page);
  await expect(page.getByRole('button', { name: /Weekly count/ })).toBeVisible();
  await page.getByRole('button', { name: /Weekly count/ }).click();
  await expect(page).toHaveURL('/inventory');
  await expect(page.locator('[data-screen-label="Inventory"]')).toContainText('Weekly count');
});
