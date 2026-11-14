import { describe, expect, it, vi } from 'vitest';
import {
  fetchProductTypes,
  saveProductType,
  typeIdFor,
  typeLabelError,
  type ProductType,
  type ProductTypesClient
} from '@/lib/data/product-types';
import { flavourFieldError, flavourPayload, type FlavourFields } from '@/lib/data/flavours';

const client = (answer: { data?: unknown; error?: { code?: string } | null }) => {
  const rpc = vi.fn(async () => ({ data: answer.data ?? null, error: answer.error ?? null }));
  return { rpc, client: { rpc } as unknown as ProductTypesClient };
};

const wire = {
  types: [
    {
      id: 'cookie',
      label: 'Cookie',
      behaves_as: 'cookie',
      sort_order: 0,
      active: true,
      built_in: true,
      updated_at: 't0'
    },
    {
      id: 'set',
      label: 'Set',
      behaves_as: 'set',
      sort_order: 1,
      active: true,
      built_in: true,
      updated_at: 't0'
    },
    {
      id: 'ice-cream',
      label: 'Ice cream',
      behaves_as: 'item',
      sort_order: 2,
      active: true,
      built_in: false,
      updated_at: 't1'
    }
  ],
  products: { hc: 'cookie', 'vanilla-ice-cream': 'ice-cream' }
};

describe('product types (migration 84, Cine 14 November 2026)', () => {
  it('reads her types and each product type, or says it did not understand', async () => {
    const read = await fetchProductTypes(client({ data: wire }).client);
    expect(read?.types.map((t) => [t.id, t.behavesAs, t.builtIn])).toEqual([
      ['cookie', 'cookie', true],
      ['set', 'set', true],
      ['ice-cream', 'item', false]
    ]);
    expect(read?.products['vanilla-ice-cream']).toBe('ice-cream');
    expect(await fetchProductTypes(client({ data: { types: 'x' } }).client)).toBeNull();
    await expect(fetchProductTypes(client({ error: { code: '42501' } }).client)).rejects.toThrow(
      '42501'
    );
  });

  it('makes a unique slug from her name for a type', () => {
    expect(typeIdFor('Ice cream', new Set(['cookie']))).toBe('ice-cream');
    expect(typeIdFor('Ice cream', new Set(['ice-cream']))).toBe('ice-cream-2');
    expect(typeIdFor('Stickers & Pins', new Set())).toBe('stickers-pins');
    expect(typeIdFor('!!!', new Set())).toBe('type');
  });

  it('checks a type name like the database: 1 to 30 characters, unique ignoring case', () => {
    const types = [{ label: 'Cookie' }] as ProductType[];
    expect(typeLabelError('  ', types)).toMatch(/1 to 30/);
    expect(typeLabelError('x'.repeat(31), types)).toMatch(/1 to 30/);
    expect(typeLabelError('cookie', types)).toMatch(/already/);
    expect(typeLabelError('Drinks', types)).toBeNull();
  });

  it('sends exactly the type body, and classifies each answer', async () => {
    const { rpc, client: c } = client({});
    const type = {
      id: 'drinks',
      label: ' Drinks ',
      behavesAs: 'item' as const,
      sortOrder: 3,
      active: true
    };
    expect(await saveProductType(c, type, null)).toBe('saved');
    expect(rpc).toHaveBeenCalledWith('save_product_type', {
      p_type: { id: 'drinks', label: 'Drinks', behaves_as: 'item', sort_order: 3, active: true },
      p_expected_updated_at: null
    });
    for (const [code, want] of [
      ['P0002', 'stale'],
      ['55000', 'locked'],
      ['22023', 'refused'],
      ['42501', 'refused'],
      ['08006', 'offline']
    ] as const)
      expect(await saveProductType(client({ error: { code } }).client, type, 't1')).toBe(want);
  });

  it('lets an item through only with one of her types, and sends the type only when chosen', () => {
    const base: FlavourFields = {
      name: 'Vanilla ice cream',
      short_name: 'Ice cream',
      price_cents: 5000,
      kind: 'Permanent',
      item_type: 'item',
      capacity_weight: 1,
      tag: '',
      description: '',
      image_path: '',
      allergens: 'Contains milk',
      active: true,
      sort_order: 40
    };
    expect(flavourFieldError(base)).toMatch(/product type/);
    expect(flavourFieldError({ ...base, type_id: 'ice-cream' })).toBeNull();
    const row = { id: 'v', published: false, updated_at: '', ...base };
    expect(flavourPayload(row)).not.toHaveProperty('type_id');
    expect(flavourPayload({ ...row, type_id: 'ice-cream' })).toMatchObject({
      type_id: 'ice-cream',
      item_type: 'item'
    });
  });

  it('takes an item at 0 slots as the database stores it, but never a cookie at 0', () => {
    const item: FlavourFields = {
      name: 'Sticker',
      short_name: 'Sticker',
      price_cents: 5000,
      kind: 'Permanent',
      item_type: 'item',
      type_id: 'stickers',
      capacity_weight: 0,
      tag: '',
      description: '',
      image_path: '',
      allergens: 'None',
      active: true,
      sort_order: 40
    };
    expect(flavourFieldError(item)).toBeNull();
    expect(flavourFieldError({ ...item, item_type: 'cookie', type_id: 'cookie' })).toMatch(
      /1 to 48/
    );
    // save_flavour takes 1 to 48, so an item goes as 1; the trigger sets it back to 0.
    const row = { id: 's', published: false, updated_at: '', ...item };
    expect(flavourPayload(row)).toMatchObject({ capacity_weight: 1 });
    expect(flavourPayload({ ...row, item_type: 'cookie', capacity_weight: 3 })).toMatchObject({
      capacity_weight: 3
    });
  });
});
