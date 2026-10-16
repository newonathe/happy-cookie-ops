import { describe, expect, it, vi } from 'vitest';
import type { BazaarClient } from '@/lib/data/bazaar-days';
import type { RecipeCost } from '@/lib/data/costs';
import { BOOK_COPY, RecipeBook, type RecipeBookDeps } from '@/store/recipe-book';

/**
 * U7: the recipe book in the owner's store. Her typed costs are read and saved through the database's two functions
 * (faked here); the recipe costs come from the runtime. Each `Mutation:` line names a change a test must catch.
 */
const TYPED_AT = Date.parse('2026-10-15T04:00:00Z'); // noon on 15 Oct in Manila

const recipe = (over: Partial<RecipeCost> = {}): RecipeCost => ({
  version: 2,
  perCookie: 31.25,
  ingredientPerCookie: 24.5,
  packagingPerCookie: 6.75,
  batch: 588,
  complete: true,
  missing: [],
  ...over
});

type Reply = { data?: unknown; error?: { code: string } | null } | 'throw';

function harness(
  opts: {
    typed?: Array<{ product_id: string; cost_cents: number; typed_at: number }>;
    recipes?: Record<string, RecipeCost>;
    costsState?: 'unread' | 'ok' | 'missing' | 'failed';
  } = {}
) {
  const state = {
    online: true,
    costsState: opts.costsState ?? ('ok' as const),
    client: true,
    replies: {
      get_flavour_costs: { data: opts.typed ?? [], error: null } as Reply,
      save_flavour_cost: { data: null, error: null } as Reply
    }
  };
  const rpc = vi.fn(async (name: 'get_flavour_costs' | 'save_flavour_cost') => {
    const r = state.replies[name];
    if (r === 'throw') throw new Error('network');
    return { data: r.data ?? null, error: r.error ?? null };
  });
  const toast = vi.fn();
  const rerender = vi.fn();
  const openRecipe = vi.fn();
  const reloadCosts = vi.fn();
  const recipes = opts.recipes ?? { classic: recipe(), velvet: recipe({ perCookie: 40 }) };
  const deps: RecipeBookDeps = {
    client: () => (state.client ? ({ rpc } as unknown as BazaarClient) : null),
    online: () => state.online,
    flavours: () => [
      { id: 'classic', name: 'Classic', priceCents: 12500, photo: 'assets/a.png', onMenu: true },
      { id: 'velvet', name: 'Velvet', priceCents: 12500, photo: '', onMenu: false }
    ],
    recipeCost: (id) => recipes[id] ?? null,
    recipeCostsState: () => state.costsState,
    batchYield: (id) => (id === 'classic' ? 24 : null),
    openRecipe,
    reloadCosts,
    toast,
    rerender
  };
  const book = new RecipeBook(deps);
  const calls = (name: string) => rpc.mock.calls.filter((c) => c[0] === name).length;
  const item = (id: string) => book.vals().items.find((i) => i.id === id)!;
  return { book, state, rpc, toast, rerender, openRecipe, reloadCosts, calls, item };
}

describe('reading her typed costs', () => {
  it('is loading until the first read, then read; nothing typed shows the recipe’s cost', async () => {
    const h = harness();
    expect(h.book.vals().state).toBe('loading');
    await h.book.read();
    const v = h.book.vals();
    expect(v.state).toBe('read');
    expect(v.note).toBeNull();
    expect(h.item('classic')).toMatchObject({
      costText: '₱31.25',
      costSource: 'recipe',
      sourceText: 'From the recipe',
      typed: false
    });
  });

  it('a typed cost wins and says when: 12,500 at 4,000 keeps 8,500 = 68 %', async () => {
    const h = harness({ typed: [{ product_id: 'classic', cost_cents: 4000, typed_at: TYPED_AT }] });
    await h.book.read();
    expect(h.item('classic')).toMatchObject({
      costText: '₱40.00',
      costSource: 'typed',
      sourceText: 'Typed by you on 15 Oct',
      marginText: '68%',
      keptText: '₱85.00',
      tone: 'ok',
      typed: true,
      startingCost: '40',
      // Mutation: showing the receipt without saying it is only for comparison.
      receiptNote: BOOK_COPY.comparison
    });
    // The other flavour is unchanged: 12,500 at 4,000 (velvet's recipe) keeps 68 % as well, but from the recipe.
    expect(h.item('velvet')).toMatchObject({ costSource: 'recipe', costText: '₱40.00' });
  });

  it('a cost under the floor is warn: 12,500 at 5,000 keeps 7,500 = 60 %', async () => {
    const h = harness({ typed: [{ product_id: 'classic', cost_cents: 5000, typed_at: TYPED_AT }] });
    await h.book.read();
    expect(h.item('classic')).toMatchObject({ marginText: '60%', tone: 'warn' });
  });

  it('a read that fails keeps the recipe costs on screen and says the typed ones are unknown', async () => {
    const h = harness();
    h.state.replies.get_flavour_costs = { error: { code: '08006' } };
    await h.book.read();
    const v = h.book.vals();
    expect(v.state).toBe('failed');
    expect(v.note).toBe(BOOK_COPY.readFailed);
    expect(h.item('classic').costText).toBe('₱31.25');
    // Never read, so nothing can be changed.
    expect(h.item('classic').saveBlocked).toBe(BOOK_COPY.unread);
  });

  it('keeps what it had when a later read fails, and still allows a save', async () => {
    const h = harness({ typed: [{ product_id: 'classic', cost_cents: 4000, typed_at: TYPED_AT }] });
    await h.book.read();
    h.state.replies.get_flavour_costs = 'throw';
    await h.book.read();
    expect(h.book.vals().state).toBe('failed');
    expect(h.item('classic').costText).toBe('₱40.00');
    expect(h.item('classic').saveBlocked).toBeNull();
  });

  it('a database without the function (migration 70 not applied) reads, shows recipe costs, and blocks the save', async () => {
    const h = harness();
    h.state.replies.get_flavour_costs = { error: { code: 'PGRST202' } };
    await h.book.read();
    expect(h.book.vals().state).toBe('read');
    expect(h.item('classic').saveBlocked).toBe(BOOK_COPY.missing);
    expect(h.item('classic').costText).toBe('₱31.25');
  });

  it('with no signed-in client it does not wait for ever', async () => {
    const h = harness();
    h.state.client = false;
    await h.book.read();
    expect(h.book.vals().state).toBe('failed');
  });

  it('a newer read replaces an older one that is still out', async () => {
    const h = harness();
    let release: (v: unknown) => void = () => undefined;
    h.rpc.mockImplementationOnce(() => new Promise((r) => (release = r)) as never);
    const first = h.book.read();
    h.state.replies.get_flavour_costs = {
      data: [{ product_id: 'classic', cost_cents: 3000, typed_at: TYPED_AT }],
      error: null
    };
    await h.book.read();
    release({
      data: [{ product_id: 'classic', cost_cents: 9999, typed_at: TYPED_AT }],
      error: null
    });
    await first;
    // Mutation: letting the older answer land last would show ₱99.99.
    expect(h.item('classic').costText).toBe('₱30.00');
  });
});

describe('the refresh the book calls when it opens', () => {
  it('is the same function on every render, so reading does not start another read', async () => {
    const h = harness();
    const first = h.book.vals().refresh;
    await h.book.read();
    // Mutation: a new closure per render made the book's effect read again after every read, for ever.
    expect(h.book.vals().refresh).toBe(first);
    h.book.vals().refresh();
    await Promise.resolve();
    expect(h.calls('get_flavour_costs')).toBe(2);
  });
});

describe('refreshing', () => {
  it('also reads the recipe costs again, so Try again on that banner does something', () => {
    const h = harness();
    h.book.vals().refresh();
    expect(h.reloadCosts).toHaveBeenCalledTimes(1);
  });
});

describe('the recipe’s cost', () => {
  it('is pending when the recipe is incomplete, and when the costs were not read', async () => {
    const part = recipe({ complete: false, missing: [{ name: 'Flour', why: 'no cost' }] });
    const h = harness({ recipes: { classic: part } });
    await h.book.read();
    expect(h.item('classic')).toMatchObject({
      costText: 'Cost pending',
      marginText: '—',
      tone: 'none'
    });
    expect(h.item('classic').receipt?.missing).toEqual(['Flour']);
    h.state.costsState = 'failed';
    const v = h.book.vals();
    expect(v.note).toBe(BOOK_COPY.recipeCostsFailed);
    expect(v.items.find((i) => i.id === 'velvet')?.costText).toBe('Cost pending');
  });

  it('writes the receipt with the batch the recipe makes', async () => {
    const h = harness();
    await h.book.read();
    expect(h.item('classic').receipt).toMatchObject({
      totalText: '₱31.25',
      batchText: 'One batch makes 24 cookies; its ingredients cost ₱588.00.'
    });
    expect(h.item('velvet').receipt?.batchText).toBeNull();
  });
});

describe('saving the cost', () => {
  it('sends the flavour and its cost in centavos, reads again, and says so', async () => {
    const h = harness();
    await h.book.read();
    h.state.replies.get_flavour_costs = {
      data: [{ product_id: 'classic', cost_cents: 3450.5, typed_at: TYPED_AT }],
      error: null
    };
    const answer = await h.item('classic').save('34.505');
    expect(answer).toBeNull();
    expect(h.rpc).toHaveBeenCalledWith('save_flavour_cost', {
      p_product: 'classic',
      p_cents: 3450.5
    });
    expect(h.toast).toHaveBeenCalledWith(BOOK_COPY.saved);
    // The read after the save is what the page shows.
    expect(h.item('classic')).toMatchObject({ costSource: 'typed', costText: '₱34.505' });
  });

  it('shows what was saved even when the read after it fails', async () => {
    const h = harness();
    await h.book.read();
    h.state.replies.get_flavour_costs = 'throw';
    expect(await h.item('classic').save('34')).toBeNull();
    // Mutation: leaving the old map would show the recipe's cost beside a toast that says "Cost saved."
    expect(h.item('classic')).toMatchObject({ costSource: 'typed', costText: '₱34.00' });
    expect(h.book.vals().note).toBe(BOOK_COPY.readFailed);
  });

  it('takes her cost away at once when blank is saved and the read fails', async () => {
    const h = harness({ typed: [{ product_id: 'classic', cost_cents: 4000, typed_at: TYPED_AT }] });
    await h.book.read();
    h.state.replies.get_flavour_costs = 'throw';
    expect(await h.item('classic').save('')).toBeNull();
    expect(h.item('classic')).toMatchObject({ costSource: 'recipe', typed: false });
  });

  it('blank takes her cost away: null goes to the database', async () => {
    const h = harness({ typed: [{ product_id: 'classic', cost_cents: 4000, typed_at: TYPED_AT }] });
    await h.book.read();
    h.state.replies.get_flavour_costs = { data: [], error: null };
    expect(await h.item('classic').save('  ')).toBeNull();
    expect(h.rpc).toHaveBeenCalledWith('save_flavour_cost', {
      p_product: 'classic',
      p_cents: null
    });
    expect(h.item('classic')).toMatchObject({ costSource: 'recipe', typed: false });
  });

  it('does not send what is not a cost, and says how to fix it', async () => {
    const h = harness();
    await h.book.read();
    const answer = await h.item('classic').save('12.50001');
    expect(answer).toContain('Enter the cost per cookie like 12 or 12.50');
    // Mutation: sending first and checking after would reach the database with a bad value.
    expect(h.calls('save_flavour_cost')).toBe(0);
  });

  it('needs signal, and says so without calling the database', async () => {
    const h = harness();
    await h.book.read();
    h.state.online = false;
    expect(await h.item('classic').save('30')).toBe(BOOK_COPY.offline);
    expect(h.calls('save_flavour_cost')).toBe(0);
    expect(h.item('classic').saveBlocked).toBe(BOOK_COPY.offline);
  });

  it('a refusal and a lost connection each have their words, and neither reads again or toasts', async () => {
    const h = harness();
    await h.book.read();
    h.state.replies.save_flavour_cost = { error: { code: '42501' } };
    expect(await h.item('classic').save('30')).toBe(BOOK_COPY.refused);
    h.state.replies.save_flavour_cost = { error: { code: '08006' } };
    expect(await h.item('classic').save('30')).toBe(BOOK_COPY.offline);
    expect(h.calls('get_flavour_costs')).toBe(1);
    expect(h.toast).not.toHaveBeenCalled();
  });

  it('refuses a second save while one is out', async () => {
    const h = harness();
    await h.book.read();
    let release: (v: unknown) => void = () => undefined;
    h.rpc.mockImplementationOnce(() => new Promise((r) => (release = r)) as never);
    const first = h.item('classic').save('30');
    expect(await h.item('classic').save('31')).toBe(BOOK_COPY.busy);
    release({ data: null, error: null });
    expect(await first).toBeNull();
  });
});

describe('opening the recipe', () => {
  it('asks the runtime to open the older Recipes screen on this flavour', async () => {
    const h = harness();
    h.item('velvet').editRecipe();
    expect(h.openRecipe).toHaveBeenCalledWith('velvet');
  });

  it('gives the book its flavours in the order given, with the menu price written', async () => {
    const h = harness();
    const items = h.book.vals().items;
    expect(items.map((i) => [i.id, i.priceText, i.onMenu])).toEqual([
      ['classic', '₱125.00', true],
      ['velvet', '₱125.00', false]
    ]);
  });
});
