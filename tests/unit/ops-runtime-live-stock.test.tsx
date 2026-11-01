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

import { OpsRuntime } from '@/store/ops-runtime';
import type { Role } from '@/store/engine/ops-engine';
import type { SettingsClient } from '@/lib/data/settings';

/**
 * B5-1: the live owner's New Stock data (`liveStock`): statuses (Ethan, 13 October: Out at 0, Low below the level, Good otherwise,
 * no level is Good unless at 0), the item page and its movements read, the grocery list of Out and Low items, and the budget that is
 * shown only once she has set one. An unknown cost is "Cost pending", never 0. Each `Mutation:` line names a change a test must catch.
 */
const STAMP = '2026-09-30T02:00:00.123456+00:00';
type Wire = Record<string, unknown>;
type Answer = { data: unknown; error: unknown; status?: number };

const item = (over: Wire = {}): Wire => ({
  id: 'butter',
  name: 'Unsalted butter',
  category: 'Ingredients',
  unit: 'g',
  on_hand: 900,
  par_level: 200,
  pack_size: 1000,
  pack_label: '1 kg block',
  supplier_id: 'sr',
  use_by_days: null,
  last_counted: '2026-10-03T04:00:00.000Z',
  active: true,
  updated_at: STAMP,
  ...over
});
const price = (id: string, name: string, label: string, cents: number): Wire => ({
  id,
  supplier_id: 'sr',
  item_name: name,
  pack_label: label,
  price_cents: cents,
  previous_cents: [],
  last_bought: '2 Aug',
  preferred: true,
  active: true,
  updated_at: STAMP
});
const catalogue = (): Wire => ({
  suppliers: [
    { id: 'sr', name: 'S&R', phone: '', notes: '', place: '', active: true, updated_at: STAMP }
  ],
  items: [
    // Good: well above its level.
    item(),
    // Low: 20 against a level of 60; a tray of 30 at ₱240: 40 short is 2 trays, ₱480.
    item({
      id: 'eggs',
      name: 'Eggs',
      unit: 'pcs',
      on_hand: 20,
      par_level: 60,
      pack_size: 30,
      pack_label: 'tray',
      last_counted: null
    }),
    // Out: a 25 kg sack at ₱1,250: 5,000 g short is 1 sack.
    item({
      id: 'flour',
      name: 'Bread flour',
      on_hand: 0,
      par_level: 5000,
      pack_size: 25000,
      pack_label: '25 kg sack'
    }),
    // Out with no price at all: the cost of buying it is not known.
    item({
      id: 'sugar',
      name: 'Brown sugar',
      on_hand: 0,
      par_level: 1000,
      pack_size: null,
      pack_label: '',
      supplier_id: null
    }),
    // Packaging with no level: Good at 3, and Out (but nothing to buy) at 0.
    item({
      id: 'tape',
      name: 'Tape',
      category: 'Packaging',
      unit: 'pcs',
      on_hand: 3,
      par_level: 0,
      pack_size: null,
      pack_label: '',
      supplier_id: null
    }),
    item({
      id: 'sticker',
      name: 'Brand sticker',
      category: 'Packaging',
      unit: 'pcs',
      on_hand: 0,
      par_level: 0,
      pack_size: null,
      pack_label: '',
      supplier_id: null
    }),
    // Switched off: kept for the history, not counted.
    item({ id: 'old', name: 'Old jar', on_hand: 0, par_level: 10, active: false })
  ],
  prices: [
    price('a3a00000-0000-4000-8000-000000000001', 'Unsalted butter', '1 kg block', 42000),
    price('a3a00000-0000-4000-8000-000000000002', 'Eggs', 'tray', 24000),
    price('a3a00000-0000-4000-8000-000000000003', 'Bread flour', '25 kg sack', 125000)
  ]
});
const itemCost = (over: Wire): Wire => ({
  item_id: 'butter',
  name: 'Unsalted butter',
  unit: 'g',
  active: true,
  on_hand: 900,
  unit_cost: 9,
  source: 'average',
  ...over
});
const ITEM_COSTS = [
  itemCost({}),
  itemCost({ item_id: 'eggs', name: 'Eggs', unit: 'pcs', unit_cost: 800, source: 'usual' }),
  itemCost({ item_id: 'flour', name: 'Bread flour', unit_cost: null, source: null })
];
const move = (over: Wire = {}): Wire => ({
  id: 'm1',
  kind: 'receipt',
  qty_delta: 500,
  unit_cost: null,
  cost_source: null,
  paid_cents: 8825,
  supplier: 'S&R',
  reason: '',
  at: Date.UTC(2026, 9, 3, 4, 0, 0),
  ...over
});
const MOVEMENTS = [
  move({
    id: 'm4',
    kind: 'use',
    qty_delta: -100,
    unit_cost: 9,
    cost_source: 'average',
    paid_cents: null,
    supplier: '',
    reason: 'Batch'
  }),
  move({
    id: 'm3',
    kind: 'waste',
    qty_delta: -20,
    paid_cents: null,
    supplier: '',
    reason: 'Dropped'
  }),
  move({
    id: 'm2',
    kind: 'count',
    qty_delta: -30,
    paid_cents: null,
    supplier: '',
    reason: 'Weekly count'
  }),
  move({ id: 'm1b', kind: 'count', qty_delta: 15, paid_cents: null, supplier: '', reason: '' }),
  move({ id: 'm1' }),
  move({
    id: 'm0',
    kind: 'opening',
    qty_delta: 1000,
    paid_cents: null,
    supplier: '',
    reason: 'Opening'
  })
];

interface World {
  itemCosts: Answer;
  movements: Answer | (() => Promise<Answer>);
  books: Wire;
  lastPaid: unknown[];
  catalogue: Wire;
}
const world = (over: Partial<World> = {}): World => ({
  itemCosts: { data: ITEM_COSTS, error: null },
  movements: { data: MOVEMENTS, error: null },
  books: { basis: 'bought', lines: [], receipts: [] },
  lastPaid: [],
  catalogue: catalogue(),
  ...over
});
function fakeClient(w: World) {
  const rpc = vi.fn(async (name: string): Promise<Answer> => {
    if (name === 'get_stock_catalogue') return { data: w.catalogue, error: null };
    if (name === 'get_last_paid') return { data: w.lastPaid, error: null };
    if (name === 'get_item_costs') return w.itemCosts;
    if (name === 'get_recipe_costs') return { data: [], error: null };
    if (name === 'get_books') return { data: w.books, error: null };
    if (name === 'get_item_movements')
      return typeof w.movements === 'function' ? w.movements() : w.movements;
    if (name === 'record_stock_movement')
      return { data: [{ item_id: 'x', on_hand: 0, duplicate: false }], error: null };
    return { data: null, error: null };
  });
  return { rpc, client: { rpc } };
}
const calls = (rpc: ReturnType<typeof fakeClient>['rpc'], name: string) =>
  rpc.mock.calls.filter((c) => c[0] === name) as unknown as Array<
    [string, Record<string, unknown>]
  >;
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 30))));

async function mounted(w: World, role: Role = 'owner', readBooks = false) {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
  const runtime = ref.current!;
  act(() => runtime.setRole(role));
  const f = fakeClient(w);
  await act(async () => {
    await runtime.loadStockCatalogue(f.client as never);
    if (readBooks) await runtime.loadBooks(f.client as never);
  });
  await settle();
  return { runtime, ...f };
}
const stock = (r: OpsRuntime) => r.renderVals().liveStock!;
const byName = (r: OpsRuntime, name: string) => stock(r).items.find((i) => i.name === name)!;

function settingsClient(budget: { cents: number; updatedAt: string | null } | null) {
  const rpc = vi.fn(async () => ({
    data: budget
      ? [
          {
            key: 'groceryBudget',
            int_value: null,
            cents_value: budget.cents,
            json_value: null,
            text_value: null,
            is_default: budget.updatedAt === null,
            updated_at: budget.updatedAt
          }
        ]
      : [],
    error: null
  }));
  return { rpc } as unknown as SettingsClient;
}

describe('B5-1: liveStock (live mode, owner)', () => {
  beforeEach(() => {
    localStorage.clear();
    live = true;
    store.clear();
    localStorage.clear();
  });
  afterEach(() => cleanup());

  it('is null for a helper, for support, outside live mode and before the catalogue is read', async () => {
    for (const role of ['helper', 'support'] as Role[]) {
      const { runtime } = await mounted(world(), role);
      expect(runtime.renderVals().liveStock ?? null).toBeNull();
      cleanup();
    }
    // Before the catalogue is read there is nothing to draw.
    const ref: { current: OpsRuntime | null } = { current: null };
    render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
    act(() => ref.current!.setRole('owner'));
    expect(ref.current!.renderVals().liveStock ?? null).toBeNull();
    cleanup();
    // The demo build never has it.
    live = false;
    const demo: { current: OpsRuntime | null } = { current: null };
    render(<OpsRuntime ref={(r) => void (demo.current = r)} />);
    expect(demo.current!.renderVals().liveStock ?? null).toBeNull();
  });

  it('gives each item its status in words: Out at 0, Low below the level, Good otherwise', async () => {
    const { runtime } = await mounted(world());
    const s = stock(runtime);
    expect(byName(runtime, 'Unsalted butter').status).toBe('Good');
    expect(byName(runtime, 'Eggs').status).toBe('Low');
    expect(byName(runtime, 'Bread flour').status).toBe('Out');
    expect(byName(runtime, 'Brown sugar').status).toBe('Out');
    // No level: Good unless it is at 0.
    expect(byName(runtime, 'Tape').status).toBe('Good');
    expect(byName(runtime, 'Brand sticker').status).toBe('Out');
    // The count chips cover the active items only.
    expect(s.counts).toEqual({ total: 6, out: 3, low: 1 });
    expect(s.items.find((i) => i.name === 'Old jar')?.active).toBe(false);
    // Mutation: counting the switched-off item would make the chips 7 / 4 / 1.
  });

  it('says quantity, level and last count in words', async () => {
    const { runtime } = await mounted(world());
    const butter = byName(runtime, 'Unsalted butter');
    expect(butter.qtyText).toBe('900 g');
    expect(butter.levelText).toBe('Low below 200 g');
    expect(butter.lastCountedText).toBe('Counted 3 Oct');
    expect(byName(runtime, 'Eggs').lastCountedText).toBe('Opening count pending');
    expect(byName(runtime, 'Tape').levelText).toBe('No level set');
    expect(byName(runtime, 'Bread flour').qtyText).toBe('0 g');
    expect(butter.supplier).toBe('S&R');
    expect(byName(runtime, 'Tape').supplier).toBe('No supplier set');
  });

  it('the cost is the database’s with where it came from; an unknown cost is Cost pending, never 0', async () => {
    const { runtime } = await mounted(world());
    expect(byName(runtime, 'Unsalted butter').costText).toBe('₱0.09 per g · average');
    expect(byName(runtime, 'Eggs').costText).toBe('₱8.00 per pcs · usual price');
    expect(byName(runtime, 'Bread flour').costText).toBe('Cost pending');
    // Not in the cost read at all.
    expect(byName(runtime, 'Brown sugar').costText).toBe('Cost pending');
    for (const i of stock(runtime).items) expect(i.costText).not.toMatch(/₱0(\.00)?\b(?!\.)/);
    // Mutation: `?? 0` would print ₱0.00 per g for flour.
  });

  it('a failed cost read leaves every cost pending, not zero', async () => {
    const { runtime } = await mounted(
      world({ itemCosts: { data: null, error: { code: '500' }, status: 500 } })
    );
    for (const i of stock(runtime).items) expect(i.costText).toBe('Cost pending');
  });

  it('on a database with no cost function the engine path never shows ₱0.00 for an unpriced item', async () => {
    const { runtime } = await mounted(
      world({ itemCosts: { data: null, error: { code: 'PGRST202' }, status: 404 } })
    );
    for (const i of stock(runtime).items) expect(i.costText).not.toMatch(/₱0(\.0+)?\s/);
    expect(byName(runtime, 'Tape').costText).toBe('Cost pending');
    // Mutation: accepting the engine's 0 as a cost prints "₱0.00 per ..." for an item nobody has priced.
  });

  it('shows what was last paid when something was', async () => {
    const { runtime } = await mounted(
      world({
        lastPaid: [
          {
            item_name: 'Unsalted butter',
            cost_cents: 8825,
            qty: 1000,
            supplier: 'S&R',
            at: Date.UTC(2026, 9, 3, 4, 0, 0)
          }
        ]
      })
    );
    expect(byName(runtime, 'Unsalted butter').lastPaidText).toBe('Last paid ₱88.25 · 3 Oct');
    expect(byName(runtime, 'Eggs').lastPaidText).toBeNull();
  });

  it('keeps the existing inventory exactly as it was', async () => {
    const { runtime } = await mounted(world());
    const vals = runtime.renderVals();
    // The ported inventory rows still come from state.inv: the active items of the open tab.
    expect(vals.invRows.map((r: { name: unknown }) => String(r.name))).toEqual([
      'Unsalted butter',
      'Eggs',
      'Bread flour',
      'Brown sugar'
    ]);
    expect(runtime.state.sheet ?? null).toBeNull();
    expect(vals.liveStockItems ?? null).toBeNull();
    expect((runtime.state.inv as unknown[]).length).toBe(6);
  });
});

describe('B5-1: the item page and its movements', () => {
  beforeEach(() => {
    localStorage.clear();
    live = true;
    store.clear();
    localStorage.clear();
  });
  afterEach(() => cleanup());

  it('there is no page until an item is opened', async () => {
    const { runtime, rpc } = await mounted(world());
    expect(stock(runtime).page).toBeNull();
    expect(calls(rpc, 'get_item_movements')).toHaveLength(0);
  });

  it('opening an item is loading, then ready with the rows newest first', async () => {
    let release!: (a: Answer) => void;
    const gate = new Promise<Answer>((r) => (release = r));
    const { runtime, rpc } = await mounted(world({ movements: () => gate }));
    act(() => byName(runtime, 'Unsalted butter').open());
    const loading = stock(runtime).page!;
    expect(loading.item.name).toBe('Unsalted butter');
    expect(loading.movementsState).toBe('loading');
    expect(loading.movements).toEqual([]);
    expect(calls(rpc, 'get_item_movements')[0]![1]).toEqual({ p_item: 'butter', p_limit: 50 });
    await act(async () => {
      release({ data: MOVEMENTS, error: null });
      await gate;
    });
    await settle();
    const ready = stock(runtime).page!;
    expect(ready.movementsState).toBe('ready');
    expect(ready.movements.map((m) => m.id)).toEqual(['m4', 'm3', 'm2', 'm1b', 'm1', 'm0']);
    // Mutation: sorting the rows here by date would break the database's own order.
  });

  it('says each movement in words: the signed change, the cost, the supplier and the reason', async () => {
    const { runtime } = await mounted(world());
    act(() => byName(runtime, 'Unsalted butter').open());
    await settle();
    const rows = stock(runtime).page!.movements;
    const by = (id: string) => rows.find((m) => m.id === id)!;
    // A use with a stamped cost: the cost per unit.
    expect(by('m4')).toMatchObject({
      changeText: '−100 g',
      costText: '₱0.09 per g',
      reason: 'Batch'
    });
    // A waste with no cost known: pending, never 0.
    expect(by('m3')).toMatchObject({
      changeText: '−20 g',
      costText: 'Cost pending',
      reason: 'Dropped'
    });
    // A count that took stock off with no cost known: pending. One that added stock carries no cost.
    expect(by('m2').costText).toBe('Cost pending');
    expect(by('m1b')).toMatchObject({ changeText: '+15 g', costText: null });
    // A receipt shows what it paid and who from; an opening carries no cost.
    expect(by('m1')).toMatchObject({
      changeText: '+500 g',
      costText: '₱88.25 paid',
      supplier: 'S&R'
    });
    expect(by('m0')).toMatchObject({ changeText: '+1,000 g', costText: null });
    expect(by('m1').at).toBe(Date.UTC(2026, 9, 3, 4, 0, 0));
    for (const m of rows) expect(m.costText ?? '').not.toMatch(/₱0(\.00)? /);
    // Mutation: a null unit cost turned into ₱0.00 would show on the waste and the count.
  });

  it('a database before migration 66 gives unavailable, not an error and not an empty history', async () => {
    const { runtime } = await mounted(
      world({ movements: { data: null, error: { code: 'PGRST202' }, status: 404 } })
    );
    act(() => byName(runtime, 'Unsalted butter').open());
    await settle();
    const page = stock(runtime).page!;
    expect(page.movementsState).toBe('unavailable');
    expect(page.movements).toEqual([]);
  });

  it('a failed read is unavailable too, and a malformed answer is never shown', async () => {
    for (const answer of [
      { data: null, error: { code: '500' }, status: 500 },
      { data: [{ id: 'x', kind: 'sale' }], error: null }
    ] as Answer[]) {
      const { runtime } = await mounted(world({ movements: answer }));
      act(() => byName(runtime, 'Unsalted butter').open());
      await settle();
      expect(stock(runtime).page!.movementsState).toBe('unavailable');
      expect(stock(runtime).page!.movements).toEqual([]);
      cleanup();
    }
  });

  it('close goes back to the list', async () => {
    const { runtime } = await mounted(world());
    act(() => byName(runtime, 'Eggs').open());
    await settle();
    expect(stock(runtime).page).not.toBeNull();
    act(() => stock(runtime).page!.close());
    expect(stock(runtime).page).toBeNull();
  });

  it('a page for another item does not show the first item’s rows', async () => {
    const { runtime } = await mounted(world());
    act(() => byName(runtime, 'Unsalted butter').open());
    await settle();
    act(() => stock(runtime).page!.close());
    act(() => byName(runtime, 'Eggs').open());
    expect(stock(runtime).page!.item.name).toBe('Eggs');
    expect(stock(runtime).page!.movementsState).toBe('loading');
    expect(stock(runtime).page!.movements).toEqual([]);
  });

  it('reads again after a stock movement, so the page never keeps a stale history', async () => {
    const { runtime, rpc } = await mounted(world());
    act(() => byName(runtime, 'Unsalted butter').open());
    await settle();
    const before = calls(rpc, 'get_item_movements').length;
    await act(async () => {
      await runtime.loadStockCatalogue(null); // what every recorded movement ends with
    });
    await settle();
    expect(calls(rpc, 'get_item_movements').length).toBeGreaterThan(before);
    expect(stock(runtime).page!.movementsState).toBe('ready');
    // Mutation: no refetch would leave the page on the history from before the movement.
  });

  it('an item that is no longer in the catalogue closes the page', async () => {
    const w = world();
    const { runtime, rpc } = await mounted(w);
    act(() => byName(runtime, 'Eggs').open());
    (w.catalogue.items as Wire[]).splice(
      (w.catalogue.items as Wire[]).findIndex((i) => i.id === 'eggs'),
      1
    );
    await act(async () => {
      await runtime.loadStockCatalogue(null);
    });
    await settle();
    expect(rpc).toBeDefined();
    expect(stock(runtime).page).toBeNull();
  });
});

describe('B5-1: the actions use the existing sheets and flows', () => {
  beforeEach(() => {
    localStorage.clear();
    live = true;
    store.clear();
    localStorage.clear();
  });
  afterEach(() => cleanup());

  const sheet = (r: OpsRuntime) =>
    r.state.sheet as { kind?: string; name?: string; id?: string } | null;

  it('receive opens the existing receive sheet for that item', async () => {
    const { runtime } = await mounted(world());
    act(() => byName(runtime, 'Eggs').receive());
    expect(sheet(runtime)).toMatchObject({ kind: 'receive', name: 'Eggs' });
  });

  it('waste opens the existing waste sheet, adjust the existing quantity sheet, edit the stock item form', async () => {
    const { runtime } = await mounted(world());
    act(() => byName(runtime, 'Unsalted butter').waste());
    expect(sheet(runtime)).toMatchObject({ kind: 'spoil', name: 'Unsalted butter' });
    act(() => byName(runtime, 'Unsalted butter').adjust());
    expect(sheet(runtime)).toMatchObject({ kind: 'invEdit', name: 'Unsalted butter' });
    act(() => byName(runtime, 'Unsalted butter').edit());
    expect(sheet(runtime)).toMatchObject({ kind: 'stockitems', id: 'butter' });
  });

  it('count starts the existing count for that one item, on its own tab', async () => {
    const { runtime } = await mounted(world());
    act(() => byName(runtime, 'Tape').count());
    await settle();
    const st = runtime.state.stocktake as { items: string[]; i: number } | null;
    expect(st).not.toBeNull();
    expect(st!.items).toEqual(['Tape']);
    expect(runtime.state.invTab).toBe('Packaging');
  });

  it('keeps earlier physical counts when another item is opened for counting', async () => {
    const { runtime } = await mounted(world());
    act(() => byName(runtime, 'Tape').count());
    act(() => runtime.renderVals().stock!.onInput({ target: { value: '0' } } as never));
    act(() => stock(runtime).count!.back());
    act(() => byName(runtime, 'Unsalted butter').count());
    expect(runtime.renderVals().stock!.name).toBe('Unsalted butter');
    expect(stock(runtime).count).toMatchObject({
      paused: false,
      total: 2,
      rows: [{ name: 'Tape', amountText: '0 pcs', error: null }]
    });
  });

  it('skips an unavailable item without discarding other physical counts or sending a movement', async () => {
    const w = world();
    const { runtime, rpc } = await mounted(w);
    act(() => byName(runtime, 'Tape').count());
    act(() => runtime.renderVals().stock!.onInput({ target: { value: '0' } } as never));
    act(() => byName(runtime, 'Unsalted butter').count());
    act(() => runtime.renderVals().stock!.onInput({ target: { value: '20' } } as never));
    act(() => runtime.renderVals().stock!.prev());
    (w.catalogue.items as Wire[]).find((row) => row.id === 'tape')!.active = false;
    await act(async () => {
      await runtime.loadStockCatalogue(null);
    });
    expect(stock(runtime).count!.unavailable).toBe(true);
    act(() => stock(runtime).count!.skipUnavailable!());
    expect(stock(runtime).count).toMatchObject({
      total: 1,
      unavailable: false,
      rows: [{ name: 'Unsalted butter', amountText: '20 g', error: null }]
    });
    expect(calls(rpc, 'record_stock_movement')).toHaveLength(0);
  });
});

describe('B5-1: the count note', () => {
  beforeEach(() => {
    localStorage.clear();
    live = true;
    store.clear();
    localStorage.clear();
  });
  afterEach(() => cleanup());

  it('is a plain sentence only on the used basis, and null otherwise', async () => {
    const used = await mounted(
      world({ books: { basis: 'used', lines: [], receipts: [] } }),
      'owner',
      true
    );
    expect(stock(used.runtime).countNote).toBe(
      'A count that finds less stock counts as an expense at the item’s cost.'
    );
    cleanup();
    const bought = await mounted(world(), 'owner', true);
    expect(stock(bought.runtime).countNote).toBeNull();
    cleanup();
    // The books not read yet: nothing is claimed.
    const unread = await mounted(world(), 'owner', false);
    expect(stock(unread.runtime).countNote).toBeNull();
  });
});

describe('B5-1: the grocery list', () => {
  beforeEach(() => {
    localStorage.clear();
    live = true;
    store.clear();
    localStorage.clear();
  });
  afterEach(() => cleanup());

  it('lists only the Out and Low items, Out first, each with its word', async () => {
    const { runtime } = await mounted(world());
    const rows = stock(runtime).grocery.rows;
    expect(rows.map((r) => r.name)).toEqual([
      'Brand sticker',
      'Bread flour',
      'Brown sugar',
      'Eggs'
    ]);
    expect(rows.map((r) => r.status)).toEqual(['Out', 'Out', 'Out', 'Low']);
    expect(rows.some((r) => ['Unsalted butter', 'Tape', 'Old jar'].includes(r.name))).toBe(false);
    // Mutation: listing every item (or the engine’s own plan for Good items) would add butter and tape.
  });

  it('works out have, needed and what to buy from the pack and the best price', async () => {
    const { runtime } = await mounted(world());
    const eggs = stock(runtime).grocery.rows.find((r) => r.name === 'Eggs')!;
    // 20 against a level of 60: 40 short; a tray holds 30, so 2 trays (60 pcs) at ₱240.
    expect(eggs).toMatchObject({
      haveText: '20 pcs',
      neededText: '60 pcs',
      toBuyText: '2 × tray (60 pcs)',
      packText: 'tray',
      supplier: 'S&R',
      lineCostText: '₱480.00',
      bestPriceText: '₱8.00 per pcs'
    });
    const flour = stock(runtime).grocery.rows.find((r) => r.name === 'Bread flour')!;
    expect(flour).toMatchObject({
      haveText: '0 g',
      neededText: '5,000 g',
      toBuyText: '1 × 25 kg sack (25,000 g)',
      lineCostText: '₱1,250.00',
      bestPriceText: '₱0.05 per g'
    });
  });

  it('an item with no price says Cost pending and the total says so; an item with nothing to buy costs ₱0.00', async () => {
    const { runtime } = await mounted(world());
    const sugar = stock(runtime).grocery.rows.find((r) => r.name === 'Brown sugar')!;
    expect(sugar.lineCostText).toBe('Cost pending');
    expect(sugar.bestPriceText).toBe('Cost pending');
    expect(sugar.packText).toBe('No pack set');
    const sticker = stock(runtime).grocery.rows.find((r) => r.name === 'Brand sticker')!;
    expect(sticker.toBuyText).toBe('Nothing to buy');
    expect(sticker.lineCostText).toBe('₱0.00');
    expect(stock(runtime).grocery.totalText).toBe('₱1,730.00 · some cost pending');
    // Mutation: counting sugar as ₱0 would print a plain ₱1,730.00 total as if it were complete.
  });

  it('when no item has a price the total is Cost pending, not ₱0.00', async () => {
    const w = world();
    (w.catalogue.prices as Wire[]).length = 0;
    const { runtime } = await mounted(w);
    const total = stock(runtime).grocery.totalText;
    expect(total).toMatch(/Cost pending|some cost pending/);
    expect(total).not.toBe('₱0.00');
  });

  it('with nothing Out or Low the list is empty and the total is a known ₱0.00', async () => {
    const w = world();
    w.catalogue = {
      ...catalogue(),
      items: [item(), item({ id: 'tape', name: 'Tape', par_level: 0, on_hand: 3 })]
    };
    const { runtime } = await mounted(w);
    expect(stock(runtime).grocery.rows).toEqual([]);
    expect(stock(runtime).grocery.totalText).toBe('₱0.00');
  });

  it('bought opens the existing receive flow for that item', async () => {
    const { runtime } = await mounted(world());
    const eggs = stock(runtime).grocery.rows.find((r) => r.name === 'Eggs')!;
    act(() => eggs.bought());
    expect(runtime.state.sheet).toMatchObject({ kind: 'receive', name: 'Eggs' });
  });

  it('has no budget until she has set one: no 6,000, no left, no over', async () => {
    const { runtime } = await mounted(world());
    const g = stock(runtime).grocery;
    expect(g.budgetText).toBeNull();
    expect(g.budgetNoteText).toBeNull();
    expect(g.overBudget).toBe(false);
    expect(JSON.stringify(g)).not.toContain('6,000');
  });

  it('a budget that is only the database default is still no budget', async () => {
    const { runtime } = await mounted(world());
    await act(async () => {
      await runtime.loadSettings(settingsClient({ cents: 600000, updatedAt: null }), 'owner');
    });
    await settle();
    expect(stock(runtime).grocery.budgetText).toBeNull();
    expect(stock(runtime).grocery.budgetNoteText).toBeNull();
    // Mutation: reading cfg.groceryBudget unconditionally would show ₱6,000 here.
  });

  it('a budget she has set shows, with what is left or over', async () => {
    const w = world();
    // Without the sugar's unknown price the list is ₱1,730.00 known.
    const { runtime } = await mounted(w);
    await act(async () => {
      await runtime.loadSettings(
        settingsClient({ cents: 200000, updatedAt: '2026-10-01T01:00:00.000Z' }),
        'owner'
      );
    });
    await settle();
    const g = stock(runtime).grocery;
    expect(g.budgetText).toBe('₱2,000');
    expect(g.overBudget).toBe(false);
    expect(g.budgetNoteText).toBe('₱270.00 left so far');
    cleanup();
    const over = await mounted(world());
    await act(async () => {
      await over.runtime.loadSettings(
        settingsClient({ cents: 100000, updatedAt: '2026-10-01T01:00:00.000Z' }),
        'owner'
      );
    });
    await settle();
    expect(stock(over.runtime).grocery.overBudget).toBe(true);
    expect(stock(over.runtime).grocery.budgetNoteText).toBe('₱730.00 over');
  });
});
