import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { OpsRuntime } from '@/store/ops-runtime';
import { InventoryLive } from '@/components/live/stock/inventory-live';
import { GroceryLive } from '@/components/live/stock/grocery-live';
import type { StockClient } from '@/lib/data/stock-catalogue';
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => true }));
const empty = { items: [], suppliers: [], prices: [] };
const owner = {
  userId: '11111111-1111-4111-8111-111111111111',
  business: 'https://stock-one.test'
};
const pause = () => new Promise((resolve) => setTimeout(resolve, 0));
const deferred = () => {
  let resolve!: (value: { data: unknown; error: null }) => void;
  const promise = new Promise<{ data: unknown; error: null }>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
afterEach(cleanup);
async function mounted() {
  let runtime!: OpsRuntime;
  render(
    <OpsRuntime
      ref={(value) => {
        if (value) runtime = value;
      }}
    />
  );
  await act(async () => {
    runtime.setRole('owner');
    await runtime.setProductionIdentity(owner);
  });
  return runtime;
}
function source() {
  let fail = false;
  const rpc = vi.fn(async (name: string) =>
    name === 'get_stock_catalogue'
      ? { data: fail ? null : empty, error: fail ? { code: '08006' } : null }
      : { data: [], error: null }
  );
  return {
    client: { rpc } as unknown as StockClient,
    rpc,
    fail: (value: boolean) => {
      fail = value;
    }
  };
}
it('distinguishes failed inventory from empty and retries locally, retaining last-good read with a warning', async () => {
  const r = await mounted(),
    f = source();
  f.fail(true);
  await act(async () => {
    expect(await r.loadStockCatalogue(f.client)).toBe(false);
  });
  expect(r.renderVals().liveStock).toBeNull();
  expect(r.renderVals().liveStockRead).toMatchObject({ state: 'failed', stale: false });
  const ui = render(<InventoryLive v={r.renderVals()} />);
  expect(ui.getByText('Inventory is unavailable')).toBeTruthy();
  expect(ui.queryByText('Stock is loading.')).toBeNull();
  f.fail(false);
  await act(async () => {
    fireEvent.click(ui.getByRole('button', { name: 'Retry inventory' }));
    await pause();
  });
  expect(r.renderVals().liveStockRead).toMatchObject({ state: 'ready', stale: false });
  expect(r.renderVals().liveStock?.items).toEqual([]);
  f.fail(true);
  await act(async () => {
    await r.loadStockCatalogue(f.client);
  });
  ui.rerender(<GroceryLive v={r.renderVals()} />);
  expect(ui.getByText('Inventory could not be refreshed')).toBeTruthy();
  expect(r.renderVals().liveStockRead?.stale).toBe(true);
});
it('retires cached Retry after role ABA and owner/backend changes', async () => {
  const r = await mounted(),
    f = source();
  await act(async () => {
    await r.loadStockCatalogue(f.client);
  });
  const retry = r.renderVals().liveStockRead!.retry;
  act(() => r.setRole('helper'));
  act(() => r.setRole('owner'));
  const before = f.rpc.mock.calls.length;
  await act(async () => {
    retry();
    await pause();
  });
  expect(f.rpc).toHaveBeenCalledTimes(before);
  const nextRetry = r.renderVals().liveStockRead!.retry;
  await act(async () => {
    await r.setProductionIdentity({ ...owner, business: 'https://stock-two.test' });
    nextRetry();
    await pause();
  });
  expect(f.rpc).toHaveBeenCalledTimes(before);
  expect(r.renderVals().liveStock).toBeNull();
  expect(r.state.paid).toEqual({});
});
it('refuses an earlier catalogue after a newer read succeeds, and after owner ABA', async () => {
  const r = await mounted(),
    old = deferred(),
    fresh = source();
  const client = { rpc: vi.fn(() => old.promise) } as unknown as StockClient;
  let loading!: Promise<boolean>;
  act(() => {
    loading = r.loadStockCatalogue(client);
  });
  await act(async () => {
    await r.loadStockCatalogue(fresh.client);
    old.resolve({ data: empty, error: null });
    expect(await loading).toBe(false);
  });
  const late = deferred();
  const next = { rpc: vi.fn(() => late.promise) } as unknown as StockClient;
  act(() => {
    loading = r.loadStockCatalogue(next);
  });
  await act(async () => {
    await r.setProductionIdentity({ ...owner, userId: '22222222-2222-4222-8222-222222222222' });
    await r.setProductionIdentity(owner);
    late.resolve({ data: empty, error: null });
    expect(await loading).toBe(false);
  });
  expect(r.renderVals().liveStock).toBeNull();
});
it('does not restore a last-paid response from an earlier owner/backend', async () => {
  const r = await mounted(),
    paid = deferred();
  const rpc = vi.fn(async (name: string) =>
    name === 'get_stock_catalogue'
      ? { data: empty, error: null }
      : name === 'get_last_paid'
        ? paid.promise
        : { data: [], error: null }
  );
  let loading!: Promise<boolean>;
  await act(async () => {
    loading = r.loadStockCatalogue({ rpc } as unknown as StockClient);
    await pause();
  });
  expect(rpc.mock.calls.some(([name]) => name === 'get_last_paid')).toBe(true);
  await act(async () => {
    await r.setProductionIdentity({ ...owner, business: 'https://stock-two.test' });
    paid.resolve({
      data: [
        {
          item_name: 'Retired item',
          cost_cents: 99900,
          qty: 1,
          supplier: 'Retired supplier',
          at: Date.now()
        }
      ],
      error: null
    });
    expect(await loading).toBe(false);
  });
  expect(r.state.paid).toEqual({});
  expect(rpc.mock.calls.some(([name]) => name === 'get_item_costs')).toBe(false);
});
it('rejects a cost answer after client ABA even while replacement catalogues are pending', async () => {
  const r = await mounted(),
    costs = deferred(),
    nextRead = deferred();
  let firstRead = true;
  const client = {
    rpc: vi.fn(async (name: string) => {
      if (name === 'get_stock_catalogue') {
        if (!firstRead) return nextRead.promise;
        firstRead = false;
        return { data: empty, error: null };
      }
      if (name === 'get_item_costs') return costs.promise;
      return { data: [], error: null };
    })
  } as unknown as StockClient;
  await act(async () => {
    await r.loadStockCatalogue(client);
    await pause();
  });
  const replacement = deferred();
  let other!: Promise<boolean>, again!: Promise<boolean>;
  act(() => {
    other = r.loadStockCatalogue({
      rpc: vi.fn(() => replacement.promise)
    } as unknown as StockClient);
    again = r.loadStockCatalogue(client);
  });
  await act(async () => {
    costs.resolve({
      data: [{ item_id: 'old', name: 'Retired cost', active: true, unit_cost: 123 }],
      error: null
    });
    await pause();
  });
  const cost = (r as unknown as { costPerUnit: (name: string) => number }).costPerUnit(
    'Retired cost'
  );
  expect(Number.isNaN(cost)).toBe(true);
  await act(async () => {
    replacement.resolve({ data: empty, error: null });
    nextRead.resolve({ data: empty, error: null });
    expect(await other).toBe(false);
    expect(await again).toBe(true);
  });
});

it('retires an older same-client cost read when a new catalogue begins', async () => {
  const r = await mounted(),
    costs = deferred(),
    paid = deferred();
  let paidReads = 0;
  const client = {
    rpc: vi.fn(async (name: string) => {
      if (name === 'get_stock_catalogue') return { data: empty, error: null };
      if (name === 'get_last_paid' && ++paidReads === 2) return paid.promise;
      if (name === 'get_item_costs') return costs.promise;
      return { data: [], error: null };
    })
  } as unknown as StockClient;
  await act(async () => {
    await r.loadStockCatalogue(client);
    await pause();
  });
  let loading!: Promise<boolean>;
  await act(async () => {
    loading = r.loadStockCatalogue(client);
    await pause();
  });
  await act(async () => {
    costs.resolve({
      data: [{ item_id: 'old', name: 'Earlier catalogue cost', active: true, unit_cost: 123 }],
      error: null
    });
    await pause();
  });
  expect(
    Number.isNaN(
      (r as unknown as { costPerUnit: (name: string) => number }).costPerUnit(
        'Earlier catalogue cost'
      )
    )
  ).toBe(true);
  await act(async () => {
    paid.resolve({ data: [], error: null });
    expect(await loading).toBe(true);
  });
});
