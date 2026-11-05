import { expect, it, vi } from 'vitest';
import {
  productionError,
  recordProduction,
  type ProductionClient,
  type ProductionFields
} from '@/lib/data/production';

const fields = (over: Partial<ProductionFields> = {}): ProductionFields => ({
  id: 'd0711000-0000-4000-8000-000000000001',
  kind: 'dough',
  productId: 'a',
  qty: 13,
  recipeAmount: 1,
  target: null,
  rejects: 0,
  adj: {},
  recipeVersion: 3,
  dropNo: 5,
  at: 1793836800000,
  ...over
});
const response = (over = {}) => [
  { record_id: fields().id, duplicate: false, shortfall: [], ...over }
];
const client = (rpc: unknown) => ({ rpc }) as ProductionClient;

it.each([11, 12, 13])('sends full recipe use independently of %s actual balls', async (qty) => {
  const rpc = vi.fn(async () => ({ data: response(), error: null }));
  expect(await recordProduction(client(rpc), fields({ qty }))).toEqual({
    outcome: 'saved',
    duplicate: false,
    usedDough: 0,
    shortfall: []
  });
  expect(rpc).toHaveBeenCalledExactlyOnceWith('record_dough_preparation', {
    p_rec: {
      id: fields().id,
      product_id: 'a',
      recipe_version: 3,
      recipe_amount: 1,
      balls: qty,
      drop_no: 5,
      at: fields().at
    }
  });
});
it('preserves half recipe amount and exactly retries the same UUID, time and quantities', async () => {
  const rpc = vi.fn(async () => ({
    data: response({
      duplicate: true,
      shortfall: [{ name: 'Flour', by: 10, unit: 'g', why: 'not a stock item' }]
    }),
    error: null
  }));
  const f = fields({ qty: 7, recipeAmount: 0.5 });
  expect(await recordProduction(client(rpc), f)).toMatchObject({
    outcome: 'saved',
    duplicate: true,
    shortfall: [{ name: 'Flour', by: 10, unit: 'g', why: 'not a stock item' }]
  });
  await recordProduction(client(rpc), f);
  expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
});
it('keeps old unanswered dough submissions on the old RPC with no new keys', async () => {
  const f = fields();
  delete f.recipeAmount;
  const rpc = vi.fn(async () => ({ data: [{ ...response()[0], used_dough: 0 }], error: null }));
  expect((await recordProduction(client(rpc), f)).outcome).toBe('saved');
  expect(rpc).toHaveBeenCalledExactlyOnceWith('record_production', {
    p_rec: {
      id: f.id,
      kind: 'dough',
      product_id: f.productId,
      qty: 13,
      target: null,
      rejects: 0,
      adj: {},
      recipe_version: 3,
      drop_no: 5,
      at: f.at
    }
  });
});
it.each([
  fields({ recipeAmount: 0.25 as never }),
  fields({ kind: 'batch', target: 13 }),
  fields({ qty: 0 }),
  fields({ qty: 13.5 }),
  fields({ rejects: 1 }),
  fields({ adj: { Flour: 1 } })
])('refuses invalid preparation before sending anything: %j', async (f) => {
  const rpc = vi.fn();
  expect((await recordProduction(client(rpc), f)).outcome).toBe('refused');
  expect(productionError(f)).not.toBeNull();
  expect(rpc).not.toHaveBeenCalled();
});
it.each([
  null,
  [],
  response({ record_id: 'd0711000-0000-4000-8000-000000000002' }),
  [...response(), ...response()],
  response({ shortfall: [{ name: 'Flour', by: -1, unit: 'g' }] }),
  response({ shortfall: [{ name: 'Flour', by: 1, unit: 'g', why: 'x'.repeat(129) }] }),
  response({ shortfall: Array.from({ length: 501 }, () => ({ name: 'Flour', by: 1, unit: 'g' })) })
])('never acknowledges a malformed or mismatched answer', async (data) => {
  const rpc = vi.fn(async () => ({ data, error: null }));
  expect((await recordProduction(client(rpc), fields())).outcome).toBe('offline');
});
it.each([
  ['P0002', 'stale'],
  ['23505', 'refused'],
  ['42501', 'refused'],
  ['08006', 'offline']
])('classifies %s without confirming stock', async (code, outcome) => {
  expect(
    (
      await recordProduction(
        client(async () => ({ data: null, error: { code } })),
        fields()
      )
    ).outcome
  ).toBe(outcome);
});
it.each(['PGRST202', '42883'])(
  'explains an unavailable migration without creating uncertain work (%s)',
  async (code) => {
    expect(
      await recordProduction(
        client(async () => ({ data: null, error: { code } })),
        fields()
      )
    ).toMatchObject({ outcome: 'refused', problem: 'preparation-update' });
  }
);

it('retains uncertain network outcomes and never mutates the request facts', async () => {
  const f = fields(),
    before = structuredClone(f);
  const result = await recordProduction(
    client(async () => {
      throw new Error('lost reply');
    }),
    f
  );
  expect(result.outcome).toBe('offline');
  expect(f).toEqual(before);
});
