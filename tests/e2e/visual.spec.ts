import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { routeCases } from '../fixtures/route-cases';
import demoState from '../fixtures/g0-demo-state.json';
import { initializeFixture, selectVisualFixture, requireScreen } from './fixture';

const stocktakeItem = demoState.inv.find((item) => item.cat === 'Ingredients');
if (!stocktakeItem) throw new Error('Missing deterministic stocktake ingredient');

test.beforeAll(() => {
  if (process.platform !== 'linux' || !existsSync('/.dockerenv'))
    throw new Error(
      'BLOCKED_ENVIRONMENT: accepted visual baselines require the prescribed Playwright Docker image'
    );
});
for (const [path, label] of routeCases) {
  test(`VISUAL-${path === '/' ? 'home' : path.slice(1)} ${label}`, async ({ page }, info) => {
    const initialUrl = path === '/stocktake' ? '/inventory' : path;
    await page.goto(initialUrl);
    await initializeFixture(page);
    const device = info.project.name.endsWith('desktop')
      ? 'desktop'
      : info.project.name.endsWith('tablet')
        ? 'tablet'
        : 'mobile';
    await selectVisualFixture(page, path === '/stocktake' ? '/inventory' : path, device);
    if (path === '/stocktake')
      await page.evaluate((name) => {
        const engine = window.__hcOps;
        if (!engine) throw new Error('Engine not hydrated');
        engine.setState({ stocktake: { i: 0, counts: {}, items: [name] } });
      }, stocktakeItem.name);
    await requireScreen(page, label);
    if (path === '/stocktake') {
      await expect(page.getByText('Weekly count', { exact: true })).toBeVisible();
      const countCard = page.getByText('Enter what you counted', { exact: true }).locator('..');
      await expect(countCard.getByText(stocktakeItem.name, { exact: true })).toBeVisible();
    }
    await page.evaluate(() => document.fonts.ready);
    await page.waitForLoadState('networkidle');
    await info.attach('fixture', {
      body: JSON.stringify({
        requested: path,
        actualInitialUrl: initialUrl,
        actual: new URL(page.url()).pathname,
        engineScreen:
          path === '/stocktake'
            ? 'inventory (stocktake focus)'
            : path === '/'
              ? 'today'
              : path.slice(1),
        fixture: 'G0-demo-v1',
        device,
        navigation: 'engine-forced; NOT deep-link acceptance',
        serviceWorkers: 'blocked'
      }),
      contentType: 'application/json'
    });
    await expect(page).toHaveScreenshot((path.slice(1) || 'home') + '.png', { fullPage: true });
  });
}
