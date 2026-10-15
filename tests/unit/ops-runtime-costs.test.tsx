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
import { PRODUCTS } from '@/store/engine/ops-engine';
import { BooksForm } from '@/components/live/books-form';

/**
 * B3b: live mode feeds the engine's cost path from the database's one cost function (`get_recipe_costs`, `get_item_costs`),
 * with no engine edit. An unknown cost reads "Cost pending", never a number; a database without the functions leaves the
 * engine's own figures exactly as they were. Each `Mutation:` line names a change one of these tests must catch.
 */
const STAMP = '2026-09-30T02:00:00.123456+00:00';
type Wire = Record<string, unknown>;

const catalogue = (): Wire => ({
  suppliers: [],
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
      supplier_id: null,
      use_by_days: 60,
      last_counted: STAMP,
      active: true,
      updated_at: STAMP
    }
  ],
  prices: []
});
const recipe = (): Wire => ({
  product_id: 'dcf',
  yield: 12,
  version: 3,
  updated_at: STAMP,
  history: [],
  lines: [{ name: 'Unsalted butter', qty: 320, unit: 'g' }]
});
const itemCost = (over: Wire = {}): Wire => ({
  item_id: 'butter',
  name: 'Unsalted butter',
  unit: 'g',
  active: true,
  on_hand: 900,
  unit_cost: 42,
  source: 'average',
  avg_cost: 42,
  usual: null,
  quote: null,
  ...over
});
const recipeCost = (over: Wire = {}): Wire => ({
  product_id: 'dcf',
  version: 3,
  yield: 12,
  batch_cents: 14814,
  ingredient_per_cookie_cents: 1000.5,
  packaging_per_cookie_cents: 234,
  per_cookie_cents: 1234.5,
  complete: true,
  missing: [],
  lines: [],
  ...over
});

interface Fake {
  items: Wire[];
  recipes: Wire[];
  /** Replace the answer of the two cost functions with an error. */
  costError?: { code: string; message: string } | null;
  books?: Wire;
}
function fakeClient(f: Fake) {
  const rpc = vi.fn(async (name: string) => {
    if (name === 'get_stock_catalogue') return { data: catalogue(), error: null };
    if (name === 'get_recipes') return { data: [recipe()], error: null };
    if (name === 'get_item_costs' || name === 'get_recipe_costs') {
      if (f.costError)
        return { data: null, error: f.costError, status: f.costError.code === '57014' ? 500 : 404 };
      return { data: name === 'get_item_costs' ? f.items : f.recipes, error: null, status: 200 };
    }
    if (name === 'get_books')
      return {
        data: f.books ?? { basis: 'bought', lines: [], uncosted: [], receipts: [] },
        error: null
      };
    if (name === 'record_stock_movement')
      return { data: [{ item_id: 'butter', on_hand: 800, duplicate: false }], error: null };
    if (name === 'get_last_paid') return { data: [], error: null };
    if (name === 'record_discard') return { data: [{ duplicate: false }], error: null };
    return { data: null, error: null };
  });
  return { rpc, client: { rpc } };
}

const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 30))));
const toasts = (r: OpsRuntime) => JSON.stringify(r.state.toast ?? r.state.toasts ?? '');

async function mounted(f: Fake, load: { costs?: boolean } = {}) {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
  const runtime = ref.current!;
  act(() => runtime.setRole('owner'));
  const { client, rpc } = fakeClient(f);
  await act(async () => {
    await runtime.loadStockCatalogue(client as never);
    await runtime.loadRecipes(client as never);
    if (load.costs !== false) await (runtime as unknown as Costs).loadCosts(client as never);
  });
  rpc.mockClear();
  return { runtime, client, rpc };
}
interface Costs {
  loadCosts: (client: unknown) => Promise<boolean>;
  unitCost: (pid: string) => number;
  ingCost: (pid: string) => number;
  costPerUnit: (name: string) => number;
  logSpoilage: (name: string, qty: unknown, why: string) => void;
  openRecipe: (pid: string) => void;
}
const eng = (r: OpsRuntime) => r as unknown as Costs;
const dcfIndex = PRODUCTS.findIndex((p) => p.id === 'dcf');
const productCost = (r: OpsRuntime) => r.renderVals().productRows[dcfIndex].costText;
const recipeCostText = (r: OpsRuntime) => {
  act(() => eng(r).openRecipe('dcf'));
  return r.renderVals().recipe.costText;
};
const sale = (items: Record<string, number>) => ({
  id: 'S1',
  at: Date.now(),
  items,
  total: 300,
  gross: 300,
  discount: 0,
  pay: 'Cash',
  ref: '',
  clerk: 'Owner',
  tendered: 0,
  change: 0,
  synced: true,
  failed: false,
  ledgerId: null
});
const closeEventWith = (r: OpsRuntime, items: Record<string, number>) =>
  act(() =>
    r.setState({
      event: { id: 'e1', name: 'Fair', stage: 'closed' },
      sales: [sale(items)]
    })
  );

describe('B3b: the cost figures come from the database (live mode)', () => {
  beforeEach(() => {
    live = true;
    store.clear();
    localStorage.clear();
  });
  afterEach(() => cleanup());

  it('a worked recipe: the Recipes and Products screens show the database’s cost per cookie', async () => {
    const { runtime } = await mounted({ items: [itemCost()], recipes: [recipeCost()] });
    // 1234.5 centavos is ₱12.345, which the screens round to ₱12.35.
    expect(productCost(runtime)).toBe('₱12.35 cost');
    expect(recipeCostText(runtime)).toBe('₱12.35 per cookie');
    expect(eng(runtime).unitCost('dcf')).toBe(12.35);
    expect(eng(runtime).ingCost('dcf')).toBeCloseTo(10.005, 10);
    expect(eng(runtime).costPerUnit('Unsalted butter')).toBeCloseTo(0.42, 10);
    // Mutation: leaving the engine's own cost path in place shows the prototype's figure, not the database's.
  });

  it('on the old shape (no packaging split) the ingredient cost is the batch over the yield', async () => {
    const old = recipeCost();
    delete old.ingredient_per_cookie_cents;
    delete old.packaging_per_cookie_cents;
    const { runtime } = await mounted({ items: [itemCost()], recipes: [old] });
    expect(eng(runtime).ingCost('dcf')).toBeCloseTo(148.14 / 12, 10);
    expect(productCost(runtime)).toBe('₱12.35 cost');
  });

  it('an incomplete recipe reads "Cost pending" on Recipes and Products, never a number', async () => {
    const { runtime } = await mounted({
      items: [itemCost({ unit_cost: null, source: null })],
      recipes: [
        recipeCost({
          per_cookie_cents: null,
          complete: false,
          missing: [{ name: 'Unsalted butter', why: 'no price' }]
        })
      ]
    });
    expect(productCost(runtime)).toBe('Cost pending');
    expect(recipeCostText(runtime)).toBe('Cost pending');
    // Mutation: a null cost taken as 0 shows "₱0.00 cost".
  });

  it('a recipe the database calls incomplete is pending even when it priced part of it', async () => {
    const { runtime } = await mounted({
      items: [itemCost()],
      recipes: [recipeCost({ complete: false })]
    });
    expect(productCost(runtime)).toBe('Cost pending');
    expect(recipeCostText(runtime)).toBe('Cost pending');
  });

  it('a failed reload after a good one makes every cost pending, never the old figure as final', async () => {
    const { runtime, client } = await mounted({ items: [itemCost()], recipes: [recipeCost()] });
    expect(productCost(runtime)).toBe('₱12.35 cost');
    const failing = {
      rpc: vi.fn(async (name: string) =>
        name === 'get_item_costs' || name === 'get_recipe_costs'
          ? { data: null, error: { code: '57014', message: 'timeout' }, status: 500 }
          : client.rpc(name)
      )
    };
    await act(async () => {
      expect(await eng(runtime).loadCosts(failing)).toBe(false);
    });
    expect(productCost(runtime)).toBe('Cost pending');
    expect(recipeCostText(runtime)).toBe('Cost pending');
    // Mutation: keeping the last good costs after a failed reload shows an edited recipe's old cost as final.
    await act(async () => {
      await eng(runtime).loadCosts(client);
    });
    expect(productCost(runtime)).toBe('₱12.35 cost');
  });

  it('a newer read that fails never discards an older one that succeeds', async () => {
    const { runtime, client } = await mounted(
      { items: [itemCost()], recipes: [recipeCost()] },
      { costs: false }
    );
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const slow = {
      rpc: vi.fn(async (name: string) => {
        await gate;
        return client.rpc(name);
      })
    };
    const failing = {
      rpc: vi.fn(async () => ({
        data: null,
        error: { code: '57014', message: 'timeout' },
        status: 500
      }))
    };
    let older: Promise<boolean> = Promise.resolve(false);
    await act(async () => {
      older = eng(runtime).loadCosts(slow);
      expect(await eng(runtime).loadCosts(failing)).toBe(false);
    });
    expect(productCost(runtime)).toBe('Cost pending');
    await act(async () => {
      release();
      expect(await older).toBe(true);
    });
    expect(productCost(runtime)).toBe('₱12.35 cost');
    // Mutation: a guard on the newest read started (not the newest answer applied) leaves the screens pending for good.
  });

  it('a flavour the database did not cost is pending too', async () => {
    const { runtime } = await mounted({ items: [itemCost()], recipes: [] });
    expect(productCost(runtime)).toBe('Cost pending');
  });

  it('bazaar profit and the cookie cost read "Cost pending" when a sold flavour is pending', async () => {
    const { runtime } = await mounted({
      items: [itemCost()],
      recipes: [recipeCost({ per_cookie_cents: null, complete: false })]
    });
    closeEventWith(runtime, { dcf: 2 });
    const closeout = runtime.renderVals().bzCloseout;
    expect(closeout.profit).toBe('Cost pending');
    expect(closeout.cogs).toBe('Cost pending');
    expect(closeout.profitOk).toBe(true);
    expect(closeout.revenue).toBe('₱300');
  });

  it('bazaar profit is a number when every sold flavour is costed', async () => {
    const { runtime } = await mounted({ items: [itemCost()], recipes: [recipeCost()] });
    closeEventWith(runtime, { dcf: 2 });
    const closeout = runtime.renderVals().bzCloseout;
    // 2 cookies at ₱12.35 is ₱24.70, shown to the peso.
    expect(closeout.cogs).toBe('₱25');
    expect(closeout.profit).toBe('₱275');
  });

  it('the P&L margin rows read "Cost pending" for a pending flavour and a number for a costed one', async () => {
    const pending = await mounted({
      items: [itemCost()],
      recipes: [recipeCost({ per_cookie_cents: null, complete: false })]
    });
    closeEventWith(pending.runtime, { dcf: 2 });
    const row = pending.runtime.renderVals().pl.marginRows.find((m) => m.soldText === '2 sold');
    expect(row).toMatchObject({
      eachText: 'Cost pending',
      madeText: 'Cost pending',
      pctText: '—'
    });
    cleanup();
    const costed = await mounted({ items: [itemCost()], recipes: [recipeCost()] });
    closeEventWith(costed.runtime, { dcf: 2 });
    const ok = costed.runtime.renderVals().pl.marginRows.find((m) => m.soldText === '2 sold');
    expect(ok?.eachText).not.toBe('Cost pending');
    expect(ok?.eachText).toMatch(/^₱\d/);
  });

  it('a write-off of stock with no cost says "Cost pending", and with a cost says how much', async () => {
    const pending = await mounted({
      items: [itemCost({ unit_cost: null, source: null })],
      recipes: [recipeCost()]
    });
    act(() => eng(pending.runtime).logSpoilage('Unsalted butter', 100, 'Spoiled'));
    await settle();
    expect(toasts(pending.runtime)).toContain('Cost pending');
    expect(toasts(pending.runtime)).not.toContain('₱0');
    cleanup();
    const priced = await mounted({ items: [itemCost()], recipes: [recipeCost()] });
    act(() => eng(priced.runtime).logSpoilage('Unsalted butter', 100, 'Spoiled'));
    await settle();
    expect(toasts(priced.runtime)).toContain('₱42');
    expect(toasts(priced.runtime)).not.toContain('Cost pending');
  });

  it('a cookie or dough write-off says "Cost pending" when its cost is pending, and how much when it is not', async () => {
    const spoil = (r: OpsRuntime) =>
      (r as unknown as Costs).logSpoilage as unknown as (
        n: string,
        q: unknown,
        w: string,
        p: string,
        k: string
      ) => void;
    for (const [kind, label] of [
      ['baked', 'cookies'],
      ['dough', 'dough balls']
    ] as const) {
      const pending = await mounted({
        items: [itemCost()],
        recipes: [recipeCost({ per_cookie_cents: null, complete: false })]
      });
      (pending.runtime as unknown as { productionClient: unknown }).productionClient =
        pending.client;
      act(() => pending.runtime.setState({ baked: { dcf: 5 }, dough: { dcf: 5 } }));
      act(() => spoil(pending.runtime)('', 2, 'Spoiled', 'dcf', kind));
      await settle();
      expect(toasts(pending.runtime), label).toContain('Cost pending');
      expect(toasts(pending.runtime), label).not.toMatch(/₱\d/);
      cleanup();
    }
    const priced = await mounted({ items: [itemCost()], recipes: [recipeCost()] });
    (priced.runtime as unknown as { productionClient: unknown }).productionClient = priced.client;
    act(() => priced.runtime.setState({ baked: { dcf: 5 } }));
    act(() => spoil(priced.runtime)('', 2, 'Spoiled', 'dcf', 'baked'));
    await settle();
    // 2 cookies at ₱12.35.
    expect(toasts(priced.runtime)).toContain('₱25');
    expect(toasts(priced.runtime)).not.toContain('Cost pending');
  });
});

describe('B3b: version skew leaves the engine’s own figures (the trial, before the migration)', () => {
  beforeEach(() => {
    live = true;
    store.clear();
    localStorage.clear();
  });
  afterEach(() => cleanup());

  it.each([
    ['PGRST202', 'Could not find the function public.get_recipe_costs'],
    ['42883', 'function public.get_item_costs() does not exist']
  ])(
    'a database that answers %s shows exactly the figures it showed before',
    async (code, message) => {
      const base = { items: [itemCost()], recipes: [recipeCost()] };
      const without = await mounted(base, { costs: false });
      const expected = {
        product: productCost(without.runtime),
        recipe: recipeCostText(without.runtime),
        unit: eng(without.runtime).unitCost('dcf'),
        ing: eng(without.runtime).ingCost('dcf'),
        unitCostOfButter: eng(without.runtime).costPerUnit('Unsalted butter')
      };
      cleanup();
      const skewed = await mounted({ ...base, costError: { code, message } });
      expect({
        product: productCost(skewed.runtime),
        recipe: recipeCostText(skewed.runtime),
        unit: eng(skewed.runtime).unitCost('dcf'),
        ing: eng(skewed.runtime).ingCost('dcf'),
        unitCostOfButter: eng(skewed.runtime).costPerUnit('Unsalted butter')
      }).toEqual(expected);
      // Mutation: replacing the engine's cost path on a failed read shows ₱0.00 where the engine had a figure.
    }
  );

  it('in the fallback a recipe is complete only with priced lines and a packaging cost, whatever the packaging is called', async () => {
    const { runtime } = await mounted(
      { items: [itemCost()], recipes: [recipeCost()] },
      {
        costs: false
      }
    );
    // No packaging cost anywhere: the engine's packaging per cookie is 0, so the cost is pending, not a number.
    expect(productCost(runtime)).toBe('Cost pending');
  });

  it('a function that goes missing after it answered puts the engine’s path back', async () => {
    const f: Fake = { items: [itemCost()], recipes: [recipeCost()] };
    const { runtime, client } = await mounted(f);
    f.costError = { code: 'PGRST202', message: 'gone' };
    await act(async () => {
      await eng(runtime).loadCosts(client as never);
    });
    expect(productCost(runtime)).toBe('Cost pending');
  });
});

describe('B3b: the books show what has no cost yet', () => {
  beforeEach(() => {
    live = true;
    store.clear();
    localStorage.clear();
  });
  afterEach(() => cleanup());

  const books = (): Wire => ({
    basis: 'used',
    lines: [
      {
        id: 'l:1',
        kind: 'expense',
        cat: 'Ingredients',
        label: 'Used: Flour',
        amount_cents: 5000,
        at: Date.parse('2026-10-12T02:00:00Z'),
        short_qty: 0
      }
    ],
    uncosted: [
      {
        id: 'm:1',
        kind: 'use',
        item: 'Sugar',
        qty: 200,
        unit: 'g',
        at: Date.parse('2026-10-12T02:00:00Z')
      },
      {
        id: 'p:1:0',
        kind: 'use',
        item: 'Cocoa',
        qty: 50,
        unit: 'g',
        at: Date.parse('2026-10-11T02:00:00Z'),
        why: 'not in stock'
      }
    ],
    receipts: []
  });

  it('the books form says how many uses have no cost yet and lists them', async () => {
    const { runtime, client } = await mounted(
      { items: [itemCost()], recipes: [recipeCost()], books: books() },
      { costs: false }
    );
    await act(async () => {
      await runtime.loadBooks(client as never);
    });
    act(() => runtime.setState({ sheet: { kind: 'books' } }));
    const liveBooks = runtime.renderVals().liveBooks;
    expect(liveBooks?.uncosted).toHaveLength(2);
    const { container } = render(<BooksForm liveBooks={liveBooks!} />);
    const text = container.textContent ?? '';
    expect(text).toContain('2 uses with no cost yet');
    expect(text).toContain('Sugar');
    expect(text).toContain('200 g');
    expect(text).toContain('Cocoa');
    // Mutation: dropping `uncosted` in the parser leaves the owner with books that look complete.
  });

  it('says nothing when every use has a cost', async () => {
    const { runtime, client } = await mounted(
      {
        items: [itemCost()],
        recipes: [recipeCost()],
        books: { ...books(), uncosted: [] }
      },
      { costs: false }
    );
    await act(async () => {
      await runtime.loadBooks(client as never);
    });
    act(() => runtime.setState({ sheet: { kind: 'books' } }));
    const { container } = render(<BooksForm liveBooks={runtime.renderVals().liveBooks!} />);
    expect(container.textContent ?? '').not.toContain('no cost yet');
  });

  it('the P&L marks its expenses, profit and margin as incomplete while uses have no cost', async () => {
    const { runtime, client } = await mounted(
      { items: [itemCost()], recipes: [recipeCost()], books: books() },
      { costs: false }
    );
    await act(async () => {
      await runtime.loadBooks(client as never);
    });
    const pl = runtime.renderVals().pl;
    expect(pl.expenseText).toContain('Cost pending');
    expect(pl.note).toContain('2 uses');
    // An unknown cost overstates the profit and the margin: neither may read as final.
    const text = (node: React.ReactNode) => render(<>{node}</>).container.textContent ?? '';
    expect(text(pl.profitNum)).toContain('Cost pending');
    expect(text(pl.marginText)).toContain('Cost pending');
    // Mutation: an unknown cost left out of the total reads as a cost of nothing.
  });
});
