import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
import { PRODUCTS } from '@/store/engine/ops-engine';
import { ProfitAndLossScreen } from '@/components/screens/profit-and-loss';
import { BooksForm } from '@/components/live/books-form';

/**
 * B3b-2: in live mode the screens read the database's cost (`get_item_costs`, `get_recipe_costs`) instead of the engine's own
 * path. An unknown cost reads "Cost pending", never 0 or NaN. A database without the functions (migration 55) keeps today's path.
 * Each `Mutation:` line names a change one of these tests must catch.
 */
const STAMP = '2026-09-30T02:00:00.123456+00:00';
const DCF = 'dcf';
const PBM = 'pbm';
type Wire = Record<string, unknown>;
type Answer = { data: unknown; error: unknown; status?: number };
const MISSING: Answer = { data: null, error: { code: 'PGRST202' }, status: 404 };

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
  last_counted: STAMP,
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
const pack = (id: string, name: string): Wire =>
  item({ id, name, category: 'Packaging', unit: 'pcs', pack_size: 1, pack_label: '1 pcs' });
const catalogue = (): Wire => ({
  suppliers: [
    { id: 'sr', name: 'S&R', phone: '', notes: '', place: '', active: true, updated_at: STAMP }
  ],
  items: [
    item(),
    item({ id: 'eggs', name: 'Eggs', unit: 'pcs', pack_size: 30, pack_label: 'tray', on_hand: 20 }),
    pack('box', 'Box of 6'),
    pack('sticker', 'Brand sticker'),
    pack('card', 'Thank-you card')
  ],
  prices: [
    price('a3a00000-0000-4000-8000-000000000001', 'Unsalted butter', '1 kg block', 42000),
    price('a3a00000-0000-4000-8000-000000000002', 'Eggs', 'tray', 24000),
    price('a3a00000-0000-4000-8000-000000000003', 'Box of 6', '1 pcs', 600),
    price('a3a00000-0000-4000-8000-000000000004', 'Brand sticker', '1 pcs', 50),
    price('a3a00000-0000-4000-8000-000000000005', 'Thank-you card', '1 pcs', 100)
  ]
});
const recipeRow = (pid: string): Wire => ({
  product_id: pid,
  yield: 12,
  version: 3,
  updated_at: STAMP,
  history: [],
  lines: [
    { name: 'Unsalted butter', qty: 320, unit: 'g' },
    { name: 'Eggs', qty: 2, unit: 'pcs' }
  ]
});

const itemCost = (over: Wire = {}): Wire => ({
  item_id: 'butter',
  name: 'Unsalted butter',
  unit: 'g',
  active: true,
  on_hand: 900,
  unit_cost: 42,
  source: 'usual',
  ...over
});
const ITEM_COSTS = [
  itemCost(),
  itemCost({ item_id: 'eggs', name: 'Eggs', unit: 'pcs', unit_cost: null, source: null })
];
const recipeCost = (pid: string, over: Wire = {}): Wire => ({
  product_id: pid,
  version: 3,
  yield: 12,
  batch_cents: 12000,
  ingredient_cents_per_cookie: 1000,
  packaging_cents_per_cookie: 234.5678,
  per_cookie_cents: 1234.5678,
  complete: true,
  missing: [],
  lines: [],
  ...over
});
const RECIPE_COSTS = [
  recipeCost(DCF),
  recipeCost(PBM, {
    complete: false,
    ingredient_cents_per_cookie: 800,
    per_cookie_cents: 900,
    missing: [{ name: 'Eggs', why: 'no cost' }]
  })
];

const books = (over: Wire = {}): Wire => ({ basis: 'bought', lines: [], receipts: [], ...over });

interface World {
  itemCosts: Answer;
  recipeCosts: Answer;
  books: Wire;
  catalogue: Wire;
}
const world = (over: Partial<World> = {}): World => ({
  itemCosts: { data: ITEM_COSTS, error: null },
  recipeCosts: { data: RECIPE_COSTS, error: null },
  books: books(),
  catalogue: catalogue(),
  ...over
});
function fakeClient(w: World) {
  const rpc = vi.fn(async (name: string, args?: Record<string, unknown>): Promise<Answer> => {
    if (name === 'get_stock_catalogue') return { data: w.catalogue, error: null };
    if (name === 'get_last_paid') return { data: [], error: null };
    if (name === 'get_recipes') return { data: PRODUCTS.map((p) => recipeRow(p.id)), error: null };
    if (name === 'get_item_costs') return w.itemCosts;
    if (name === 'get_recipe_costs') return w.recipeCosts;
    if (name === 'get_books') return { data: w.books, error: null };
    if (name === 'get_production')
      return { data: { batches: [], dough: [], baked: [], shortfalls: [] }, error: null };
    if (name === 'record_stock_movement')
      return {
        data: [
          {
            item_id: (args?.p_movement as { item_id: string }).item_id,
            on_hand: 0,
            duplicate: false
          }
        ],
        error: null
      };
    if (name === 'record_discard') return { data: [{ duplicate: false }], error: null };
    return { data: null, error: null };
  });
  return { rpc, client: { rpc } };
}

interface Acts {
  unitCost: (pid: string) => number;
  ingCost: (pid: string) => number;
  packCostPerCookie: (pid?: string) => number;
  costPerUnit: (name: string) => number;
  logSpoilage: (name: string, qty: unknown, why: string, pid?: string, kind?: string) => void;
  reconcile: () => void;
  startStocktake: () => void;
  countInput: (name: string, value: string) => void;
}
const acts = (r: OpsRuntime) => r as unknown as Acts;
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 30))));
const msg = (r: OpsRuntime) => (r.state.toast as { msg?: string } | null)?.msg ?? '';

async function mounted(w: World, readBooks = true) {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
  const runtime = ref.current!;
  act(() => runtime.setRole('owner'));
  const f = fakeClient(w);
  await act(async () => {
    await runtime.loadStockCatalogue(f.client as never);
    await runtime.loadRecipes(f.client as never);
    if (readBooks) await runtime.loadBooks(f.client as never);
    await runtime.loadProduction(f.client as never);
  });
  await settle(); // the cost read follows the loads without holding them up
  return { runtime, ...f };
}
const product = (r: OpsRuntime, pid: string) =>
  r.renderVals().productRows[PRODUCTS.findIndex((p) => p.id === pid)]!;
const sale = (items: Record<string, number>, total: number) => ({
  id: 's' + Object.keys(items).join(''),
  items,
  total,
  pay: 'Cash',
  at: Date.now()
});
const PENDING = 'Cost pending';

describe('B3b-2: the screens read the database’s cost (live mode)', () => {
  beforeEach(() => {
    localStorage.clear();
    live = true;
    store.clear();
    localStorage.clear();
  });
  afterEach(() => cleanup());

  it('(a) the recipe cost per cookie on screen is get_recipe_costs, rounded to centavos like the engine', async () => {
    const { runtime } = await mounted(world());
    act(() => runtime.setState({ screen: 'recipes', recipeOpen: DCF } as never));
    expect(runtime.renderVals().recipe.costText).toBe('₱12.35 per cookie');
    expect(product(runtime, DCF).costText).toBe('₱12.35 cost');
    expect(acts(runtime).unitCost(DCF)).toBe(12.35);
    expect(acts(runtime).ingCost(DCF)).toBeCloseTo(10, 9);
    expect(acts(runtime).packCostPerCookie(DCF)).toBeCloseTo(2.345678, 9);
    expect(acts(runtime).costPerUnit('Unsalted butter')).toBeCloseTo(0.42, 9);
    // Mutation: the engine's own path (butter at the pack price over the pack) would give ₱14.45 here.
  });

  it('(a) a recipe the owner is editing reads Cost pending until it is saved', async () => {
    const { runtime } = await mounted(world());
    act(() =>
      runtime.setState({ screen: 'recipes', recipeOpen: DCF, recipeDirty: { dcf: true } } as never)
    );
    expect(runtime.renderVals().recipe.costText).toBe(PENDING);
    expect(product(runtime, DCF).costText).toBe(PENDING);
    expect(Number.isNaN(acts(runtime).unitCost(DCF))).toBe(true);
  });

  it('(a) a recipe with a line the database cannot cost is Cost pending, not a part cost', async () => {
    const { runtime } = await mounted(world());
    act(() => runtime.setState({ screen: 'recipes', recipeOpen: PBM } as never));
    expect(runtime.renderVals().recipe.costText).toBe(PENDING);
    expect(product(runtime, PBM).costText).toBe(PENDING);
    expect(Number.isNaN(acts(runtime).unitCost(PBM))).toBe(true);
    // A flavour the database has no recipe row for is unknown too.
    expect(product(runtime, 'wcb').costText).toBe(PENDING);
  });

  it('(b) a database without the cost functions gives today’s figures from the engine’s own path', async () => {
    // The engine as the demo runs it, built first and given this runtime's recipes and prices afterwards.
    live = false;
    const demo = (() => {
      const ref: { current: OpsRuntime | null } = { current: null };
      render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
      return ref.current!;
    })();
    live = true;
    const { runtime, rpc } = await mounted(world({ itemCosts: MISSING, recipeCosts: MISSING }));
    expect(rpc.mock.calls.some((c) => c[0] === 'get_item_costs')).toBe(true);
    act(() =>
      demo.setState({
        recipes: (runtime.state as Wire).recipes,
        paid: (runtime.state as Wire).paid
      } as never)
    );
    for (const pid of [DCF, PBM]) {
      const original = acts(demo).unitCost(pid);
      expect(Number.isFinite(original)).toBe(true);
      expect(original).toBeGreaterThan(0);
      expect(acts(runtime).unitCost(pid)).toBe(original);
      expect(acts(runtime).ingCost(pid)).toBe(acts(demo).ingCost(pid));
    }
    expect(acts(runtime).packCostPerCookie()).toBe(acts(demo).packCostPerCookie());
    expect(acts(runtime).costPerUnit('Unsalted butter')).toBe(
      acts(demo).costPerUnit('Unsalted butter')
    );
    // The screens say what the engine works out, as before.
    const expected = '₱' + acts(demo).unitCost(DCF).toFixed(2);
    expect(product(runtime, DCF).costText).toBe(expected + ' cost');
    act(() => runtime.setState({ screen: 'recipes', recipeOpen: DCF } as never));
    expect(runtime.renderVals().recipe.costText).toBe(expected + ' per cookie');
    // Mutation: reading the database's cost whatever the answer would show Cost pending here.
  });

  it('(b) one of the two missing is the whole read missing', async () => {
    const { runtime } = await mounted(world({ recipeCosts: MISSING }));
    expect(Number.isFinite(acts(runtime).unitCost(DCF))).toBe(true);
    expect(acts(runtime).costPerUnit('Unsalted butter')).toBeCloseTo(0.42, 9); // the engine's pack price over the pack
  });

  it('(c) a failed read is Cost pending everywhere, with no NaN on any screen', async () => {
    const { runtime } = await mounted(
      world({
        itemCosts: { data: null, error: { code: '500' } },
        recipeCosts: { data: {}, error: null }
      })
    );
    act(() =>
      runtime.setState({
        sales: [sale({ [DCF]: 2 }, 560)],
        priceDraft: 'Cookie cost × multiplier + packaging'
      } as never)
    );
    expectNoNaN(runtime);
    expect(product(runtime, DCF).costText).toBe(PENDING);
  });

  it('(c) Recipes, Products, P&L margins, the bazaar close-out, waste and the pricing example say Cost pending when unknown', async () => {
    const { runtime } = await mounted(world());
    act(() =>
      runtime.setState({
        sales: [sale({ [DCF]: 2 }, 560), sale({ [DCF]: 1, [PBM]: 1 }, 500)],
        priceDraft: 'Cookie cost × multiplier + packaging'
      } as never)
    );
    const vals = runtime.renderVals();
    // P&L margins: the known flavour keeps its figures, the unknown one reads pending.
    const rows = vals.pl.marginRows;
    const known = rows.find((r) => r.name === PRODUCTS.find((p) => p.id === DCF)!.short)!;
    const unknown = rows.find((r) => r.name === PRODUCTS.find((p) => p.id === PBM)!.short)!;
    expect(known.eachText).not.toBe(PENDING);
    expect(String(known.eachText)).toMatch(/^[−]?₱\d/);
    expect(unknown).toMatchObject({
      eachText: PENDING,
      madeText: PENDING,
      pctText: '—',
      barStyle: 'width:4%'
    });
    // Bazaar close-out: pending when ANY flavour sold is unknown, and never a false red.
    expect(vals.bzCloseout.cogs).toBe(PENDING);
    expect(vals.bzCloseout.profit).toBe(PENDING);
    expect(vals.bzCloseout.profitOk).toBe(true);
    // The pricing example works from cost; unknown costs make it pending.
    expect(vals.priceModePreview.total).toBe(PENDING);
    expectNoNaN(runtime);
    // Only known flavours sold: the close-out is a number again.
    act(() => runtime.setState({ sales: [sale({ [DCF]: 2 }, 560)] } as never));
    const closed = runtime.renderVals().bzCloseout;
    expect(closed.cogs).toBe('₱25'); // 2 x 12.35 = 24.70
    expect(closed.profit).not.toBe(PENDING);
    // Mutation: letting NaN through prints ₱NaN here.
  });

  it('(c) waste of a stock item says Cost pending when its cost is unknown, and states its cost when known', async () => {
    const { runtime } = await mounted(world());
    act(() => acts(runtime).logSpoilage('Eggs', 2, 'Cracked'));
    await settle();
    expect(msg(runtime)).toMatch(/Cost pending/);
    expect(msg(runtime)).not.toMatch(/NaN|₱0/);
    expect(msg(runtime)).toContain('already expensed when you bought it');
    act(() => acts(runtime).logSpoilage('Unsalted butter', 100, 'Spoiled'));
    await settle();
    expect(msg(runtime)).toContain('About ₱42 of stock gone.');
  });

  it('(e) waste on the used basis says it is a cost in the books, not that it was already expensed', async () => {
    const { runtime } = await mounted(world({ books: books({ basis: 'used' }) }));
    act(() => acts(runtime).logSpoilage('Unsalted butter', 100, 'Spoiled'));
    await settle();
    expect(msg(runtime)).toContain('About ₱42 of stock gone.');
    expect(msg(runtime)).toContain('cost in the books the day it was wasted');
    expect(msg(runtime)).not.toContain('already expensed');
  });

  it('(c) dough thrown away with an unknown cost stores no NaN and says Cost pending', async () => {
    const { runtime } = await mounted(world());
    act(() => runtime.setState({ dough: { [PBM]: 6 } } as never));
    act(() => acts(runtime).logSpoilage('x', 2, 'Spoiled', PBM, 'dough'));
    await settle();
    const spoilage = runtime.state.spoilage as Array<{ cost: number | null }>;
    expect(spoilage.length).toBeGreaterThan(0);
    for (const entry of spoilage)
      expect(entry.cost === null || Number.isFinite(entry.cost)).toBe(true);
    expect(JSON.stringify(runtime.state.toast ?? '')).not.toContain('NaN');
    expect(msg(runtime)).toMatch(/binned — cost pending\./);
  });

  it('(c) a stocktake over items with no cost reports no value, not NaN', async () => {
    const { runtime } = await mounted(world());
    act(() => acts(runtime).startStocktake());
    act(() => acts(runtime).countInput('Eggs', '5'));
    act(() => acts(runtime).reconcile());
    await settle();
    expect(msg(runtime)).not.toContain('NaN');
    expect(msg(runtime)).toMatch(/1 item corrected/);
    expect(msg(runtime)).toMatch(/pending/i);
  });

  it('(c) the pricing example is a number when the costs are known', async () => {
    const { runtime } = await mounted(
      world({
        recipeCosts: { data: PRODUCTS.slice(0, 3).map((p) => recipeCost(p.id)), error: null }
      })
    );
    act(() => runtime.setState({ priceDraft: 'Cookie cost × multiplier + packaging' } as never));
    expect(runtime.renderVals().priceModePreview.total).toMatch(/^₱\d/);
  });

  it('a cost read follows a stock change and a saved recipe, and the newest answer wins', async () => {
    const w = world();
    const { runtime, client, rpc } = await mounted(w);
    expect(product(runtime, DCF).costText).toBe('₱12.35 cost');
    w.recipeCosts = { data: [recipeCost(DCF, { per_cookie_cents: 2000 })], error: null };
    await act(async () => {
      await runtime.loadStockCatalogue(client as never);
    });
    await settle();
    expect(product(runtime, DCF).costText).toBe('₱20.00 cost');
    w.recipeCosts = { data: [recipeCost(DCF, { per_cookie_cents: 3000 })], error: null };
    await act(async () => {
      await runtime.loadRecipes(client as never);
    });
    await settle();
    expect(product(runtime, DCF).costText).toBe('₱30.00 cost');
    expect(rpc.mock.calls.filter((c) => c[0] === 'get_item_costs').length).toBeGreaterThan(2);
  });

  it('a helper never reads the costs, and is shown no cost figure', async () => {
    const ref: { current: OpsRuntime | null } = { current: null };
    render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
    act(() => ref.current!.setRole('helper'));
    const f = fakeClient(world());
    await act(async () => {
      await ref.current!.loadStockCatalogue(f.client as never);
      await ref.current!.loadRecipes(f.client as never);
    });
    await settle();
    expect(f.rpc.mock.calls.some((c) => c[0] === 'get_item_costs')).toBe(false);
    expect(f.rpc.mock.calls.some((c) => c[0] === 'get_recipe_costs')).toBe(false);
    act(() =>
      ref.current!.setState({ screen: 'bazaar', sales: [sale({ [DCF]: 2 }, 560)] } as never)
    );
    const vals = ref.current!.renderVals();
    expect(vals.bzCloseout.cogs).toBe('—');
    expect(vals.bzCloseout.profit).toBe('—');
    expect(vals.bzCloseout.cogs).not.toBe(PENDING);
    // The owner's database cost never reaches a helper's screens.
    for (const screen of ['bazaar', 'today', 'inventory'])
      expect(
        JSON.stringify(
          (act(() => ref.current!.setState({ screen } as never)), ref.current!.renderVals())
        )
      ).not.toContain('12.35');
  });

  it('P1: without the cost functions, one engine packaging item priced and another not is Cost pending; all priced is the figure', async () => {
    const w = world({ itemCosts: MISSING, recipeCosts: MISSING });
    const stickerAt = (w.catalogue.prices as Wire[]).findIndex(
      (p) => p.item_name === 'Brand sticker'
    );
    const sticker = (w.catalogue.prices as Wire[]).splice(stickerAt, 1)[0]!;
    const { runtime, client } = await mounted(w);
    expect(product(runtime, DCF).costText).toBe(PENDING);
    act(() => runtime.setState({ screen: 'recipes', recipeOpen: DCF } as never));
    expect(runtime.renderVals().recipe.costText).toBe(PENDING);
    (w.catalogue.prices as Wire[]).push(sticker);
    await act(async () => {
      await runtime.loadStockCatalogue(client as never);
    });
    await settle();
    const figure = '₱' + acts(runtime).unitCost(DCF).toFixed(2);
    expect(figure).toMatch(/^₱\d+\.\d\d$/);
    expect(product(runtime, DCF).costText).toBe(figure + ' cost');
    expect(runtime.renderVals().recipe.costText).toBe(figure + ' per cookie');
  });

  it('P3: a cost row of an older version than the saved recipe is Cost pending until the cost read catches up', async () => {
    const w = world({
      recipeCosts: { data: [recipeCost(DCF, { version: 2 })], error: null }
    });
    const { runtime, client } = await mounted(w);
    // The saved recipe is version 3 (get_recipes); the cost is of version 2.
    expect(product(runtime, DCF).costText).toBe(PENDING);
    expect(Number.isNaN(acts(runtime).unitCost(DCF))).toBe(true);
    w.recipeCosts = { data: [recipeCost(DCF, { version: 3 })], error: null };
    await act(async () => {
      await runtime.loadStockCatalogue(client as never);
    });
    await settle();
    expect(product(runtime, DCF).costText).toBe('₱12.35 cost');
  });

  it('P3: waste before the books are read says neither basis sentence', async () => {
    const { runtime } = await mounted(world(), false);
    act(() => acts(runtime).logSpoilage('Unsalted butter', 100, 'Spoiled'));
    await settle();
    expect(msg(runtime)).toBe('100 of unsalted butter written off. About ₱42 of stock gone.');
  });

  it('two overlapping cost reads: the newer answer stands, whichever finishes last', async () => {
    const { runtime, rpc } = await mounted(world());
    const original = rpc.getMockImplementation()!;
    let calls = 0;
    let finishOlder!: (a: Answer) => void;
    rpc.mockImplementation(async (name: string) => {
      if (name !== 'get_recipe_costs') return original(name);
      calls += 1;
      if (calls === 1) return new Promise<Answer>((resolve) => (finishOlder = resolve));
      return { data: [recipeCost(DCF, { per_cookie_cents: 3000 })], error: null };
    });
    let older!: Promise<void>;
    await act(async () => {
      older = runtime.loadCosts();
      await runtime.loadCosts();
    });
    expect(product(runtime, DCF).costText).toBe('₱30.00 cost');
    await act(async () => {
      finishOlder({ data: [recipeCost(DCF, { per_cookie_cents: 2000 })], error: null });
      await older;
    });
    expect(product(runtime, DCF).costText).toBe('₱30.00 cost');
  });

  it('a failed read after a good one clears the costs: Cost pending, not the old figure', async () => {
    const w = world();
    const { runtime } = await mounted(w);
    expect(product(runtime, DCF).costText).toBe('₱12.35 cost');
    w.recipeCosts = { data: null, error: { code: '500' } };
    await act(async () => {
      await runtime.loadCosts();
    });
    expect(product(runtime, DCF).costText).toBe(PENDING);
    expect(Number.isNaN(acts(runtime).unitCost(DCF))).toBe(true);
    expect(Number.isNaN(acts(runtime).costPerUnit('Unsalted butter'))).toBe(true);
  });

  it('baked cookies thrown away with an unknown cost: no ₱NaN in the toast, the waste entry has no cost', async () => {
    const { runtime } = await mounted(world());
    act(() => runtime.setState({ baked: { [PBM]: 6 } } as never));
    act(() => acts(runtime).logSpoilage('x', 2, 'Spoiled', PBM, 'baked'));
    await settle();
    const spoilage = runtime.state.spoilage as Array<{ cost: number | null }>;
    expect(spoilage.at(-1)!.cost).toBeNull();
    expect(msg(runtime)).not.toContain('NaN');
    expect(msg(runtime)).toMatch(/written off — cost pending\./);
  });

  it('(d) no packaging item is named in the runtime', () => {
    const source = readFileSync(join(process.cwd(), 'src/store/ops-runtime.tsx'), 'utf8');
    for (const name of ['Box of 6', 'Brand sticker', 'Thank-you card'])
      expect(source).not.toContain(name);
  });
});

function expectNoNaN(runtime: OpsRuntime) {
  for (const screen of [
    'today',
    'products',
    'recipes',
    'pnl',
    'bazaar',
    'inventory',
    'settings',
    'grocery',
    'health'
  ]) {
    act(() => runtime.setState({ screen } as never));
    const text = JSON.stringify(runtime.renderVals());
    expect(text, 'screen ' + screen).not.toContain('NaN');
  }
}

describe('B3b-2: the books list what has no cost', () => {
  beforeEach(() => {
    localStorage.clear();
    live = true;
    store.clear();
    localStorage.clear();
  });
  afterEach(() => cleanup());

  const uncosted = [
    { id: 'm:1', kind: 'use', item: 'Eggs', qty: 12, unit: 'pcs', at: Date.now() - 2000 },
    {
      id: 'p:9:0',
      kind: 'use',
      item: 'Miso',
      qty: 2.5,
      unit: 'g',
      at: Date.now() - 3000,
      why: 'no cost'
    }
  ];

  it('(e) the P&L says how many uses are not costed, and says nothing when none are', async () => {
    const { runtime } = await mounted(world({ books: books({ basis: 'used', uncosted }) }));
    const text = runtime.renderVals().pl.periodText;
    expect(text).toMatch(/^Last 30 days · .* · 2 uses not costed$/);
    const view = render(<ProfitAndLossScreen v={runtime.renderVals()} />);
    expect(view.getByText(/2 uses not costed/)).toBeTruthy();
    cleanup();
    const one = await mounted(world({ books: books({ basis: 'used', uncosted: [uncosted[0]] }) }));
    expect(one.runtime.renderVals().pl.periodText).toMatch(/ · 1 use not costed$/);
    cleanup();
    const none = await mounted(world({ books: books({ basis: 'used' }) }));
    expect(none.runtime.renderVals().pl.periodText).not.toContain('not costed');
  });

  it('B4b-1: a count or an adjustment down with no cost is listed with its own wording, not as a use', async () => {
    const counted = [
      { id: 'm:11', kind: 'count', item: 'Butter', qty: 250, unit: 'g', at: Date.now() - 1000 },
      { id: 'm:12', kind: 'adjust', item: 'Sugar', qty: 40, unit: 'g', at: Date.now() - 1500 }
    ];
    const { runtime } = await mounted(
      world({ books: books({ basis: 'used', uncosted: counted }) })
    );
    act(() => runtime.setState({ sheet: { kind: 'books' } } as never));
    const lb = runtime.renderVals().liveBooks!;
    expect(lb.uncosted).toHaveLength(2);
    expect(lb.uncosted![0]!.detail).toContain('Counted short · 250 g');
    expect(lb.uncosted![1]!.detail).toContain('Adjusted down · 40 g');
    expect(runtime.renderVals().pl.periodText).toMatch(/ · 2 uses not costed$/);
  });

  it('(e) the books sheet lists each one: item, quantity, why, date', async () => {
    const { runtime } = await mounted(world({ books: books({ basis: 'used', uncosted }) }));
    act(() => runtime.setState({ sheet: { kind: 'books' } } as never));
    const lb = runtime.renderVals().liveBooks!;
    expect(lb.uncosted).toHaveLength(2);
    expect(lb.uncosted![0]).toMatchObject({ id: 'm:1', item: 'Eggs' });
    expect(lb.uncosted![0]!.detail).toContain('12 pcs');
    expect(lb.uncosted![1]!.detail).toContain('2.5 g');
    expect(lb.uncosted![1]!.detail).toContain('no cost');
    const view = render(<BooksForm liveBooks={lb} />);
    expect(view.getByText('Not costed yet')).toBeTruthy();
    expect(view.getByText('Eggs')).toBeTruthy();
    expect(view.getByText('Miso')).toBeTruthy();
    cleanup();
    const none = await mounted(world({ books: books() }));
    act(() => none.runtime.setState({ sheet: { kind: 'books' } } as never));
    const empty = render(<BooksForm liveBooks={none.runtime.renderVals().liveBooks!} />);
    expect(empty.queryByText('Not costed yet')).toBeNull();
  });
});
