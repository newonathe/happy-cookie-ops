import { expect, test } from '@playwright/test';
import { assertRoute } from '../fixtures/acceptance';
import { routeCases } from '../fixtures/route-cases';
import { initializeFixture, waitForHydration, selectPrerequisites, requireScreen } from './fixture';

for (const [path, label] of routeCases) {
  test(`ROUTE-${path === '/' ? 'home' : path.slice(1)} direct URL retains ${label}`, async ({
    page
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(path);
    await initializeFixture(page);
    await waitForHydration(page);
    await selectPrerequisites(page, path); // Selection only; never forces navigation in a route test.
    const observation = await page.evaluate(
      (requested) => ({
        requested,
        actual: location.pathname,
        labels: Array.from(
          document.querySelectorAll('[data-screen-label]'),
          (el) => el.getAttribute('data-screen-label') ?? ''
        )
      }),
      path
    );
    await info.attach('route-observation', {
      body: JSON.stringify({
        ...observation,
        fixture: 'G0-demo-v1',
        navigation: 'direct URL; prerequisite selection only',
        serviceWorkers: 'blocked'
      }),
      contentType: 'application/json'
    });
    assertRoute(observation, label);
    await requireScreen(page, label);
    if (path === '/sales') {
      // Sales log is intentionally read-only; the fixture record proves its content loaded.
      await expect(page.locator('[data-screen-label="Sales log"]')).toContainText(
        'Katipunan Weekend Market'
      );
    } else {
      await expect(
        page
          .locator(`[data-screen-label="${label}"] button, [data-screen-label="${label}"] input`)
          .first()
      ).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
}
