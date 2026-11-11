import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';

let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));

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
const flush = vi.hoisted(() => ({ result: { sent: [] as string[], failed: [], skipped: false } }));
vi.mock('@/lib/offline/sync', async (orig) => ({
  ...(await orig<typeof import('@/lib/offline/sync')>()),
  flushQueue: vi.fn(async () => flush.result)
}));

import { OpsRuntime } from '@/store/ops-runtime';
import { bindProductionOwner } from './production-runtime-helpers';
import { PRODUCTS, type Role } from '@/store/engine/ops-engine';
import type { StaffOrderClient } from '@/lib/data/staff-orders';
import { PRODUCTION_COPY, STAFF_COPY } from '@/lib/orders/staff-copy';

/**
 * C2: in live mode mixing dough, baking a batch and packing an order record on the database (stock comes off there, once), and
 * the screens read the batches, the dough and the baked counts back. Each `Mutation:` line names a change one of these tests
 * must catch.
 */
const STAMP = '2026-09-30T02:00:00.123456+00:00';
const PID = PRODUCTS[0]!.id;
const SHORT = (PRODUCTS[0] as unknown as { short: string }).short;
type Wire = Record<string, unknown>;

const stockItem = (over: Wire = {}): Wire => ({
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
  last_counted: null,
  active: true,
  updated_at: STAMP,
  ...over
});
const order = (over: Wire = {}): Wire => ({
  id: 'HC-1001',
  name: 'Ana Cruz',
  phone: '09171234567',
  ig: '@ana',
  state: 'Confirmed',
  pay_state: 'confirmed',
  pay_method: 'GCash',
  pay_ref: null,
  total_cents: 20000,
  paid_cents: 20000,
  refund_ref: null,
  pickup_date: '2026-10-05',
  pickup_window: '10:00',
  placed_at: '2026-09-29T01:00:00.000Z',
  updated_at: STAMP,
  status_token: 'b'.repeat(64),
  holds: true,
  items: [{ product_id: PID, qty: 13, unit_price_cents: 10000, unavailable: false }],
  swaps: [],
  ...over
});

interface Fake {
  recipes?: Wire[] | null;
  items: Wire[];
  production: Wire;
  /** Answers to record_production / record_pack in order, then the default (saved). */
  answers: Array<{ data: unknown; error: unknown }>;
  packAnswers: Array<{ data: unknown; error: unknown }>;
  orders: Wire[];
}
const wireProduction = (over: Wire = {}): Wire => ({
  batches: [],
  dough: [],
  baked: [],
  shortfalls: [],
  ...over
});
const savedRecipe = (): Wire[] => [
  {
    product_id: PID,
    yield: 12,
    version: 3,
    updated_at: STAMP,
    lines: [{ name: 'Bread flour', qty: 300, unit: 'g', kind: 'ingredient' }],
    history: []
  }
];
const saved = (used = 0, shortfall: unknown[] = []) => ({
  data: [{ record_id: 'r', duplicate: false, used_dough: used, shortfall }],
  error: null
});
const fresh = (over: Partial<Fake> = {}): Fake => ({
  items: [stockItem()],
  production: wireProduction(),
  answers: [],
  packAnswers: [],
  orders: [order()],
  ...over
});
function fakeClient(f: Fake) {
  const rpc = vi.fn(async (name: string, args?: Wire) => {
    if (name === 'get_stock_catalogue')
      return { data: { suppliers: [], items: f.items, prices: [] }, error: null };
    if (name === 'get_last_paid') return { data: [], error: null };
    if (name === 'get_production') return { data: f.production, error: null };
    if (name === 'get_recipes')
      return { data: 'recipes' in f ? f.recipes : savedRecipe(), error: null };
    if (name === 'get_staff_orders') return { data: f.orders, error: null };
    if (name === 'record_bake') return f.answers.shift() ?? savedBake(rpc);
    if (name === 'record_dough_preparation') {
      const result = f.answers.shift();
      if (result?.error) return result;
      return {
        data: [{ record_id: (args?.p_rec as Wire).id, duplicate: false, shortfall: [] }],
        error: null
      };
    }
    if (name === 'record_discard')
      return { data: [{ record_id: 'd', duplicate: false }], error: null };
    if (name === 'record_pack')
      return (
        f.packAnswers.shift() ?? {
          data: [{ record_id: 'p', duplicate: false, shortfall: [] }],
          error: null
        }
      );
    return { data: [{ replayed: false }], error: null };
  });
  return { rpc, client: { rpc } };
}
function savedBake(rpc: { mock: { calls: Array<[string, Wire?]> } }) {
  const body = rpc.mock.calls.filter(([name]) => name === 'record_bake').at(-1)![1]!.p_rec as Wire;
  return {
    data: [
      { record_id: String(body.id), duplicate: false, used_dough: Number(body.qty), shortfall: [] }
    ],
    error: null
  };
}
const called = (rpc: ReturnType<typeof fakeClient>['rpc'], name: string) =>
  rpc.mock.calls.filter((c) => c[0] === name) as unknown as Array<
    [string, Record<string, unknown>]
  >;

const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 30))));
const toast = (r: OpsRuntime) => r.state.toast as { msg?: string; undo?: unknown } | null;
const msg = (r: OpsRuntime) => toast(r)?.msg ?? '';

interface Acts {
  startDough: (pid: string) => void;
  setDoughPortion: (kind: string) => void;
  confirmDough: () => void;
  confirmBatch: () => void;
  packOrder: (id: string) => void;
  logSpoilage: (name: string, qty: unknown, why: string, pid?: string, kind?: string) => void;
}
const acts = (r: OpsRuntime) => r as unknown as Acts;

it.each([0, 2])(
  'reads %s good cookies and high rejects as valid production without a write',
  async (good) => {
    const f = fresh({
      production: wireProduction({
        batches: [
          {
            product_id: PID,
            qty: good,
            rejects: 12 - good,
            target: 12,
            version: 3,
            at: Date.parse('2026-11-02T07:00:00Z')
          }
        ]
      })
    });
    const { runtime, rpc, client } = await mounted('owner', f);
    await act(async () => {
      await runtime.loadProduction(client as never);
    });
    act(() => runtime.go('bake'));
    const view = runtime.renderVals().liveProduction!;
    expect(view.state).toBe('read');
    expect(view.rows).toMatchObject([{ qty: good, rejects: 12 - good }]);
    expect(called(rpc, 'record_bake')).toHaveLength(0);
  }
);

it('keeps global history visible while a different drop needs a fresh plan read', async () => {
  const f = fresh({
    production: wireProduction({
      batches: [
        {
          product_id: PID,
          qty: 24,
          rejects: 2,
          target: 24,
          version: 3,
          at: Date.parse('2026-11-02T07:00:00Z')
        }
      ]
    })
  });
  const { runtime, client } = await mounted('owner', f);
  await act(async () => {
    await runtime.loadProduction(client as never);
  });
  act(() => runtime.go('bake'));
  expect(runtime.renderVals().liveProduction?.state).toBe('read');
  act(() => runtime.setState({ dropNo: 6 }));
  const view = runtime.renderVals().liveProduction!;
  expect(view.state).toBe('loading');
  expect(view.rows).toMatchObject([{ qty: 24, rejects: 2 }]);
  expect(view.planReady).toBe(false);
});

async function mounted(role: Role, f: Fake, load = true) {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
  const runtime = ref.current!;
  act(() => runtime.setRole(role));
  const scope = role === 'owner' ? await bindProductionOwner(runtime) : null;
  const c = fakeClient(f);
  await act(async () => {
    await runtime.loadStockCatalogue(c.client as never);
    await runtime.loadOrders(c.client as unknown as StaffOrderClient);
    if (load) await runtime.loadProduction(c.client as never);
    await runtime.loadRecipes(c.client as never, undefined, undefined, scope);
  });
  // The recipes screen's own state: yield 12 for this flavour, and the version the screen is on.
  const cur = runtime.state as unknown as {
    recipes: Record<string, unknown>;
    recipeVer: Record<string, number>;
  };
  act(() =>
    runtime.setState({
      recipes: { ...cur.recipes, [PID]: { yield: 12, ing: [['Bread flour', 300, 'g']] } },
      recipeVer: { ...cur.recipeVer, [PID]: 3 },
      dropNo: 5
    } as never)
  );
  c.rpc.mockClear();
  return { runtime, ...c };
}
const startBatch = (r: OpsRuntime, over: Wire = {}) =>
  act(() =>
    r.setState({
      batch: { pid: PID, target: 8, actual: 8, step: 1, note: '', adj: {}, rejects: 0, ...over },
      screen: 'batch'
    } as never)
  );

describe('production reply ownership', () => {
  it('keeps unanswered dough quantities and identity while checking its original result', async () => {
    const { runtime, rpc } = await mounted(
      'owner',
      fresh({ answers: [{ data: null, error: { code: '08006' } }] })
    );
    act(() =>
      runtime.setState({
        screen: 'bake',
        doughPrep: { pid: PID, balls: 6 },
        sheet: { kind: 'mixDough' }
      } as never)
    );
    act(() => runtime.renderVals().liveDough?.setActualBalls?.('6'));
    act(() => acts(runtime).confirmDough());
    await settle();
    const held = runtime.state.doughPrep;
    act(() => {
      acts(runtime).setDoughPortion('full');
    });
    expect(runtime.state.doughPrep).toBe(held);
    act(() => acts(runtime).startDough(PID));
    act(() => runtime.go('bake'));
    const pending = runtime
      .renderVals()
      .liveProduction!.inProgress!.find(
        (work) => work.id === (held as { liveWorkId: string }).liveWorkId
      )!;
    expect(runtime.renderVals().liveProduction!.inProgress).toHaveLength(2);
    act(() => pending.open());
    act(() => acts(runtime).confirmDough());
    await settle();
    const requests = called(rpc, 'record_dough_preparation').map((c) => c[1].p_rec as Wire);
    expect(requests[1]).toEqual(requests[0]);
    expect(runtime.state.doughPrep).toBeNull();
  });
  for (const kind of ['batch', 'dough'] as const) {
    it(`does not finish newer ${kind} work for the same product when an old reply arrives`, async () => {
      const { runtime, rpc } = await mounted('owner', fresh());
      const field = kind === 'batch' ? 'batch' : 'doughPrep';
      const put = () =>
        act(() =>
          runtime.setState({
            [field]:
              kind === 'batch'
                ? { pid: PID, target: 8, actual: 8, step: 2, note: '', adj: {}, rejects: 0 }
                : { pid: PID, balls: 6, actualBallsText: '6', recipeAmount: 0.5 },
            screen: 'batch',
            sheet: { kind: 'mixDough' }
          } as never)
        );
      put();
      let reply!: (value: { data: unknown; error: null }) => void;
      rpc.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            reply = resolve;
          })
      );
      act(() => (kind === 'batch' ? acts(runtime).confirmBatch() : acts(runtime).confirmDough()));
      put();
      const newer = runtime.state[field];
      await act(async () =>
        reply(
          kind === 'dough'
            ? {
                data: [
                  {
                    record_id: (called(rpc, 'record_dough_preparation')[0]![1].p_rec as Wire).id,
                    duplicate: false,
                    shortfall: []
                  }
                ],
                error: null
              }
            : savedBake(rpc)
        )
      );
      await settle();
      expect(runtime.state[field]).toBe(newer);
      expect(runtime.state.screen).toBe('batch');
      expect(called(rpc, 'get_production')).toHaveLength(1);
    });
  }

  it('gives a second identical working batch a distinct request after a lost reply', async () => {
    const { runtime, rpc } = await mounted(
      'owner',
      fresh({
        answers: [
          { data: null, error: { code: '08006' } },
          { data: null, error: { code: '08006' } }
        ]
      })
    );
    startBatch(runtime);
    act(() => acts(runtime).confirmBatch());
    await settle();
    startBatch(runtime);
    act(() => acts(runtime).confirmBatch());
    await settle();
    const requests = called(rpc, 'record_bake').map((c) => c[1].p_rec as Wire);
    expect(requests).toHaveLength(2);
    expect(requests[1].id).not.toBe(requests[0].id);
  });

  it('locks unanswered batch inputs and retries its exact request after sources change', async () => {
    const { runtime, rpc } = await mounted(
      'owner',
      fresh({ answers: [{ data: null, error: { code: '08006' } }] })
    );
    const adj: Record<string, number> = {};
    startBatch(runtime, { step: 2, adj });
    const old = runtime.renderVals().batch!;
    act(() => acts(runtime).confirmBatch());
    await settle();
    expect(runtime.renderVals().liveBatchCounts).toMatchObject({ uncertain: true, saving: false });
    adj['Bread flour'] = 9;
    act(() => {
      old.discard();
      runtime.renderVals().batch!.discard();
    });
    act(() => runtime.renderVals().liveBatchCounts!.setActual('20'));
    expect(runtime.state.batch).toMatchObject({ actual: 8 });
    act(() => runtime.setState({ dropNo: 6, recipeVer: { [PID]: 4 } } as never));
    expect(runtime.renderVals().liveBatchCounts).toMatchObject({
      periodText: 'Drop 5',
      recipeVersion: 3
    });
    act(() => acts(runtime).confirmBatch());
    await settle();
    const requests = called(rpc, 'record_bake').map((c) => c[1].p_rec as Wire);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    expect(requests[1]).not.toHaveProperty('adj');
    expect(runtime.state.batch).toBeNull();
  });

  for (const returnToOwner of [false, true])
    it(`does not run completion after a role changes (owner restored: ${returnToOwner})`, async () => {
      const { runtime, rpc } = await mounted('owner', fresh());
      startBatch(runtime);
      let reply!: (value: ReturnType<typeof saved>) => void;
      rpc.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            reply = resolve;
          })
      );
      act(() => acts(runtime).confirmBatch());
      act(() => runtime.setRole('helper'));
      if (returnToOwner) act(() => runtime.setRole('owner'));
      const held = runtime.state.batch,
        screen = runtime.state.screen;
      await act(async () => reply(savedBake(rpc)));
      await settle();
      // The completion that belonged to the first actor never runs: no navigation, the held batch view stays.
      expect(runtime.state.batch).toBe(held);
      expect(runtime.state.screen).toBe(screen);
      // The server recorded it, so it leaves In progress either way; only an owner reads the counts again.
      const pool = runtime as unknown as { productionDrafts: { list: () => unknown[] } };
      expect(pool.productionDrafts.list()).toHaveLength(0);
      expect(called(rpc, 'get_stock_catalogue')).toHaveLength(returnToOwner ? 1 : 0);
      expect(called(rpc, 'record_bake')).toHaveLength(1);
    });

  it('a batch recorded while a helper is signed in is announced to the owner on return, never recorded twice', async () => {
    const { runtime, rpc } = await mounted('owner', fresh());
    startBatch(runtime);
    let reply!: (value: ReturnType<typeof saved>) => void;
    rpc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          reply = resolve;
        })
    );
    act(() => acts(runtime).confirmBatch());
    act(() => runtime.setRole('helper'));
    await act(async () => reply(savedBake(rpc)));
    await settle();
    expect(called(rpc, 'get_stock_catalogue')).toHaveLength(0);
    act(() => runtime.setRole('owner'));
    await settle();
    const pool = runtime as unknown as { productionDrafts: { list: () => unknown[] } };
    expect(pool.productionDrafts.list()).toHaveLength(0);
    expect(msg(runtime)).toContain('saved while you were away is recorded');
    expect(called(rpc, 'get_stock_catalogue')).toHaveLength(1);
    expect(called(rpc, 'record_bake')).toHaveLength(1);
    // Mutation: the old silent return left a saved batch looking unsaved, inviting a second batch for the same cookies.
  });

  it('starting a batch for a product that is not on the menu does nothing', async () => {
    const { runtime } = await mounted('owner', fresh());
    act(() =>
      (runtime as unknown as { startBatch: (pid: string) => void }).startBatch('not-a-product')
    );
    expect(runtime.state.batch).toBeNull();
    // Mutation: dropping the menu check opens a batch nobody can record.
  });

  it('Back retains an unanswered batch instead of discarding its retry identity', async () => {
    const { runtime, rpc } = await mounted(
      'owner',
      fresh({ answers: [{ data: null, error: { code: '08006' } }] })
    );
    startBatch(runtime);
    act(() => acts(runtime).confirmBatch());
    await settle();
    const held = runtime.state.batch;
    act(() => runtime.renderVals().goBack());
    expect(runtime.state.screen).toBe('bake');
    expect(runtime.state.batch).toBe(held);
    expect(called(rpc, 'record_bake')).toHaveLength(1);
  });

  it('does not start the follow-up production read if the role changes during stock refresh', async () => {
    const f = fresh(),
      { runtime, rpc } = await mounted('owner', f);
    startBatch(runtime);
    const original = rpc.getMockImplementation()!;
    let release!: (value: { data: unknown; error: null }) => void;
    rpc.mockImplementation((name) =>
      name === 'get_stock_catalogue'
        ? new Promise((resolve) => {
            release = resolve;
          })
        : original(name)
    );
    act(() => acts(runtime).confirmBatch());
    await settle();
    expect(called(rpc, 'get_stock_catalogue')).toHaveLength(1);
    act(() => runtime.setRole('helper'));
    await act(async () =>
      release({ data: { suppliers: [], items: f.items, prices: [] }, error: null })
    );
    await settle();
    expect(called(rpc, 'get_production')).toHaveLength(0);
  });
});

describe('C2: baking, mixing dough and packing record on the database (live mode)', () => {
  it('does not substitute prototype quantities for unread production or expose the owner read to a helper', async () => {
    const { runtime, client } = await mounted('owner', fresh(), false);
    act(() => runtime.go('bake'));
    expect(runtime.renderVals().liveProduction).toMatchObject({
      state: 'loading',
      planReady: false,
      rows: []
    });
    await act(async () => {
      await runtime.loadProduction(client as never);
    });
    expect(runtime.renderVals().liveProduction).toMatchObject({ state: 'read', rows: [] });
    act(() => runtime.setRole('helper'));
    expect(runtime.renderVals().liveProduction).toBeNull();
  });
  it('exposes saved global history with honest failed-read state and no stale drop plan or write', async () => {
    const f = fresh({
      production: wireProduction({
        batches: [
          {
            product_id: PID,
            qty: 14,
            target: null,
            rejects: 2,
            version: 3,
            at: Date.parse('2026-10-05T01:00:00Z')
          }
        ]
      })
    });
    const { runtime, rpc, client } = await mounted('owner', f);
    act(() => runtime.go('bake'));
    await act(async () => {
      await runtime.loadProduction(client as never);
    });
    expect(runtime.renderVals().liveProduction).toMatchObject({
      state: 'read',
      periodText: 'Drop 5',
      rows: [{ name: SHORT, qty: 14, target: null, rejects: 2 }]
    });
    await act(async () => {
      await runtime.loadProduction({
        rpc: async () => ({ data: null, error: { code: '08006' } })
      } as never);
    });
    expect(runtime.renderVals().liveProduction).toMatchObject({
      state: 'failed',
      rows: [{ qty: 14, target: null }]
    });
    act(() => runtime.setState({ dropNo: 6 }));
    // SQL58 batches span drops; the cached history stays, while the new drop's plan is unavailable.
    expect(runtime.renderVals().liveProduction).toMatchObject({
      state: 'failed',
      periodText: 'Drop 6',
      planReady: false,
      rows: [{ qty: 14, target: null }]
    });
    act(() => runtime.go('products'));
    expect(runtime.renderVals().liveProduction).toBeNull();
    expect(called(rpc, 'record_bake')).toHaveLength(0);
  });
  beforeEach(() => {
    // The fixtures' pickup dates are fixed, and "this week" is worked out from today: without a fixed
    // clock the suite passes only until the first fixture date is in the past (it failed on 6 October).
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-05T02:00:00Z')); // 10:00 in Manila, the fixtures' own Monday
    live = true;
    store.clear();
    localStorage.clear();
    flush.result = { sent: [], failed: [], skipped: false };
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('confirming a batch sends one record with what was baked, the recipe version on screen and the week; then the screens show what the database holds', async () => {
    const f = fresh();
    const { runtime, rpc } = await mounted('owner', f);
    startBatch(runtime, { adj: { 'Bread flour': 2, Butter: 0 }, rejects: 1 });
    act(() => acts(runtime).confirmBatch());
    await settle();
    expect(called(rpc, 'record_bake')).toHaveLength(0);
    expect(runtime.state.batch).toMatchObject({ adj: { 'Bread flour': 2, Butter: 0 } });
    act(() => runtime.renderVals().liveBatchCounts!.clearIngredientChanges!());
    // The database's answer to the confirm: the flour is down and the batch is on the books.
    f.items = [stockItem({ on_hand: 3700 })];
    f.production = wireProduction({
      batches: [{ product_id: PID, qty: 7, target: 8, rejects: 1, version: 3, at: 5000 }],
      baked: [{ product_id: PID, qty: 7 }]
    });
    act(() => acts(runtime).confirmBatch());
    await settle();
    const sent = called(rpc, 'record_bake');
    expect(sent).toHaveLength(1);
    const body = sent[0]![1].p_rec as Record<string, unknown>;
    expect(body).toMatchObject({
      product_id: PID,
      qty: 8,
      target: 8,
      rejects: 1,
      recipe_version: 3,
      drop_no: 5
    });
    expect(body).not.toHaveProperty('adj'); // a line left at 0 is not sent
    expect(body.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    // The screens read the records back (counted once: the engine's own local push is replaced, not added to).
    const s = runtime.state as unknown as {
      batches: unknown[];
      baked: Record<string, number>;
      inv: Array<{ name: string; qty: number }>;
      batch: unknown;
    };
    expect(s.batches).toEqual([{ pid: PID, qty: 7, version: 3, at: 5000, rejects: 1 }]);
    expect(s.baked[PID]).toBe(7);
    expect(s.inv.find((i) => i.name === 'Bread flour')?.qty).toBe(3700);
    expect(s.batch).toBeNull();
    expect(toast(runtime)?.undo ?? null).toBeNull();
    // Mutation: not replacing `batches` from the database leaves the engine's local push, so "baked on this version" survives only until a reload.
    // Mutation: sending every adjustment (including 0) fails the exact-keys rule of the database.
  });

  it.each(['ZD001', 'ZD002'])(
    'keeps counts after definite %s refusal and creates a new request only on explicit retry',
    async (code) => {
      const { runtime, rpc } = await mounted(
        'owner',
        fresh({ answers: [{ data: null, error: { code } }] })
      );
      startBatch(runtime, { actual: 8, rejects: 2, note: 'Keep tray' });
      act(() => acts(runtime).confirmBatch());
      await waitFor(() => expect(runtime.renderVals().liveBatchCounts?.saving).toBe(false));
      expect(runtime.state.batch).toMatchObject({ actual: 8, rejects: 2, note: 'Keep tray' });
      expect(runtime.renderVals().liveBatchCounts?.uncertain).toBe(false);
      expect(runtime.renderVals().liveProduction?.completed ?? []).toEqual([]);
      expect(msg(runtime)).toContain(code === 'ZD001' ? 'Prepare dough first' : 'bake date');
      expect(called(rpc, 'record_bake')).toHaveLength(1);
      act(() => acts(runtime).confirmBatch());
      await waitFor(() => expect(runtime.state.batch).toBeNull());
      const bodies = called(rpc, 'record_bake').map((call) => call[1].p_rec as Wire);
      expect(bodies[1].id).not.toBe(bodies[0].id);
      expect(called(rpc, 'record_production')).toHaveLength(0);
    }
  );

  it('keeps acknowledged quantities separate from failed refresh and retries only the original drop read', async () => {
    const f = fresh({ production: wireProduction({ baked: [{ product_id: PID, qty: 7 }] }) });
    const { runtime, rpc } = await mounted('owner', f);
    const original = rpc.getMockImplementation()!;
    let fail = true,
      release: ((value: ReturnType<typeof saved>) => void) | undefined;
    rpc.mockImplementation((name) =>
      name === 'record_bake'
        ? new Promise((resolve) => {
            release = resolve;
          })
        : name === 'get_production' && fail
          ? Promise.resolve({ data: null, error: { code: '08006' } })
          : original(name)
    );
    startBatch(runtime, { rejects: 1 });
    act(() => acts(runtime).confirmBatch());
    await waitFor(() => expect(release).toBeTypeOf('function'));
    act(() => runtime.setState({ dropNo: 6 }));
    await act(async () => release!(savedBake(rpc)));
    act(() => runtime.go('bake'));
    await waitFor(() =>
      expect(runtime.renderVals().liveProduction?.completed?.[0]?.stockState).toBe('failed')
    );
    const receipt = runtime.renderVals().liveProduction!.completed![0]!;
    expect(receipt).toMatchObject({
      dropNo: 5,
      quantity: 8,
      rejects: 1,
      version: 3,
      balance: null,
      usedDough: 8,
      shortfall: []
    });
    fail = false;
    act(() => receipt.retry());
    await waitFor(() =>
      expect(runtime.renderVals().liveProduction?.completed?.[0]?.stockState).toBe('read')
    );
    expect(runtime.renderVals().liveProduction?.completed?.[0]?.balance).toBe(7);
    expect(called(rpc, 'get_production').at(-1)![1]).toMatchObject({ p_drop: 5 });
    expect(called(rpc, 'record_bake')).toHaveLength(1);
  });

  it('does not present an unanswered production request as saved work', async () => {
    const { runtime, rpc } = await mounted('owner', fresh());
    rpc.mockImplementationOnce(async () => ({ data: null, error: { code: '08006' } }));
    startBatch(runtime);
    act(() => acts(runtime).confirmBatch());
    await waitFor(() => expect(msg(runtime)).toBe(PRODUCTION_COPY.notSaved));
    act(() => runtime.go('bake'));
    expect(runtime.renderVals().liveProduction?.completed).toEqual([]);
    expect(called(rpc, 'record_bake')).toHaveLength(1);
  });

  it('uses the acknowledged shortage result instead of an engine toast derived from stale local stock', async () => {
    const { runtime, rpc } = await mounted('owner', fresh({ items: [stockItem({ on_hand: 0 })] }));
    startBatch(runtime);
    act(() => acts(runtime).confirmBatch());
    await waitFor(() => expect(msg(runtime)).toBe('Double Chocolate Fudge · Batch 1 saved.'));
    expect(called(rpc, 'record_bake')).toHaveLength(1);
    act(() => runtime.go('bake'));
    expect(runtime.renderVals().liveProduction?.completed?.[0]?.shortfall).toEqual([]);
  });

  it('keeps an interrupted acknowledged refresh recoverable after the owner returns', async () => {
    const { runtime, rpc } = await mounted('owner', fresh());
    const original = rpc.getMockImplementation()!;
    let release: (() => void) | undefined;
    rpc.mockImplementation(async (name) => {
      if (name === 'get_stock_catalogue')
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      return original(name);
    });
    startBatch(runtime);
    act(() => acts(runtime).confirmBatch());
    await waitFor(() => expect(release).toBeTypeOf('function'));
    act(() => {
      runtime.setRole('helper');
    });
    act(() => {
      runtime.setRole('owner');
    });
    await act(async () => release!());
    act(() => runtime.go('bake'));
    await waitFor(() =>
      expect(runtime.renderVals().liveProduction?.completed?.[0]?.stockState).toBe('failed')
    );
    expect(runtime.renderVals().liveProduction?.completed?.[0]?.balance).toBeNull();
    expect(called(rpc, 'record_bake')).toHaveLength(1);
  });

  it.each([null, []])(
    'keeps legacy batch quantities but requires a saved recipe after an unavailable read (%j)',
    async (recipes) => {
      const f = fresh({ recipes });
      const { runtime, rpc } = await mounted('owner', f);
      startBatch(runtime, { actual: 9, note: 'Keep this tray' });
      const counts = runtime.renderVals().liveBatchCounts!;
      expect(counts).toMatchObject({ sourceUnavailable: true, recipeVersion: null, actual: '9' });
      act(() => {
        counts.review();
        acts(runtime).confirmBatch();
      });
      expect(called(rpc, 'record_bake')).toHaveLength(0);
      expect(runtime.state.batch).toMatchObject({ actual: 9, note: 'Keep this tray', step: 1 });
      f.recipes = savedRecipe();
      act(() => counts.retryRecipe!());
      await waitFor(() =>
        expect(runtime.renderVals().liveBatchCounts?.sourceUnavailable).toBe(false)
      );
      act(() => runtime.renderVals().liveBatchCounts!.recipeUpdate!.use());
      expect(runtime.renderVals().liveBatchCounts).toMatchObject({
        actual: '9',
        recipeVersion: 3,
        sourceChanged: false
      });
      act(() => runtime.renderVals().liveBatchCounts!.review());
      act(() => runtime.renderVals().liveBatchCounts!.confirm());
      await waitFor(() => expect(called(rpc, 'record_bake')).toHaveLength(1));
      expect(called(rpc, 'record_bake')[0]![1].p_rec).toMatchObject({
        qty: 9,
        recipe_version: 3
      });
    }
  );

  it.each(['batch', 'dough'] as const)(
    'checks an unanswered %s with its exact request even if recipes become unavailable',
    async (kind) => {
      const f = fresh({ answers: [{ data: null, error: { code: '08006' } }] });
      const { runtime, rpc, client } = await mounted('owner', f);
      if (kind === 'batch') startBatch(runtime);
      else
        act(() =>
          runtime.setState({
            screen: 'bake',
            sheet: { kind: 'mixDough' },
            doughPrep: { pid: PID, balls: 6, actualBallsText: '6', recipeAmount: 0.5, step: 2 }
          } as never)
        );
      act(() => (kind === 'batch' ? acts(runtime).confirmBatch() : acts(runtime).confirmDough()));
      await waitFor(() => expect(msg(runtime)).toBe(PRODUCTION_COPY.notSaved));
      f.recipes = [];
      await act(async () => {
        await runtime.loadRecipes(client as never);
      });
      const view =
        kind === 'batch' ? runtime.renderVals().liveBatchCounts! : runtime.renderVals().liveDough!;
      expect(view).toMatchObject({ sourceUnavailable: true, uncertain: true });
      act(() => view.confirm());
      const rpcName = kind === 'dough' ? 'record_dough_preparation' : 'record_bake';
      await waitFor(() => expect(called(rpc, rpcName)).toHaveLength(2));
      expect(called(rpc, rpcName)[1]![1]).toEqual(called(rpc, rpcName)[0]![1]);
    }
  );

  it('keeps a previously verified saved recipe usable when only its latest refresh fails', async () => {
    const f = fresh();
    const { runtime, rpc, client } = await mounted('owner', f);
    f.recipes = null;
    await act(async () => {
      expect(await runtime.loadRecipes(client as never)).toBe(false);
    });
    startBatch(runtime);
    expect(runtime.renderVals().liveBatchCounts).toMatchObject({
      sourceUnavailable: false,
      recipeVersion: 3,
      sourceChanged: false
    });
    act(() => runtime.renderVals().liveBatchCounts!.confirm());
    await waitFor(() => expect(called(rpc, 'record_bake')).toHaveLength(1));
    expect(called(rpc, 'record_bake')[0]![1].p_rec).toMatchObject({ recipe_version: 3 });
  });

  it('retains an unavailable-source dough mix, blocks direct confirmation and allows local discard', async () => {
    const { runtime, rpc } = await mounted('owner', fresh({ recipes: [] }));
    act(() =>
      runtime.setState({
        screen: 'bake',
        sheet: { kind: 'mixDough' },
        doughPrep: { pid: PID, balls: 6, step: 2 }
      } as never)
    );
    const view = runtime.renderVals().liveDough!;
    expect(view).toMatchObject({ sourceUnavailable: true, balls: 6, version: null });
    act(() => acts(runtime).confirmDough());
    expect(called(rpc, 'record_bake')).toHaveLength(0);
    expect(runtime.state.doughPrep).toMatchObject({ balls: 6 });
    act(() => view.discard());
    expect(runtime.state.doughPrep).toBeNull();
  });

  it('a helper records nothing and the batch stays open', async () => {
    const { runtime, rpc } = await mounted('helper', fresh());
    startBatch(runtime);
    act(() => acts(runtime).confirmBatch());
    await settle();
    expect(called(rpc, 'record_bake')).toHaveLength(0);
    expect(msg(runtime)).toBe(PRODUCTION_COPY.ownerOnly);
    expect((runtime.state as unknown as { batch: unknown }).batch).not.toBeNull();
  });

  it('without a connection to the database nothing is recorded and she is told', async () => {
    const ref: { current: OpsRuntime | null } = { current: null };
    render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
    act(() => ref.current!.setRole('owner'));
    startBatch(ref.current!);
    act(() => acts(ref.current!).confirmBatch());
    await settle();
    expect(msg(ref.current!)).toBe(STAFF_COPY.offline);
    expect((ref.current!.state as unknown as { batch: unknown }).batch).not.toBeNull();
  });

  it('a lost reply keeps the batch open and repeating it exactly sends the same id and time; a changed entry is a new record', async () => {
    const f = fresh({ answers: [{ data: null, error: { code: '08006' } }] });
    const { runtime, rpc } = await mounted('owner', f);
    startBatch(runtime);
    act(() => acts(runtime).confirmBatch());
    await settle();
    expect(msg(runtime)).toBe(PRODUCTION_COPY.notSaved);
    expect((runtime.state as unknown as { batch: unknown }).batch).not.toBeNull();
    act(() => acts(runtime).confirmBatch());
    await settle();
    const [first, second] = called(rpc, 'record_bake').map(
      (c) => c[1].p_rec as Record<string, unknown>
    );
    expect(second!.id).toBe(first!.id);
    expect(second!.at).toBe(first!.at);
    expect((runtime.state as unknown as { batch: unknown }).batch).toBeNull(); // the retry was recorded
    // A new batch is a new record.
    startBatch(runtime, { actual: 9 });
    act(() => acts(runtime).confirmBatch());
    await settle();
    const third = called(rpc, 'record_bake')[2]![1].p_rec as Record<string, unknown>;
    expect(third.id).not.toBe(first!.id);
    // Mutation: minting a new id on every tap lets a lost reply be counted twice.
  });

  it('a recipe that changed since the screen was read is refused, the recipes are read again and the batch stays open', async () => {
    const f = fresh({ answers: [{ data: null, error: { code: 'P0002' } }] });
    const { runtime, rpc } = await mounted('owner', f);
    startBatch(runtime);
    act(() => acts(runtime).confirmBatch());
    await settle();
    expect(msg(runtime)).toBe(PRODUCTION_COPY.stale);
    expect(called(rpc, 'get_recipes').length).toBeGreaterThan(0);
    expect((runtime.state as unknown as { batch: unknown }).batch).not.toBeNull();
    // Mutation: not re-reading the recipes leaves the old version on screen, so every retry is refused again.
  });

  it('a refusal says so and changes nothing on screen', async () => {
    const f = fresh({ answers: [{ data: null, error: { code: '22023' } }] });
    const { runtime } = await mounted('owner', f);
    startBatch(runtime);
    act(() => acts(runtime).confirmBatch());
    await settle();
    expect(msg(runtime)).toBe(PRODUCTION_COPY.refused);
    expect((runtime.state as unknown as { batch: unknown }).batch).not.toBeNull();
  });

  it('confirming dough sends a dough record with the balls, closes the sheet, and shows the chiller from the database', async () => {
    const f = fresh();
    const { runtime, rpc } = await mounted('owner', f);
    act(() =>
      runtime.setState({
        doughPrep: { pid: PID, balls: 12, actualBallsText: '13', recipeAmount: 1 },
        sheet: { kind: 'mixDough' }
      } as never)
    );
    f.production = wireProduction({ dough: [{ product_id: PID, balls: 13, at: 7000 }] });
    act(() => acts(runtime).confirmDough());
    await settle();
    expect(called(rpc, 'record_dough_preparation')[0]![1].p_rec).toMatchObject({
      product_id: PID,
      balls: 13,
      recipe_amount: 1,
      recipe_version: 3,
      drop_no: 5
    });
    const s = runtime.state as unknown as {
      dough: Record<string, number>;
      doughAt: Record<string, number>;
      doughPrep: unknown;
    };
    expect(s.dough[PID]).toBe(13);
    expect(s.doughAt[PID]).toBe(7000);
    expect(s.doughPrep).toBeNull();
    // Mutation: running only the engine's confirm loses the mix on a reload.
  });

  it('what ran short is on the records screen from the database, worded as the ported screen words it', async () => {
    const f = fresh({
      production: wireProduction({
        shortfalls: [
          {
            kind: 'batch',
            product_id: PID,
            ref: '',
            short: [{ name: 'Unsalted butter', by: 80, unit: 'g' }],
            at: 9000
          }
        ]
      })
    });
    const { runtime } = await mounted('owner', f);
    expect((runtime.state as unknown as { shortfalls: unknown[] }).shortfalls).toEqual([
      { name: 'Unsalted butter', by: 80, unit: 'g', when: 'Bake — ' + SHORT, at: 9000 }
    ]);
  });

  it('packing an order records its packaging first (with its week), then moves it to Ready; a shortfall is in the message', async () => {
    const f = fresh({
      packAnswers: [
        {
          data: [
            {
              record_id: 'p',
              duplicate: false,
              shortfall: [{ name: 'Brand sticker', by: 1, unit: 'pcs' }]
            }
          ],
          error: null
        }
      ]
    });
    const { runtime, rpc } = await mounted('owner', f);
    act(() => acts(runtime).packOrder('HC-1001'));
    await settle();
    const names = rpc.mock.calls.map((c) => c[0]);
    expect(names.indexOf('record_pack')).toBeGreaterThanOrEqual(0);
    expect(names.indexOf('record_pack')).toBeLessThan(names.indexOf('staff_set_status'));
    expect(called(rpc, 'record_pack')[0]![1]).toEqual({ p_order: 'HC-1001', p_drop: 5 });
    expect(msg(runtime)).toContain(PRODUCTION_COPY.ranShort('brand sticker').trim());
    // production and stock are read again after the pack
    expect(called(rpc, 'get_production').length).toBeGreaterThan(0);
    // Mutation: setting the status first packs the order even when its packaging could not be recorded.
  });

  it('an order that could not be recorded is not packed', async () => {
    for (const [answer, text] of [
      [{ data: null, error: { code: '08006' } }, PRODUCTION_COPY.packNotSaved],
      [{ data: null, error: { code: '22023' } }, PRODUCTION_COPY.refused]
    ] as const) {
      const f = fresh({ packAnswers: [answer] });
      const { runtime, rpc } = await mounted('owner', f);
      act(() => acts(runtime).packOrder('HC-1001'));
      await settle();
      expect(rpc.mock.calls.map((c) => c[0])).not.toContain('staff_set_status');
      expect(msg(runtime)).toBe(text);
      cleanup();
    }
  });

  it('a helper still packs the order but records no packaging (stock is the owner’s)', async () => {
    const { runtime, rpc } = await mounted('helper', fresh());
    act(() => acts(runtime).packOrder('HC-1001'));
    await settle();
    expect(called(rpc, 'record_pack')).toHaveLength(0);
    expect(rpc.mock.calls.map((c) => c[0])).toContain('staff_set_status');
  });

  it('a bazaar sale that reached the server refreshes the stock it used, and only that; nothing sent refreshes nothing', async () => {
    const { runtime, rpc } = await mounted('owner', fresh());
    await act(async () => void (await runtime.flushSales()));
    expect(called(rpc, 'get_stock_catalogue')).toHaveLength(0);
    flush.result = { sent: ['dev1:S1:1'], failed: [], skipped: false };
    await act(async () => void (await runtime.flushSales()));
    await settle();
    expect(called(rpc, 'get_stock_catalogue').length).toBeGreaterThan(0);
    // A sale changes no batch and no dough: reading production again would put back stall stock taken off the baked count.
    expect(called(rpc, 'get_production')).toHaveLength(0);
    // Mutation: not refreshing after a flush leaves the pouches the sale used on screen until the next reload.
    // Mutation: reading production after a flush restores the cookies loaded onto the stall.
  });

  it('a double tap on Confirm records the batch once', async () => {
    const f = fresh();
    const { runtime, rpc } = await mounted('owner', f);
    startBatch(runtime);
    act(() => {
      acts(runtime).confirmBatch();
      acts(runtime).confirmBatch();
    });
    await settle();
    expect(called(rpc, 'record_bake')).toHaveLength(1);
    expect((runtime.state as unknown as { batch: unknown }).batch).toBeNull();
    // Mutation: without the in-flight guard two ids are minted: two records, twice the ingredients off.
  });

  it('leaving the batch screen while the record is on its way still records it once, tells her, and does not crash', async () => {
    const f = fresh();
    const { runtime, rpc } = await mounted('owner', f);
    startBatch(runtime);
    const errors: unknown[] = [];
    const onRejection = (e: unknown) => errors.push(e);
    process.on('unhandledRejection', onRejection);
    act(() => acts(runtime).confirmBatch());
    act(() => runtime.setState({ batch: null } as never)); // she went Back / discarded before the answer came
    await settle();
    process.off('unhandledRejection', onRejection);
    expect(errors).toEqual([]);
    expect(called(rpc, 'record_bake')).toHaveLength(1);
    expect(msg(runtime)).toBe('Double Chocolate Fudge · Batch 1 saved.');
    expect(called(rpc, 'get_production').length).toBeGreaterThan(0);
    // Mutation: running the engine's confirm on a closed screen throws on the missing batch and skips the re-read.
  });

  it('what changed only on the screen is kept when the database is read again: binned dough, cookies taken to the stall', async () => {
    const f = fresh({
      production: wireProduction({
        dough: [{ product_id: PID, balls: 6, at: 7000 }],
        baked: [{ product_id: PID, qty: 30 }]
      })
    });
    const { runtime } = await mounted('owner', f);
    const s = () =>
      runtime.state as unknown as {
        dough: Record<string, number>;
        baked: Record<string, number>;
        doughAt: Record<string, number>;
      };
    expect(s().dough[PID]).toBe(6);
    expect(s().baked[PID]).toBe(30);
    // She bins 2 dough and takes 20 cookies to the stall: only the screen knows.
    act(() => runtime.setState({ dough: { [PID]: 4 }, baked: { [PID]: 10 } } as never));
    // The database then shows 7 more baked (a batch) and the same dough.
    f.production = wireProduction({
      dough: [{ product_id: PID, balls: 6, at: 7000 }],
      baked: [{ product_id: PID, qty: 37 }]
    });
    await act(async () => void (await runtime.loadProduction(null)));
    expect(s().dough[PID]).toBe(4);
    expect(s().baked[PID]).toBe(17);
    expect(s().doughAt[PID]).toBe(7000);
    // The last of the dough used up on the database empties it here too.
    f.production = wireProduction({ dough: [], baked: [{ product_id: PID, qty: 37 }] });
    await act(async () => void (await runtime.loadProduction(null)));
    expect(s().dough[PID]).toBeUndefined();
    expect(s().doughAt[PID]).toBeUndefined();
    // Mutation: replacing dough and baked with the database's makes the binned dough come back and puts the stall's cookies back on the shelf.
  });

  it('an order for another week is packed against this week’s baked count, not refused', async () => {
    const f = fresh({ orders: [order(), order({ id: 'HC-2002', pickup_date: '2027-03-01' })] });
    const { runtime, rpc } = await mounted('owner', f);
    const other = (runtime.state.orders as Array<{ id: string; drop?: number }>).find(
      (o) => o.id === 'HC-2002'
    );
    expect(other?.drop).toBe(-1);
    act(() => acts(runtime).packOrder('HC-2002'));
    await settle();
    expect(called(rpc, 'record_pack')[0]![1]).toEqual({ p_order: 'HC-2002', p_drop: 5 });
    // Mutation: sending the order's own -1 is refused by the database and the order can never be packed.
  });

  it('binning dough is recorded on the database first, then the counts are read back once (not taken off twice)', async () => {
    const f = fresh({
      production: wireProduction({ dough: [{ product_id: PID, balls: 6, at: 7000 }] })
    });
    const { runtime, rpc } = await mounted('owner', f);
    f.production = wireProduction({ dough: [{ product_id: PID, balls: 4, at: 7000 }] }); // the database's answer after the record
    act(() => acts(runtime).logSpoilage('Dough', 2, 'Went off', PID, 'dough'));
    await settle();
    const sent = called(rpc, 'record_discard');
    expect(sent).toHaveLength(1);
    expect(sent[0]![1].p_rec).toMatchObject({
      kind: 'dough',
      product_id: PID,
      qty: 2,
      reason: 'Went off',
      drop_no: 5
    });
    const s = runtime.state as unknown as {
      dough: Record<string, number>;
      spoilage: Array<{ qty: number }>;
    };
    expect(s.dough[PID]).toBe(4); // 6 - 2, once: the engine's own -2 is undone before the database's -2 is read back
    expect(s.spoilage).toHaveLength(1); // the waste record still gets its line
    // Mutation: not undoing the engine's own change makes it 2 (taken off twice).
    // Mutation: not recording first leaves the database counting the binned dough.
  });

  it('binning baked cookies sends a baked discard; more than is there, or a fraction, sends nothing', async () => {
    const f = fresh({ production: wireProduction({ baked: [{ product_id: PID, qty: 5 }] }) });
    const { runtime, rpc } = await mounted('owner', f);
    act(() => acts(runtime).logSpoilage('Cookie', 6, 'x', PID, 'baked')); // the engine refuses: only 5
    await settle();
    expect(called(rpc, 'record_discard')).toHaveLength(0);
    act(() => acts(runtime).logSpoilage('Cookie', 1.5, 'x', PID, 'baked'));
    await settle();
    expect(called(rpc, 'record_discard')).toHaveLength(0);
    expect(msg(runtime)).toBe(PRODUCTION_COPY.discardWhole);
    act(() => acts(runtime).logSpoilage('Cookie', 2, '', PID, 'baked'));
    await settle();
    expect(called(rpc, 'record_discard')[0]![1].p_rec).toMatchObject({
      kind: 'baked',
      qty: 2,
      reason: 'Spoiled'
    });
    // Mutation: sending a count the engine would refuse records waste the screen never showed.
  });

  it('a lost reply keeps the binned dough on screen and repeating it sends the same id and time', async () => {
    const f = fresh({
      production: wireProduction({ dough: [{ product_id: PID, balls: 6, at: 7000 }] })
    });
    const { runtime, rpc } = await mounted('owner', f);
    const answers: Array<{ data: unknown; error: unknown }> = [
      { data: null, error: { code: '08006' } }
    ];
    const inner = rpc.getMockImplementation()!;
    rpc.mockImplementation(async (name: string) => {
      if (name === 'record_discard')
        return answers.shift() ?? { data: [{ record_id: 'd', duplicate: false }], error: null };
      return inner(name);
    });
    act(() => acts(runtime).logSpoilage('Dough', 2, 'x', PID, 'dough'));
    await settle();
    expect(msg(runtime)).toBe(PRODUCTION_COPY.notSaved);
    expect((runtime.state as unknown as { dough: Record<string, number> }).dough[PID]).toBe(6);
    act(() => acts(runtime).logSpoilage('Dough', 2, 'x', PID, 'dough'));
    await settle();
    const [a, b] = called(rpc, 'record_discard').map((c) => c[1].p_rec as Record<string, unknown>);
    expect(b!.id).toBe(a!.id);
    expect(b!.at).toBe(a!.at);
    // Mutation: minting a new id on every tap lets a lost reply be counted twice.
  });

  it('a helper cannot bin dough on the database', async () => {
    const { runtime, rpc } = await mounted('helper', fresh());
    act(() => runtime.setState({ dough: { [PID]: 6 } } as never));
    act(() => acts(runtime).logSpoilage('Dough', 2, 'x', PID, 'dough'));
    await settle();
    expect(called(rpc, 'record_discard')).toHaveLength(0);
    expect(msg(runtime)).toBe(PRODUCTION_COPY.ownerOnly);
  });

  it('an older production read never replaces a newer one', async () => {
    const f = fresh();
    const { runtime, client } = await mounted('owner', f);
    let release!: () => void;
    const slow = new Promise<void>((r) => (release = r));
    const rpc = client.rpc as unknown as ReturnType<typeof vi.fn>;
    rpc.mockImplementationOnce(async () => {
      await slow;
      return { data: wireProduction({ baked: [{ product_id: PID, qty: 1 }] }), error: null };
    });
    const older = runtime.loadProduction(null);
    f.production = wireProduction({ baked: [{ product_id: PID, qty: 9 }] });
    await act(async () => void (await runtime.loadProduction(null)));
    release();
    await act(async () => void (await older));
    expect((runtime.state as unknown as { baked: Record<string, number> }).baked[PID]).toBe(9);
    // Mutation: dropping the sequence guard lets the slow, older answer bring back 1.
  });
});
