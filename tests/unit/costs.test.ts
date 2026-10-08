import { describe, expect, it, vi } from 'vitest';
import { fetchItemCosts, fetchRecipeCosts } from '@/lib/data/costs';
import { costCentavosToPesos } from '@/lib/money';

/**
 * B3b-2: the database's cost reads (`get_item_costs`, `get_recipe_costs`). Both answer in centavos with up to six decimals;
 * the only conversion to pesos is `costCentavosToPesos`. An unknown cost is null, never 0. A database without the
 * functions is `missing`; every other problem is `failed`; neither read throws.
 */
const item = (over: Record<string, unknown> = {}) => ({
  item_id: 'butter',
  name: 'Unsalted butter',
  unit: 'g',
  active: true,
  on_hand: 900,
  unit_cost: 0.42,
  source: 'average',
  ...over
});
const recipe = (over: Record<string, unknown> = {}) => ({
  product_id: 'dcf',
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
const client = (data: unknown, error: unknown = null, status = 200) => ({
  rpc: vi.fn(async () => ({ data, error, status }))
});

describe('costCentavosToPesos', () => {
  it('turns fractional centavos into pesos, and an unknown into null', () => {
    expect(costCentavosToPesos(1234.5678)).toBeCloseTo(12.345678, 9);
    expect(costCentavosToPesos('42.5')).toBe(0.425);
    expect(costCentavosToPesos(0)).toBe(0);
    expect(costCentavosToPesos(null)).toBeNull();
    expect(costCentavosToPesos(undefined)).toBeNull();
    expect(costCentavosToPesos('')).toBeNull();
    expect(costCentavosToPesos('abc')).toBeNull();
    expect(costCentavosToPesos(Number.NaN)).toBeNull();
    expect(costCentavosToPesos(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('fetchItemCosts', () => {
  it('reads each item by id and by name, in pesos; no cost is null, not zero', async () => {
    const read = await fetchItemCosts(
      client([
        item(),
        item({ item_id: 'eggs', name: 'Eggs', unit: 'pcs', unit_cost: null })
      ]) as never
    );
    expect(read.status).toBe('ok');
    if (read.status !== 'ok') return;
    expect(read.byId.get('butter')).toBeCloseTo(0.0042, 9);
    expect(read.byName.get('Unsalted butter')).toBeCloseTo(0.0042, 9);
    expect(read.byId.get('eggs')).toBeNull();
    expect(read.byName.get('Eggs')).toBeNull();
    expect(read.byName.has('Flour')).toBe(false);
  });

  it('a name held by two active items is unknown; a switched-off item does not claim the name', async () => {
    const read = await fetchItemCosts(
      client([
        item({ item_id: 'a', name: 'Flour', unit_cost: 5 }),
        item({ item_id: 'b', name: 'Flour', unit_cost: 6 }),
        item({ item_id: 'c', name: 'Sugar', unit_cost: 7 }),
        item({ item_id: 'd', name: 'Sugar', unit_cost: 9, active: false })
      ]) as never
    );
    if (read.status !== 'ok') throw new Error('expected ok');
    expect(read.byName.get('Flour')).toBeNull();
    expect(read.byId.get('a')).toBeCloseTo(0.05, 9);
    expect(read.byName.get('Sugar')).toBeCloseTo(0.07, 9);
    expect(read.byId.get('d')).toBeCloseTo(0.09, 9);
  });

  it('reads an empty list as ok with nothing in it', async () => {
    const read = await fetchItemCosts(client([]) as never);
    expect(read.status).toBe('ok');
  });

  it.each([
    ['PGRST202 (no such function)', { code: 'PGRST202' }, 200],
    ['42883 (undefined function)', { code: '42883' }, 200],
    ['an HTTP 404', { code: '' }, 404]
  ])('%s is missing', async (_label, error, status) => {
    expect((await fetchItemCosts(client(null, error, status) as never)).status).toBe('missing');
    expect((await fetchRecipeCosts(client(null, error, status) as never)).status).toBe('missing');
  });

  it('any other error, a malformed answer and a thrown call are failed, and never throw', async () => {
    for (const bad of [
      client(null, { code: '42501' }, 403),
      client(null, null),
      client({ not: 'a list' }),
      client([item({ unit_cost: 'abc' })]),
      client([item({ item_id: 5 })]),
      client([item({ active: 'yes' })]),
      client(['x'])
    ])
      expect((await fetchItemCosts(bad as never)).status).toBe('failed');
    const throws = { rpc: vi.fn(async () => Promise.reject(new Error('offline'))) };
    expect((await fetchItemCosts(throws as never)).status).toBe('failed');
    expect((await fetchRecipeCosts(throws as never)).status).toBe('failed');
  });
});

describe('fetchRecipeCosts', () => {
  it('reads a recipe by product: per cookie, its two parts and the batch in pesos, completeness and what is missing', async () => {
    const read = await fetchRecipeCosts(
      client([
        recipe(),
        recipe({
          product_id: 'pbm',
          complete: false,
          batch_cents: null,
          ingredient_cents_per_cookie: null,
          packaging_cents_per_cookie: 0,
          per_cookie_cents: null,
          missing: [{ name: 'Miso', why: 'no cost' }]
        })
      ]) as never
    );
    expect(read.status).toBe('ok');
    if (read.status !== 'ok') return;
    const dcf = read.byProduct.get('dcf')!;
    expect(dcf.perCookie).toBeCloseTo(12.345678, 9);
    expect(dcf.ingredientPerCookie).toBeCloseTo(10, 9);
    expect(dcf.packagingPerCookie).toBeCloseTo(2.345678, 9);
    expect(dcf.batch).toBeCloseTo(120, 9);
    expect(dcf.complete).toBe(true);
    expect(dcf.missing).toEqual([]);
    const pbm = read.byProduct.get('pbm')!;
    expect(pbm.perCookie).toBeNull();
    expect(pbm.ingredientPerCookie).toBeNull();
    expect(pbm.batch).toBeNull();
    expect(pbm.packagingPerCookie).toBe(0);
    expect(pbm.complete).toBe(false);
    expect(pbm.missing).toEqual([{ name: 'Miso', why: 'no cost' }]);
  });

  it('an answer without the packaging part (migrations 56 to 59, before the packaging rules) is missing, so the engine path stands', async () => {
    const old = recipe();
    delete (old as Record<string, unknown>).ingredient_cents_per_cookie;
    delete (old as Record<string, unknown>).packaging_cents_per_cookie;
    expect((await fetchRecipeCosts(client([old]) as never)).status).toBe('missing');
    const half = recipe();
    delete (half as Record<string, unknown>).packaging_cents_per_cookie;
    expect((await fetchRecipeCosts(client([half]) as never)).status).toBe('missing');
    // A null packaging part is the new answer saying "some packaging, none costed": a key that is there.
    const read = await fetchRecipeCosts(
      client([recipe({ packaging_cents_per_cookie: null })]) as never
    );
    expect(read.status).toBe('ok');
  });

  it('reads the version the cost is of', async () => {
    const read = await fetchRecipeCosts(client([recipe({ version: 7 })]) as never);
    if (read.status !== 'ok') throw new Error('expected ok');
    expect(read.byProduct.get('dcf')!.version).toBe(7);
  });

  it('a malformed answer is failed', async () => {
    for (const bad of [
      client({}),
      client([recipe({ complete: 'yes' })]),
      client([recipe({ product_id: 1 })]),
      client([recipe({ per_cookie_cents: 'abc' })]),
      client([recipe({ version: '3' })]),
      client([recipe({ version: undefined })]),
      client([recipe({ missing: 'none' })])
    ])
      expect((await fetchRecipeCosts(bad as never)).status).toBe('failed');
  });
});
