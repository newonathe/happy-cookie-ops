import { describe, expect, it, vi } from 'vitest';
import {
  discardError,
  engineProduction,
  recordDiscard,
  type DiscardFields,
  fetchProduction,
  parseProduction,
  productionError,
  recordPack,
  recordProduction,
  type ProductionClient,
  type ProductionFields
} from '@/lib/data/production';

/**
 * C2: production's pure functions and the RPC wrappers. Each `Mutation:` line names a change one of these tests must catch
 * (each was applied and seen to fail).
 */
const ID = 'c2a00000-0000-4000-8000-000000000001';
const AT = 1_790_000_000_000;

const rec = (over: Partial<ProductionFields> = {}): ProductionFields => ({
  id: ID,
  kind: 'batch',
  productId: 'dcf',
  qty: 12,
  target: 12,
  rejects: 0,
  adj: {},
  recipeVersion: 3,
  dropNo: 5,
  at: AT,
  ...over
});
const client = (rpc: unknown) => ({ rpc }) as unknown as ProductionClient;

describe('productionError mirrors the database bounds', () => {
  it('accepts a batch and a dough mix in their shape', () => {
    expect(productionError(rec())).toBeNull();
    expect(productionError(rec({ adj: { Flour: 2, Butter: -50 }, rejects: 12 }))).toBeNull();
    expect(productionError(rec({ kind: 'dough', target: null, qty: 6 }))).toBeNull();
    expect(productionError(rec({ target: 0, qty: 10000 }))).toBeNull();
  });

  it.each([
    ['an id that is not a uuid', rec({ id: 'x' }), 'no id'],
    ['no flavour', rec({ productId: '' }), 'no id'],
    ['a kind it does not know', rec({ kind: 'pack' as never }), 'dough mix or a batch'],
    ['a quantity of zero', rec({ qty: 0 }), 'whole number'],
    ['a fraction', rec({ qty: 1.5 }), 'whole number'],
    ['ten thousand and one', rec({ qty: 10001 }), 'whole number'],
    ['more rejects than were baked', rec({ rejects: 13 }), 'Rejects'],
    ['a negative reject', rec({ rejects: -1 }), 'Rejects'],
    ['rejects on dough', rec({ kind: 'dough', target: null, rejects: 1 }), 'Rejects'],
    ['no plan for a batch', rec({ target: null }), 'planned'],
    ['a plan for dough', rec({ kind: 'dough', target: 6 }), 'planned'],
    ['a fractional plan', rec({ target: 1.5 }), 'planned'],
    ['a version of zero', rec({ recipeVersion: 0 }), 'version'],
    ['a negative week', rec({ dropNo: -1 }), 'version'],
    ['half a step', rec({ adj: { Flour: 0.5 } }), 'adjustment'],
    ['51 steps', rec({ adj: { Flour: 51 } }), 'adjustment'],
    ['an unnamed adjustment', rec({ adj: { '': 1 } }), 'adjustment'],
    [
      'an adjustment on dough',
      rec({ kind: 'dough', target: null, adj: { Flour: 1 } }),
      'Dough has no'
    ],
    ['a time in seconds', rec({ at: 1_790_000_000 }), 'time']
  ])('refuses %s', (_label, fields, text) => {
    expect(productionError(fields)).toContain(text);
    // Mutation: dropping the matching check in productionError returns null and the refusal test fails.
  });
});

describe('recordProduction', () => {
  const ok = {
    data: [
      {
        record_id: ID,
        duplicate: false,
        used_dough: 6,
        shortfall: [{ name: 'Butter', by: 80, unit: 'g' }]
      }
    ],
    error: null
  };

  it('sends exactly the record body and returns what the database answered', async () => {
    const rpc = vi.fn(async () => ok);
    const r = await recordProduction(client(rpc), rec({ adj: { Flour: 2 } }));
    expect(rpc).toHaveBeenCalledWith('record_production', {
      p_rec: {
        id: ID,
        kind: 'batch',
        product_id: 'dcf',
        qty: 12,
        target: 12,
        rejects: 0,
        adj: { Flour: 2 },
        recipe_version: 3,
        drop_no: 5,
        at: AT
      }
    });
    expect(r).toEqual({
      outcome: 'saved',
      duplicate: false,
      usedDough: 6,
      shortfall: [{ name: 'Butter', by: 80, unit: 'g' }]
    });
  });

  it('an identical retry is saved (answered as a duplicate), not an error', async () => {
    const r = await recordProduction(
      client(async () => ({ data: [{ ...ok.data[0], duplicate: true }], error: null })),
      rec()
    );
    expect(r.outcome).toBe('saved');
    expect(r.duplicate).toBe(true);
  });

  it.each([
    ['P0002', 'stale'],
    ['22023', 'refused'],
    ['23505', 'refused'],
    ['42501', 'refused'],
    ['23503', 'refused'],
    ['08006', 'offline'],
    ['', 'offline']
  ])('an error %s is %s', async (code, outcome) => {
    const r = await recordProduction(
      client(async () => ({ data: null, error: { code } })),
      rec()
    );
    expect(r.outcome).toBe(outcome);
    expect(r.shortfall).toEqual([]);
    // Mutation: treating P0002 as offline tells her nothing changed and keeps a stale id alive for a retry.
  });

  it('a thrown request and an answer it cannot read are both offline (nothing is assumed saved)', async () => {
    expect(
      (
        await recordProduction(
          client(async () => Promise.reject(new Error('net'))),
          rec()
        )
      ).outcome
    ).toBe('offline');
    expect(
      (
        await recordProduction(
          client(async () => ({ data: [{ ...ok.data[0], duplicate: 'x' }], error: null })),
          rec()
        )
      ).outcome
    ).toBe('offline');
    expect(
      (
        await recordProduction(
          client(async () => ({
            data: [{ ...ok.data[0], shortfall: [{ name: 1 }] }],
            error: null
          })),
          rec()
        )
      ).outcome
    ).toBe('offline');
  });
});

describe('recordPack', () => {
  it('sends the order and the week; a repeat is answered', async () => {
    const rpc = vi.fn(async () => ({
      data: [{ record_id: ID, duplicate: true, shortfall: [] }],
      error: null
    }));
    const r = await recordPack(client(rpc), 'HC-1001', 5);
    expect(rpc).toHaveBeenCalledWith('record_pack', { p_order: 'HC-1001', p_drop: 5 });
    expect(r).toEqual({ outcome: 'saved', duplicate: true, usedDough: 0, shortfall: [] });
  });

  it('refuses a bad order id or week without sending, and classifies errors', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { code: 'P0002' } }));
    expect((await recordPack(client(rpc), '', 5)).outcome).toBe('refused');
    expect((await recordPack(client(rpc), 'x'.repeat(65), 5)).outcome).toBe('refused');
    expect((await recordPack(client(rpc), 'HC-1', -1)).outcome).toBe('refused');
    expect(rpc).not.toHaveBeenCalled();
    expect((await recordPack(client(rpc), 'HC-1', 5)).outcome).toBe('stale');
    expect(
      (
        await recordPack(
          client(async () => Promise.reject(new Error('net'))),
          'HC-1',
          5
        )
      ).outcome
    ).toBe('offline');
  });
});

const WIRE = {
  batches: [
    { product_id: 'dcf', qty: 7, target: 6, rejects: 1, version: 3, at: 1000 },
    { product_id: 'hc', qty: 12, target: null, rejects: 0, version: 1, at: 2000 }
  ],
  dough: [
    { product_id: 'dcf', balls: 4, at: 500 },
    { product_id: 'hc', balls: 2, at: null }
  ],
  baked: [{ product_id: 'dcf', qty: 30 }],
  shortfalls: [
    {
      kind: 'dough',
      product_id: 'dcf',
      ref: '',
      short: [{ name: 'Butter', by: 50, unit: 'g' }],
      at: 500
    },
    {
      kind: 'batch',
      product_id: 'dcf',
      ref: '',
      short: [{ name: 'Flour', by: 1.5, unit: 'g' }],
      at: 1000
    },
    {
      kind: 'pack',
      product_id: null,
      ref: 'HC-9',
      short: [{ name: 'Brand sticker', by: 1, unit: 'pcs' }],
      at: 1500
    },
    {
      kind: 'sale',
      product_id: null,
      ref: 'abc',
      short: [{ name: 'Paper bag', by: 1, unit: 'pcs' }],
      at: 1600
    }
  ]
};

describe('parseProduction and engineProduction', () => {
  it('reads the answer strictly', () => {
    const p = parseProduction(WIRE);
    expect(p?.batches).toHaveLength(2);
    expect(p?.batches[1]?.target).toBe(12); // no plan recorded: what was baked stands in
    expect(p?.dough[1]?.at).toBeNull();
    for (const bad of [
      null,
      [],
      { ...WIRE, batches: 'x' },
      { ...WIRE, dough: [{ product_id: 'dcf', balls: 'x', at: 1 }] },
      { ...WIRE, baked: [{ product_id: 'dcf' }] },
      { ...WIRE, batches: [{ ...WIRE.batches[0], version: 'x' }] },
      { ...WIRE, shortfalls: [{ ...WIRE.shortfalls[0], short: 'x' }] },
      { ...WIRE, shortfalls: [{ ...WIRE.shortfalls[0], at: 'x' }] }
    ])
      expect(parseProduction(bad as never)).toBeNull();
  });

  it('turns what the database holds into the engine’s state keys', () => {
    const e = engineProduction(parseProduction(WIRE)!, (pid) => pid.toUpperCase());
    expect(e.batches).toEqual([
      { pid: 'dcf', qty: 7, version: 3, at: 1000, rejects: 1 },
      { pid: 'hc', qty: 12, version: 1, at: 2000, rejects: 0 }
    ]);
    expect(e.variances[0]).toEqual({ pid: 'dcf', target: 6, actual: 7, rejects: 1, at: 1000 });
    expect(e.dough).toEqual({ dcf: 4, hc: 2 });
    expect(e.doughAt).toEqual({ dcf: 500 }); // a flavour with no mix time has no entry: "Mix date not recorded"
    expect(e.baked).toEqual({ dcf: 30 });
    expect(e.shortfalls.map((s) => s.when)).toEqual([
      'Dough — DCF',
      'Bake — DCF',
      'Packing — order HC-9',
      'Bazaar sale'
    ]);
    expect(e.shortfalls[1]).toEqual({
      name: 'Flour',
      by: 1.5,
      unit: 'g',
      when: 'Bake — DCF',
      at: 1000
    });
    // Mutation: reading `version` from the recipe's current version instead of the batch's makes "baked on this version" wrong after an edit.
  });

  it('fetchProduction asks for the week and throws on an error or an answer it cannot read', async () => {
    const rpc = vi.fn(async () => ({ data: WIRE, error: null }));
    expect((await fetchProduction(client(rpc), 5)).baked).toEqual([{ productId: 'dcf', qty: 30 }]);
    expect(rpc).toHaveBeenCalledWith('get_production', { p_drop: 5 });
    await expect(
      fetchProduction(
        client(async () => ({ data: null, error: { code: '42501' } })),
        5
      )
    ).rejects.toThrow('42501');
    await expect(
      fetchProduction(
        client(async () => ({ data: [], error: null })),
        5
      )
    ).rejects.toThrow('not understood');
  });
});

const dis = (over: Partial<DiscardFields> = {}): DiscardFields => ({
  id: ID,
  kind: 'dough',
  productId: 'dcf',
  qty: 2,
  reason: 'Spoiled',
  dropNo: 5,
  at: AT,
  ...over
});

describe('discardError mirrors the database bounds', () => {
  it('accepts dough and baked cookies', () => {
    expect(discardError(dis())).toBeNull();
    expect(discardError(dis({ kind: 'baked', qty: 10000, reason: 'x'.repeat(80) }))).toBeNull();
  });

  it.each([
    ['an id that is not a uuid', dis({ id: 'x' }), 'no id'],
    ['no flavour', dis({ productId: '' }), 'no id'],
    ['a kind it does not know', dis({ kind: 'raw' as never }), 'dough or baked'],
    ['zero', dis({ qty: 0 }), 'whole number'],
    ['a fraction', dis({ qty: 1.5 }), 'whole number'],
    ['no reason', dis({ reason: '  ' }), 'reason'],
    ['a reason of 81', dis({ reason: 'x'.repeat(81) }), 'reason'],
    ['a control character in the reason', dis({ reason: 'a\u0007' }), 'reason'],
    ['a negative week', dis({ dropNo: -1 }), 'week'],
    ['a time in seconds', dis({ at: 1_790_000_000 }), 'time']
  ])('refuses %s', (_label, fields, text) => {
    expect(discardError(fields)).toContain(text);
    // Mutation: dropping the matching check returns null and the refusal test fails.
  });
});

describe('recordDiscard', () => {
  it('sends exactly the body (reason trimmed) and reports a retry as saved', async () => {
    const rpc = vi.fn(async () => ({ data: [{ record_id: ID, duplicate: true }], error: null }));
    const r = await recordDiscard(client(rpc), dis({ reason: ' Spoiled ' }));
    expect(rpc).toHaveBeenCalledWith('record_discard', {
      p_rec: { id: ID, kind: 'dough', product_id: 'dcf', qty: 2, reason: 'Spoiled', drop_no: 5, at: AT }
    });
    expect(r).toEqual({ outcome: 'saved', duplicate: true });
  });

  it.each([
    ['22023', 'refused'],
    ['23505', 'refused'],
    ['42501', 'refused'],
    ['08006', 'offline']
  ])('an error %s is %s; a thrown request and an unreadable answer are offline', async (code, outcome) => {
    expect((await recordDiscard(client(async () => ({ data: null, error: { code } })), dis())).outcome).toBe(outcome);
    expect((await recordDiscard(client(async () => Promise.reject(new Error('net'))), dis())).outcome).toBe('offline');
    expect((await recordDiscard(client(async () => ({ data: [{ duplicate: 'x' }], error: null })), dis())).outcome).toBe('offline');
    // Mutation: treating a refusal as offline keeps a refused id alive for a retry.
  });
});
