import { act } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpsRuntime } from '@/store/ops-runtime';
import { PRODUCTS, ALLERGENS, replaceFlavours } from '@/store/engine/ops-engine';
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => true }));
vi.mock('@/lib/device', () => ({ deviceId: () => 'production-pool-test' }));
vi.mock('@/lib/offline/idb', () => ({ idb: { get: async () => null, set: async () => {}, del: async () => {}, supported: () => true } }));
const original = { products: PRODUCTS.map(p => ({ ...p })), allergens: { ...ALLERGENS } };
const [A, B] = original.products.slice(0, 2).map(p => p.id);
afterEach(() => { cleanup(); replaceFlavours(original.products, original.allergens); });
const saved = () => ({ data: [{ record_id: 'example', duplicate: false, used_dough: 0, shortfall: [] }], error: null });
async function mount() {
  let r!: OpsRuntime;
  render(<OpsRuntime ref={v => { if (v) r = v; }} />);
  const requests: Array<Record<string, unknown>> = [], replies: Array<(value: ReturnType<typeof saved>) => void> = [];
  const rpc = vi.fn(async (name: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: null }> => {
    if (name === 'record_production') {
      requests.push(structuredClone(args?.p_rec as Record<string, unknown>));
      return new Promise(resolve => replies.push(resolve));
    }
    const values: Record<string, unknown> = {
      get_flavours: original.products.slice(0, 2).map((p, i) => ({ id: p.id, name: p.name, short_name: p.short,
        price_cents: 12500, kind: 'Permanent', tag: '', description: '', image_path: p.img, allergens: 'milk',
        active: true, published: false, sort_order: i, item_type: 'cookie', capacity_weight: 1, updated_at: '2026-11-03T00:00:00Z' })),
      get_recipes: [A, B].map(id => ({ product_id: id, yield: 12, version: 3,
        updated_at: '2026-11-03T00:00:00Z', lines: [{ name: 'Butter', qty: 200, unit: 'g' }], history: [] })),
      get_stock_catalogue: { items: [], suppliers: [], prices: [] }, get_last_paid: [], get_staff_orders: [],
      get_production: { batches: [], dough: [], baked: [], shortfalls: [] }
    };
    if (!(name in values)) throw Error('Unexpected call: ' + name);
    return { data: values[name], error: null };
  });
  act(() => { r.setRole('owner'); r.setState({ dropNo: 5 }); r.go('bake'); });
  await act(async () => {
    const client = { rpc } as never;
    await r.loadFlavours(client); await r.loadStockCatalogue(client); await r.loadRecipes(client);
    await r.loadOrders(client); await r.loadProduction(client);
  });
  return { r, requests, replies };
}
const rows = (r: OpsRuntime) => r.renderVals().liveProduction?.inProgress ?? [];
function begin(r: OpsRuntime, pid: string, qty: string) {
  act(() => r.go('bake'));
  act(() => r.renderVals().liveProduction!.start!.open());
  act(() => r.renderVals().liveProduction!.start!.choose(pid));
  act(() => r.renderVals().liveProduction!.start!.setQuantity(qty));
  act(() => { expect(r.renderVals().liveProduction!.start!.begin()).toBe(true); });
}
function open(r: OpsRuntime, pid: string) {
  act(() => r.go('bake'));
  const work = rows(r).find(w => w.productId === pid)!;
  expect(work).toBeTruthy(); act(() => work.open());
}
describe('multiple production work items in the actual runtime', () => {
  it('starts manual dough with no orders, retains review beside a batch, and blocks stale modal callbacks', async () => {
    const { r, requests } = await mount(); begin(r, A, '24');
    act(() => r.go('bake'));
    act(() => r.renderVals().liveProduction!.start!.open());
    act(() => r.renderVals().liveProduction!.start!.choose(B));
    act(() => r.renderVals().liveProduction!.start!.chooseKind!('dough'));
    act(() => r.renderVals().liveProduction!.start!.setQuantity('6'));
    act(() => { expect(r.renderVals().liveProduction!.start!.begin()).toBe(true); });
    expect(r.renderVals().liveDough).toMatchObject({ balls: 6, reviewing: false, version: 3 });
    const old = r.renderVals().liveDough!;
    act(() => old.review());
    expect(r.renderVals().liveDough?.reviewing).toBe(true);
    act(() => r.renderVals().liveDough!.close());
    expect(rows(r)).toHaveLength(2);
    open(r, B);
    const current = r.state.doughPrep;
    act(() => { old.close(); old.discard(); old.portions[0].choose(); });
    expect(r.state.doughPrep).toBe(current);
    expect(r.renderVals().liveDough).toMatchObject({ balls: 6, reviewing: true });
    act(() => r.renderVals().liveDough!.close());
    open(r, A); expect(r.state.batch).toMatchObject({ actual: 24 });
    expect(requests).toHaveLength(0);
  });
  it('keeps a started recipe and period snapshot when the current source changes', async () => {
    const { r, requests } = await mount(); begin(r, A, '24');
    act(() => r.setState({ dropNo: 6, recipeVer: { [A]: 4, [B]: 3 } } as never));
    expect(r.renderVals().liveBatchCounts).toMatchObject({ recipeVersion: 3, periodText: 'Drop 5', sourceChanged: true });
    act(() => r.renderVals().liveBatchCounts!.confirm());
    expect(requests).toHaveLength(0);
  });
  it('reviews an updated saved recipe explicitly, keeps counts and rejects stale adoption callbacks', async () => {
    const { r, requests } = await mount(); begin(r, A, '24');
    act(() => r.renderVals().liveBatchCounts!.setActual('26'));
    act(() => r.renderVals().liveBatchCounts!.setRejects('2'));
    act(() => r.renderVals().batch!.setNote({ target: { value: 'Keep this tray' } }));
    act(() => r.renderVals().batch!.rows[0].plus());
    await act(async () => { await r.loadRecipes({ rpc: async () => ({ data: [A, B].map(id => ({
      product_id: id, yield: id === A ? 24 : 12, version: id === A ? 4 : 3,
      updated_at: '2026-11-03T01:00:00Z', lines: [{ name: 'Butter', qty: id === A ? 300 : 200, unit: 'g' }], history: []
    })), error: null }) } as never); });
    const update = r.renderVals().liveBatchCounts!.recipeUpdate!;
    expect(update).toMatchObject({ previousVersion: 3, version: 4, previousYield: 12, yield: 24 });
    expect(update.rows).toContainEqual({ name: 'Butter', previous: '200 g', current: '300 g' });
    act(() => update.use());
    expect(r.renderVals().liveBatchCounts).toMatchObject({ recipeVersion: 4, sourceChanged: false, actual: '26', rejects: '2', periodText: 'Drop 5' });
    expect(r.state.batch).toMatchObject({ target: 24, note: 'Keep this tray', adj: {}, step: 1 });
    begin(r, B, '12'); const selected = r.state.batch;
    act(() => update.use()); expect(r.state.batch).toBe(selected);
    expect(requests).toHaveLength(0);
  });
  it('keeps an old dough amount visible after recipe adoption and requires a valid full/half choice', async () => {
    const { r, requests } = await mount();
    act(() => r.renderVals().liveProduction!.start!.open());
    act(() => r.renderVals().liveProduction!.start!.choose(A));
    act(() => r.renderVals().liveProduction!.start!.chooseKind!('dough'));
    act(() => r.renderVals().liveProduction!.start!.setQuantity('6'));
    act(() => { expect(r.renderVals().liveProduction!.start!.begin()).toBe(true); });
    await act(async () => { await r.loadRecipes({ rpc: async () => ({ data: [{ product_id: A,
      yield: 24, version: 4, updated_at: '2026-11-03T01:00:00Z', lines: [{ name: 'Butter', qty: 300, unit: 'g' }], history: []
    }], error: null }) } as never); });
    act(() => r.renderVals().liveDough!.recipeUpdate!.use());
    expect(r.renderVals().liveDough).toMatchObject({ balls: 6, validAmount: false, reviewing: false, version: 4, sourceChanged: false });
    act(() => { r.renderVals().liveDough!.review(); r.renderVals().liveDough!.confirm(); });
    act(() => (r as unknown as { confirmDough: () => void }).confirmDough());
    expect(requests).toHaveLength(0);
    act(() => r.renderVals().liveDough!.portions[1].choose());
    expect(r.renderVals().liveDough).toMatchObject({ balls: 12, validAmount: true });
    act(() => r.renderVals().liveDough!.review());
    expect(r.renderVals().liveDough?.reviewing).toBe(true);
    expect(requests).toHaveLength(0);
  });
  it('keeps counts, exceptions, note and review through another flavour and cross-section Back', async () => {
    const { r, requests } = await mount(); begin(r, A, '24');
    act(() => r.renderVals().liveBatchCounts!.setActual('26'));
    act(() => r.renderVals().liveBatchCounts!.setRejects('2'));
    act(() => r.renderVals().batch!.setNote({ target: { value: 'Tray two' } }));
    act(() => r.renderVals().batch!.rows[0].plus());
    act(() => r.renderVals().liveBatchCounts!.review());
    begin(r, B, '12'); act(() => r.go('bake'));
    expect(rows(r)).toHaveLength(2);
    open(r, A);
    expect(r.state.batch).toMatchObject({ pid: A, target: 24, actual: 26, rejects: 2, note: 'Tray two', step: 2, adj: { Butter: 1 } });
    act(() => r.go('sales')); const previous = (r.state.history as string[]).at(-1);
    act(() => r.renderVals().goBack());
    expect(r.state.screen).toBe(previous);
    open(r, A);
    expect(r.state.batch).toMatchObject({ actual: 26, note: 'Tray two', step: 2 });
    open(r, B); expect(r.state.batch).toMatchObject({ actual: 12, rejects: 0 });
    expect(requests).toHaveLength(0);
  });
  it.each([false, true])('edits/saves B while A saves and scopes replies (B answered first: %s)', async (reverse) => {
    const { r, requests, replies } = await mount(); begin(r, A, '24'); begin(r, B, '12'); open(r, A);
    act(() => r.renderVals().liveBatchCounts!.review());
    act(() => r.renderVals().liveBatchCounts!.confirm());
    open(r, B); act(() => r.renderVals().liveBatchCounts!.setActual('14'));
    expect(r.state.batch).toMatchObject({ pid: B, actual: 14 });
    act(() => r.renderVals().liveBatchCounts!.review());
    act(() => r.renderVals().liveBatchCounts!.confirm());
    expect(requests).toHaveLength(2);
    expect(requests[0].product_id).toBe(A); expect(requests[1].product_id).toBe(B);
    expect(requests[0].id).not.toBe(requests[1].id);
    await act(async () => { replies[reverse ? 1 : 0](saved()); });
    if (!reverse) expect(r.state.batch).toMatchObject({ pid: B, actual: 14 });
    act(() => r.go('bake'));
    expect(rows(r).map(w => w.productId)).toEqual([reverse ? A : B]);
    if (reverse) open(r, A);
    await act(async () => { replies[reverse ? 0 : 1](saved()); });
    expect(r.state.batch).toBeNull();
    act(() => r.go('bake'));
    expect(rows(r)).toHaveLength(0);
  });
});
