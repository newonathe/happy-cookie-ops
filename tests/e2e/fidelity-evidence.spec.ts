import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { initializeFixture, selectVisualFixture, requireScreen } from './fixture';

const cases = [
  { name: 'add-inv', kind: 'addInv', data: { cat: 'Ingredients' }, text: 'Add to Ingredients' },
  {
    name: 'edit-price',
    kind: 'editPrice',
    data: { pid: 'dcf', name: 'Double Choco', qty: 100 },
    text: 'New price'
  },
  {
    name: 'inv-edit',
    kind: 'invEdit',
    data: { name: 'Butter', qty: 100, unit: 'g', cat: 'Ingredients' },
    text: 'Save the correction'
  },
  {
    name: 'why',
    kind: 'why',
    data: { name: 'Butter', why: 'Synthetic ingredient requirement' },
    text: 'Synthetic ingredient requirement'
  },
  { name: 'proof', kind: 'proof', data: {}, text: "Customer's payment screenshot" }
];
for (const fixture of cases) {
  test(`FIDELITY-${fixture.name} approved guard preserves valid sheet`, async ({ page }, info) => {
    await page.goto('/orders');
    await initializeFixture(page);
    await selectVisualFixture(page, '/orders');
    await requireScreen(page, 'Orders');
    await page.evaluate((fixture) => {
      const engine = window.__hcOps;
      if (!engine || !engine.state.orders[0]) throw new Error('Missing engine/order fixture');
      engine.setState({
        orderId: engine.state.orders[0].id,
        sheet: { kind: fixture.kind, ...fixture.data }
      });
    }, fixture);
    await expect(page.getByText(fixture.text, { exact: true }).first()).toBeVisible();
    await expect(page.getByText('This screen hit a problem')).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    const dir = 'docs/state/evidence/screenshots';
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: `${dir}/${fixture.name}.png`, fullPage: true });
    await info.attach('conditions', {
      body: JSON.stringify({
        fixture,
        routeRequested: '/orders',
        actual: new URL(page.url()).pathname,
        viewport: { width: 390, height: 844 },
        serviceWorkers: 'blocked',
        navigation: 'engine-forced fixture; not deep-link proof',
        baseline: 'diagnostic Windows capture; not an accepted Docker baseline'
      }),
      contentType: 'application/json'
    });
  });
}
