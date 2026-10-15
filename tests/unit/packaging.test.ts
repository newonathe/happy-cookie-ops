import { describe, expect, it, vi } from 'vitest';
import {
  fetchPackagingRules,
  packagingLinesError,
  packagingRulesError,
  parsePackagingRules,
  savePackagingLines,
  savePackagingRules,
  type PackagingClient,
  type PackagingRuleFields
} from '@/lib/data/packaging';
import { parseRecipes } from '@/lib/data/recipes';
import type { Json } from '@/lib/types/database';

/**
 * B3b: the owner's packaging records (`get_packaging_rules`, `save_packaging_rules`, `save_recipe_packaging`, migration
 * 20260101005900). The payload carries exactly the keys the database accepts; a database without the functions is `missing`
 * (never `failed`, and a bare 404 is a failure); a stale stamp is a conflict; a refusal carries the database's own message.
 */
const STAMP = '2026-10-14T02:00:00.123456+00:00';
const wire = (over: Record<string, unknown> = {}) => ({
  updated_at: STAMP,
  rules: [
    {
      id: 'r1',
      container: 'box',
      box_size: 6,
      item_id: 'item-a',
      item_name: 'Item A',
      unit: 'pcs',
      qty: 1,
      per: 'container',
      position: 1
    },
    {
      id: 'r2',
      container: 'loose',
      box_size: null,
      item_id: 'item-b',
      item_name: 'Item B',
      unit: 'pcs',
      qty: 0.5,
      per: 'cookie',
      position: 1
    }
  ],
  ...over
});
const rule = (over: Partial<PackagingRuleFields> = {}): PackagingRuleFields => ({
  container: 'box',
  boxSize: 6,
  itemId: 'item-a',
  qty: 1,
  per: 'container',
  ...over
});

const client = (
  result:
    { data?: unknown; error?: { code?: string; message?: string } | null; status?: number } | Error
) => {
  const rpc = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return { data: result.data ?? null, error: result.error ?? null, status: result.status };
  });
  return { rpc: rpc as unknown as PackagingClient['rpc'], calls: rpc };
};

describe('parsePackagingRules', () => {
  it('reads the stamp and every rule', () => {
    const got = parsePackagingRules(wire() as Json);
    expect(got?.updatedAt).toBe(STAMP);
    expect(got?.rules).toHaveLength(2);
    expect(got?.rules[0]).toMatchObject({
      container: 'box',
      boxSize: 6,
      itemId: 'item-a',
      itemName: 'Item A',
      unit: 'pcs',
      qty: 1,
      per: 'container'
    });
    expect(got?.rules[1]?.boxSize).toBeNull();
  });

  it('accepts a first read with no stamp and no rules', () => {
    expect(parsePackagingRules({ updated_at: null, rules: [] })).toEqual({
      updatedAt: null,
      rules: []
    });
  });

  it('is no answer at all when anything is unexpected', () => {
    expect(parsePackagingRules(null)).toBeNull();
    expect(parsePackagingRules([] as Json)).toBeNull();
    expect(parsePackagingRules(wire({ rules: 'x' }) as Json)).toBeNull();
    const bad = wire();
    (bad.rules[0] as Record<string, unknown>).container = 'pallet';
    expect(parsePackagingRules(bad as Json)).toBeNull();
    const per = wire();
    (per.rules[0] as Record<string, unknown>).per = 'week';
    expect(parsePackagingRules(per as Json)).toBeNull();
    const qty = wire();
    (qty.rules[0] as Record<string, unknown>).qty = 'one';
    expect(parsePackagingRules(qty as Json)).toBeNull();
  });
});

describe('fetchPackagingRules', () => {
  it('answers ok with the rules', async () => {
    const c = client({ data: wire() });
    const got = await fetchPackagingRules(c);
    expect(got.status).toBe('ok');
    expect(c.calls).toHaveBeenCalledWith('get_packaging_rules');
  });

  it('answers missing for a database without the function (PGRST202 and 42883)', async () => {
    expect(await fetchPackagingRules(client({ error: { code: 'PGRST202' } }))).toEqual({
      status: 'missing'
    });
    expect(await fetchPackagingRules(client({ error: { code: '42883' } }))).toEqual({
      status: 'missing'
    });
  });

  it('answers failed, not missing, for a bare 404, a refusal, a lost connection or an odd answer', async () => {
    expect(await fetchPackagingRules(client({ error: { code: '' }, status: 404 }))).toEqual({
      status: 'failed'
    });
    expect(await fetchPackagingRules(client({ error: { code: '42501' } }))).toEqual({
      status: 'failed'
    });
    expect(await fetchPackagingRules(client(new Error('network')))).toEqual({ status: 'failed' });
    expect(await fetchPackagingRules(client({ data: { rules: 3 } }))).toEqual({
      status: 'failed'
    });
  });
});

describe('savePackagingRules', () => {
  it('sends exactly box_size, container, item_id, per and qty, with box_size null unless a box', async () => {
    const c = client({ data: [{ updated_at: STAMP }] });
    const out = await savePackagingRules(
      c,
      [
        rule(),
        rule({ container: 'loose', boxSize: 6, itemId: 'item-b', qty: 2, per: 'cookie' }),
        rule({ container: 'order', boxSize: null, itemId: 'item-c' }),
        rule({ container: 'bazaar_sale', boxSize: 12, itemId: 'item-d' })
      ],
      STAMP
    );
    expect(out).toEqual({ outcome: 'saved', updatedAt: STAMP });
    const [name, args] = c.calls.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(name).toBe('save_packaging_rules');
    expect(args.p_expected_updated_at).toBe(STAMP);
    const sent = args.p_rules as Array<Record<string, unknown>>;
    for (const r of sent)
      expect(Object.keys(r).sort()).toEqual(['box_size', 'container', 'item_id', 'per', 'qty']);
    expect(sent.map((r) => r.box_size)).toEqual([6, null, null, null]);
    expect(sent[1]).toEqual({
      box_size: null,
      container: 'loose',
      item_id: 'item-b',
      per: 'cookie',
      qty: 2
    });
  });

  it('sends a null stamp for the first save', async () => {
    const c = client({ data: [{ updated_at: STAMP }] });
    await savePackagingRules(c, [rule()], null);
    const args = (c.calls.mock.calls[0] as unknown as [string, Record<string, unknown>])[1];
    expect(args.p_expected_updated_at).toBeNull();
  });

  it('answers conflict for a stale stamp (P0002)', async () => {
    const out = await savePackagingRules(client({ error: { code: 'P0002' } }), [rule()], STAMP);
    expect(out).toEqual({ outcome: 'conflict' });
  });

  it('answers refused with the database message', async () => {
    const out = await savePackagingRules(
      client({
        error: { code: '22023', message: 'an item is listed twice for the same container' }
      }),
      [rule()],
      STAMP
    );
    expect(out).toEqual({
      outcome: 'refused',
      message: 'an item is listed twice for the same container'
    });
  });

  it('answers offline when the call throws or the connection is lost', async () => {
    expect(await savePackagingRules(client(new Error('network')), [rule()], STAMP)).toEqual({
      outcome: 'offline'
    });
    expect(await savePackagingRules(client({ error: { code: '08006' } }), [rule()], STAMP)).toEqual(
      {
        outcome: 'offline'
      }
    );
  });

  it('answers missing for a database without the function, not for a bare 404', async () => {
    expect(
      await savePackagingRules(client({ error: { code: 'PGRST202' } }), [rule()], null)
    ).toEqual({
      outcome: 'missing'
    });
    expect(
      await savePackagingRules(client({ error: { code: '' }, status: 404 }), [rule()], null)
    ).toEqual({ outcome: 'offline' });
  });
});

describe('savePackagingLines', () => {
  const lines = [
    { itemId: 'item-a', qty: 1 },
    { itemId: 'item-b', qty: 0.25 }
  ];

  it('sends exactly product_id and lines of item_id and qty, with the recipe stamp', async () => {
    const c = client({ data: [{ product_id: 'p1', version: 4, updated_at: STAMP }] });
    const out = await savePackagingLines(c, 'p1', lines, STAMP);
    expect(out).toEqual({ outcome: 'saved', version: 4, updatedAt: STAMP });
    const [name, args] = c.calls.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(name).toBe('save_recipe_packaging');
    expect(args.p_expected_updated_at).toBe(STAMP);
    const recipe = args.p_recipe as { product_id: string; lines: Array<Record<string, unknown>> };
    expect(Object.keys(recipe).sort()).toEqual(['lines', 'product_id']);
    expect(recipe.product_id).toBe('p1');
    for (const l of recipe.lines) expect(Object.keys(l).sort()).toEqual(['item_id', 'qty']);
  });

  it('maps the same outcomes: conflict, refused with message, offline, missing', async () => {
    expect(
      await savePackagingLines(client({ error: { code: 'P0002' } }), 'p1', lines, STAMP)
    ).toEqual({
      outcome: 'conflict'
    });
    expect(
      await savePackagingLines(
        client({ error: { code: '22023', message: 'an item is listed twice' } }),
        'p1',
        lines,
        STAMP
      )
    ).toEqual({ outcome: 'refused', message: 'an item is listed twice' });
    expect(await savePackagingLines(client(new Error('x')), 'p1', lines, STAMP)).toEqual({
      outcome: 'offline'
    });
    expect(
      await savePackagingLines(client({ error: { code: '42883' } }), 'p1', lines, STAMP)
    ).toEqual({ outcome: 'missing' });
  });
});

describe('packagingRulesError', () => {
  it('accepts a good set and the empty set', () => {
    expect(packagingRulesError([rule(), rule({ itemId: 'item-b' })])).toBeNull();
    expect(packagingRulesError([])).toBeNull();
  });

  it('mirrors the database bounds', () => {
    expect(packagingRulesError([rule({ boxSize: 1 })])).not.toBeNull();
    expect(packagingRulesError([rule({ boxSize: 49 })])).not.toBeNull();
    expect(packagingRulesError([rule({ boxSize: 2.5 })])).not.toBeNull();
    expect(packagingRulesError([rule({ boxSize: null })])).not.toBeNull();
    expect(packagingRulesError([rule({ container: 'loose', boxSize: 6 })])).not.toBeNull();
    expect(packagingRulesError([rule({ qty: 0 })])).not.toBeNull();
    expect(packagingRulesError([rule({ qty: 1_000_000 })])).not.toBeNull();
    expect(packagingRulesError([rule({ qty: 0.0005 })])).not.toBeNull();
    expect(packagingRulesError([rule({ itemId: '' })])).not.toBeNull();
    expect(packagingRulesError([rule(), rule()])).not.toBeNull();
    expect(
      packagingRulesError(Array.from({ length: 81 }, (_, i) => rule({ itemId: 'i' + i })))
    ).not.toBeNull();
  });

  it('allows the same item in two different containers', () => {
    expect(
      packagingRulesError([
        rule(),
        rule({ boxSize: 12 }),
        rule({ container: 'order', boxSize: null })
      ])
    ).toBeNull();
  });
});

describe('packagingLinesError', () => {
  it('accepts good lines and none', () => {
    expect(
      packagingLinesError([
        { itemId: 'a', qty: 1 },
        { itemId: 'b', qty: 0.25 }
      ])
    ).toBeNull();
    expect(packagingLinesError([])).toBeNull();
  });

  it('mirrors the database bounds', () => {
    expect(packagingLinesError([{ itemId: '', qty: 1 }])).not.toBeNull();
    expect(packagingLinesError([{ itemId: 'a', qty: 0 }])).not.toBeNull();
    expect(packagingLinesError([{ itemId: 'a', qty: 1_000_000 }])).not.toBeNull();
    expect(packagingLinesError([{ itemId: 'a', qty: 0.0001 }])).not.toBeNull();
    expect(
      packagingLinesError([
        { itemId: 'a', qty: 1 },
        { itemId: 'a', qty: 2 }
      ])
    ).not.toBeNull();
    expect(
      packagingLinesError(Array.from({ length: 81 }, (_, i) => ({ itemId: 'i' + i, qty: 1 })))
    ).not.toBeNull();
  });
});

describe('the recipes read carries packaging', () => {
  const recipe = (over: Record<string, unknown> = {}) => ({
    product_id: 'p1',
    yield: 12,
    version: 2,
    updated_at: STAMP,
    lines: [],
    history: [],
    ...over
  });

  it('is an empty list on a database that does not send it', () => {
    expect(parseRecipes([recipe()] as Json)?.[0]?.packaging).toEqual([]);
  });

  it('reads name, item id, quantity and unit', () => {
    const got = parseRecipes([
      recipe({ packaging: [{ name: 'Item A', item_id: 'item-a', qty: 1, unit: 'pcs' }] })
    ] as Json);
    expect(got?.[0]?.packaging).toEqual([
      { name: 'Item A', itemId: 'item-a', qty: 1, unit: 'pcs' }
    ]);
  });

  it('is no list at all when a packaging line is malformed', () => {
    expect(parseRecipes([recipe({ packaging: [{ name: 'x' }] })] as Json)).toBeNull();
    expect(parseRecipes([recipe({ packaging: 'x' })] as Json)).toBeNull();
  });
});
