import { describe, expect, it, vi } from 'vitest';
import {
  engineRecipes,
  fetchRecipes,
  parseRecipes,
  recipeError,
  saveRecipe,
  type RecipeClient,
  type RecipeFields
} from '@/lib/data/recipes';

/**
 * A4: Cine's recipes with versions, as pure functions and the RPC wrappers. Each `Mutation:` line names a change one of these
 * tests must catch (each was applied and seen to fail).
 */
const STAMP = '2026-09-30T02:00:00.123456+00:00';

const wire = (over: Record<string, unknown> = {}) => ({
  product_id: 'dcf',
  yield: 24,
  version: 3,
  updated_at: STAMP,
  lines: [
    { name: 'Unsalted butter', qty: 320, unit: 'g' },
    { name: 'Eggs', qty: 2, unit: 'pcs' }
  ],
  history: [
    { version: 1, yield: 24, lines: [{ name: 'Unsalted butter', qty: 300, unit: 'g' }] },
    { version: 2, yield: 20, lines: [{ name: 'Unsalted butter', qty: 310.5, unit: 'g' }] }
  ],
  ...over
});
const fields = (over: Partial<RecipeFields> = {}): RecipeFields => ({
  productId: 'dcf',
  yield: 24,
  lines: [
    { name: 'Unsalted butter', qty: 320, unit: 'g' },
    { name: 'Eggs', qty: 2, unit: 'pcs' }
  ],
  ...over
});

describe('parseRecipes', () => {
  it('reads a recipe with its lines and the versions it replaced, oldest first', () => {
    expect(parseRecipes([wire()])).toEqual([
      {
        productId: 'dcf',
        yield: 24,
        version: 3,
        updatedAt: STAMP,
        lines: [
          { name: 'Unsalted butter', qty: 320, unit: 'g' },
          { name: 'Eggs', qty: 2, unit: 'pcs' }
        ],
        history: [
          { version: 1, yield: 24, lines: [{ name: 'Unsalted butter', qty: 300, unit: 'g' }] },
          { version: 2, yield: 20, lines: [{ name: 'Unsalted butter', qty: 310.5, unit: 'g' }] }
        ]
      }
    ]);
    expect(parseRecipes([])).toEqual([]);
    expect(parseRecipes([wire({ lines: [], history: [] })])![0]).toMatchObject({
      lines: [],
      history: []
    });
  });

  it('refuses anything unexpected, so the recipes screen never shows a half-read recipe', () => {
    for (const bad of [
      null,
      {},
      'x',
      [null],
      [wire({ product_id: 5 })],
      [wire({ yield: 0 })],
      [wire({ yield: 1.5 })],
      [wire({ version: 0 })],
      [wire({ updated_at: 1 })],
      [wire({ lines: [{ name: 'x', qty: '1', unit: 'g' }] })],
      [wire({ lines: [{ name: 'x', qty: 1 }] })],
      [wire({ lines: 'x' })],
      [wire({ history: 'x' })],
      [wire({ history: [{ version: 1, yield: 2 }] })],
      [wire({ history: [{ version: 'a', yield: 2, lines: [] }] })]
    ])
      expect(parseRecipes(bad as never)).toBeNull();
    // Mutation: accepting a line with a text quantity puts NaN into the cost per cookie.
  });
});

describe('recipeError mirrors the database bounds', () => {
  it('accepts a sound recipe, an empty one, the smallest and the largest amounts', () => {
    expect(recipeError(fields())).toBeNull();
    expect(recipeError(fields({ lines: [] }))).toBeNull();
    expect(
      recipeError(
        fields({
          lines: [
            { name: 'a', qty: 0.001, unit: 'g' },
            { name: 'b', qty: 999_999, unit: 'ml' }
          ]
        })
      )
    ).toBeNull();
    expect(recipeError(fields({ yield: 10000 }))).toBeNull();
  });

  it.each([
    ['a yield of zero', fields({ yield: 0 }), 'whole number'],
    ['a fractional yield', fields({ yield: 1.5 }), 'whole number'],
    ['a yield over 10000', fields({ yield: 10001 }), 'whole number'],
    [
      '81 ingredients',
      fields({
        lines: Array.from({ length: 81 }, (_, i) => ({ name: 'n' + i, qty: 1, unit: 'g' }))
      }),
      'at most 80'
    ],
    ['a blank name', fields({ lines: [{ name: '  ', qty: 1, unit: 'g' }] }), 'name'],
    ['a name of 81', fields({ lines: [{ name: 'n'.repeat(81), qty: 1, unit: 'g' }] }), 'name'],
    ['a control character', fields({ lines: [{ name: 'a\u0007', qty: 1, unit: 'g' }] }), 'name'],
    ['an amount of zero', fields({ lines: [{ name: 'x', qty: 0, unit: 'g' }] }), 'above 0'],
    ['a negative amount', fields({ lines: [{ name: 'x', qty: -1, unit: 'g' }] }), 'above 0'],
    [
      'an amount that is not a number',
      fields({ lines: [{ name: 'x', qty: Number.NaN, unit: 'g' }] }),
      'above 0'
    ],
    ['four decimals', fields({ lines: [{ name: 'x', qty: 1.2345, unit: 'g' }] }), 'above 0'],
    ['a million', fields({ lines: [{ name: 'x', qty: 1_000_000, unit: 'g' }] }), 'above 0'],
    [
      'a unit outside g, ml and pcs',
      fields({ lines: [{ name: 'x', qty: 1, unit: 'kg' }] }),
      'g, ml or pcs'
    ],
    [
      'an ingredient twice, by trimmed name',
      fields({
        lines: [
          { name: 'x', qty: 1, unit: 'g' },
          { name: ' x ', qty: 2, unit: 'g' }
        ]
      }),
      'twice'
    ]
  ])('refuses %s', (_n, f, word) => {
    expect(recipeError(f)?.toLowerCase()).toContain(word);
    // Mutation: dropping any one of these checks sends what the database refuses; each row fails without its check.
  });
});

describe('the rpc wrappers', () => {
  const client = (result: unknown) => {
    const rpc = vi.fn(async () => result);
    return { rpc, client: { rpc } as unknown as RecipeClient };
  };

  it('fetches and parses; a failed or unreadable read throws rather than showing nothing', async () => {
    const ok = client({ data: [wire()], error: null });
    expect((await fetchRecipes(ok.client))[0]!.version).toBe(3);
    expect(ok.rpc).toHaveBeenCalledWith('get_recipes');
    await expect(
      fetchRecipes(client({ data: null, error: { code: '42501' } }).client)
    ).rejects.toThrow('42501');
    await expect(fetchRecipes(client({ data: { x: 1 }, error: null }).client)).rejects.toThrow(
      'not understood'
    );
  });

  it('a recipe goes as exactly its three keys, names trimmed, against the stamp it read (none for a new one)', async () => {
    const f = client({ data: [{ product_id: 'dcf', version: 4, updated_at: STAMP }], error: null });
    expect(
      await saveRecipe(
        f.client,
        fields({ lines: [{ name: ' Unsalted butter ', qty: 320.5, unit: 'g' }] }),
        STAMP
      )
    ).toEqual({ outcome: 'saved', version: 4, updatedAt: STAMP });
    const [name, args] = f.rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(name).toBe('save_recipe');
    expect(args.p_expected_updated_at).toBe(STAMP);
    expect(args.p_recipe).toEqual({
      product_id: 'dcf',
      yield: 24,
      lines: [{ name: 'Unsalted butter', qty: 320.5, unit: 'g' }]
    });
    await saveRecipe(f.client, fields(), null);
    expect(
      (f.rpc.mock.calls[1] as unknown as [string, Record<string, unknown>])[1].p_expected_updated_at
    ).toBeNull();
  });

  it('classifies the outcome: stale, refused, or not sent', async () => {
    const send = async (result: unknown) =>
      (await saveRecipe(client(result).client, fields(), STAMP)).outcome;
    expect(await send({ error: { code: 'P0002' } })).toBe('conflict');
    expect(await send({ error: { code: '22023' } })).toBe('refused');
    expect(await send({ error: { code: '42501' } })).toBe('refused');
    expect(await send({ error: { code: '' } })).toBe('offline');
    const throwing = {
      rpc: vi.fn(async () => Promise.reject(new Error('net')))
    } as unknown as RecipeClient;
    expect(await saveRecipe(throwing, fields(), STAMP)).toEqual({
      outcome: 'offline',
      version: null,
      updatedAt: null
    });
    // A save that succeeded but answered nothing usable still saved (the caller reads it back).
    expect(await saveRecipe(client({ data: [], error: null }).client, fields(), STAMP)).toEqual({
      outcome: 'saved',
      version: null,
      updatedAt: null
    });
    // Mutation: reading the stamp of a failed save would move the next save onto a stamp the database never made.
    expect(
      await saveRecipe(
        client({ data: [{ version: 9, updated_at: 'x' }], error: { code: 'P0002' } }).client,
        fields(),
        STAMP
      )
    ).toEqual({
      outcome: 'conflict',
      version: null,
      updatedAt: null
    });
  });
});

describe('the shapes the ported recipes screen reads', () => {
  it('gives every flavour a recipe: the saved one, or an empty one that is never the prototype’s', () => {
    const rows = parseRecipes([wire()])!;
    const s = engineRecipes(rows, ['dcf', 'wcb']);
    expect(s.recipes.dcf).toEqual({
      yield: 24,
      ing: [
        ['Unsalted butter', 320, 'g'],
        ['Eggs', 2, 'pcs']
      ]
    });
    expect(s.recipeBase.dcf).toEqual(s.recipes.dcf);
    expect(s.recipeBase.dcf).not.toBe(s.recipes.dcf);
    expect(s.recipeVer).toEqual({ dcf: 3, wcb: 1 });
    expect(s.recipes.wcb).toEqual({ yield: 1, ing: [] });
    expect(s.recipeHistory.wcb).toEqual([]);
    expect(s.recipeHistory.dcf.map((h) => [h.version, h.snap.yield, h.snap.ing])).toEqual([
      [1, 24, [['Unsalted butter', 300, 'g']]],
      [2, 20, [['Unsalted butter', 310.5, 'g']]]
    ]);
    // A recipe for a flavour that is not on the menu is left out.
    expect(Object.keys(engineRecipes(rows, ['wcb']).recipes)).toEqual(['wcb']);
    // Mutation: a recipe for a missing flavour left as the prototype's shows demo ingredients and a demo cost.
  });
});
