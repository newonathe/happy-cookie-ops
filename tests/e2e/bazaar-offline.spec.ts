import { expect, test, type Page } from '@playwright/test';
import {
  assertRecordedSale,
  assertDurableSale,
  assertAcknowledgedSale
} from '../fixtures/acceptance';
import { initializeFixture, waitForHydration, readSales, requireScreen } from './fixture';

const EVENT_ID = 'd1e0c105-0000-4000-8000-0000000000e1';

/**
 * The e2e build has no Supabase project, so the acknowledgment comes from a stand-in client
 * on the engine (`saleClient`) that answers `record_event_sale` the way the RPC does and
 * writes down what it was sent. The server side of that contract is proven separately by
 * the SQL role suite (tests/integration/security/bazaar-events.sql).
 */
async function installSaleClient(page: Page): Promise<void> {
  await page.evaluate(() => {
    const acked: string[] = [];
    Object.assign(window, { __hcAcked: acked });
    Object.assign(window.__hcOps as object, {
      saleClient: {
        rpc: async (name: string, args: { p_sale?: { clientId?: string; eventId?: string } }) => {
          const sale = args.p_sale;
          if (name !== 'record_event_sale' || !sale?.clientId || typeof sale.eventId !== 'string') {
            return { data: null, error: { code: '22023', message: 'malformed sale' } };
          }
          acked.push(sale.clientId);
          return {
            data: [
              { client_id: sale.clientId, sale_id: 'fixture', duplicate: false, voided: false }
            ],
            error: null
          };
        }
      }
    });
  });
}

test.use({ serviceWorkers: 'allow' });
test('OFFLINE-01 one real sale survives reload and requires its acknowledgment', async ({
  page,
  context
}, info) => {
  // Playwright's WebKit build fails every service-worker-fulfilled request while the context
  // is emulated offline: microsoft/playwright#42775, open, reproduced upstream on macOS and
  // here on Windows and Linux with 1.63.0. Depending on what is already cached, that breaks
  // either the payment sheet or the reload. It is an emulator defect; real Safari is proven
  // by the physical-phone rehearsal, never by this run. Owner-approved on 2026-10-05, for
  // the webkit project only:
  //   - the sale is made online, because offline emulation is unusable there;
  //   - the offline reload must fail with exactly the known error, so this run turns red
  //     when Playwright fixes the defect (then delete the WebKit branches);
  //   - every later assertion still runs: the sale survives a reload unchanged and is
  //     marked sent only after its own clientId is acknowledged.
  // Not covered on WebKit: selling while offline, a sale held pending across an offline
  // period, the service worker serving the app on an offline reload, booting offline, and
  // the browser's own reconnect event (it is dispatched by hand below). Chromium (phone,
  // desktop) covers all of these here.
  const emulatorOfflineDefect = info.project.name === 'webkit';
  await page.addInitScript((eventId) => {
    if (!localStorage.getItem('hc-ops-state-v1'))
      localStorage.setItem(
        'hc-ops-state-v1',
        JSON.stringify({
          v: 1,
          data: {
            event: { id: eventId, name: 'G0 synthetic bazaar', date: 'Mar 4', stage: 'selling' },
            eventStock: { dcf: 5 },
            eventPrices: { dcf: 100 },
            eventLoaded: { dcf: 5 },
            sales: [],
            cart: {},
            online: true
          }
        })
      );
  }, EVENT_ID);
  await page.goto('/');
  await initializeFixture(page, 'offline');
  await waitForHydration(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => document.documentElement.dataset.hcOfflineReady === 'true');
  await page
    .getByRole('button', { name: /^Bazaar$/ })
    .first()
    .click();
  await requireScreen(page, 'Bazaar Mode');
  if (!emulatorOfflineDefect) await context.setOffline(true);
  await page
    .getByRole('button', { name: /Double Choco/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Charge', exact: true }).click();
  await page.getByRole('button', { name: /^Cash/ }).last().click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const sales = window.__hcOps?.state.sales;
        return Array.isArray(sales) ? sales.length : 0;
      })
    )
    .toBe(1);
  await info.attach('engine-sale', {
    body: JSON.stringify(await page.evaluate(() => window.__hcOps?.state.sales)),
    contentType: 'application/json'
  });
  await expect(async () => assertRecordedSale(await readSales(page))).toPass({ timeout: 5000 });
  const before = await readSales(page);
  const sale = assertRecordedSale(before);
  expect(sale.items).toEqual({ dcf: 1 });
  expect(sale.total).toBe(100);
  expect(sale.state).toBe('pending');
  await info.attach('recorded-sale', {
    body: JSON.stringify(before),
    contentType: 'application/json'
  });
  if (emulatorOfflineDefect) {
    const url = page.url();
    await context.setOffline(true);
    await expect(page.reload()).rejects.toThrow(/WebKit encountered an internal error/);
    info.annotations.push({
      type: 'issue',
      description: 'https://github.com/microsoft/playwright/issues/42775'
    });
    await context.setOffline(false);
    await page.goto(url);
  } else {
    await page.reload();
  }
  await waitForHydration(page);
  assertDurableSale(before, await readSales(page));
  await installSaleClient(page);
  await context.setOffline(false);
  // The stand-in client is installed after the reload, so the reconnect is what sends the
  // sale. WebKit is already online here, so raise the reconnect event the app listens for.
  if (emulatorOfflineDefect) await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(async () => (await readSales(page))[0]?.state).toBe('sent');
  const accepted = await page.evaluate(
    () => (window as unknown as { __hcAcked: string[] }).__hcAcked
  );
  assertAcknowledgedSale(assertRecordedSale(await readSales(page)), accepted);
  await info.attach('acknowledged-sale', {
    body: JSON.stringify({
      rows: await readSales(page),
      accepted,
      backend: 'stand-in sale client on the engine, not real SQL'
    }),
    contentType: 'application/json'
  });
});
