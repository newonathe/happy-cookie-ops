import { act } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpsRuntime } from '@/store/ops-runtime';
import { bindProductionOwner } from './production-runtime-helpers';
import { ALLERGENS, PRODUCTS, replaceFlavours } from '@/store/engine/ops-engine';

vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => true }));
vi.mock('@/lib/device', () => ({ deviceId: () => 'production-entry-test' }));
vi.mock('@/lib/offline/idb', () => ({
  idb: { get: async () => null, set: async () => {}, del: async () => {}, supported: () => true }
}));
vi.mock('@/lib/offline/sync', async (original) => ({
  ...(await original<typeof import('@/lib/offline/sync')>()),
  flushQueue: vi.fn(async () => ({ sent: [], failed: [], skipped: false }))
}));
const original = { products: PRODUCTS.map((p) => ({ ...p })), allergens: { ...ALLERGENS } };
const pid = original.products[0]!.id;
const stamp = '2026-11-03T00:00:00Z';
afterEach(() => {
  cleanup();
  replaceFlavours(original.products, original.allergens);
});

async function mounted(ready = true, orders = true) {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
  const runtime = ref.current!;
  const source = { version: 3, active: true, orderQty: 0 };
  const rpc = vi.fn(async (name: string) => {
    const data: Record<string, unknown> = {
      get_flavours: [
        {
          id: pid,
          name: 'Chocolate cookie',
          short_name: 'Chocolate',
          price_cents: 12500,
          kind: 'Permanent',
          tag: '',
          description: '',
          image_path: original.products[0]!.img,
          allergens: 'milk',
          active: source.active,
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
            name: 'Bread flour',
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
      get_staff_orders: source.orderQty
        ? [
            {
              id: 'HC-ENTRY',
              name: 'Example customer',
              phone: '',
              ig: '',
              state: 'Confirmed',
              pay_state: 'confirmed',
              pay_method: 'cash',
              pay_ref: null,
              total_cents: source.orderQty * 12500,
              paid_cents: source.orderQty * 12500,
              refund_ref: null,
              pickup_date: '2026-11-07',
              pickup_window: '10:00',
              placed_at: stamp,
              updated_at: stamp,
              status_token: 'e'.repeat(64),
              holds: true,
              swaps: [],
              items: [
                {
                  product_id: pid,
                  qty: source.orderQty,
                  unit_price_cents: 12500,
                  unavailable: false
                }
              ]
            }
          ]
        : [],
      get_production: { batches: [], dough: [], baked: [], shortfalls: [] },
      get_recipes: [
        {
          product_id: pid,
          yield: 12,
          version: source.version,
          updated_at: stamp,
          lines: [{ name: 'Bread flour', qty: 300, unit: 'g' }],
          history: []
        }
      ]
    };
    if (!(name in data)) throw new Error('Entry must not write: ' + name);
    return { data: data[name], error: null };
  });
  const client = { rpc };
  act(() => {
    runtime.setRole('owner');
    runtime.go('bake');
    runtime.setState({ dropNo: 5 });
  });
  const scope = ready ? await bindProductionOwner(runtime) : null;
  if (ready)
    await act(async () => {
      await runtime.loadFlavours(client as never);
      await runtime.loadStockCatalogue(client as never);
      await runtime.loadRecipes(client as never, undefined, undefined, scope);
      if (orders) await runtime.loadOrders(client as never);
      await runtime.loadProduction(client as never);
    });
  return { runtime, rpc, client, source };
}
const start = (r: OpsRuntime) => r.renderVals().liveProduction!.start!;
const recipePage = (r: OpsRuntime) => {
  act(() => r.setState({ screen: 'recipes', liveRecipeTarget: pid } as never));
  return r.renderVals().liveRecipes!.recipePage!;
};
const noWrites = (rpc: ReturnType<typeof vi.fn>) =>
  expect(rpc.mock.calls.every(([name]) => String(name).startsWith('get_'))).toBe(true);

describe('owner production entry', () => {
  it.each([6, 12, 48])(
    'carries %s recipe cookies without choosing the production type',
    async (cookies) => {
      const { runtime, rpc } = await mounted();
      const page = recipePage(runtime);
      act(() => page.startProduction!(cookies));
      expect(start(runtime).multi!.choices).toMatchObject([
        { productId: pid, quantity: String(cookies), version: 3, kind: 'choose' }
      ]);
      expect(start(runtime).multi!.review()).toBe(false);
      act(() => start(runtime).multi!.setKind(pid, 'batch'));
      expect(start(runtime).multi!.choices[0]?.quantity).toBe(String(cookies));
      act(() => {
        expect(start(runtime).multi!.review()).toBe(true);
      });
      act(() => {
        expect(start(runtime).multi!.begin()).toBe(true);
      });
      expect(runtime.renderVals().liveProduction!.inProgress).toMatchObject([
        { productId: pid, kind: 'batch', quantityText: `${cookies} planned` }
      ]);
      noWrites(rpc);
    }
  );
  it.each(['keep', 'use'] as const)(
    'offers %s for a conflicting recipe plan without replacing actual work',
    async (resolution) => {
      const { runtime, rpc } = await mounted();
      act(() => start(runtime).open());
      act(() => start(runtime).setQuantity('16'));
      act(() => {
        expect(start(runtime).begin()).toBe(true);
      });
      act(() => runtime.renderVals().liveBatchCounts!.setActual('13'));
      act(() => runtime.renderVals().liveBatchCounts!.setRejects('2'));
      act(() => runtime.go('bake'));
      const work = runtime.renderVals().liveProduction!.inProgress![0];
      act(() => start(runtime).open());
      act(() => start(runtime).setQuantity('8'));
      const page = recipePage(runtime);
      act(() => page.startProduction!(48));
      expect(start(runtime).multi!.choices).toMatchObject([{ quantity: '8', kind: 'batch' }]);
      expect(start(runtime).handoff?.rows).toMatchObject([{ quantity: '48', version: 3 }]);
      expect(start(runtime).multi!.review()).toBe(false);
      expect(start(runtime).begin()).toBe(false);
      const old = start(runtime).handoff!;
      act(() => old[resolution]());
      expect(start(runtime).handoff).toBeUndefined();
      expect(start(runtime).multi!.choices).toMatchObject([
        {
          quantity: resolution === 'keep' ? '8' : '48',
          kind: resolution === 'keep' ? 'batch' : 'choose'
        }
      ]);
      act(() => old.use());
      expect(start(runtime).handoff).toBeUndefined();
      act(() => work.open());
      expect(runtime.renderVals().liveBatchCounts).toMatchObject({ actual: '13', rejects: '2' });
      noWrites(rpc);
    }
  );
  it.each([
    'recipe',
    'navigation',
    'period',
    'period-return',
    'role',
    'identity',
    'failed',
    'unavailable'
  ] as const)('rejects a captured recipe action after %s changes', async (change) => {
    const { runtime, rpc, source, client } = await mounted();
    const old = recipePage(runtime);
    if (change === 'recipe') {
      source.version = 4;
      await act(async () => {
        await runtime.loadRecipes(client as never);
      });
    } else if (change === 'navigation') {
      act(() => runtime.go('products'));
      recipePage(runtime);
    } else if (change === 'period') act(() => runtime.setState({ dropNo: 6 }));
    else if (change === 'period-return') {
      act(() => runtime.setState({ dropNo: 6 }));
      act(() => runtime.setState({ dropNo: 5 }));
    } else if (change === 'role') {
      act(() => runtime.setRole('helper'));
      act(() => runtime.setRole('owner'));
      recipePage(runtime);
    } else if (change === 'identity') await bindProductionOwner(runtime);
    else
      await act(async () => {
        rpc.mockImplementationOnce(
          async () =>
            ({
              data: change === 'unavailable' ? [] : null,
              error: change === 'failed' ? { code: '08006' } : null
            }) as never
        );
        await runtime.loadRecipes(client as never);
      });
    act(() => old.startProduction!(48));
    expect(runtime.state.screen).toBe('recipes');
    act(() => runtime.go('bake'));
    expect(start(runtime).draft).toBeNull();
    noWrites(rpc);
  });
  it('keeps an unanswered bake and its exact request when a recipe plan arrives', async () => {
    const { runtime, rpc } = await mounted();
    act(() => start(runtime).open());
    act(() => start(runtime).setQuantity('8'));
    act(() => {
      expect(start(runtime).begin()).toBe(true);
    });
    act(() => runtime.renderVals().liveBatchCounts!.setRejects('2'));
    rpc.mockImplementationOnce(async () => ({ data: null, error: { code: '08006' } }) as never);
    await act(async () => {
      runtime.renderVals().liveBatchCounts!.confirm();
    });
    expect(runtime.renderVals().liveBatchCounts!.uncertain).toBe(true);
    const requests = () => rpc.mock.calls.filter(([name]) => name === 'record_bake');
    const frozen = JSON.stringify(requests());
    const page = recipePage(runtime);
    act(() => page.startProduction!(48));
    expect(start(runtime).multi!.choices).toMatchObject([{ quantity: '48', kind: 'choose' }]);
    act(() => runtime.renderVals().liveProduction!.inProgress![0].open());
    expect(runtime.renderVals().liveBatchCounts).toMatchObject({
      actual: '8',
      rejects: '2',
      uncertain: true
    });
    expect(requests()).toHaveLength(1);
    expect(JSON.stringify(requests())).toBe(frozen);
  });
  it('retains blank counts through navigation and refuses invalid review/confirmation', async () => {
    const { runtime, rpc } = await mounted();
    act(() => {
      start(runtime).open();
    });
    act(() => {
      start(runtime).setQuantity('24');
    });
    act(() => {
      start(runtime).begin();
    });
    const counts = () => runtime.renderVals().liveBatchCounts!;
    act(() => counts().setActual(''));
    expect(counts()).toMatchObject({ actual: '', valid: false });
    act(() => {
      counts().review();
      counts().confirm();
    });
    expect(runtime.state.batch).toMatchObject({ step: 1 });
    act(() => runtime.go('bake'));
    act(() => runtime.renderVals().liveProduction!.inProgress![0].open());
    expect(counts().actual).toBe('');
    act(() => counts().setActual('18'));
    act(() => counts().setRejects('19'));
    expect(counts().valid).toBe(false);
    act(() => counts().confirm());
    act(() => counts().setRejects('2'));
    expect(counts().valid).toBe(true);
    expect(runtime.state.batch).toMatchObject({ actual: 18, rejects: 2, target: 24 });
    act(() => counts().review());
    expect(runtime.state.batch).toMatchObject({ step: 2 });
    noWrites(rpc);
  });
  it('rejects stale count callbacks and count edits while saving', async () => {
    const { runtime, rpc } = await mounted();
    act(() => start(runtime).open());
    act(() => start(runtime).setQuantity('24'));
    act(() => {
      start(runtime).begin();
    });
    const old = runtime.renderVals().liveBatchCounts!;
    act(() => old.setActual('18'));
    act(() => {
      old.setRejects('3');
      old.review();
      old.confirm();
    });
    expect(runtime.state.batch).toMatchObject({ actual: 18, rejects: 0, step: 1 });
    let reply!: (value: { data: unknown; error: null }) => void;
    rpc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          reply = resolve;
        })
    );
    act(() => runtime.renderVals().liveBatchCounts!.confirm());
    act(() => runtime.renderVals().liveBatchCounts!.setActual('30'));
    expect(runtime.state.batch).toMatchObject({ actual: 18 });
    expect(rpc.mock.calls.filter(([name]) => name === 'record_bake')).toHaveLength(1);
    await act(async () => reply({ data: null, error: null }));
  });
  it('exposes the saving state until the recording answer arrives', async () => {
    const { runtime, rpc } = await mounted();
    let reply!: (value: Awaited<ReturnType<typeof rpc>>) => void;
    rpc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          reply = resolve;
        })
    );
    act(() =>
      runtime.setState({ batch: { pid, target: 12, actual: 12, rejects: 0, adj: {} } } as never)
    );
    act(() => (runtime as unknown as { confirmBatch: () => void }).confirmBatch());
    expect(runtime.renderVals().liveProduction?.saving).toBe(true);
    await act(async () => {
      reply({
        data: [
          {
            record_id: (
              rpc.mock.calls.find(([name]) => name === 'record_bake') as unknown as [
                string,
                { p_rec: { id: string } }
              ]
            )[1].p_rec.id,
            duplicate: false,
            used_dough: 12,
            shortfall: []
          }
        ],
        error: null
      });
    });
    expect(runtime.renderVals().liveProduction?.saving).toBe(false);
    expect(rpc.mock.calls.filter(([name]) => name === 'record_bake')).toHaveLength(1);
  });
  it.each(['quick', 'row', 'first', 'direct'] as const)(
    'preserves the unfinished batch when starting from %s',
    async (entry) => {
      const { runtime, rpc, client, source } = await mounted();
      source.orderQty = 18;
      await act(async () => {
        await runtime.loadOrders(client as never);
      });
      act(() => {
        runtime.setState({
          dough: { [pid]: 24 },
          batch: {
            pid,
            target: 12,
            actual: 11,
            rejects: 2,
            step: 2,
            showUsed: true,
            note: 'Tray two',
            adj: { 'Bread flour': 1 }
          }
        } as never);
      });
      const pending = runtime.state.batch;
      const vals = runtime.renderVals();
      await act(async () => {
        if (entry === 'quick')
          vals.quickActions.find((a) => a.label === 'Confirm production')!.go();
        if (entry === 'row') vals.bakeRows.find((r) => r.name === 'Chocolate')!.act();
        if (entry === 'first') vals.startFirst();
        if (entry === 'direct')
          (runtime as unknown as { startBatch: (id: string) => void }).startBatch(pid);
        if (entry === 'quick') await new Promise((resolve) => setTimeout(resolve, 20));
      });
      expect(runtime.state.screen).toBe('batch');
      expect(runtime.state.batch).not.toBe(pending);
      act(() => runtime.go('bake'));
      const work = runtime.renderVals().liveProduction!.inProgress!;
      expect(work).toHaveLength(2);
      act(() => work[0].open());
      expect(runtime.state.batch).toMatchObject(pending as object);
      noWrites(rpc);
    }
  );
  it('starts independent preparation while another batch save is waiting', async () => {
    const { runtime, rpc } = await mounted();
    const engine = runtime as unknown as {
      startBatch: (id: string) => void;
      confirmBatch: () => void;
    };
    let reply!: (value: { data: unknown; error: null }) => void;
    rpc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          reply = resolve;
        })
    );
    act(() =>
      runtime.setState({ batch: { pid, target: 12, actual: 12, rejects: 0, adj: {} } } as never)
    );
    act(() => engine.confirmBatch());
    act(() => engine.startBatch(pid));
    expect(runtime.state.batch).not.toBeNull();
    expect(runtime.renderVals().liveBatchCounts!.saving).toBe(false);
    act(() => runtime.go('bake'));
    expect(runtime.renderVals().liveProduction!.inProgress).toHaveLength(2);
    await act(async () => reply({ data: null, error: null }));
  });
  it('continues the unfinished batch without replacing its quantity or progress', async () => {
    const { runtime, rpc } = await mounted();
    act(() => start(runtime).open());
    act(() => start(runtime).setQuantity('24'));
    act(() => {
      expect(start(runtime).begin()).toBe(true);
    });
    const pending = runtime.state.batch;
    act(() => runtime.go('bake'));
    expect(start(runtime).resume).toBe(false);
    act(() => runtime.renderVals().liveProduction!.inProgress![0].open());
    expect(runtime.state.screen).toBe('batch');
    expect(runtime.state.batch).toMatchObject(pending as object);
    noWrites(rpc);
  });
  it('does not let a cancelled entry change, close or start a newer draft', async () => {
    const { runtime, rpc } = await mounted();
    act(() => start(runtime).open());
    const old = start(runtime);
    act(() => old.cancel());
    act(() => start(runtime).open());
    act(() => start(runtime).setQuantity('24'));
    act(() => {
      old.setQuantity('48');
      old.cancel();
    });
    expect(old.begin()).toBe(false);
    expect(start(runtime).draft?.quantity).toBe('24');
    noWrites(rpc);
  });
  it('never offers prototype products or starts from unread sources', async () => {
    const { runtime, rpc } = await mounted(false);
    expect(start(runtime).products).toEqual([]);
    act(() => start(runtime).open());
    expect(start(runtime).draft).toBeNull();
    expect(start(runtime).begin()).toBe(false);
    noWrites(rpc);
  });
  it('starts a manual plan with no order demand, without recording actual production', async () => {
    const { runtime, rpc } = await mounted();
    expect(start(runtime).products).toMatchObject([{ id: pid, version: 3, needed: 0, yield: 12 }]);
    act(() => start(runtime).open());
    expect(start(runtime).draft).toMatchObject({ productId: pid, quantity: '', version: 3 });
    act(() => start(runtime).setQuantity('36'));
    let opened = false;
    act(() => {
      opened = start(runtime).begin();
    });
    expect(opened).toBe(true);
    expect(runtime.state).toMatchObject({
      screen: 'batch',
      batch: { pid, target: 36, actual: 36 }
    });
    noWrites(rpc);
  });
  it('retains an unfinished entry across navigation and rejects invalid whole quantities', async () => {
    const { runtime, rpc } = await mounted();
    act(() => {
      start(runtime).open();
      start(runtime).setQuantity('3.5');
    });
    const old = start(runtime);
    act(() => runtime.go('products'));
    expect(old.begin()).toBe(false);
    act(() => runtime.go('bake'));
    expect(start(runtime).draft?.quantity).toBe('3.5');
    for (const value of ['3.5', '0', '10001', '1e3', '']) {
      act(() => start(runtime).setQuantity(value));
      expect(start(runtime).begin()).toBe(false);
    }
    expect(runtime.state.screen).toBe('bake');
    act(() => start(runtime).cancel());
    expect(start(runtime).draft).toBeNull();
    noWrites(rpc);
  });
  it('carries existing demand into an editable plan without recording it', async () => {
    const { runtime, rpc, client, source } = await mounted();
    source.orderQty = 18;
    await act(async () => {
      await runtime.loadOrders(client as never);
    });
    expect(start(runtime).products[0]?.needed).toBe(18);
    act(() => start(runtime).open());
    expect(start(runtime).draft?.quantity).toBe('18');
    act(() => {
      expect(start(runtime).begin()).toBe(true);
    });
    expect(runtime.state).toMatchObject({ batch: { pid, target: 18, actual: 18 } });
    noWrites(rpc);
  });
  it('does not let an old-period callback open or change a new-period draft', async () => {
    const { runtime, client, rpc } = await mounted();
    act(() => {
      start(runtime).open();
      start(runtime).setQuantity('12');
    });
    const old = start(runtime);
    act(() => runtime.setState({ dropNo: 6 }));
    await act(async () => {
      await runtime.loadProduction(client as never);
    });
    act(() => {
      start(runtime).open();
      start(runtime).setQuantity('24');
    });
    act(() => {
      old.setQuantity('48');
      old.cancel();
    });
    expect(old.begin()).toBe(false);
    expect(start(runtime).draft?.quantity).toBe('24');
    const owner = start(runtime);
    act(() => runtime.setRole('helper'));
    expect(owner.begin()).toBe(false);
    expect(runtime.renderVals().liveProduction).toBeNull();
    noWrites(rpc);
  });
  it('requires an explicit updated-recipe selection and preserves the entered quantity', async () => {
    const { runtime, client, source, rpc } = await mounted();
    act(() => {
      start(runtime).open();
      start(runtime).setQuantity('20');
    });
    source.version = 4;
    await act(async () => {
      await runtime.loadRecipes(client as never);
    });
    expect(start(runtime).draft?.version).toBe(3);
    expect(start(runtime).begin()).toBe(false);
    act(() => start(runtime).choose(pid));
    expect(start(runtime).draft).toMatchObject({ version: 4, quantity: '20' });
    act(() => {
      expect(start(runtime).begin()).toBe(true);
    });
    noWrites(rpc);
  });
  it('does not make the order read a prerequisite for manual production', async () => {
    const { runtime, rpc } = await mounted(true, false);
    expect(runtime.renderVals().liveProduction!.planReady).toBe(false);
    expect(start(runtime).products).toMatchObject([{ id: pid, needed: null }]);
    act(() => {
      start(runtime).open();
      start(runtime).setQuantity('12');
    });
    act(() => {
      expect(start(runtime).begin()).toBe(true);
    });
    noWrites(rpc);
  });
});
