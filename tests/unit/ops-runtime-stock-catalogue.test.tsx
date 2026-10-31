import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';

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
import { StockItemsForm, readItemForm } from '@/components/live/stock-items-form';
import { StockSuppliersForm, readSupplierForm } from '@/components/live/stock-suppliers-form';
import * as engineModule from '@/store/engine/ops-engine';
import type { Role } from '@/store/engine/ops-engine';

// The engine's supplier constants, which the typings only partly list.
const SUPPLIERS = engineModule.SUPPLIERS as unknown as Array<{ name: string }>;
const OPTIONS_FOR = (
  engineModule as unknown as {
    OPTIONS_FOR: (item: string) => Array<{ name: string; price: number }>;
  }
).OPTIONS_FOR;
import type { LiveStockItemEdit, LiveStockSupplierEdit } from '@/view-models/vals';

/**
 * A3: the owner's stock items, suppliers and prices. They come from the database into the inventory rows (state) and
 * into the engine's own supplier constants (refilled in place), and the owner edits them in two forms; the ported
 * "Add item" and "Remove" actions go to the database instead of changing one screen. Each `Mutation:` line names
 * a change one of these tests must catch (each was applied and seen to fail).
 */
const STAMP = '2026-09-30T02:00:00.123456+00:00';
const P1 = 'a3a00000-0000-4000-8000-000000000001';
const P2 = 'a3a00000-0000-4000-8000-000000000002';
const NEW_PRICE = 'a3a00000-0000-4000-8000-0000000000ff';

type Wire = Record<string, unknown>;
const catalogue = (): Wire => ({
  suppliers: [
    {
      id: 'sr',
      name: 'S&R Membership',
      phone: '',
      notes: '',
      place: 'Congressional Ave',
      active: true,
      updated_at: STAMP
    },
    {
      id: 'lan',
      name: 'Landers',
      phone: '',
      notes: '',
      place: 'Balintawak',
      active: true,
      updated_at: STAMP
    },
    {
      id: 'off',
      name: 'Switched off',
      phone: '',
      notes: '',
      place: '',
      active: false,
      updated_at: STAMP
    }
  ],
  items: [
    {
      id: 'butter',
      name: 'Unsalted butter',
      category: 'Ingredients',
      unit: 'g',
      on_hand: 900,
      par_level: 2000,
      pack_size: 1000,
      pack_label: '1 kg block',
      supplier_id: 'sr',
      use_by_days: 60,
      last_counted: null,
      active: true,
      updated_at: STAMP
    },
    {
      id: 'box',
      name: 'Box of 6',
      category: 'Packaging',
      unit: 'pcs',
      on_hand: 9,
      par_level: 20,
      pack_size: 25,
      pack_label: '',
      supplier_id: null,
      use_by_days: null,
      last_counted: null,
      active: true,
      updated_at: STAMP
    }
  ],
  prices: [
    {
      id: P1,
      supplier_id: 'sr',
      item_name: 'Unsalted butter',
      pack_label: '1 kg block',
      price_cents: 42000,
      previous_cents: [43800],
      last_bought: '2 Aug',
      preferred: true,
      active: true,
      updated_at: STAMP
    },
    {
      id: P2,
      supplier_id: 'lan',
      item_name: 'Unsalted butter',
      pack_label: '1 kg block',
      price_cents: 45500,
      previous_cents: [],
      last_bought: '19 Jul',
      preferred: false,
      active: true,
      updated_at: STAMP
    }
  ]
});

interface Fake {
  data: Wire;
  save: { data: unknown; error: unknown };
  /** The answer to record_stock_movement (C1). */
  movement?: { data: unknown; error: unknown };
  lastPaid?: unknown[];
}
function fakeClient(state: Fake) {
  const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
    if (name === 'get_stock_catalogue') return { data: state.data, error: null };
    if (name.startsWith('save_')) return state.save;
    if (name === 'record_stock_movement')
      return (
        state.movement ?? {
          data: [
            {
              item_id: (args?.p_movement as { item_id: string }).item_id,
              on_hand: 0,
              duplicate: false
            }
          ],
          error: null
        }
      );
    if (name === 'get_last_paid') return { data: state.lastPaid ?? [], error: null };
    // A database before B3b has no cost functions: the engine's own cost path stands.
    if (name === 'get_item_costs' || name === 'get_recipe_costs')
      return { data: null, error: { code: 'PGRST202' }, status: 404 };
    return { data: null, error: null };
  });
  return { rpc, client: { rpc } };
}
const called = (rpc: ReturnType<typeof fakeClient>['rpc'], name: string) =>
  rpc.mock.calls.filter((c) => c[0] === name) as unknown as Array<
    [string, Record<string, unknown>]
  >;

const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 30))));
const toasts = (r: OpsRuntime) => JSON.stringify(r.state.toast ?? r.state.toasts ?? '');
const fresh = (over: Partial<Fake> = {}): Fake => ({
  data: catalogue(),
  save: { data: [{ id: 'x', updated_at: STAMP }], error: null },
  ...over
});

async function mounted(role: Role, state: Fake) {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
  const runtime = ref.current!;
  act(() => runtime.setRole(role));
  const f = fakeClient(state);
  await act(async () => {
    await runtime.loadStockCatalogue(f.client as never);
  });
  f.rpc.mockClear();
  return { runtime, ...f };
}
const entry = (r: OpsRuntime, label: string) =>
  r
    .renderVals()
    .toolGroups.flatMap((g) => g.items)
    .find((i) => i.label === label);
const inv = (r: OpsRuntime) =>
  r.state.inv as Array<{ name: string; cat: string; qty: number; level: number; supplier: string }>;
const tabs = (r: OpsRuntime) =>
  (r.renderVals().supplierTabs as Array<{ label: string; active: boolean }>).map((t) => t.label);

interface InvActions {
  addInv: (
    cat: string,
    name: string,
    qty: unknown,
    unit: string,
    level: unknown,
    supplier: string
  ) => void;
  removeInv: (name: string) => void;
  saveInv: (name: string, qty: unknown) => void;
}

describe('A3: the catalogue reaches the ported screens (live mode)', () => {
  beforeEach(() => {
    live = true;
    store.clear();
    localStorage.clear();
  });
  afterEach(() => cleanup());

  it('missing recipes and partial ingredient/packaging prices do not claim zero or complete costs', async () => {
    const { runtime } = await mounted('owner', fresh());
    const total = runtime.renderVals().productRows.length;
    act(() => runtime.setState({ screen: 'products', dropActive: { dcf: false } }));
    expect(runtime.renderVals().pageSub).toBe(total + ' flavours · ' + (total - 1) + ' on menu');
    act(() => runtime.setState({ dropActive: {} }));
    expect(runtime.renderVals().pageSub).toBe(total + ' flavours · ' + total + ' on menu');
    expect(runtime.renderVals().productRows[0].costText).toBe('Cost pending');
    await act(async () => {
      await runtime.loadRecipes({
        rpc: async () => ({
          data: [
            {
              product_id: 'dcf',
              yield: 12,
              version: 1,
              updated_at: STAMP,
              history: [],
              lines: [{ name: 'Unsalted butter', qty: 225, unit: 'g' }]
            }
          ],
          error: null
        })
      } as never);
    });
    // Butter has a real price in the catalogue; missing packing prices still make this incomplete.
    expect(runtime.renderVals().productRows[0].costText).toBe('Cost pending');
    act(() => runtime.renderVals().productRows[0].goRecipe());
    expect(runtime.renderVals().recipe.costText).toBe('Cost pending');
  });

  it('uncounted catalogue items do not use creation time as a physical count', async () => {
    const state = fresh();
    const items = state.data.items as Wire[];
    items[0].last_counted = null;
    const { runtime, client } = await mounted('owner', state);
    expect(runtime.renderVals().invRows.find((row) => row.name === items[0].name)?.sub).toBe(
      'Opening count pending'
    );
    items[0].last_counted = STAMP;
    await act(async () => {
      await runtime.loadStockCatalogue(client as never);
    });
    expect(runtime.renderVals().invRows.find((row) => row.name === items[0].name)?.sub).toContain(
      'counted'
    );
    act(() =>
      runtime.setState({
        inv: [
          {
            name: 'Unmatched ingredient',
            cat: 'Ingredients',
            qty: 2,
            unit: 'g',
            level: 1,
            supplier: '',
            updatedAt: Date.now(),
            useBy: null
          }
        ]
      })
    );
    expect(runtime.renderVals().invRows[0].sub).toBe('Opening count pending');
  });

  it('confirmed zero-price quotes remain a real zero; a mismatched pack is pending', async () => {
    const state = fresh();
    const items = state.data.items as Wire[];
    const prices = state.data.prices as Wire[];
    const butter = items[0];
    prices[0].price_cents = 0;
    prices[1].active = false;
    for (const [index, name] of ['Box of 6', 'Brand sticker', 'Thank-you card'].entries()) {
      const item = {
        ...butter,
        id: 'pack-' + index,
        name,
        category: 'Packaging',
        unit: 'pcs',
        pack_size: 1,
        pack_label: '1 pcs'
      };
      if (index === 0) items[1] = item;
      else items.push(item);
      prices.push({
        ...prices[0],
        id: 'a3a00000-0000-4000-8000-00000000000' + (index + 4),
        item_name: name,
        pack_label: '1 pcs'
      });
    }
    const { runtime, client } = await mounted('owner', state);
    await act(async () => {
      await runtime.loadRecipes({
        rpc: async () => ({
          data: [
            {
              product_id: 'dcf',
              yield: 12,
              version: 1,
              updated_at: STAMP,
              history: [],
              lines: [{ name: 'Unsalted butter', qty: 225, unit: 'g' }]
            }
          ],
          error: null
        })
      } as never);
    });
    expect(runtime.renderVals().productRows[0].costText).toBe('₱0.00 cost');
    prices[0].pack_label = 'Different pack';
    await act(async () => {
      await runtime.loadStockCatalogue(client as never);
    });
    expect(runtime.renderVals().productRows[0].costText).toBe('Cost pending');
  });

  it('before it is read, no demo supplier or item shows, and the screens still render', () => {
    const ref: { current: OpsRuntime | null } = { current: null };
    render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
    act(() => ref.current!.setRole('owner'));
    expect(tabs(ref.current!)).toEqual(['No suppliers yet']);
    expect(inv(ref.current!)).toEqual([]);
    expect(() => ref.current!.renderVals()).not.toThrow();
    // Mutation: an empty supplier list makes the engine's adminVals throw on every settings screen.
  });

  it('inventory rows, supplier tabs, prices and best buys come from the database', async () => {
    const { runtime } = await mounted('owner', fresh());
    expect(inv(runtime).map((r) => [r.name, r.cat, r.qty, r.level, r.supplier])).toEqual([
      ['Unsalted butter', 'Ingredients', 900, 2000, 'S&R Membership'],
      ['Box of 6', 'Packaging', 9, 20, '—']
    ]);
    expect(tabs(runtime)).toEqual(['S&R Membership', 'Landers']);
    const vals = runtime.renderVals() as unknown as {
      supplier: { name: string; countText: string; items: Array<Record<string, unknown>> };
    };
    expect(vals.supplier.name).toBe('S&R Membership');
    expect(vals.supplier.items).toMatchObject([
      {
        item: 'Unsalted butter',
        pack: '1 kg block',
        prevText: 'Before: ₱438',
        best: true,
        preferred: true
      }
    ]);
    // The engine's own best-buy comparison follows the refilled constants.
    expect(OPTIONS_FOR('Unsalted butter').map((o) => [o.name, o.price])).toEqual([
      ['S&R Membership', 420],
      ['Landers', 455]
    ]);
    expect(SUPPLIERS.map((s) => s.name)).toEqual(['S&R Membership', 'Landers']);
    // Mutation: leaving the prototype suppliers in place shows Cine eight suppliers she never entered.
  });

  it('the suppliers screen opens on a supplier that exists', async () => {
    const { runtime } = await mounted('owner', fresh());
    expect(runtime.state.supplierOpen).toBe('S&R Membership');
    act(() => runtime.setState({ supplierOpen: 'Landers' }));
    await act(async () => {
      await runtime.loadStockCatalogue(null);
    });
    expect(runtime.state.supplierOpen).toBe('Landers');
    act(() => runtime.setState({ supplierOpen: 'A prototype supplier that is not here' }));
    await act(async () => {
      await runtime.loadStockCatalogue(null);
    });
    expect(runtime.state.supplierOpen).toBe('S&R Membership');
    // Mutation: leaving a stale tab name selected shows a supplier tab list with none of them active.
  });

  it('a supplier or price switched off, or a price for a switched-off item, is not offered', async () => {
    const data = catalogue();
    (data.items as Wire[])[0]!.active = false;
    const { runtime } = await mounted('owner', fresh({ data }));
    expect(inv(runtime).map((r) => r.name)).toEqual(['Box of 6']);
    expect(OPTIONS_FOR('Unsalted butter')).toEqual([]);
  });

  it('demo mode keeps the prototype’s own suppliers, after a live runtime refilled them', async () => {
    await mounted('owner', fresh());
    cleanup();
    live = false;
    const ref: { current: OpsRuntime | null } = { current: null };
    render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
    expect(tabs(ref.current!)).toContain('S&R Membership');
    expect(tabs(ref.current!).length).toBeGreaterThan(3);
    expect(inv(ref.current!).length).toBeGreaterThan(20);
    const f = fakeClient(fresh());
    expect(await ref.current!.loadStockCatalogue(f.client as never)).toBe(false);
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it('a failed read leaves what was there', async () => {
    const { runtime } = await mounted('owner', fresh());
    const down = { rpc: vi.fn(async () => ({ data: null, error: { code: '57014' } })) };
    expect(await runtime.loadStockCatalogue(down as never)).toBe(false);
    expect(inv(runtime)).toHaveLength(2);
  });
});

describe('A3: the stock items form', () => {
  beforeEach(() => {
    live = true;
    store.clear();
  });
  afterEach(() => cleanup());

  const open = async (r: OpsRuntime) => {
    await act(async () => entry(r, 'Stock items')!.go());
    await settle();
    return r.renderVals().liveStockItems!;
  };

  it('is the owner’s alone', async () => {
    const helper = await mounted('helper', fresh());
    expect(entry(helper.runtime, 'Stock items')).toBeUndefined();
    act(() => helper.runtime.sheet('stockitems', {}));
    expect(helper.runtime.renderVals().liveStockItems ?? null).toBeNull();
    // Mutation: dropping the role test shows the form to a helper who opens the sheet kind directly.
  });

  it('lists every item, on or off, with its supplier by name, and the active suppliers to pick', async () => {
    const { runtime } = await mounted('owner', fresh());
    const v = await open(runtime);
    expect(runtime.renderVals().sheet).toMatchObject({ liveForm: true, title: 'Stock items' });
    expect(v.rows.map((r) => [r.name, r.supplierName, r.active])).toEqual([
      ['Unsalted butter', 'S&R Membership', true],
      ['Box of 6', 'No supplier', true]
    ]);
    expect(v.suppliers.map((s) => s.name)).toEqual(['S&R Membership', 'Landers']);
    expect(v.editing).toBeNull();
  });

  it('adds an item under a fresh id with no stamp, sends exactly the ten keys, and returns to the list', async () => {
    const { runtime, rpc } = await mounted('owner', fresh());
    let v = await open(runtime);
    act(() => v.add());
    v = runtime.renderVals().liveStockItems!;
    expect(v.editing).toMatchObject({
      isNew: true,
      name: '',
      category: 'Ingredients',
      unit: 'g',
      active: true
    });
    const id = v.editing!.id;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    rpc.mockClear();
    act(() =>
      v.save({
        ...v.editing!,
        name: ' Fine salt ',
        unit: 'g',
        parLevel: 200,
        packSize: 500,
        packLabel: '500 g',
        supplierId: 'sr'
      })
    );
    await settle();
    const [[, args]] = called(rpc, 'save_stock_item');
    expect(args.p_expected_updated_at).toBeNull();
    expect(args.p_item).toEqual({
      id,
      name: 'Fine salt',
      category: 'Ingredients',
      unit: 'g',
      par_level: 200,
      pack_size: 500,
      pack_label: '500 g',
      supplier_id: 'sr',
      use_by_days: null,
      active: true
    });
    expect(toasts(runtime)).toContain('Saved');
    expect(called(rpc, 'get_stock_catalogue').length).toBeGreaterThanOrEqual(1);
    expect(runtime.renderVals().liveStockItems!.editing).toBeNull();
    // Mutation: sending the stamp of another item, or none for a change, turns a quiet edit into a conflict.
  });

  it('changes an item against the stamp it read', async () => {
    const { runtime, rpc } = await mounted('owner', fresh());
    let v = await open(runtime);
    act(() => v.edit('butter'));
    v = runtime.renderVals().liveStockItems!;
    expect(v.editing).toMatchObject({
      id: 'butter',
      name: 'Unsalted butter',
      parLevel: 2000,
      packSize: 1000,
      supplierId: 'sr',
      useByDays: 60
    });
    rpc.mockClear();
    act(() => v.save({ ...v.editing!, parLevel: 2500 }));
    await settle();
    const [[, args]] = called(rpc, 'save_stock_item');
    expect(args.p_expected_updated_at).toBe(STAMP);
    expect((args.p_item as Wire).par_level).toBe(2500);
  });

  it('refuses without sending what the database would refuse', async () => {
    const { runtime, rpc } = await mounted('owner', fresh());
    let v = await open(runtime);
    act(() => v.add());
    v = runtime.renderVals().liveStockItems!;
    rpc.mockClear();
    for (const bad of [
      { name: '  ' },
      { unit: '' },
      { parLevel: -1 },
      { parLevel: Number.NaN },
      { packSize: 0 },
      { useByDays: 0 }
    ]) {
      act(() => v.save({ ...v.editing!, name: 'Salt', ...bad }));
      await settle();
    }
    expect(called(rpc, 'save_stock_item')).toEqual([]);
    // Mutation: skipping the local check sends every one of these and waits for the refusal.
  });

  it('a change made elsewhere shows their version; a refusal and a lost connection say so', async () => {
    const stale = await mounted('owner', fresh({ save: { data: null, error: { code: 'P0002' } } }));
    let v = await open(stale.runtime);
    act(() => v.edit('butter'));
    v = stale.runtime.renderVals().liveStockItems!;
    const before = v.version;
    act(() => v.save({ ...v.editing!, parLevel: 1 }));
    await settle();
    expect(toasts(stale.runtime)).toContain('Someone else');
    expect(stale.runtime.renderVals().liveStockItems!.version).toBeGreaterThan(before);
    cleanup();
    for (const [save, words] of [
      [{ data: null, error: { code: '22023' } }, 'could not be saved'],
      [{ data: null, error: { code: '' } }, 'Offline']
    ] as const) {
      const f = await mounted('owner', fresh({ save }));
      let w = await open(f.runtime);
      act(() => w.edit('butter'));
      w = f.runtime.renderVals().liveStockItems!;
      act(() => w.save({ ...w.editing!, parLevel: 1 }));
      await settle();
      expect(toasts(f.runtime)).toContain(words);
      expect(f.runtime.renderVals().liveStockItems!.editing).not.toBeNull();
      cleanup();
    }
  });

  it('a failed read does not open the form', async () => {
    const ref: { current: OpsRuntime | null } = { current: null };
    render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
    act(() => ref.current!.setRole('owner'));
    await act(async () => {
      await ref.current!.loadStockCatalogue({
        rpc: vi.fn(async () => ({ data: null, error: { code: '57014' } }))
      } as never);
    });
    await act(async () => entry(ref.current!, 'Stock items')!.go());
    await settle();
    expect(ref.current!.renderVals().liveStockItems ?? null).toBeNull();
    expect(toasts(ref.current!)).toContain('Offline');
  });
});

describe('A3: the suppliers and prices form', () => {
  beforeEach(() => {
    live = true;
    store.clear();
  });
  afterEach(() => cleanup());

  const open = async (r: OpsRuntime) => {
    await act(async () => entry(r, 'Suppliers & prices')!.go());
    await settle();
    return r.renderVals().liveStockSuppliers!;
  };

  it('lists suppliers with their price counts, and opens one with its prices and what each was before', async () => {
    const { runtime } = await mounted('owner', fresh());
    let v = await open(runtime);
    expect(v.rows.map((r) => [r.name, r.priceCount, r.active])).toEqual([
      ['S&R Membership', 1, true],
      ['Landers', 1, true],
      ['Switched off', 0, false]
    ]);
    expect(v.itemNames).toEqual(['Unsalted butter', 'Box of 6']);
    act(() => v.edit('sr'));
    v = runtime.renderVals().liveStockSuppliers!;
    expect(v.editing).toMatchObject({
      id: 'sr',
      name: 'S&R Membership',
      prices: [
        { id: P1, itemName: 'Unsalted butter', pricePesos: 420, previousText: 'Before: ₱438' }
      ]
    });
    expect(v.editing!.newPriceId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('saves only what changed: the price with its stamp, a new price with none, never the untouched supplier', async () => {
    const { runtime, rpc } = await mounted('owner', fresh());
    let v = await open(runtime);
    act(() => v.edit('sr'));
    v = runtime.renderVals().liveStockSuppliers!;
    const e = v.editing!;
    rpc.mockClear();
    act(() =>
      v.save({
        ...e,
        prices: [
          { ...e.prices[0]!, pricePesos: 430.5 },
          {
            id: e.newPriceId,
            itemName: 'Box of 6',
            packLabel: 'pack of 25',
            pricePesos: 90,
            lastBought: '5 Sep',
            preferred: true,
            active: true,
            previousText: ''
          }
        ]
      })
    );
    await settle();
    expect(called(rpc, 'save_supplier')).toEqual([]);
    const prices = called(rpc, 'save_supplier_price');
    expect(prices).toHaveLength(2);
    expect(prices[0]![1].p_expected_updated_at).toBe(STAMP);
    expect(prices[0]![1].p_price).toMatchObject({ id: P1, supplier_id: 'sr', price_cents: 43050 });
    expect(prices[1]![1].p_expected_updated_at).toBeNull();
    expect(prices[1]![1].p_price).toEqual({
      id: e.newPriceId,
      supplier_id: 'sr',
      item_name: 'Box of 6',
      pack_label: 'pack of 25',
      price_cents: 9000,
      last_bought: '5 Sep',
      preferred: true,
      active: true
    });
    expect(toasts(runtime)).toContain('Saved');
    // Mutation: sending every row re-stamps prices nobody touched and turns a quiet edit into a conflict.
  });

  it('a new supplier is saved with no stamp, before anything else, and the details of an old one with its stamp', async () => {
    const { runtime, rpc } = await mounted('owner', fresh());
    let v = await open(runtime);
    act(() => v.add());
    v = runtime.renderVals().liveStockSuppliers!;
    expect(v.editing).toMatchObject({ isNew: true, prices: [] });
    rpc.mockClear();
    act(() => v.save({ ...v.editing!, name: ' Puregold ', place: 'Cubao' }));
    await settle();
    const [[, args]] = called(rpc, 'save_supplier');
    expect(args.p_expected_updated_at).toBeNull();
    expect(args.p_supplier).toEqual({
      id: v.editing!.id,
      name: 'Puregold',
      phone: '',
      notes: '',
      place: 'Cubao',
      active: true
    });
    act(() => v.edit('lan'));
    v = runtime.renderVals().liveStockSuppliers!;
    rpc.mockClear();
    act(() => v.save({ ...v.editing!, phone: '0917 111 2222' }));
    await settle();
    expect(called(rpc, 'save_supplier')[0]![1].p_expected_updated_at).toBe(STAMP);
    expect(called(rpc, 'save_supplier_price')).toEqual([]);
  });

  it('sends nothing when any price is unusable, and stops at the first failure', async () => {
    const { runtime, rpc } = await mounted('owner', fresh());
    let v = await open(runtime);
    act(() => v.edit('sr'));
    v = runtime.renderVals().liveStockSuppliers!;
    const e = v.editing!;
    rpc.mockClear();
    act(() => v.save({ ...e, name: 'S&R', prices: [{ ...e.prices[0]!, pricePesos: Number.NaN }] }));
    await settle();
    act(() => v.save({ ...e, name: 'S&R', prices: [{ ...e.prices[0]!, itemName: '' }] }));
    await settle();
    act(() => v.save({ ...e, name: '  ' }));
    await settle();
    expect(rpc.mock.calls.filter((c) => c[0].startsWith('save_'))).toEqual([]);
    // Stops at the first failure: the supplier is refused, so its prices are never sent.
    const refused = await mounted(
      'owner',
      fresh({ save: { data: null, error: { code: '22023' } } })
    );
    let w = await open(refused.runtime);
    act(() => w.edit('sr'));
    w = refused.runtime.renderVals().liveStockSuppliers!;
    act(() =>
      w.save({
        ...w.editing!,
        name: 'S&R Two',
        prices: [{ ...w.editing!.prices[0]!, pricePesos: 1 }]
      })
    );
    await settle();
    expect(called(refused.rpc, 'save_supplier')).toHaveLength(1);
    expect(called(refused.rpc, 'save_supplier_price')).toEqual([]);
    expect(toasts(refused.runtime)).toContain('could not be saved');
    // Mutation: sending prices after a refused supplier books prices for a supplier that is not there.
  });

  it('a conflict reloads and remounts the form on what is saved', async () => {
    const { runtime } = await mounted(
      'owner',
      fresh({ save: { data: null, error: { code: 'P0002' } } })
    );
    let v = await open(runtime);
    act(() => v.edit('sr'));
    v = runtime.renderVals().liveStockSuppliers!;
    const before = v.version;
    act(() => v.save({ ...v.editing!, place: 'Elsewhere' }));
    await settle();
    expect(toasts(runtime)).toContain('Someone else');
    expect(runtime.renderVals().liveStockSuppliers!.version).toBeGreaterThan(before);
  });
});

describe('A3: reloads and lost replies', () => {
  beforeEach(() => {
    live = true;
    store.clear();
  });
  afterEach(() => cleanup());

  it('a reload always shows the database’s quantities: a change is a movement, never only this screen', async () => {
    const { runtime } = await mounted('owner', fresh());
    expect(inv(runtime).find((r) => r.name === 'Unsalted butter')!.qty).toBe(900);
    act(() =>
      runtime.setState((s) => ({
        inv: (s.inv as Array<{ name: string; qty: number }>).map((r) =>
          r.name === 'Unsalted butter' ? { ...r, qty: 5 } : r
        )
      }))
    );
    await act(async () => {
      await runtime.loadStockCatalogue(null);
    });
    expect(inv(runtime).find((r) => r.name === 'Unsalted butter')!.qty).toBe(900);
    // Mutation: keeping the screen's quantity shows stock the database does not hold.
  });

  it('a new item saved elsewhere under the same id (a conflict) gets a fresh id; a lost reply keeps it for an identical retry', async () => {
    const conflict = fresh({ save: { data: null, error: { code: 'P0002' } } });
    const a = await mounted('owner', conflict);
    await act(async () => entry(a.runtime, 'Stock items')!.go());
    await settle();
    let v = a.runtime.renderVals().liveStockItems!;
    act(() => v.add());
    v = a.runtime.renderVals().liveStockItems!;
    const id = v.editing!.id;
    (conflict.data.items as Wire[]).push({
      ...(conflict.data.items as Wire[])[0]!,
      id,
      name: 'Elsewhere'
    });
    act(() => v.save({ ...v.editing!, name: 'Fine salt' }));
    await settle();
    expect(a.runtime.renderVals().liveStockItems!.editing!.id).not.toBe(id);
    cleanup();
    const lost = fresh({ save: { data: null, error: { code: '' } } });
    const b = await mounted('owner', lost);
    await act(async () => entry(b.runtime, 'Stock items')!.go());
    await settle();
    let w = b.runtime.renderVals().liveStockItems!;
    act(() => w.add());
    w = b.runtime.renderVals().liveStockItems!;
    const kept = w.editing!.id;
    (lost.data.items as Wire[]).push({
      ...(lost.data.items as Wire[])[0]!,
      id: kept,
      name: 'Fine salt'
    });
    act(() => w.save({ ...w.editing!, name: 'Fine salt' }));
    await settle();
    expect(b.runtime.renderVals().liveStockItems!.editing!.id).toBe(kept);
    // Mutation: a fresh id after a lost reply turns the identical retry into a duplicate the database refuses.
  });

  it('a price create whose reply was lost leaves a new blank price row on a new id', async () => {
    const state = fresh({ save: { data: null, error: { code: '' } } });
    const { runtime } = await mounted('owner', state);
    await act(async () => entry(runtime, 'Suppliers & prices')!.go());
    await settle();
    let v = runtime.renderVals().liveStockSuppliers!;
    act(() => v.edit('sr'));
    v = runtime.renderVals().liveStockSuppliers!;
    const e = v.editing!;
    (state.data.prices as Wire[]).push({
      id: e.newPriceId,
      supplier_id: 'sr',
      item_name: 'Box of 6',
      pack_label: 'pack of 25',
      price_cents: 9000,
      previous_cents: [],
      last_bought: '',
      preferred: true,
      active: true,
      updated_at: STAMP
    });
    act(() =>
      v.save({
        ...e,
        prices: [
          ...e.prices,
          {
            id: e.newPriceId,
            itemName: 'Box of 6',
            packLabel: 'pack of 25',
            pricePesos: 90,
            lastBought: '',
            preferred: true,
            active: true,
            previousText: ''
          }
        ]
      })
    );
    await settle();
    const after = runtime.renderVals().liveStockSuppliers!;
    expect(after.editing!.newPriceId).not.toBe(e.newPriceId);
    expect(after.version).toBeGreaterThan(v.version);
    // Mutation: keeping the id types the next price onto the saved row and replaces it.
  });
});

describe('A3: the ported inventory actions go to the database', () => {
  beforeEach(() => {
    live = true;
    store.clear();
  });
  afterEach(() => cleanup());

  it('"Add item" creates the item in the catalogue, matched to its supplier by name, then records its opening quantity', async () => {
    const { runtime, rpc } = await mounted('owner', fresh());
    act(() =>
      (runtime as unknown as InvActions).addInv(
        'Ingredients',
        ' Fine salt ',
        500,
        'g',
        200,
        'S&R Membership'
      )
    );
    await settle();
    const [[, args]] = called(rpc, 'save_stock_item');
    expect(args.p_expected_updated_at).toBeNull();
    expect(args.p_item).toMatchObject({
      name: 'Fine salt',
      category: 'Ingredients',
      unit: 'g',
      par_level: 200,
      supplier_id: 'sr',
      pack_size: null
    });
    expect(Object.keys(args.p_item as object)).not.toContain('on_hand');
    const [[, move]] = called(rpc, 'record_stock_movement');
    expect(move.p_movement).toMatchObject({
      item_id: (args.p_item as Wire).id,
      kind: 'opening',
      qty: 500,
      cost_cents: null
    });
    expect(toasts(runtime)).toContain('Fine salt added to Ingredients');
    // Mutation: adding only to local state shows an item that is gone on the next load; no opening movement shows 0 on hand.
  });

  it('"Add item" with no name, or offline, sends nothing', async () => {
    const { runtime, rpc } = await mounted('owner', fresh());
    act(() => (runtime as unknown as InvActions).addInv('Ingredients', '', 0, 'g', 0, '—'));
    await settle();
    expect(called(rpc, 'save_stock_item')).toEqual([]);
    const ref: { current: OpsRuntime | null } = { current: null };
    render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
    act(() => ref.current!.setRole('owner'));
    act(() => (ref.current as unknown as InvActions).addInv('Ingredients', 'Salt', 0, 'g', 0, '—'));
    await settle();
    expect(toasts(ref.current!)).toContain('Offline');
  });

  it('"Remove" switches the item off with the stamp it read, never deleting it', async () => {
    const { runtime, rpc } = await mounted('owner', fresh());
    act(() => (runtime as unknown as InvActions).removeInv('Unsalted butter'));
    await settle();
    const [[, args]] = called(rpc, 'save_stock_item');
    expect(args.p_expected_updated_at).toBe(STAMP);
    expect(args.p_item).toMatchObject({
      id: 'butter',
      name: 'Unsalted butter',
      active: false,
      par_level: 2000
    });
    expect(toasts(runtime)).toContain('switched off');
  });

  it('a count of one item is a count movement of the total; the screen then shows what the database holds', async () => {
    const state = fresh({
      movement: { data: [{ item_id: 'butter', on_hand: 5, duplicate: false }], error: null }
    });
    const { runtime, rpc } = await mounted('owner', state);
    act(() => (runtime as unknown as InvActions).saveInv('Unsalted butter', 5));
    await settle();
    const [[, args]] = called(rpc, 'record_stock_movement');
    expect(args.p_movement).toMatchObject({
      item_id: 'butter',
      kind: 'count',
      qty: 5,
      cost_cents: null
    });
    expect(toasts(runtime)).toContain('updated');
    // Mutation: sending an adjustment for the difference records a variance against a quantity that may have moved.
  });
});

describe('the form components read themselves back', () => {
  afterEach(() => cleanup());
  const item: LiveStockItemEdit = {
    id: 'butter',
    isNew: false,
    name: 'Unsalted butter',
    category: 'Ingredients',
    unit: 'g',
    parLevel: 2000,
    packSize: 1000,
    packLabel: '1 kg block',
    supplierId: 'sr',
    useByDays: 60,
    active: true
  };
  const setupItem = (editing: LiveStockItemEdit) => {
    const save = vi.fn();
    const view = render(
      <StockItemsForm
        liveStock={{
          online: true,
          rows: [],
          editing,
          suppliers: [
            { id: 'sr', name: 'S&R Membership' },
            { id: 'lan', name: 'Landers' }
          ],
          version: 0,
          add: vi.fn(),
          edit: vi.fn(),
          save,
          back: vi.fn(),
          close: vi.fn()
        }}
      />
    );
    const input = (name: string) =>
      view.container.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
    return {
      save,
      input,
      submit: () => fireEvent.submit(view.container.querySelector('form')!),
      view
    };
  };

  it('items: sends back what it showed; a cleared pack size and use-by are none, not zero', () => {
    const { save, input, submit } = setupItem(item);
    submit();
    expect(save.mock.calls[0]![0]).toEqual(item);
    fireEvent.change(input('itemPack'), { target: { value: '' } });
    fireEvent.change(input('itemUseBy'), { target: { value: '' } });
    fireEvent.change(input('itemPar'), { target: { value: '' } });
    fireEvent.change(input('itemCategory'), { target: { value: 'Packaging' } });
    fireEvent.change(input('itemSupplier'), { target: { value: '' } });
    fireEvent.click(input('itemActive'));
    submit();
    expect(save.mock.calls[1]![0]).toEqual({
      ...item,
      packSize: null,
      useByDays: null,
      parLevel: 0,
      category: 'Packaging',
      supplierId: null,
      active: false
    });
    expect(readItemForm).toBeTypeOf('function');
    // Mutation: reading a cleared pack size as 0 saves a pack of nothing (the database refuses it).
  });

  const supplier: LiveStockSupplierEdit = {
    id: 'sr',
    isNew: false,
    name: 'S&R Membership',
    phone: '',
    notes: '',
    place: 'Congressional Ave',
    active: true,
    prices: [
      {
        id: P1,
        itemName: 'Unsalted butter',
        packLabel: '1 kg block',
        pricePesos: 420,
        lastBought: '2 Aug',
        preferred: true,
        active: true,
        previousText: 'Before: ₱438'
      }
    ],
    newPriceId: NEW_PRICE
  };
  const setupSupplier = (editing: LiveStockSupplierEdit) => {
    const save = vi.fn();
    const view = render(
      <StockSuppliersForm
        liveStock={{
          online: true,
          rows: [],
          editing,
          itemNames: ['Unsalted butter', 'Box of 6'],
          version: 0,
          add: vi.fn(),
          edit: vi.fn(),
          save,
          back: vi.fn(),
          close: vi.fn()
        }}
      />
    );
    const input = (name: string) =>
      view.container.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
    return {
      save,
      input,
      submit: () => fireEvent.submit(view.container.querySelector('form')!),
      view
    };
  };

  it('suppliers: sends back what it showed, without the blank price row; a filled blank row is a new price', () => {
    const { save, input, submit } = setupSupplier(supplier);
    submit();
    expect(save.mock.calls[0]![0]).toEqual(supplier);
    fireEvent.change(input('prItem1'), { target: { value: 'Box of 6' } });
    fireEvent.change(input('prPack1'), { target: { value: 'pack of 25' } });
    fireEvent.change(input('prPrice1'), { target: { value: '90' } });
    submit();
    expect(save.mock.calls[1]![0].prices[1]).toEqual({
      id: NEW_PRICE,
      itemName: 'Box of 6',
      packLabel: 'pack of 25',
      pricePesos: 90,
      lastBought: '',
      preferred: true,
      active: true,
      previousText: ''
    });
    fireEvent.change(input('prPrice0'), { target: { value: '' } });
    submit();
    expect(Number.isNaN(save.mock.calls[2]![0].prices[0].pricePesos)).toBe(true);
    expect(readSupplierForm).toBeTypeOf('function');
    // Mutation: reading a cleared price as 0 would save a free price and make it the best buy.
  });

  it('a new supplier shows no price rows until it is saved', () => {
    const { view } = setupSupplier({ ...supplier, isNew: true, prices: [] });
    expect(view.container.textContent).toContain('Save the supplier first');
    expect(view.container.querySelector('[name="prItem0"]')).toBeNull();
  });
});
