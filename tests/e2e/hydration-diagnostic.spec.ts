import { expect, test } from '@playwright/test';

test('Home hydrates when client clock is later than prerender', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.setFixedTime(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as Window & { __hcOps?: unknown }).__hcOps));
  await expect(page.locator('[data-screen-label="Home"]')).toBeVisible();
  expect(errors).toEqual([]);
});
