import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { OpsRuntime } from '@/store/ops-runtime';
import { ALLERGENS, PRODUCTS, replaceFlavours } from '@/store/engine/ops-engine';
import { bindProductionOwner } from './production-runtime-helpers';

vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => true }));
const original = { products: PRODUCTS.map((row) => ({ ...row })), allergens: { ...ALLERGENS } };
const A = {
  userId: '11111111-1111-4111-8111-111111111111',
  business: 'https://catalogue-one.test'
};
const B = { ...A, business: 'https://catalogue-two.test' };
const stamp = '2026-11-07T00:00:00Z';
const order = (id: string, productId: string) => ({
  id,
  name: 'Synthetic order',
  phone: '',
  state: 'Confirmed',
  pay_state: 'confirmed',
  total_cents: 10000,
  updated_at: stamp,
  placed_at: stamp,
  items: [{ product_id: productId, qty: 1, unit_price_cents: 10000 }]
});
const flavour = {
  id: 'dcf',
  name: 'Chocolate',
  short_name: 'Chocolate',
  price_cents: 10000,
  kind: 'Permanent',
  tag: '',
  description: '',
  image_path: null,
  allergens: '',
  active: true,
  published: false,
  sort_order: 0,
  item_type: 'cookie',
  capacity_weight: 1,
  updated_at: stamp
};
afterEach(() => {
  cleanup();
  replaceFlavours(original.products, original.allergens);
});
async function mount() {
  let runtime!: OpsRuntime;
  render(
    <OpsRuntime
      ref={(value) => {
        if (value) runtime = value;
      }}
    />
  );
  act(() => runtime.setRole('owner'));
  await bindProductionOwner(runtime, A);
  return runtime;
}
function client(id: string, productId: string) {
  return {
    rpc: vi.fn(async (name: string) => {
      if (name === 'get_flavours') return { data: [flavour], error: null };
      if (name === 'get_staff_orders') return { data: [order(id, productId)], error: null };
      throw Error('Unexpected catalogue test RPC: ' + name);
    })
  };
}

it('clears retired order rows before a new verified catalogue removes their flavour', async () => {
  const r = await mount(),
    old = client('OLD', 'hc'),
    fresh = client('CURRENT', 'dcf');
  await act(async () => {
    expect(await r.loadOrders(old as never)).toBe(true);
  });
  expect(r.state.orders).toMatchObject([{ id: 'OLD', items: { hc: 1 } }]);
  await bindProductionOwner(r, B);
  expect(r.state.orders).toEqual([]);
  await act(async () => {
    expect(await r.loadFlavours(fresh as never)).toBe(true);
  });
  expect(PRODUCTS.map((row) => row.id)).toEqual(['dcf']);
  expect(() => r.renderVals()).not.toThrow();
  await act(async () => {
    expect(await r.loadOrders(fresh as never)).toBe(true);
  });
  expect(r.state.orders).toMatchObject([{ id: 'CURRENT' }]);
});

it('ignores a retired order read after the new owner catalogue and orders are in place', async () => {
  const r = await mount(),
    fresh = client('CURRENT', 'dcf');
  let reply!: (value: { data: ReturnType<typeof order>[]; error: null }) => void;
  const old = {
    rpc: vi.fn(
      () =>
        new Promise<{ data: ReturnType<typeof order>[]; error: null }>((resolve) => {
          reply = resolve;
        })
    )
  };
  let pending!: Promise<boolean>;
  await act(async () => {
    pending = r.loadOrders(old as never);
  });
  await bindProductionOwner(r, B);
  await act(async () => {
    await r.loadFlavours(fresh as never);
    expect(await r.loadOrders(fresh as never)).toBe(true);
  });
  await act(async () => {
    reply({ data: [order('OLD', 'hc')], error: null });
    expect(await pending).toBe(false);
  });
  expect(r.state.orders).toMatchObject([{ id: 'CURRENT', items: { dcf: 1 } }]);
  expect(() => r.renderVals()).not.toThrow();
});
