import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';

vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => true }));
type Row = Record<string, unknown> & { clientId: string };
const store = new Map<string, Row>();
vi.mock('@/lib/offline/idb', () => ({
  idb: {
    put: async (v: Row) => void store.set(v.clientId, JSON.parse(JSON.stringify(v)) as Row),
    all: async () => [...store.values()],
    get: async (k: string) => store.get(k),
    delete: async (k: string) => void store.delete(k),
    supported: () => true
  }
}));
vi.mock('@/lib/device', () => ({ deviceId: () => 'dev1' }));

import { OpsRuntime } from '@/store/ops-runtime';
import { bindProductionOwner } from './production-runtime-helpers';
import { PRODUCTS } from '@/store/engine/ops-engine';
import type { LiveHome } from '@/view-models/vals';
import { HomeLive } from '@/components/live/home/home-live';
import { ordersRead, type OrdersReadSnapshot } from '@/lib/orders/orders-read-state';

/** Live Home: every figure from the record that owns it; unknown is never shown as zero. */
type Wire = Record<string, unknown>;
const STAMP = '2026-10-30T02:00:00.000Z';
const item = (over: Wire): Wire => ({
  id: 'flour',
  name: 'Bread flour',
  category: 'Ingredients',
  unit: 'g',
  on_hand: 4000,
  par_level: 3000,
  pack_size: 1000,
  pack_label: '1 kg',
  supplier_id: null,
  use_by_days: null,
  last_counted: STAMP,
  active: true,
  updated_at: STAMP,
  ...over
});
const order = (id: string, state: string): Wire => ({
  id,
  name: 'Ana Cruz',
  phone: '09171234567',
  ig: '',
  state,
  pay_state: state === 'Payment review' ? 'unpaid' : 'confirmed',
  pay_method: 'GCash',
  pay_ref: null,
  total_cents: 20000,
  paid_cents: state === 'Payment review' ? null : 20000,
  refund_ref: null,
  pickup_date: '2026-11-05',
  pickup_window: '10:00',
  placed_at: '2026-11-01T01:00:00.000Z',
  updated_at: STAMP,
  status_token: 'b'.repeat(64),
  holds: true,
  items: [{ product_id: PRODUCTS[0]!.id, qty: 2, unit_price_cents: 10000, unavailable: false }],
  swaps: []
});
const rpc = vi.fn(async (name: string) => {
  if (name === 'get_stock_catalogue')
    return {
      data: {
        suppliers: [],
        prices: [],
        items: [
          item({}),
          item({ id: 'butter', name: 'Butter', on_hand: 0 }),
          item({ id: 'pouch', name: 'Pouch', category: 'Packaging', on_hand: 7, par_level: 10 }),
          item({ id: 'sugar', name: 'Sugar', on_hand: 0, last_counted: null }),
          item({
            id: 'eggs',
            name: 'Eggs',
            unit: 'pcs',
            on_hand: 30,
            par_level: 12,
            last_counted: null
          }),
          item({ id: 'old', name: 'Old jar', active: false, on_hand: 0 })
        ]
      },
      error: null
    };
  if (name === 'get_staff_orders')
    return {
      data: [
        order('HC-1', 'Payment review'),
        order('HC-2', 'Confirmed'),
        order('HC-3', 'Preparing'),
        order('HC-4', 'Ready')
      ],
      error: null
    };
  return { data: [], error: null };
});

async function mounted(load: boolean) {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
  const runtime = ref.current!;
  act(() => runtime.setRole('owner'));
  await bindProductionOwner(runtime);
  if (load)
    await act(async () => {
      await runtime.loadStockCatalogue({ rpc } as never);
      await runtime.loadOrders({ rpc } as never);
    });
  act(() => runtime.go('today'));
  return runtime;
}
const home = (r: OpsRuntime) => r.renderVals().liveHome as LiveHome;

describe('the live Home', () => {
  beforeEach(() => store.clear());
  afterEach(() => {
    cleanup();
    ordersRead.reset();
  });

  it('counts open orders by their saved status', async () => {
    const r = await mounted(true);
    expect(home(r).orders).toEqual({ review: 1, toPrepare: 2, ready: 1 });
  });

  it('opens receiving directly and starts or resumes the existing count without posting stock', async () => {
    const r = await mounted(true);
    const ui = render(<HomeLive v={r.renderVals()} />);
    await act(async () => {
      fireEvent.click(ui.getByRole('button', { name: /Add to inventory/ }));
    });
    expect(r.state.screen).toBe('inventory');
    expect(r.renderVals().liveStock?.receive?.lines.map((line) => line.itemName)).toEqual([
      'Bread flour'
    ]);
    act(() => {
      r.renderVals().liveStock?.receive?.close();
      r.go('today');
    });
    ui.rerender(<HomeLive v={r.renderVals()} />);
    await act(async () => {
      fireEvent.click(ui.getByRole('button', { name: /Count stock/ }));
    });
    expect(r.state.stocktake).toMatchObject({
      counts: {},
      items: expect.arrayContaining(['Bread flour'])
    });
    act(() =>
      (r as unknown as { countInput: (name: string, value: string) => void }).countInput(
        'Bread flour',
        '0'
      )
    );
    act(() => r.go('today'));
    const pending = r.state.stocktake;
    await act(async () => home(r).go.count());
    expect(r.state.stocktake).toBe(pending);
    expect(r.state.stocktake).toMatchObject({ counts: { 'Bread flour': '0' } });
    expect(rpc.mock.calls.some(([name]) => name === 'record_stock_movement')).toBe(false);
  });

  it('rejects stale Home stock shortcuts after the owner role changes', async () => {
    const r = await mounted(true),
      actions = home(r).go;
    act(() => r.setRole('helper'));
    const screen = r.state.screen;
    await act(async () => {
      actions.receive();
      actions.count();
    });
    expect(r.state.screen).toBe(screen);
    expect(r.state.sheet).toBeNull();
    expect(r.state.stocktake).toBeNull();
  });

  it('separates unknown zero from confirmed empty and retains positive recorded stock without a count date', async () => {
    const r = await mounted(true);
    const h = home(r);
    // Bread flour: counted, plenty. Butter: 0, counted. Pouch: low. Sugar: 0 recorded, never counted.
    // Eggs: stock on hand but no count date, so it stays In stock, exactly as the Stock page shows it.
    expect(h.stockCounts).toEqual({ ok: 2, low: 1, out: 1, unknown: 1, neverCounted: 2 });
    const stock = r.renderVals().liveStock!;
    expect(stock.items.find((row) => row.id === 'sugar')?.confidence).toBe('unknown');
    expect(stock.items.find((row) => row.id === 'eggs')?.confidence).toBe('recorded');
    expect(stock.counts).toEqual({ total: 5, out: 1, low: 1 });
    expect(stock.grocery.rows.some((row) => row.itemId === 'sugar')).toBe(false);
    expect(stock.grocery.unknownCount).toBe(1);
    expect(h.stockAttention.map((a) => [a.name, a.status])).toEqual([
      ['Butter', 'Out'],
      ['Pouch', 'Low'],
      ['Sugar', 'Not counted']
    ]);
    expect(h.stockAttention[2]!.detail).toContain('never counted');
    // Mutation: a Home-only rule would call Eggs unknown while Stock shows its balance.
  });

  it('shows a dash, not zero, while orders and stock are still loading', async () => {
    const r = await mounted(false);
    const h = home(r);
    expect(h.orders).toBeNull();
    expect(h.stockCounts).toBeNull();
    expect(h.month).toBeNull();
    const view = render(<HomeLive v={r.renderVals()} />);
    expect(view.getAllByText('—')).toHaveLength(3);
    expect(view.getByText('Orders are still loading.')).toBeTruthy();
    expect(view.getByText('Your books are still loading.')).toBeTruthy();
  });
  it('HCB-002i: a failed first orders read says so; a read still out says loading; a good read counts', async () => {
    const r = await mounted(false);
    const reader = {};
    const snap = (over: Partial<OrdersReadSnapshot>): OrdersReadSnapshot => ({
      phase: 'idle',
      everRead: false,
      readAt: null,
      dropped: 0,
      savedNotRefreshed: null,
      retry: null,
      ...over
    });
    ordersRead.claim(reader);
    ordersRead.publish(reader, snap({ phase: 'loading' }));
    const view = render(<HomeLive v={r.renderVals()} />);
    expect(view.getByText('Orders are still loading.')).toBeTruthy();
    expect(view.queryByText(/could not be read/)).toBeNull();
    await act(async () => ordersRead.publish(reader, snap({ phase: 'failed' })));
    expect(view.getByText('Your orders could not be read. Open Orders to retry.')).toBeTruthy();
    expect(view.queryByText('Orders are still loading.')).toBeNull();
    expect(view.getAllByText('—')).toHaveLength(3);
    // Mutation: reading the failure from nowhere keeps saying "still loading" for a read that ended.
    cleanup();
    const good = await mounted(true);
    const ui = render(<HomeLive v={good.renderVals()} />);
    expect(ui.queryByText('Orders are still loading.')).toBeNull();
    expect(ui.queryByText(/could not be read/)).toBeNull();
    expect(ui.queryAllByText('—')).toHaveLength(0);
  });
  it('counts unknown stock once in the visible Home bar', async () => {
    const r = await mounted(true);
    const view = render(<HomeLive v={r.renderVals()} />);
    expect(
      view.getByRole('img', { name: '1 Out, 1 Low, 2 In stock, 1 Unknown count' })
    ).toBeTruthy();
    expect(view.queryByText('No stock items yet.')).toBeNull();
    expect(view.getByText('2 items short · 1 item needs a count')).toBeTruthy();
  });

  it('recovers unavailable Home stock locally and warns when showing a last-good read', async () => {
    const r = await mounted(false);
    let fail = true;
    const client = {
      rpc: vi.fn(async (name: string) =>
        name === 'get_stock_catalogue' && fail
          ? { data: null, error: { code: '08006' } }
          : rpc(name)
      )
    };
    await act(async () => {
      await r.loadStockCatalogue(client as never);
    });
    const view = render(<HomeLive v={r.renderVals()} />);
    expect(view.getByText('Inventory is unavailable')).toBeTruthy();
    expect(view.queryByText('Stock is still loading.')).toBeNull();
    fail = false;
    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: 'Retry inventory' }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    view.rerender(<HomeLive v={r.renderVals()} />);
    expect(view.queryByText('Inventory is unavailable')).toBeNull();
    expect(
      view.getByRole('img', { name: '1 Out, 1 Low, 2 In stock, 1 Unknown count' })
    ).toBeTruthy();
    fail = true;
    await act(async () => {
      await r.loadStockCatalogue(client as never);
    });
    view.rerender(<HomeLive v={r.renderVals()} />);
    expect(view.getByText('Inventory could not be refreshed')).toBeTruthy();
    expect(
      view.getByRole('img', { name: '1 Out, 1 Low, 2 In stock, 1 Unknown count' })
    ).toBeTruthy();
  });
  it('shows an all-unknown stock chart without claiming empty inventory', async () => {
    const r = await mounted(false);
    await act(async () => {
      await r.loadStockCatalogue({
        rpc: vi.fn(async (name: string) => ({
          data:
            name === 'get_stock_catalogue'
              ? { suppliers: [], prices: [], items: [item({ on_hand: 0, last_counted: null })] }
              : [],
          error: null
        }))
      } as never);
    });
    const view = render(<HomeLive v={r.renderVals()} />);
    expect(
      view.getByRole('img', { name: '0 Out, 0 Low, 0 In stock, 1 Unknown count' })
    ).toBeTruthy();
    expect(view.queryByText('No stock items yet.')).toBeNull();
    expect(view.getByText('1 item needs a count')).toBeTruthy();
    expect(view.queryByText('1 item short')).toBeNull();
  });
  it.each([
    ['2026-11-08T15:59:00Z', 'Good evening', 'Sunday, 8 Nov'],
    ['2026-11-08T16:00:00Z', 'Good morning', 'Monday, 9 Nov'],
    ['2026-11-09T03:59:00Z', 'Good morning', 'Monday, 9 Nov'],
    ['2026-11-09T04:00:00Z', 'Good afternoon', 'Monday, 9 Nov'],
    ['2026-11-09T09:59:00Z', 'Good afternoon', 'Monday, 9 Nov'],
    ['2026-11-09T10:00:00Z', 'Good evening', 'Monday, 9 Nov']
  ])(
    'uses the business day and greeting on a UTC device at %s',
    async (instant, salutation, day) => {
      vi.stubEnv('TZ', 'UTC');
      try {
        const r = await mounted(false);
        act(() => r.setState({ now: Date.parse(instant) }));
        expect(home(r).greeting).toBe(`${salutation}, Owner.`);
        expect(home(r).dateText).toBe(day);
      } finally {
        vi.unstubAllEnvs();
      }
    }
  );
});
