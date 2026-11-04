import { act } from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpsRuntime } from '@/store/ops-runtime';
import { bindProductionOwner } from './production-runtime-helpers';
import { readProductionRecovery, type ProductionRecoveryScope } from '@/lib/production/recovery';
import { PRODUCTS, ALLERGENS, replaceFlavours } from '@/store/engine/ops-engine';
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => true }));
vi.mock('@/lib/device', () => ({ deviceId: () => 'production-pool-test' }));
vi.mock('@/lib/offline/idb', () => ({
  idb: { get: async () => null, set: async () => {}, del: async () => {}, supported: () => true }
}));
const original = { products: PRODUCTS.map((p) => ({ ...p })), allergens: { ...ALLERGENS } };
const [A, B] = original.products.slice(0, 2).map((p) => p.id);
afterEach(() => {
  cleanup();
  replaceFlavours(original.products, original.allergens);
});
const saved = () => ({
  data: [{ record_id: 'example', duplicate: false, used_dough: 0, shortfall: [] }],
  error: null
});
async function mount(identity?: ProductionRecoveryScope) {
  let r!: OpsRuntime;
  const view = render(
    <OpsRuntime
      ref={(v) => {
        if (v) r = v;
      }}
    />
  );
  const requests: Array<Record<string, unknown>> = [],
    replies: Array<(value: ReturnType<typeof saved>) => void> = [];
  const durableAtSend: boolean[] = [];
  const rpc = vi.fn(
    async (
      name: string,
      args?: Record<string, unknown>
    ): Promise<{ data: unknown; error: null }> => {
      if (name === 'record_production') {
        requests.push(structuredClone(args?.p_rec as Record<string, unknown>));
        durableAtSend.push(
          readProductionRecovery(scope).value?.requests.some(
            (row) => row.fields.id === (args?.p_rec as Record<string, unknown>).id
          ) === true
        );
        return new Promise((resolve) => replies.push(resolve));
      }
      const values: Record<string, unknown> = {
        get_flavours: original.products.slice(0, 2).map((p, i) => ({
          id: p.id,
          name: p.name,
          short_name: p.short,
          price_cents: 12500,
          kind: 'Permanent',
          tag: '',
          description: '',
          image_path: p.img,
          allergens: 'milk',
          active: true,
          published: false,
          sort_order: i,
          item_type: 'cookie',
          capacity_weight: 1,
          updated_at: '2026-11-03T00:00:00Z'
        })),
        get_recipes: [A, B].map((id) => ({
          product_id: id,
          yield: 12,
          version: 3,
          updated_at: '2026-11-03T00:00:00Z',
          lines: [{ name: 'Butter', qty: 200, unit: 'g' }],
          history: []
        })),
        get_stock_catalogue: { items: [], suppliers: [], prices: [] },
        get_last_paid: [],
        get_staff_orders: [],
        get_production: { batches: [], dough: [], baked: [], shortfalls: [] }
      };
      if (!(name in values)) throw Error('Unexpected call: ' + name);
      return { data: values[name], error: null };
    }
  );
  act(() => {
    r.setRole('owner');
    r.setState({ dropNo: 5 });
    r.go('bake');
  });
  const scope = await bindProductionOwner(r, identity);
  await act(async () => {
    const client = { rpc } as never;
    await r.loadFlavours(client);
    await r.loadStockCatalogue(client);
    await r.loadRecipes(client);
    await r.loadOrders(client);
    await r.loadProduction(client);
  });
  return { r, requests, replies, scope, durableAtSend, unmount: view.unmount };
}
const rows = (r: OpsRuntime) => r.renderVals().liveProduction?.inProgress ?? [];
function begin(r: OpsRuntime, pid: string, qty: string) {
  act(() => r.go('bake'));
  act(() => r.renderVals().liveProduction!.start!.open());
  act(() => r.renderVals().liveProduction!.start!.choose(pid));
  act(() => r.renderVals().liveProduction!.start!.setQuantity(qty));
  act(() => {
    expect(r.renderVals().liveProduction!.start!.begin()).toBe(true);
  });
}
function open(r: OpsRuntime, pid: string) {
  act(() => r.go('bake'));
  const work = rows(r).find((w) => w.productId === pid)!;
  expect(work).toBeTruthy();
  act(() => work.open());
}
describe('multiple production work items in the actual runtime', () => {
  it('plans multiple products together, preserving distinct snapshots and recording no actual output', async () => {
    const { r, requests, scope } = await mount();
    act(() => r.renderVals().liveProduction!.start!.open());
    const plan = () => r.renderVals().liveProduction!.start!.multi!;
    expect(plan()).toBeTruthy();
    act(() => {
      plan().toggle(A);
      plan().toggle(B);
      plan().setKind(A, 'batch');
      plan().setKind(B, 'batch');
    });
    act(() => {
      plan().setQuantity(A, '24');
      plan().setQuantity(B, '12');
    });
    act(() => {
      expect(plan().review()).toBe(true);
    });
    expect(plan().reviewing).toBe(true);
    const old = plan();
    act(() => {
      expect(plan().begin()).toBe(true);
    });
    expect(rows(r)).toHaveLength(2);
    expect(rows(r).map((row) => [row.productId, row.quantityText])).toEqual([
      [A, '24 planned'],
      [B, '12 planned']
    ]);
    expect(requests).toHaveLength(0);
    expect(readProductionRecovery(scope).value?.works).toHaveLength(2);
    expect(readProductionRecovery(scope).value?.entry).toBeNull();
    act(() => {
      expect(old.begin()).toBe(false);
    });
    expect(rows(r)).toHaveLength(2);
  });
  it('restores a multi-product setup, and refuses the whole plan if any recipe changed', async () => {
    const first = await mount();
    act(() => first.r.renderVals().liveProduction!.start!.open());
    let plan = first.r.renderVals().liveProduction!.start!.multi!;
    act(() => {
      plan.toggle(A);
      plan.toggle(B);
      plan.setKind(A, 'batch');
      plan.setKind(B, 'batch');
    });
    plan = first.r.renderVals().liveProduction!.start!.multi!;
    act(() => {
      plan.setQuantity(A, '24');
      plan.setQuantity(B, '');
    });
    await act(async () => first.unmount());
    const second = await mount(first.scope);
    act(() => second.r.renderVals().liveProduction!.start!.open());
    const current = () => second.r.renderVals().liveProduction!.start!.multi!;
    expect(current().choices.map((row) => row.quantity)).toEqual(['24', '']);
    act(() => {
      expect(current().review()).toBe(false);
    });
    act(() => current().setQuantity(B, '12'));
    await act(async () =>
      second.r.loadRecipes({
        rpc: async () => ({
          data: [A, B].map((id) => ({
            product_id: id,
            yield: 12,
            version: id === B ? 4 : 3,
            updated_at: '2026-11-04T00:00:00Z',
            lines: [{ name: 'Butter', qty: 200, unit: 'g' }],
            history: []
          })),
          error: null
        })
      } as never)
    );
    act(() => {
      expect(current().review()).toBe(false);
      expect(current().begin()).toBe(false);
    });
    expect(rows(second.r)).toHaveLength(0);
    act(() => current().useRecipe(B));
    expect(current().choices.map((row) => row.quantity)).toEqual(['24', '12']);
    act(() => {
      expect(current().review()).toBe(true);
      expect(current().begin()).toBe(true);
    });
    expect(rows(second.r)).toHaveLength(2);
    expect(second.requests).toHaveLength(0);
  });
  it('keeps all selections and creates no partial group when device storage refuses the plan', async () => {
    const { r, requests } = await mount();
    begin(r, A, '6');
    act(() => r.go('bake'));
    act(() => r.renderVals().liveProduction!.start!.open());
    const plan = () => r.renderVals().liveProduction!.start!.multi!;
    act(() => {
      plan().toggle(A);
      plan().toggle(B);
      plan().setKind(A, 'batch');
      plan().setKind(B, 'batch');
    });
    act(() => {
      plan().setQuantity(A, '24');
      plan().setQuantity(B, '12');
      expect(plan().review()).toBe(true);
    });
    const original = Storage.prototype.setItem;
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value
    ) {
      if (key.startsWith('hc-production-recovery')) throw Error('quota');
      return original.call(this, key, value);
    });
    try {
      act(() => {
        expect(plan().begin()).toBe(false);
      });
      expect(plan().choices).toHaveLength(2);
      expect(rows(r)).toHaveLength(1);
      expect(rows(r)[0].quantityText).toBe('6 planned');
    } finally {
      write.mockRestore();
    }
    act(() => {
      expect(plan().begin()).toBe(true);
    });
    expect(rows(r)).toHaveLength(3);
    expect(requests).toHaveLength(0);
  });
  it('restores unfinished setup and raw counts without submitting while offline', async () => {
    const first = await mount();
    act(() => first.r.go('bake'));
    act(() => first.r.renderVals().liveProduction!.start!.open());
    act(() => first.r.renderVals().liveProduction!.start!.choose(A));
    act(() => first.r.renderVals().liveProduction!.start!.setQuantity('17'));
    await act(async () => first.unmount());
    const second = await mount(first.scope);
    act(() => second.r.renderVals().liveProduction!.start!.open());
    expect(second.r.renderVals().liveProduction?.start?.draft).toMatchObject({
      productId: A,
      quantity: '17'
    });
    act(() => {
      expect(second.r.renderVals().liveProduction!.start!.begin()).toBe(true);
    });
    act(() => second.r.renderVals().liveBatchCounts!.setActual(''));
    act(() => second.r.renderVals().liveBatchCounts!.setRejects('-'));
    await act(async () => second.unmount());
    const third = await mount(first.scope);
    open(third.r, A);
    expect(third.r.renderVals().liveBatchCounts).toMatchObject({
      actual: '',
      rejects: '-',
      valid: false
    });
    act(() => third.r.renderVals().liveBatchCounts!.setActual('17'));
    act(() => third.r.renderVals().liveBatchCounts!.setRejects('0'));
    act(() => third.r.renderVals().liveBatchCounts!.review());
    act(() => third.r.setState({ online: false }));
    act(() => third.r.renderVals().liveBatchCounts!.confirm());
    expect(third.requests).toHaveLength(0);
    expect(third.r.renderVals().liveBatchCounts).toMatchObject({ actual: '17', connected: false });
  });
  it('restores multiple drafts and the exact unanswered request after reload without submitting automatically', async () => {
    const first = await mount();
    begin(first.r, A, '24');
    act(() => first.r.renderVals().liveBatchCounts!.setActual('26'));
    act(() => first.r.renderVals().liveBatchCounts!.setRejects('2'));
    act(() => first.r.renderVals().batch!.setNote({ target: { value: 'Keep tray A' } }));
    act(() => first.r.renderVals().liveBatchCounts!.review());
    act(() => first.r.renderVals().liveBatchCounts!.confirm());
    await waitFor(() => expect(first.requests).toHaveLength(1));
    begin(first.r, B, '12');
    act(() => first.r.go('bake'));
    const ids = rows(first.r).map((row) => row.id);
    expect(first.durableAtSend).toEqual([true]);
    await act(async () => first.unmount());
    const second = await mount(first.scope);
    expect(second.requests).toHaveLength(0);
    expect(rows(second.r).map((row) => row.id)).toEqual(ids);
    open(second.r, A);
    expect(second.r.renderVals().liveBatchCounts).toMatchObject({
      actual: '26',
      rejects: '2',
      uncertain: true
    });
    expect(second.r.state.batch).toMatchObject({ note: 'Keep tray A', step: 2 });
    act(() => second.r.renderVals().liveBatchCounts!.confirm());
    await waitFor(() => expect(second.requests).toHaveLength(1));
    expect(second.requests[0]).toEqual(first.requests[0]);
    await act(async () => second.replies[0]!(saved()));
    expect(rows(second.r)).toHaveLength(1);
    expect(rows(second.r)[0]!.productId).toBe(B);
    second.unmount();
    const third = await mount(first.scope);
    expect(third.requests).toHaveLength(0);
    expect(third.r.renderVals().liveProduction?.completed?.[0]).toMatchObject({
      quantity: 26,
      rejects: 2,
      stockState: 'unread',
      number: 1
    });
    expect(rows(third.r)[0]!.productId).toBe(B);
  });

  it('keeps a second tab read-only, then rereads current work before acquiring ownership', async () => {
    const first = await mount();
    begin(first.r, A, '24');
    act(() => first.r.renderVals().liveBatchCounts!.review());
    act(() => first.r.renderVals().liveBatchCounts!.confirm());
    await waitFor(() => expect(first.requests).toHaveLength(1));
    const second = await mount(first.scope);
    expect(second.r.renderVals().liveProduction?.recovery?.status).toBe('locked');
    open(second.r, A);
    expect(second.r.renderVals().liveBatchCounts?.readOnly).toBe(true);
    act(() => second.r.renderVals().liveBatchCounts!.confirm());
    expect(second.requests).toHaveLength(0);
    await act(async () => first.unmount());
    act(() => second.r.renderVals().liveBatchCounts!.retryCopy!());
    await waitFor(() => expect(second.r.renderVals().liveBatchCounts?.readOnly).toBe(false));
    act(() => second.r.renderVals().liveBatchCounts!.confirm());
    await waitFor(() => expect(second.requests).toHaveLength(1));
    expect(second.requests[0]).toEqual(first.requests[0]);
  });

  it('isolates accounts and merges a late acknowledgement only into its original verified owner', async () => {
    const first = await mount();
    begin(first.r, A, '24');
    act(() => first.r.renderVals().liveBatchCounts!.review());
    act(() => first.r.renderVals().liveBatchCounts!.confirm());
    await waitFor(() => expect(first.requests).toHaveLength(1));
    const other = { ...first.scope, userId: crypto.randomUUID() };
    await bindProductionOwner(first.r, other);
    expect(rows(first.r)).toHaveLength(0);
    begin(first.r, B, '12');
    const held = first.r.state.batch;
    await act(async () => first.replies[0]!(saved()));
    expect(first.r.state.batch).toBe(held);
    expect(first.r.renderVals().liveProduction?.completed ?? []).toHaveLength(0);
    await bindProductionOwner(first.r, first.scope);
    act(() => first.r.go('bake'));
    expect(rows(first.r)).toHaveLength(0);
    expect(first.r.renderVals().liveProduction?.completed?.[0]).toMatchObject({ quantity: 24 });
    expect(first.requests).toHaveLength(1);
    await bindProductionOwner(first.r, other);
    act(() => first.r.go('bake'));
    expect(rows(first.r)[0]).toMatchObject({ productId: B, quantityText: '12 planned' });
  });

  it('does not submit a new request when its device copy cannot be written, and keeps entered counts', async () => {
    const first = await mount();
    begin(first.r, A, '24');
    act(() => first.r.renderVals().liveBatchCounts!.review());
    const original = Storage.prototype.setItem;
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value
    ) {
      if (key.startsWith('hc-production-recovery')) throw Error('quota');
      return original.call(this, key, value);
    });
    try {
      act(() => first.r.renderVals().liveBatchCounts!.confirm());
      expect(first.requests).toHaveLength(0);
      expect(first.r.renderVals().liveBatchCounts).toMatchObject({
        actual: '24',
        copyReady: false,
        readOnly: false
      });
      await bindProductionOwner(first.r, first.scope);
      expect(first.r.renderVals().liveBatchCounts?.actual).toBe('24');
    } finally {
      write.mockRestore();
    }
    act(() => first.r.renderVals().liveBatchCounts!.retryCopy!());
    await waitFor(() => expect(first.r.renderVals().liveBatchCounts?.copyReady).toBe(true));
    act(() => first.r.renderVals().liveBatchCounts!.confirm());
    await waitFor(() => expect(first.requests).toHaveLength(1));
    expect(first.durableAtSend).toEqual([true]);
  });
  it('starts manual dough with no orders, retains review beside a batch, and blocks stale modal callbacks', async () => {
    const { r, requests } = await mount();
    begin(r, A, '24');
    act(() => r.go('bake'));
    act(() => r.renderVals().liveProduction!.start!.open());
    act(() => r.renderVals().liveProduction!.start!.choose(B));
    act(() => r.renderVals().liveProduction!.start!.chooseKind!('dough'));
    act(() => r.renderVals().liveProduction!.start!.setQuantity('6'));
    act(() => {
      expect(r.renderVals().liveProduction!.start!.begin()).toBe(true);
    });
    expect(r.renderVals().liveDough).toMatchObject({ balls: 6, reviewing: false, version: 3 });
    const old = r.renderVals().liveDough!;
    act(() => old.review());
    expect(r.renderVals().liveDough?.reviewing).toBe(true);
    act(() => r.renderVals().liveDough!.close());
    expect(rows(r)).toHaveLength(2);
    open(r, B);
    const current = r.state.doughPrep;
    act(() => {
      old.close();
      old.discard();
      old.portions[0].choose();
    });
    expect(r.state.doughPrep).toBe(current);
    expect(r.renderVals().liveDough).toMatchObject({ balls: 6, reviewing: true });
    act(() => r.renderVals().liveDough!.close());
    open(r, A);
    expect(r.state.batch).toMatchObject({ actual: 24 });
    expect(requests).toHaveLength(0);
  });
  it('keeps a started recipe and period snapshot when the current source changes', async () => {
    const { r, requests } = await mount();
    begin(r, A, '24');
    act(() => r.setState({ dropNo: 6, recipeVer: { [A]: 4, [B]: 3 } } as never));
    expect(r.renderVals().liveBatchCounts).toMatchObject({
      recipeVersion: 3,
      periodText: 'Drop 5',
      sourceChanged: true
    });
    act(() => r.renderVals().liveBatchCounts!.confirm());
    expect(requests).toHaveLength(0);
  });
  it('reviews an updated saved recipe explicitly, keeps counts and rejects stale adoption callbacks', async () => {
    const { r, requests } = await mount();
    begin(r, A, '24');
    act(() => r.renderVals().liveBatchCounts!.setActual('26'));
    act(() => r.renderVals().liveBatchCounts!.setRejects('2'));
    act(() => r.renderVals().batch!.setNote({ target: { value: 'Keep this tray' } }));
    act(() => r.renderVals().batch!.rows[0].plus());
    await act(async () => {
      await r.loadRecipes({
        rpc: async () => ({
          data: [A, B].map((id) => ({
            product_id: id,
            yield: id === A ? 24 : 12,
            version: id === A ? 4 : 3,
            updated_at: '2026-11-03T01:00:00Z',
            lines: [{ name: 'Butter', qty: id === A ? 300 : 200, unit: 'g' }],
            history: []
          })),
          error: null
        })
      } as never);
    });
    const update = r.renderVals().liveBatchCounts!.recipeUpdate!;
    expect(update).toMatchObject({ previousVersion: 3, version: 4, previousYield: 12, yield: 24 });
    expect(update.rows).toContainEqual({ name: 'Butter', previous: '200 g', current: '300 g' });
    act(() => update.use());
    expect(r.renderVals().liveBatchCounts).toMatchObject({
      recipeVersion: 4,
      sourceChanged: false,
      actual: '26',
      rejects: '2',
      periodText: 'Drop 5'
    });
    expect(r.state.batch).toMatchObject({ target: 24, note: 'Keep this tray', adj: {}, step: 1 });
    begin(r, B, '12');
    const selected = r.state.batch;
    act(() => update.use());
    expect(r.state.batch).toBe(selected);
    expect(requests).toHaveLength(0);
  });
  it('keeps an old dough amount visible after recipe adoption and requires a valid full/half choice', async () => {
    const { r, requests } = await mount();
    act(() => r.renderVals().liveProduction!.start!.open());
    act(() => r.renderVals().liveProduction!.start!.choose(A));
    act(() => r.renderVals().liveProduction!.start!.chooseKind!('dough'));
    act(() => r.renderVals().liveProduction!.start!.setQuantity('6'));
    act(() => {
      expect(r.renderVals().liveProduction!.start!.begin()).toBe(true);
    });
    await act(async () => {
      await r.loadRecipes({
        rpc: async () => ({
          data: [
            {
              product_id: A,
              yield: 24,
              version: 4,
              updated_at: '2026-11-03T01:00:00Z',
              lines: [{ name: 'Butter', qty: 300, unit: 'g' }],
              history: []
            }
          ],
          error: null
        })
      } as never);
    });
    act(() => r.renderVals().liveDough!.recipeUpdate!.use());
    expect(r.renderVals().liveDough).toMatchObject({
      balls: 6,
      validAmount: false,
      reviewing: false,
      version: 4,
      sourceChanged: false
    });
    act(() => {
      r.renderVals().liveDough!.review();
      r.renderVals().liveDough!.confirm();
    });
    act(() => (r as unknown as { confirmDough: () => void }).confirmDough());
    expect(requests).toHaveLength(0);
    act(() => r.renderVals().liveDough!.portions[1].choose());
    expect(r.renderVals().liveDough).toMatchObject({ balls: 12, validAmount: true });
    act(() => r.renderVals().liveDough!.review());
    expect(r.renderVals().liveDough?.reviewing).toBe(true);
    expect(requests).toHaveLength(0);
  });
  it('keeps counts, exceptions, note and review through another flavour and cross-section Back', async () => {
    const { r, requests } = await mount();
    begin(r, A, '24');
    act(() => r.renderVals().liveBatchCounts!.setActual('26'));
    act(() => r.renderVals().liveBatchCounts!.setRejects('2'));
    act(() => r.renderVals().batch!.setNote({ target: { value: 'Tray two' } }));
    act(() => r.renderVals().batch!.rows[0].plus());
    act(() => r.renderVals().liveBatchCounts!.review());
    begin(r, B, '12');
    act(() => r.go('bake'));
    expect(rows(r)).toHaveLength(2);
    open(r, A);
    expect(r.state.batch).toMatchObject({
      pid: A,
      target: 24,
      actual: 26,
      rejects: 2,
      note: 'Tray two',
      step: 2,
      adj: { Butter: 1 }
    });
    act(() => r.go('sales'));
    const previous = (r.state.history as string[]).at(-1);
    act(() => r.renderVals().goBack());
    expect(r.state.screen).toBe(previous);
    open(r, A);
    expect(r.state.batch).toMatchObject({ actual: 26, note: 'Tray two', step: 2 });
    open(r, B);
    expect(r.state.batch).toMatchObject({ actual: 12, rejects: 0 });
    expect(requests).toHaveLength(0);
  });
  it.each([false, true])(
    'edits/saves B while A saves and scopes replies (B answered first: %s)',
    async (reverse) => {
      const { r, requests, replies } = await mount();
      begin(r, A, '24');
      begin(r, B, '12');
      open(r, A);
      act(() => r.renderVals().liveBatchCounts!.review());
      act(() => r.renderVals().liveBatchCounts!.confirm());
      open(r, B);
      act(() => r.renderVals().liveBatchCounts!.setActual('14'));
      expect(r.state.batch).toMatchObject({ pid: B, actual: 14 });
      act(() => r.renderVals().liveBatchCounts!.review());
      act(() => r.renderVals().liveBatchCounts!.confirm());
      expect(requests).toHaveLength(2);
      expect(requests[0].product_id).toBe(A);
      expect(requests[1].product_id).toBe(B);
      expect(requests[0].id).not.toBe(requests[1].id);
      await act(async () => {
        replies[reverse ? 1 : 0](saved());
      });
      if (!reverse) expect(r.state.batch).toMatchObject({ pid: B, actual: 14 });
      act(() => r.go('bake'));
      expect(rows(r).map((w) => w.productId)).toEqual([reverse ? A : B]);
      if (reverse) open(r, A);
      await act(async () => {
        replies[reverse ? 0 : 1](saved());
      });
      expect(r.state.batch).toBeNull();
      act(() => r.go('bake'));
      expect(rows(r)).toHaveLength(0);
    }
  );
});
