import { describe, expect, it, vi } from 'vitest';
import {
  engineBestBuy,
  engineInventory,
  enginePackSizes,
  engineSuppliers,
  fetchStockCatalogue,
  itemError,
  parseStockCatalogue,
  priceError,
  saveStockItem,
  saveSupplier,
  saveSupplierPrice,
  supplierError,
  type ItemFields,
  type PriceFields,
  type StockCatalogue,
  type StockClient,
  type SupplierFields
} from '@/lib/data/stock-catalogue';

/**
 * A3: Cine's stock items, suppliers and supplier prices, as pure functions and the RPC wrappers. Each `Mutation:` line
 * names a change one of these tests must catch (each was applied and seen to fail).
 */
const STAMP = '2026-09-30T02:00:00.123456+00:00';
const PID = 'a3a00000-0000-4000-8000-000000000001';

const wireSupplier = (over: Record<string, unknown> = {}) => ({
  id: 'sr',
  name: 'S&R Membership',
  phone: '0917 000 0000',
  notes: '',
  place: 'Congressional Ave',
  active: true,
  updated_at: STAMP,
  ...over
});
const wireItem = (over: Record<string, unknown> = {}) => ({
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
  last_counted: '2026-09-28T02:00:00+00:00',
  active: true,
  updated_at: STAMP,
  ...over
});
const wirePrice = (over: Record<string, unknown> = {}) => ({
  id: PID,
  supplier_id: 'sr',
  item_name: 'Unsalted butter',
  pack_label: '1 kg block',
  price_cents: 42000,
  previous_cents: [43800, 44500],
  last_bought: '2 Aug',
  preferred: true,
  active: true,
  updated_at: STAMP,
  ...over
});
const wire = (over: Record<string, unknown> = {}) => ({
  suppliers: [wireSupplier()],
  items: [wireItem()],
  prices: [wirePrice()],
  ...over
});

const supplier = (over: Partial<SupplierFields> = {}): SupplierFields => ({
  id: 'sr',
  name: 'S&R Membership',
  phone: '0917 000 0000',
  notes: '',
  place: 'Congressional Ave',
  active: true,
  ...over
});
const item = (over: Partial<ItemFields> = {}): ItemFields => ({
  id: 'butter',
  name: 'Unsalted butter',
  category: 'Ingredients',
  unit: 'g',
  parLevel: 2000,
  packSize: 1000,
  packLabel: '1 kg block',
  supplierId: 'sr',
  useByDays: 60,
  active: true,
  ...over
});
const price = (over: Partial<PriceFields> = {}): PriceFields => ({
  id: PID,
  supplierId: 'sr',
  itemName: 'Unsalted butter',
  packLabel: '1 kg block',
  priceCents: 42000,
  lastBought: '2 Aug',
  preferred: true,
  active: true,
  ...over
});

describe('parseStockCatalogue', () => {
  it('reads the three lists', () => {
    const c = parseStockCatalogue(wire())!;
    expect(c.suppliers).toEqual([
      {
        id: 'sr',
        name: 'S&R Membership',
        phone: '0917 000 0000',
        notes: '',
        place: 'Congressional Ave',
        active: true,
        updatedAt: STAMP
      }
    ]);
    expect(c.items[0]).toMatchObject({
      name: 'Unsalted butter',
      category: 'Ingredients',
      onHand: 900,
      parLevel: 2000,
      packSize: 1000,
      supplierId: 'sr',
      useByDays: 60,
      lastCounted: '2026-09-28T02:00:00+00:00'
    });
    expect(c.prices[0]).toMatchObject({
      priceCents: 42000,
      previousCents: [43800, 44500],
      lastBought: '2 Aug',
      preferred: true
    });
    expect(parseStockCatalogue(wire({ suppliers: [], items: [], prices: [] }))).toEqual({
      suppliers: [],
      items: [],
      prices: []
    });
    expect(
      parseStockCatalogue(
        wire({
          items: [
            wireItem({ pack_size: null, supplier_id: null, use_by_days: null, last_counted: null })
          ]
        })
      )!.items[0]
    ).toMatchObject({ packSize: null, supplierId: null, useByDays: null, lastCounted: null });
  });

  it('refuses anything unexpected, so a screen never shows a half-read list', () => {
    for (const bad of [
      null,
      [],
      'x',
      { suppliers: [], items: [] },
      wire({ suppliers: [wireSupplier({ name: 3 })] }),
      wire({ suppliers: [wireSupplier({ active: 'yes' })] }),
      wire({ suppliers: [null] }),
      wire({ items: [wireItem({ category: 'Snacks' })] }),
      wire({ items: [wireItem({ on_hand: 'lots' })] }),
      wire({ items: [wireItem({ pack_size: 'big' })] }),
      wire({ items: [wireItem({ use_by_days: 0 })] }),
      wire({ items: [wireItem({ supplier_id: 5 })] }),
      wire({ items: [wireItem({ updated_at: 1 })] }),
      wire({ prices: [wirePrice({ id: 'nope' })] }),
      wire({ prices: [wirePrice({ price_cents: -1 })] }),
      wire({ prices: [wirePrice({ price_cents: 1.5 })] }),
      wire({ prices: [wirePrice({ previous_cents: [1, 'x'] })] }),
      wire({ prices: [wirePrice({ previous_cents: 'x' })] }),
      wire({ prices: [wirePrice({ preferred: null })] })
    ])
      expect(parseStockCatalogue(bad as never)).toBeNull();
    // Mutation: accepting a category outside the two offers a row the inventory tabs cannot place.
  });
});

describe('the validators mirror the database bounds', () => {
  it('accept a sound supplier, item and price, with the optional parts left empty', () => {
    expect(supplierError(supplier())).toBeNull();
    expect(supplierError(supplier({ phone: '', notes: '', place: '' }))).toBeNull();
    expect(supplierError(supplier({ notes: 'a\nb' }))).toBeNull();
    expect(itemError(item())).toBeNull();
    expect(
      itemError(item({ packSize: null, supplierId: null, useByDays: null, packLabel: '' }))
    ).toBeNull();
    expect(itemError(item({ parLevel: 0, packSize: 0.001 }))).toBeNull();
    expect(priceError(price())).toBeNull();
    expect(priceError(price({ priceCents: 0, lastBought: '' }))).toBeNull();
  });

  it.each([
    ['a supplier id that is not a slug', supplier({ id: 'Bad Id' }), 'no id'],
    ['a blank supplier name', supplier({ name: '  ' }), 'name'],
    ['a supplier name of 81', supplier({ name: 'n'.repeat(81) }), 'name'],
    ['a control character in the name', supplier({ name: 'a\u0007' }), 'name'],
    ['a phone of 41', supplier({ phone: '9'.repeat(41) }), 'phone'],
    ['a place of 81', supplier({ place: 'p'.repeat(81) }), 'place'],
    ['notes of 301', supplier({ notes: 'n'.repeat(301) }), 'notes']
  ])('refuses %s', (_n, f, word) => {
    expect(supplierError(f)?.toLowerCase()).toContain(word);
    // Mutation: dropping any one of these checks sends what the database refuses.
  });

  it.each([
    ['an item id that is not a slug', item({ id: 'Bad Id' }), 'no id'],
    ['a blank name', item({ name: ' ' }), 'name'],
    ['a name of 81', item({ name: 'n'.repeat(81) }), 'name'],
    ['a control character in the unit', item({ unit: 'g\u0007' }), 'name'],
    ['a blank unit', item({ unit: ' ' }), 'unit'],
    ['a unit of 13', item({ unit: 'u'.repeat(13) }), 'unit'],
    ['a pack label of 41', item({ packLabel: 'p'.repeat(41) }), 'pack label'],
    ['a category outside the two', item({ category: 'Snacks' as never }), 'pick'],
    ['a negative level', item({ parLevel: -1 }), 'level'],
    ['four decimals', item({ parLevel: 1.2345 }), 'level'],
    ['a level of a billion', item({ parLevel: 1_000_000_000 }), 'level'],
    ['a pack size of zero', item({ packSize: 0 }), 'pack size'],
    ['use-by days of zero', item({ useByDays: 0 }), 'use-by'],
    ['use-by days of 1.5', item({ useByDays: 1.5 }), 'use-by'],
    ['use-by days of 3651', item({ useByDays: 3651 }), 'use-by']
  ])('refuses %s', (_n, f, word) => {
    expect(itemError(f)?.toLowerCase()).toContain(word);
  });

  it.each([
    ['a price id that is not a uuid', price({ id: 'x' }), 'no id'],
    ['no item picked', price({ itemName: ' ' }), 'item'],
    ['no supplier picked', price({ supplierId: '' }), 'item'],
    ['a blank pack label', price({ packLabel: ' ' }), 'pack label'],
    ['a pack label of 41', price({ packLabel: 'p'.repeat(41) }), 'pack label'],
    ['last bought of 21', price({ lastBought: 'b'.repeat(21) }), 'last-bought'],
    ['a negative price', price({ priceCents: -1 }), 'price'],
    ['a fractional centavo', price({ priceCents: 1.5 }), 'price'],
    ['a price over a million pesos', price({ priceCents: 100_000_001 }), 'price']
  ])('refuses %s', (_n, f, word) => {
    expect(priceError(f)?.toLowerCase()).toContain(word);
  });
});

describe('the shapes the ported inventory, suppliers and grocery screens read', () => {
  const catalogue = (): StockCatalogue =>
    parseStockCatalogue(
      wire({
        suppliers: [
          wireSupplier(),
          wireSupplier({ id: 'lan', name: 'Landers', place: 'Balintawak' }),
          wireSupplier({ id: 'off', name: 'Switched off', active: false })
        ],
        items: [
          wireItem(),
          wireItem({
            id: 'box',
            name: 'Box of 6',
            category: 'Packaging',
            unit: 'pcs',
            on_hand: 9,
            par_level: 20,
            pack_size: 25,
            supplier_id: null,
            last_counted: null
          }),
          wireItem({ id: 'gone', name: 'Old thing', active: false })
        ],
        prices: [
          wirePrice(),
          wirePrice({
            id: 'a3a00000-0000-4000-8000-000000000002',
            supplier_id: 'lan',
            price_cents: 45500,
            previous_cents: [45000],
            preferred: false
          }),
          wirePrice({
            id: 'a3a00000-0000-4000-8000-000000000003',
            supplier_id: 'off',
            price_cents: 100
          }),
          wirePrice({
            id: 'a3a00000-0000-4000-8000-000000000004',
            item_name: 'Old thing',
            price_cents: 100
          }),
          wirePrice({
            id: 'a3a00000-0000-4000-8000-000000000005',
            supplier_id: 'lan',
            item_name: 'Box of 6',
            price_cents: 900,
            active: false
          })
        ]
      })
    )!;

  it('inventory: active items only, in the item’s own unit, the supplier by name', () => {
    expect(engineInventory(catalogue())).toEqual([
      {
        cat: 'Ingredients',
        name: 'Unsalted butter',
        qty: 900,
        unit: 'g',
        level: 2000,
        supplier: 'S&R Membership',
        updatedAt: Date.parse('2026-09-28T02:00:00+00:00'),
        useBy: null
      },
      {
        cat: 'Packaging',
        name: 'Box of 6',
        qty: 9,
        unit: 'pcs',
        level: 20,
        supplier: '—',
        updatedAt: Date.parse(STAMP),
        useBy: null
      }
    ]);
    // Mutation: listing a switched-off item keeps a retired ingredient on the shopping list.
  });

  it('suppliers: active suppliers, with their active prices for active items, in pesos', () => {
    const s = engineSuppliers(catalogue());
    expect(s.map((x) => x.name)).toEqual(['S&R Membership', 'Landers']);
    expect(s[0]).toEqual({
      name: 'S&R Membership',
      place: 'Congressional Ave',
      items: [
        {
          item: 'Unsalted butter',
          pack: '1 kg block',
          price: 420,
          prev: [438, 445],
          last: '2 Aug',
          preferred: true
        }
      ]
    });
    expect(s[1]!.items.map((i) => [i.item, i.price])).toEqual([['Unsalted butter', 455]]);
    // Mutation: keeping a switched-off price offers 1 peso butter as the best buy.
  });

  it('pack sizes come from items that have one; best buy is the cheapest active price', () => {
    expect(enginePackSizes(catalogue())).toEqual({ 'Unsalted butter': 1000, 'Box of 6': 25 });
    expect(engineBestBuy(engineSuppliers(catalogue()))).toEqual({
      'Unsalted butter': { price: 420, pack: '1 kg block', supplier: 'S&R Membership' }
    });
    expect(engineBestBuy([])).toEqual({});
  });
});

describe('the rpc wrappers', () => {
  const client = (result: unknown) => {
    const rpc = vi.fn(async () => result);
    return { rpc, client: { rpc } as unknown as StockClient };
  };

  it('fetches and parses; a failed or unreadable read throws rather than showing nothing', async () => {
    const ok = client({ data: wire(), error: null });
    expect((await fetchStockCatalogue(ok.client)).items[0]!.name).toBe('Unsalted butter');
    expect(ok.rpc).toHaveBeenCalledWith('get_stock_catalogue');
    await expect(
      fetchStockCatalogue(client({ data: null, error: { code: '42501' } }).client)
    ).rejects.toThrow('42501');
    await expect(fetchStockCatalogue(client({ data: [], error: null }).client)).rejects.toThrow(
      'not understood'
    );
  });

  it('a supplier goes as exactly its six keys, trimmed, against the stamp it read', async () => {
    const f = client({ data: null, error: null });
    expect(
      await saveSupplier(f.client, supplier({ name: ' Landers ', place: ' Balintawak ' }), STAMP)
    ).toBe('saved');
    const [name, args] = f.rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(name).toBe('save_supplier');
    expect(args.p_expected_updated_at).toBe(STAMP);
    expect(args.p_supplier).toEqual({
      id: 'sr',
      name: 'Landers',
      phone: '0917 000 0000',
      notes: '',
      place: 'Balintawak',
      active: true
    });
    await saveSupplier(f.client, supplier(), null);
    expect(
      (f.rpc.mock.calls[1] as unknown as [string, Record<string, unknown>])[1].p_expected_updated_at
    ).toBeNull();
  });

  it('an item goes as exactly its ten keys, with the blanks as null and never a quantity', async () => {
    const f = client({ data: null, error: null });
    await saveStockItem(
      f.client,
      item({ packSize: null, supplierId: null, useByDays: null, unit: ' g ' }),
      STAMP
    );
    const [name, args] = f.rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(name).toBe('save_stock_item');
    expect(args.p_item).toEqual({
      id: 'butter',
      name: 'Unsalted butter',
      category: 'Ingredients',
      unit: 'g',
      par_level: 2000,
      pack_size: null,
      pack_label: '1 kg block',
      supplier_id: null,
      use_by_days: null,
      active: true
    });
    // Mutation: sending on_hand overwrites a count with the form's old copy (the database refuses the extra key).
  });

  it('a price goes as exactly its eight keys', async () => {
    const f = client({ data: null, error: null });
    await saveSupplierPrice(f.client, price({ itemName: ' Unsalted butter ' }), null);
    const [name, args] = f.rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(name).toBe('save_supplier_price');
    expect(args.p_expected_updated_at).toBeNull();
    expect(args.p_price).toEqual({
      id: PID,
      supplier_id: 'sr',
      item_name: 'Unsalted butter',
      pack_label: '1 kg block',
      price_cents: 42000,
      last_bought: '2 Aug',
      preferred: true,
      active: true
    });
  });

  it('classifies every outcome: stale, refused, or not sent', async () => {
    const outcomes = async (send: (c: StockClient) => Promise<string>) => {
      const out: string[] = [];
      for (const result of [
        { error: { code: 'P0002' } },
        { error: { code: '22023' } },
        { error: { code: '42501' } },
        { error: { code: '' } }
      ])
        out.push(await send(client(result).client));
      const throwing = {
        rpc: vi.fn(async () => Promise.reject(new Error('net')))
      } as unknown as StockClient;
      out.push(await send(throwing));
      return out;
    };
    const want = ['conflict', 'refused', 'refused', 'offline', 'offline'];
    expect(await outcomes((c) => saveSupplier(c, supplier(), STAMP))).toEqual(want);
    expect(await outcomes((c) => saveStockItem(c, item(), STAMP))).toEqual(want);
    expect(await outcomes((c) => saveSupplierPrice(c, price(), STAMP))).toEqual(want);
  });
});
