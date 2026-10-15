import { describe, expect, it, vi } from 'vitest';
import {
  fetchItemCosts,
  fetchRecipeCosts,
  parseItemCosts,
  parseRecipeCosts,
  type CostsClient
} from '@/lib/data/costs';
import { parseBooks } from '@/lib/data/books';
import { isMissingFunction } from '@/lib/data/rpc-missing';
import { centavosRateToPesos } from '@/lib/money';

/**
 * B3b: the strict-but-tolerant readers for `get_item_costs` and `get_recipe_costs`. New keys are optional (the function on
 * today's schema lacks the packaging split and the line `kind`), unknown keys are ignored, a null cost stays null (an unknown
 * cost is never a zero), and a database without the function is `missing`, not `failed`. Each rule names the mutation it
 * would catch.
 */
const ITEM = {
  item_id: 'butter',
  name: 'Unsalted butter',
  unit: 'g',
  active: true,
  on_hand: 900,
  unit_cost: 0.42,
  source: 'average',
  avg_cost: 0.42,
  usual: 0.4,
  quote: 0.45
};
const RECIPE_NEW = {
  product_id: 'dcf',
  version: 3,
  yield: 12,
  batch_cents: 14814,
  ingredient_per_cookie_cents: 1000.5,
  packaging_per_cookie_cents: 234,
  per_cookie_cents: 1234.5,
  complete: true,
  missing: [],
  lines: [
    {
      kind: 'ingredient',
      name: 'Unsalted butter',
      item_id: 'butter',
      qty: 320,
      unit: 'g',
      unit_cost: 0.42,
      source: 'average',
      cents: 134.4
    }
  ]
};
const { ingredient_per_cookie_cents: _a, packaging_per_cookie_cents: _b, ...OLD_BASE } = RECIPE_NEW;
void _a;
void _b;
const RECIPE_OLD = {
  ...OLD_BASE,
  lines: RECIPE_NEW.lines.map(({ kind: _k, ...line }) => {
    void _k;
    return line;
  })
};

describe('isMissingFunction', () => {
  it('is the shop-identity rule: PGRST202, 42883 or a 404', () => {
    expect(isMissingFunction({ code: 'PGRST202' }, 400)).toBe(true);
    expect(isMissingFunction({ code: '42883' }, 400)).toBe(true);
    expect(isMissingFunction({ code: '' }, 404)).toBe(true);
    expect(isMissingFunction({ code: '42501' }, 403)).toBe(false);
    expect(isMissingFunction({ code: 'PGRST301' }, 401)).toBe(false);
    // Mutation: treating every error as missing would hide a refused or failed read behind the fallback figures.
  });
});

describe('parseItemCosts', () => {
  it('reads an item and keeps a null cost as null', () => {
    const rows = parseItemCosts([
      ITEM,
      { ...ITEM, item_id: 'sugar', name: 'Sugar', unit_cost: null, source: null }
    ]);
    expect(rows?.[0]).toMatchObject({
      itemId: 'butter',
      name: 'Unsalted butter',
      unitCostCents: 0.42,
      source: 'average'
    });
    expect(rows?.[1]).toMatchObject({ itemId: 'sugar', unitCostCents: null, source: null });
    // Mutation: coercing null to 0 shows an unpriced item as free.
  });

  it('ignores keys it does not know and takes an absent cost as unknown', () => {
    const { unit_cost: _u, ...bare } = ITEM;
    void _u;
    const rows = parseItemCosts([{ ...bare, something_new: 1 }]);
    expect(rows?.[0]?.unitCostCents).toBeNull();
  });

  it('is no answer at all when a row is not understood', () => {
    expect(parseItemCosts({})).toBeNull();
    expect(parseItemCosts([{ ...ITEM, name: 5 }])).toBeNull();
    expect(parseItemCosts([{ ...ITEM, unit_cost: '0.42' }])).toBeNull();
  });
});

describe('parseRecipeCosts', () => {
  it('reads the new shape with the packaging split', () => {
    const [r] = parseRecipeCosts([RECIPE_NEW]) ?? [];
    expect(r).toMatchObject({
      productId: 'dcf',
      yield: 12,
      batchCents: 14814,
      ingredientPerCookieCents: 1000.5,
      packagingPerCookieCents: 234,
      perCookieCents: 1234.5,
      complete: true
    });
    expect(r?.lines[0]).toMatchObject({
      kind: 'ingredient',
      name: 'Unsalted butter',
      cents: 134.4
    });
  });

  it('reads today’s shape: no split and no line kind', () => {
    const [r] = parseRecipeCosts([RECIPE_OLD]) ?? [];
    expect(r?.perCookieCents).toBe(1234.5);
    expect(r?.ingredientPerCookieCents).toBeUndefined();
    expect(r?.packagingPerCookieCents).toBeUndefined();
    expect(r?.lines[0]?.kind).toBeUndefined();
  });

  it('keeps a null per-cookie cost and what is missing', () => {
    const [r] =
      parseRecipeCosts([
        {
          ...RECIPE_NEW,
          per_cookie_cents: null,
          ingredient_per_cookie_cents: null,
          packaging_per_cookie_cents: null,
          complete: false,
          missing: [
            { name: 'Sugar', why: 'no price', kind: 'ingredient' },
            { name: 'Box', why: 'not stocked' }
          ]
        }
      ]) ?? [];
    expect(r?.perCookieCents).toBeNull();
    expect(r?.ingredientPerCookieCents).toBeNull();
    expect(r?.complete).toBe(false);
    expect(r?.missing).toEqual([
      { name: 'Sugar', why: 'no price', kind: 'ingredient' },
      { name: 'Box', why: 'not stocked', kind: undefined }
    ]);
    // Mutation: coercing a null per-cookie cost to 0 shows an unknown cost as ₱0.00.
  });

  it('is no answer at all when a row is not understood', () => {
    expect(parseRecipeCosts(null)).toBeNull();
    expect(parseRecipeCosts([{ ...RECIPE_NEW, complete: 'yes' }])).toBeNull();
    expect(parseRecipeCosts([{ ...RECIPE_NEW, product_id: 7 }])).toBeNull();
  });
});

describe('the fetchers', () => {
  const client = (reply: { data?: unknown; error?: { code?: string } | null; status?: number }) => {
    const rpc = vi.fn(async () => ({ data: null, error: null, status: 200, ...reply }));
    return { c: { rpc } as unknown as CostsClient, rpc };
  };

  it('answer ok with the parsed rows', async () => {
    const a = client({ data: [ITEM] });
    expect(await fetchItemCosts(a.c)).toMatchObject({ status: 'ok', data: [{ itemId: 'butter' }] });
    expect(a.rpc).toHaveBeenCalledWith('get_item_costs');
    const b = client({ data: [RECIPE_NEW] });
    expect(await fetchRecipeCosts(b.c)).toMatchObject({
      status: 'ok',
      data: [{ productId: 'dcf' }]
    });
    expect(b.rpc).toHaveBeenCalledWith('get_recipe_costs');
  });

  it.each([
    ['PGRST202', 404],
    ['42883', 400]
  ])('answer missing for a database without the function (%s, %s)', async (code, status) => {
    const a = client({ error: { code }, status });
    expect(await fetchItemCosts(a.c)).toEqual({ status: 'missing' });
    expect(await fetchRecipeCosts(a.c)).toEqual({ status: 'missing' });
  });

  it('answer failed for any other error, a malformed answer and a thrown call', async () => {
    // A bare 404 (a wrong address, a proxy) is not a database without the function: the screens must not quietly fall back.
    expect(await fetchItemCosts(client({ error: { code: '' }, status: 404 }).c)).toEqual({
      status: 'failed'
    });
    expect(await fetchItemCosts(client({ error: { code: '42501' }, status: 403 }).c)).toEqual({
      status: 'failed'
    });
    expect(await fetchRecipeCosts(client({ data: { nope: 1 } }).c)).toEqual({ status: 'failed' });
    const thrown = {
      rpc: async () => {
        throw new Error('offline');
      }
    } as unknown as CostsClient;
    expect(await fetchItemCosts(thrown)).toEqual({ status: 'failed' });
    expect(await fetchRecipeCosts(thrown)).toEqual({ status: 'failed' });
  });
});

describe('centavosRateToPesos', () => {
  it('moves a per-unit rate with fractional centavos to pesos without rounding it', () => {
    expect(centavosRateToPesos(0.42)).toBeCloseTo(0.0042, 10);
    expect(centavosRateToPesos(1234.5)).toBeCloseTo(12.345, 10);
    expect(() => centavosRateToPesos(Number.NaN)).toThrow(TypeError);
  });
});

describe('parseBooks keeps what has no cost', () => {
  const base = { basis: 'used', lines: [], receipts: [] };
  const use = { id: 'm:1', kind: 'use', item: 'Sugar', qty: 200, unit: 'g', at: 1_760_000_000_000 };

  it('reads the uncosted uses, with or without a reason', () => {
    const books = parseBooks({ ...base, uncosted: [use, { ...use, id: 'p:1:0', why: 'not in stock' }] });
    expect(books?.uncosted).toEqual([use, { ...use, id: 'p:1:0', why: 'not in stock' }]);
    // Mutation: dropping `uncosted` in the parser leaves the books looking complete.
  });

  it('takes a database from before the list as having none to say', () => {
    expect(parseBooks(base)?.uncosted).toEqual([]);
  });

  it('is no answer at all when the list is malformed', () => {
    expect(parseBooks({ ...base, uncosted: {} })).toBeNull();
    expect(parseBooks({ ...base, uncosted: [{ ...use, qty: '200' }] })).toBeNull();
    expect(parseBooks({ ...base, uncosted: [{ ...use, kind: 'sale' }] })).toBeNull();
  });
});
