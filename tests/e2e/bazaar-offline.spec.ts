import { expect, test } from '@playwright/test';
import { assertRecordedSale, assertDurableSale, assertAcknowledgedSale } from '../fixtures/acceptance';
import { initializeFixture, waitForHydration, readSales, requireScreen } from './fixture';

test.use({ serviceWorkers: 'allow' });
test('OFFLINE-01 one real sale survives reload and requires its acknowledgment', async ({ page, context }, info) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('hc-ops-state-v1')) localStorage.setItem('hc-ops-state-v1', JSON.stringify({ v: 1, data: {
      event: { id: 'g0-synthetic-event', name: 'G0 synthetic bazaar', date: 'Mar 4', stage: 'selling' },
      eventStock: { dcf: 5 }, eventPrices: { dcf: 100 }, eventLoaded: { dcf: 5 }, sales: [], cart: {}, online: true
    } }));
  });
  const accepted: string[] = [];
  await context.route('**/api/sync', async (route) => {
    const body: unknown = route.request().postDataJSON();
    if (!body || typeof body !== 'object' || !('sales' in body) || !Array.isArray(body.sales)) throw new Error('Malformed sync request');
    const ids = body.sales.map((sale: unknown) => {
      if (!sale || typeof sale !== 'object' || !('clientId' in sale) || typeof sale.clientId !== 'string') throw new Error('Missing sync identity');
      return sale.clientId;
    });
    accepted.push(...ids);
    await route.fulfill({ json: { accepted: ids, rejected: [] } });
  });
  await page.goto('/');
  await initializeFixture(page, 'offline');
  await waitForHydration(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.getByRole('button', { name: /^Bazaar$/ }).first().click();
  await requireScreen(page, 'Bazaar Mode');
  await context.setOffline(true);
  await page.getByRole('button', { name: /Double Choco/ }).first().click();
  await page.getByRole('button', { name: 'Charge', exact: true }).click();
  await page.getByRole('button', { name: /^Cash/ }).last().click();
  await expect.poll(() => page.evaluate(() => {
    const sales = window.__hcOps?.state.sales;
    return Array.isArray(sales) ? sales.length : 0;
  })).toBe(1);
  await info.attach('engine-sale', { body: JSON.stringify(await page.evaluate(() => window.__hcOps?.state.sales)), contentType: 'application/json' });
  await expect(async () => assertRecordedSale(await readSales(page))).toPass({ timeout: 5000 });
  const before = await readSales(page);
  const sale = assertRecordedSale(before);
  expect(sale.items).toEqual({ dcf: 1 });
  expect(sale.total).toBe(100);
  expect(sale.state).toBe('pending');
  await info.attach('recorded-sale', { body: JSON.stringify(before), contentType: 'application/json' });
  await page.reload();
  await waitForHydration(page);
  assertDurableSale(before, await readSales(page));
  await context.setOffline(false);
  await expect.poll(async () => (await readSales(page))[0]?.state).toBe('sent');
  assertAcknowledgedSale(assertRecordedSale(await readSales(page)), accepted);
  await info.attach('acknowledged-sale', { body: JSON.stringify({ rows: await readSales(page), accepted, backend: 'synthetic acknowledgment fixture, not real SQL' }), contentType: 'application/json' });
});
