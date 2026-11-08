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

it('retries production balances locally and retains the last read on refresh failure', async () => {
  const runtime = await mounted(),
    f = source();
  let fail = true;
  const rpc = vi.fn(async () =>
    fail
      ? { data: null, error: { code: '08006' } }
      : {
          data: {
            batches: [],
            shortfalls: [],
            dough: [{ product_id: 'dcf', balls: 7, at: null }],
            baked: []
          },
          error: null
        }
  );
  await act(async () => {
    await runtime.loadStockCatalogue(f.client);
    runtime.go('inventory');
    await runtime.loadProduction({
      rpc
    } as unknown as import('@/lib/data/production').ProductionClient);
  });
  const ui = render(<InventoryLive v={runtime.renderVals()} />);
  fireEvent.click(ui.getByRole('button', { name: 'Dough in the fridge' }));
  expect(ui.queryByRole('button', { name: 'Count stock' })).toBeNull();
  expect(ui.getByText('Production balances are unavailable.')).toBeTruthy();
  fail = false;
  await act(async () => {
    fireEvent.click(ui.getByRole('button', { name: 'Retry production balances' }));
    await pause();
  });
  ui.rerender(<InventoryLive v={runtime.renderVals()} />);
  expect(ui.getByText('7 balls')).toBeTruthy();
  fail = true;
  await act(async () => {
    await runtime.loadProduction(null);
  });
  ui.rerender(<InventoryLive v={runtime.renderVals()} />);
  expect(
    ui.getByText('Production could not be refreshed. Showing the last read balances.')
  ).toBeTruthy();
  expect(ui.getByText('7 balls')).toBeTruthy();
});

it('does not apply an old production read after an identity change or use a cached retry', async () => {
  const runtime = await mounted(),
    f = source();
  let answer!: (value: { data: unknown; error: null }) => void;
  const rpc = vi.fn(
    () =>
      new Promise<{ data: unknown; error: null }>((resolve) => {
        answer = resolve;
      })
  );
  let pending!: Promise<boolean>;
  await act(async () => {
    await runtime.loadStockCatalogue(f.client);
    runtime.go('inventory');
    pending = runtime.loadProduction({
      rpc
    } as unknown as import('@/lib/data/production').ProductionClient);
  });
  const retry = runtime.renderVals().liveStock!.madeRead!.retry;
  await act(async () => {
    await runtime.setProductionIdentity({ ...owner, business: 'https://two.test' });
    answer({
      data: {
        batches: [],
        shortfalls: [],
        dough: [{ product_id: 'dcf', balls: 99, at: null }],
        baked: []
      },
      error: null
    });
    expect(await pending).toBe(false);
    retry();
  });
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(runtime.state.dough).toEqual({});
});

it('retires Stock balance Retry across client ABA, period changes and role ABA', async () => {
  const r = await mounted(),
    f = source();
  const rpc = vi.fn(async () => ({
    data: { batches: [], dough: [], baked: [], shortfalls: [] },
    error: null
  }));
  const a = { rpc } as unknown as import('@/lib/data/production').ProductionClient;
  const b = { rpc: vi.fn(rpc) } as unknown as import('@/lib/data/production').ProductionClient;
  await act(async () => {
    await r.loadStockCatalogue(f.client);
    await r.loadProduction(a);
    r.go('inventory');
  });
  const oldClient = r.renderVals().liveStock!.madeRead!.retry;
  await act(async () => {
    await r.loadProduction(b);
    await r.loadProduction(a);
  });
  let before = rpc.mock.calls.length;
  await act(async () => {
    oldClient();
    await pause();
  });
  expect(rpc).toHaveBeenCalledTimes(before);
  const oldPeriod = r.renderVals().liveStock!.madeRead!.retry;
  act(() => r.setState({ dropNo: Number(r.state.dropNo) + 1 }));
  await act(async () => {
    oldPeriod();
    await pause();
  });
  expect(rpc).toHaveBeenCalledTimes(before);
  const oldRole = r.renderVals().liveStock!.madeRead!.retry;
  act(() => r.setRole('helper'));
  act(() => r.setRole('owner'));
  before = rpc.mock.calls.length;
  await act(async () => {
    oldRole();
    await pause();
  });
  expect(rpc).toHaveBeenCalledTimes(before);
});

it('hides balances from another drop and only shows loading for the drop being read', async () => {
  const r = await mounted(),
    f = source(),
    pending = deferred();
  const data = {
    batches: [],
    shortfalls: [],
    dough: [{ product_id: 'dcf', balls: 7, at: null }],
    baked: [{ product_id: 'dcf', qty: 4 }]
  };
  await act(async () => {
    await r.loadStockCatalogue(f.client);
    await r.loadProduction({ rpc: vi.fn(async () => ({ data, error: null })) } as never);
    r.go('inventory');
  });
  const drop = Number(r.state.dropNo);
  expect(r.renderVals().liveStock!.madeRead).toMatchObject({ state: 'read', stale: false });
  act(() => r.setState({ dropNo: drop + 1 }));
  expect(r.renderVals().liveStock!.made).toBeNull();
  expect(r.renderVals().liveStock!.madeRead).toMatchObject({ state: 'failed', stale: false });
  let loading!: Promise<boolean>;
  act(() => {
    loading = r.loadProduction({ rpc: vi.fn(() => pending.promise) } as never);
  });
  expect(r.renderVals().liveStock!.madeRead?.state).toBe('loading');
  act(() => r.setState({ dropNo: drop + 2 }));
  expect(r.renderVals().liveStock!.made).toBeNull();
  expect(r.renderVals().liveStock!.madeRead).toMatchObject({ state: 'failed', stale: false });
  await act(async () => {
    pending.resolve({ data, error: null });
    expect(await loading).toBe(false);
  });
  expect(r.renderVals().liveStock!.made).toBeNull();
});

it('keeps a retired inventory read recoverable after production workspace Retry', async () => {
  const locks = Object.getOwnPropertyDescriptor(navigator, 'locks');
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  try {
    const r = await mounted(),
      held = deferred();
    let first = true;
    const rpc = vi.fn(async (name: string) => {
      if (name === 'get_stock_catalogue' && first) {
        first = false;
        return held.promise;
      }
      return { data: name === 'get_stock_catalogue' ? empty : [], error: null };
    });
    let pending!: Promise<boolean>;
    act(() => {
      pending = r.loadStockCatalogue({ rpc } as unknown as StockClient);
      r.go('bake');
    });
    await act(async () => {
      const retry = r.renderVals().liveProduction!.recovery?.retry;
      expect(retry).toBeTypeOf('function');
      retry!();
      await pause();
    });
    await act(async () => {
      held.resolve({ data: empty, error: null });
      expect(await pending).toBe(false);
      r.go('inventory');
    });
    expect(r.renderVals().liveStockRead?.state).not.toBe('loading');
    expect(r.renderVals().liveStock).toBeNull();
    const view = render(<InventoryLive v={r.renderVals()} />);
    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: 'Retry inventory' }));
      await pause();
    });
    expect(r.renderVals().liveStockRead?.state).toBe('ready');
    expect(r.renderVals().liveStock?.items).toEqual([]);
    expect(rpc.mock.calls.filter(([name]) => name === 'get_stock_catalogue')).toHaveLength(2);
  } finally {
    if (locks) Object.defineProperty(navigator, 'locks', locks);
    else Reflect.deleteProperty(navigator, 'locks');
  }
});
