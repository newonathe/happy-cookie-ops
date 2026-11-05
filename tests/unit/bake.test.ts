import { expect, it, vi } from 'vitest';
import {
  recordProduction,
  productionError,
  type ProductionFields,
  type ProductionClient
} from '@/lib/data/production';

const fields = (over: Partial<ProductionFields> = {}): ProductionFields => ({
  id: 'd0721000-0000-4000-8000-000000000001',
  kind: 'batch',
  doughOnly: true,
  productId: 'a',
  qty: 8,
  target: 12,
  rejects: 2,
  adj: {},
  recipeVersion: 3,
  dropNo: 5,
  at: 1793836800000,
  ...over
});
const answer = (over = {}) => [
  { record_id: fields().id, duplicate: false, used_dough: 8, shortfall: [], ...over }
];
const client = (rpc: unknown) => ({ rpc }) as ProductionClient;

it.each([0, 2, 8])(
  'records %s rejects using only fridge dough, including all rejects',
  async (rejects) => {
    const rpc = vi.fn(async () => ({ data: answer(), error: null }));
    expect(await recordProduction(client(rpc), fields({ rejects }))).toEqual({
      outcome: 'saved',
      duplicate: false,
      usedDough: 8,
      shortfall: []
    });
    expect(rpc).toHaveBeenCalledExactlyOnceWith('record_bake', {
      p_rec: {
        id: fields().id,
        product_id: 'a',
        qty: 8,
        target: 12,
        rejects,
        recipe_version: 3,
        drop_no: 5,
        at: fields().at
      }
    });
  }
);
it('retains the exact body on a lost reply and duplicate replay', async () => {
  const f = fields(),
    before = structuredClone(f);
  const rpc = vi
    .fn()
    .mockRejectedValueOnce(Error('lost reply'))
    .mockResolvedValue({ data: answer({ duplicate: true }), error: null });
  expect((await recordProduction(client(rpc), f)).outcome).toBe('offline');
  expect(await recordProduction(client(rpc), f)).toMatchObject({
    outcome: 'saved',
    duplicate: true
  });
  expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
  expect(f).toEqual(before);
});
it.each([
  ['ZD001', 'refused', 'dough-shortage'],
  ['ZD002', 'refused', 'dough-chronology'],
  ['PGRST202', 'refused', 'bake-update'],
  ['42883', 'refused', 'bake-update'],
  ['P0002', 'stale', undefined],
  ['23505', 'refused', undefined],
  ['42501', 'refused', undefined],
  ['08006', 'offline', undefined]
])('classifies %s and never falls back to ingredients', async (code, outcome, problem) => {
  const rpc = vi.fn(async () => ({ data: null, error: { code } }));
  expect(await recordProduction(client(rpc), fields())).toMatchObject({
    outcome,
    ...(problem ? { problem } : {})
  });
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith('record_bake', expect.any(Object));
});
it.each([
  null,
  [],
  [...answer(), ...answer()],
  answer({ record_id: 'd0721000-0000-4000-8000-000000000002' }),
  answer({ used_dough: 6 }),
  answer({ used_dough: '8' }),
  answer({ shortfall: [{ name: 'Flour', by: 1, unit: 'g' }] })
])('keeps malformed or mismatched acknowledgements unresolved', async (data) => {
  expect(
    (
      await recordProduction(
        client(async () => ({ data, error: null })),
        fields()
      )
    ).outcome
  ).toBe('offline');
});
it.each([
  fields({ kind: 'dough' }),
  fields({ adj: { Flour: 1 } }),
  fields({ recipeAmount: 1 }),
  fields({ qty: 0 }),
  fields({ rejects: 9 }),
  fields({ target: null }),
  fields({ qty: 1.5 })
])('refuses invalid bake facts before any RPC', async (f) => {
  const rpc = vi.fn();
  expect(productionError(f)).not.toBeNull();
  expect((await recordProduction(client(rpc), f)).outcome).toBe('refused');
  expect(rpc).not.toHaveBeenCalled();
});
it('does not upgrade a legacy frozen bake or add keys to its old body', async () => {
  const f = fields();
  delete f.doughOnly;
  const rpc = vi.fn(async () => ({ data: answer({ used_dough: 3 }), error: null }));
  expect((await recordProduction(client(rpc), f)).outcome).toBe('saved');
  expect(rpc).toHaveBeenCalledExactlyOnceWith('record_production', {
    p_rec: {
      id: f.id,
      kind: 'batch',
      product_id: 'a',
      qty: 8,
      target: 12,
      rejects: 2,
      adj: {},
      recipe_version: 3,
      drop_no: 5,
      at: f.at
    }
  });
});

it('accepts the SQL72 maximum recipe version and refuses the next integer', async () => {
  const rpc = vi.fn(async () => ({ data: answer(), error: null }));
  const f = fields({ recipeVersion: 2147483647 });
  expect(productionError(f)).toBeNull();
  expect((await recordProduction(client(rpc), f)).outcome).toBe('saved');
  expect(productionError(fields({ recipeVersion: 2147483648 }))).not.toBeNull();
  expect((await recordProduction(client(rpc), fields({ recipeVersion: 2147483648 }))).outcome).toBe(
    'refused'
  );
  expect(rpc).toHaveBeenCalledTimes(1);
});
