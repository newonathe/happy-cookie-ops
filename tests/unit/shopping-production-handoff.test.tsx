import { act } from 'react';
import { render, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { OpsRuntime } from '@/store/ops-runtime';
import type { Recipe } from '@/lib/data/recipes';
import type { BakePlan } from '@/store/bake-plan';
import type { ProductionRecoveryEntry } from '@/lib/production/recovery';
import { bindProductionOwner } from './production-runtime-helpers';
import { PRODUCTS, ALLERGENS, replaceFlavours } from '@/store/engine/ops-engine';
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => true }));
const original = { products: PRODUCTS.map((p) => ({ ...p })), allergens: { ...ALLERGENS } };
afterEach(() => {
  cleanup();
  localStorage.clear();
  replaceFlavours(original.products, original.allergens);
});
interface Access {
  bakePlan: BakePlan;
  productionClient: unknown;
  recipeRows: Recipe[] | null;
  recipeReaderState: 'loading' | 'read' | 'failed';
  productionEntry: ProductionRecoveryEntry | null;
}
function choose(plan: BakePlan, quantity = '8') {
  plan.vals().edit();
  for (const row of plan.vals().rows) plan.vals().removeRow(row.key);
  plan.vals().addRow();
  const key = plan.vals().rows[0].key;
  plan.vals().setProduct(key, 'dcf');
  plan.vals().setCookies(key, quantity);
  plan.vals().use();
}
async function setup() {
  let runtime!: OpsRuntime;
  render(
    <OpsRuntime
      ref={(r) => {
        if (r) runtime = r;
      }}
    />
  );
  await act(async () => {
    runtime.setRole('owner');
    runtime.go('grocery');
  });
  const scope = await bindProductionOwner(runtime);
  const access = runtime as unknown as Access;
  const stamp = '2026-11-08T00:00:00Z';
  const data: Record<string, unknown> = {
    get_flavours: [
      {
        id: 'dcf',
        name: 'Chocolate cookie',
        short_name: 'Chocolate',
        price_cents: 12500,
        kind: 'Permanent',
        tag: '',
        description: '',
        image_path: '',
        allergens: 'milk',
        active: true,
        published: false,
        sort_order: 0,
        item_type: 'cookie',
        capacity_weight: 1,
        updated_at: stamp
      }
    ],
    get_stock_catalogue: {
      suppliers: [],
      prices: [],
      items: [
        {
          id: 'flour',
          name: 'Flour',
          unit: 'g',
          category: 'Ingredients',
          on_hand: 4000,
          par_level: 1000,
          pack_size: 1000,
          pack_label: '1 kg',
          supplier_id: null,
          use_by_days: null,
          last_counted: null,
          active: true,
          updated_at: stamp
        }
      ]
    },
    get_last_paid: [],
    get_staff_orders: [],
    get_production: { batches: [], dough: [], baked: [], shortfalls: [] },
    get_recipes: [
      {
        product_id: 'dcf',
        yield: 12,
        version: 3,
        updated_at: stamp,
        lines: [{ name: 'Flour', qty: 250, unit: 'g' }],
        history: []
      }
    ]
  };
  const rpc = vi.fn(async (name: string) => {
    if (!(name in data)) throw Error('Handoff must not write: ' + name);
    return { data: data[name], error: null };
  });
  const client = { rpc };
  await act(async () => {
    await runtime.loadFlavours(client as never);
    await runtime.loadStockCatalogue(client as never);
    await runtime.loadRecipes(client as never, undefined, undefined, scope);
    await runtime.loadOrders(client as never);
    await runtime.loadProduction(client as never);
  });
  act(() => choose(access.bakePlan));
  return { runtime, access, rpc };
}
it('hands the saved Shopping quantity and recipe version to an explicit production choice', async () => {
  const f = await setup();
  const start = f.access.bakePlan.vals().startProduction;
  expect(start).toBeTypeOf('function');
  act(() => start!());
  expect(f.runtime.state.screen).toBe('bake');
  expect(f.access.productionEntry?.choices).toMatchObject([
    { productId: 'dcf', quantity: '8', version: 3, kind: 'choose' }
  ]);
  expect(f.rpc.mock.calls.filter((c) => /^record_/.test(c[0]))).toEqual([]);
});
it.each(['client', 'period', 'identity', 'role', 'screen', 'plan', 'recipe'])(
  'keeps a stale Shopping action from starting after %s changes',
  async (change) => {
    const f = await setup(),
      start = f.access.bakePlan.vals().startProduction;
    expect(start).toBeTypeOf('function');
    if (change === 'client') f.access.productionClient = { rpc: vi.fn() };
    if (change === 'period')
      await act(async () => f.runtime.setState({ dropNo: Number(f.runtime.state.dropNo) + 1 }));
    if (change === 'identity') await act(async () => f.runtime.setProductionIdentity(null));
    if (change === 'role') await act(async () => f.runtime.setState({ role: 'helper' }));
    if (change === 'screen') await act(async () => f.runtime.setState({ screen: 'inventory' }));
    if (change === 'plan') act(() => choose(f.access.bakePlan, '16'));
    if (change === 'recipe')
      f.access.recipeRows = f.access.recipeRows!.map((r) => ({ ...r, version: 4 }));
    act(() => start!());
    expect(f.access.productionEntry).toBeNull();
    expect(f.rpc.mock.calls.filter((c) => /^record_/.test(c[0]))).toEqual([]);
  }
);
it('retains conflicting setup and offers the incoming Shopping plan', async () => {
  const f = await setup(),
    dropNo = Number(f.runtime.state.dropNo);
  const existing: ProductionRecoveryEntry = {
    dropNo,
    productId: '',
    quantity: '',
    version: 0,
    kind: 'batch',
    choices: [{ productId: 'dcf', quantity: '4', version: 3, kind: 'batch' }]
  };
  f.access.productionEntry = existing;
  const before = structuredClone(existing);
  act(() => f.access.bakePlan.vals().startProduction!());
  expect(f.access.productionEntry?.choices).toEqual(before.choices);
  expect(f.access.productionEntry?.handoff).toEqual({
    source: 'shopping',
    rows: [{ productId: 'dcf', quantity: '8', version: 3 }]
  });
  expect(existing).toEqual(before);
});

it('keeps a large shopping plan and explains the existing per-entry production limit', async () => {
  const f = await setup();
  act(() => choose(f.access.bakePlan, '10001'));
  const toast = vi.spyOn(f.runtime, 'toast');
  act(() => f.access.bakePlan.vals().startProduction!());
  expect(f.runtime.state.screen).toBe('grocery');
  expect(f.access.productionEntry).toBeNull();
  expect(f.access.bakePlan.vals().cookies).toBe(10001);
  expect(toast).toHaveBeenCalledWith(
    'Shopping plan kept. Make accepts at most 10,000 cookies per product in one production entry.',
    'warn'
  );
  expect(f.rpc.mock.calls.filter((c) => /^record_/.test(c[0]))).toEqual([]);
});
