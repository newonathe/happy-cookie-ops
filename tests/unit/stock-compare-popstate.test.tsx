import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, render } from '@testing-library/react';

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
import { RouteSync } from '@/components/app/route-sync';

/** HCB-012: browser Back from Compare prices lands on Shopping and leaves no item page open for the next Inventory visit. */
const STAMP = '2026-09-30T02:00:00.123456+00:00';
const catalogue = {
  suppliers: [
    { id: 'sr', name: 'S&R', phone: '', notes: '', place: '', active: true, updated_at: STAMP }
  ],
  items: [
    {
      id: 'eggs',
      name: 'Eggs',
      category: 'Ingredients',
      unit: 'pcs',
      on_hand: 20,
      par_level: 60,
      pack_size: 30,
      pack_label: 'tray',
      supplier_id: 'sr',
      use_by_days: null,
      last_counted: null,
      active: true,
      updated_at: STAMP
    }
  ],
  prices: []
};
const client = {
  rpc: vi.fn(async (name: string) => ({
    data: name === 'get_stock_catalogue' ? catalogue : name === 'get_item_movements' ? [] : null,
    error: null
  }))
};
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 30))));

beforeEach(() => {
  localStorage.clear();
  store.clear();
  window.history.replaceState(null, '', '/today');
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

it('browser Back from Compare prices pops to Shopping, and the next Inventory visit shows the list', async () => {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(
    <OpsRuntime ref={(r) => void (ref.current = r)}>
      <RouteSync initialScreen="today" />
    </OpsRuntime>
  );
  const runtime = ref.current!;
  act(() => runtime.setRole('owner'));
  await act(async () => {
    await runtime.loadStockCatalogue(client as never);
  });
  await settle();
  act(() => runtime.go('grocery'));
  await settle();
  expect(window.location.pathname).toBe('/grocery');
  const row = runtime.renderVals().liveStock!.grocery.rows.find((r) => r.name === 'Eggs')!;
  act(() => row.compare?.());
  await settle();
  expect(window.location.pathname).toBe('/inventory');
  expect(runtime.renderVals().liveStock?.page?.item.id).toBe('eggs');

  await act(async () => {
    window.history.back();
    await new Promise((r) => setTimeout(r, 50));
  });
  expect(window.location.pathname).toBe('/grocery');
  expect(runtime.state.screen).toBe('grocery');
  expect(runtime.state.liveStockReturn ?? null).toBeNull();
  expect(runtime.state.liveStockOpen ?? null).toBeNull();

  act(() => runtime.go('inventory'));
  await settle();
  expect(runtime.state.screen).toBe('inventory');
  expect(runtime.renderVals().liveStock?.page ?? null).toBeNull();
});
