import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, render } from '@testing-library/react';

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
  const rpc = vi.fn(async (name: string) => {
    if (name === 'get_stock_catalogue')
      return { data: { suppliers: [], items: f.items, prices: [] }, error: null };
    if (name === 'get_last_paid') return { data: [], error: null };
    if (name === 'get_production') return { data: f.production, error: null };
    if (name === 'get_recipes') return { data: [], error: null };
    if (name === 'get_staff_orders') return { data: f.orders, error: null };
    if (name === 'record_production') return f.answers.shift() ?? saved();
    if (name === 'record_discard') return { data: [{ record_id: 'd', duplicate: false }], error: null };
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
const called = (rpc: ReturnType<typeof fakeClient>['rpc'], name: string) =>
  rpc.mock.calls.filter((c) => c[0] === name) as unknown as Array<
    [string, Record<string, unknown>]
  >;

const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 30))));
const toast = (r: OpsRuntime) => r.state.toast as { msg?: string; undo?: unknown } | null;
const msg = (r: OpsRuntime) => toast(r)?.msg ?? '';

interface Acts {
  confirmDough: () => void;
  confirmBatch: () => void;
  packOrder: (id: string) => void;
  logSpoilage: (name: string, qty: unknown, why: string, pid?: string, kind?: string) => void;
}
const acts = (r: OpsRuntime) => r as unknown as Acts;

async function mounted(role: Role, f: Fake, load = true) {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
  const runtime = ref.current!;
  act(() => runtime.setRole(role));
  const c = fakeClient(f);
  await act(async () => {
    await runtime.loadStockCatalogue(c.client as never);
    await runtime.loadOrders(c.client as unknown as StaffOrderClient);
    if (load) await runtime.loadProduction(c.client as never);
    await runtime.loadRecipes(c.client as never);
  });
  // The recipes screen's own state: yield 12 for this flavour, and the version the screen is on.
  const cur = runtime.state as unknown as { recipes: Record<string, unknown>; recipeVer: Record<string, number> };
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

describe('C2: baking, mixing dough and packing record on the database (live mode)', () => {
  beforeEach(() => {
    live = true;
    store.clear();
    localStorage.clear();
    flush.result = { sent: [], failed: [], skipped: false };
  });
  afterEach(() => cleanup());

  it('confirming a batch sends one record with what was baked, the recipe version on screen and the week; then the screens show what the database holds', async () => {
    const f = fresh();
    const { runtime, rpc } = await mounted('owner', f);
    startBatch(runtime, { adj: { 'Bread flour': 2, Butter: 0 }, rejects: 1 });
    // The database's answer to the confirm: the flour is down and the batch is on the books.
    f.items = [stockItem({ on_hand: 3700 })];
    f.production = wireProduction({
      batches: [{ product_id: PID, qty: 7, target: 8, rejects: 1, version: 3, at: 5000 }],
      baked: [{ product_id: PID, qty: 7 }]
    });
    act(() => acts(runtime).confirmBatch());
    await settle();
    const sent = called(rpc, 'record_production');
    expect(sent).toHaveLength(1);
    const body = sent[0]![1].p_rec as Record<string, unknown>;
    expect(body).toMatchObject({
      kind: 'batch',
      product_id: PID,
      qty: 8,
      target: 8,
      rejects: 1,
      recipe_version: 3,
      drop_no: 5
    });
    expect(body.adj).toEqual({ 'Bread flour': 2 }); // a line left at 0 is not sent
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

  it('a helper records nothing and the batch stays open', async () => {
    const { runtime, rpc } = await mounted('helper', fresh());
    startBatch(runtime);
    act(() => acts(runtime).confirmBatch());
    await settle();
    expect(called(rpc, 'record_production')).toHaveLength(0);
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
    const [first, second] = called(rpc, 'record_production').map(
      (c) => c[1].p_rec as Record<string, unknown>
    );
    expect(second!.id).toBe(first!.id);
    expect(second!.at).toBe(first!.at);
    expect((runtime.state as unknown as { batch: unknown }).batch).toBeNull(); // the retry was recorded
    // A new batch is a new record.
    startBatch(runtime, { actual: 9 });
    act(() => acts(runtime).confirmBatch());
    await settle();
    const third = called(rpc, 'record_production')[2]![1].p_rec as Record<string, unknown>;
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
      runtime.setState({ doughPrep: { pid: PID, balls: 6 }, sheet: { kind: 'mixDough' } } as never)
    );
    f.production = wireProduction({ dough: [{ product_id: PID, balls: 6, at: 7000 }] });
    act(() => acts(runtime).confirmDough());
    await settle();
    expect(called(rpc, 'record_production')[0]![1].p_rec).toMatchObject({
      kind: 'dough',
      product_id: PID,
      qty: 6,
      target: null,
      rejects: 0,
      adj: {},
      recipe_version: 3,
      drop_no: 5
    });
    const s = runtime.state as unknown as {
      dough: Record<string, number>;
      doughAt: Record<string, number>;
      doughPrep: unknown;
    };
    expect(s.dough[PID]).toBe(6);
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
    expect(called(rpc, 'record_production')).toHaveLength(1);
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
    expect(called(rpc, 'record_production')).toHaveLength(1);
    expect(msg(runtime)).toBe(PRODUCTION_COPY.recorded);
    expect(called(rpc, 'get_production').length).toBeGreaterThan(0);
    // Mutation: running the engine's confirm on a closed screen throws on the missing batch and skips the re-read.
  });

  it('what changed only on the screen is kept when the database is read again: binned dough, cookies taken to the stall', async () => {
    const f = fresh({ production: wireProduction({ dough: [{ product_id: PID, balls: 6, at: 7000 }], baked: [{ product_id: PID, qty: 30 }] }) });
    const { runtime } = await mounted('owner', f);
    const s = () => runtime.state as unknown as { dough: Record<string, number>; baked: Record<string, number>; doughAt: Record<string, number> };
    expect(s().dough[PID]).toBe(6);
    expect(s().baked[PID]).toBe(30);
    // She bins 2 dough and takes 20 cookies to the stall: only the screen knows.
    act(() => runtime.setState({ dough: { [PID]: 4 }, baked: { [PID]: 10 } } as never));
    // The database then shows 7 more baked (a batch) and the same dough.
    f.production = wireProduction({ dough: [{ product_id: PID, balls: 6, at: 7000 }], baked: [{ product_id: PID, qty: 37 }] });
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
    const other = (runtime.state.orders as Array<{ id: string; drop?: number }>).find((o) => o.id === 'HC-2002');
    expect(other?.drop).toBe(-1);
    act(() => acts(runtime).packOrder('HC-2002'));
    await settle();
    expect(called(rpc, 'record_pack')[0]![1]).toEqual({ p_order: 'HC-2002', p_drop: 5 });
    // Mutation: sending the order's own -1 is refused by the database and the order can never be packed.
  });

  it('binning dough is recorded on the database first, then the counts are read back once (not taken off twice)', async () => {
    const f = fresh({ production: wireProduction({ dough: [{ product_id: PID, balls: 6, at: 7000 }] }) });
    const { runtime, rpc } = await mounted('owner', f);
    f.production = wireProduction({ dough: [{ product_id: PID, balls: 4, at: 7000 }] }); // the database's answer after the record
    act(() => acts(runtime).logSpoilage('Dough', 2, 'Went off', PID, 'dough'));
    await settle();
    const sent = called(rpc, 'record_discard');
    expect(sent).toHaveLength(1);
    expect(sent[0]![1].p_rec).toMatchObject({ kind: 'dough', product_id: PID, qty: 2, reason: 'Went off', drop_no: 5 });
    const s = runtime.state as unknown as { dough: Record<string, number>; spoilage: Array<{ qty: number }> };
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
    expect(called(rpc, 'record_discard')[0]![1].p_rec).toMatchObject({ kind: 'baked', qty: 2, reason: 'Spoiled' });
    // Mutation: sending a count the engine would refuse records waste the screen never showed.
  });

  it('a lost reply keeps the binned dough on screen and repeating it sends the same id and time', async () => {
    const f = fresh({ production: wireProduction({ dough: [{ product_id: PID, balls: 6, at: 7000 }] }) });
    const { runtime, rpc } = await mounted('owner', f);
    const answers: Array<{ data: unknown; error: unknown }> = [{ data: null, error: { code: '08006' } }];
    const inner = rpc.getMockImplementation()!;
    rpc.mockImplementation(async (name: string) => {
      if (name === 'record_discard') return answers.shift() ?? { data: [{ record_id: 'd', duplicate: false }], error: null };
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
