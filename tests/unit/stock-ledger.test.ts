import { describe, expect, it, vi } from 'vitest';
import {
  enginePaid,
  fetchLastPaid,
  movementError,
  parseLastPaid,
  recordStockMovement,
  type LedgerClient,
  type MovementFields
} from '@/lib/data/stock-ledger';

/**
 * C1: the stock ledger's pure functions and the RPC wrappers. Each `Mutation:` line names a change one of these tests must
 * catch (each was applied and seen to fail).
 */
const ID = 'c1a00000-0000-4000-8000-000000000001';
const AT = 1_790_000_000_000;

const mv = (over: Partial<MovementFields> = {}): MovementFields => ({
  id: ID,
  itemId: 'butter',
  kind: 'receipt',
  qty: 1000,
  costCents: 42000,
  supplier: 'S&R Membership',
  reason: '',
  at: AT,
  ...over
});

describe('movementError mirrors the database bounds', () => {
  it('accepts each kind in its shape', () => {
    expect(movementError(mv())).toBeNull();
    expect(movementError(mv({ kind: 'receipt', costCents: null }))).toBeNull();
    expect(movementError(mv({ kind: 'receipt', costCents: 0 }))).toBeNull();
    expect(movementError(mv({ kind: 'opening', costCents: null, qty: 1 }))).toBeNull();
    expect(movementError(mv({ kind: 'count', costCents: null, qty: 0 }))).toBeNull();
    expect(
      movementError(mv({ kind: 'waste', costCents: null, qty: 15, reason: 'dropped' }))
    ).toBeNull();
    expect(
      movementError(mv({ kind: 'adjust', costCents: null, qty: -3.5, reason: 'lost' }))
    ).toBeNull();
    expect(movementError(mv({ qty: 0.001, costCents: null }))).toBeNull();
  });

  it.each([
    ['an id that is not a uuid', mv({ id: 'x' }), 'no id'],
    ['no item', mv({ itemId: '' }), 'no id'],
    ['a kind it does not know', mv({ kind: 'sale' as never }), 'kind'],
    ['four decimals', mv({ qty: 1.2345 }), 'decimals'],
    ['a quantity that is not a number', mv({ qty: Number.NaN }), 'decimals'],
    ['a billion', mv({ qty: 1_000_000_000 }), 'decimals'],
    ['a receipt of zero', mv({ qty: 0 }), 'above 0'],
    ['a negative receipt', mv({ qty: -1 }), 'above 0'],
    ['an opening of zero', mv({ kind: 'opening', costCents: null, qty: 0 }), 'above 0'],
    ['a waste of zero', mv({ kind: 'waste', costCents: null, qty: 0, reason: 'x' }), 'above 0'],
    ['a negative count', mv({ kind: 'count', costCents: null, qty: -1 }), 'below 0'],
    [
      'an adjustment of zero',
      mv({ kind: 'adjust', costCents: null, qty: 0, reason: 'x' }),
      'add or subtract'
    ],
    ['a cost on a waste', mv({ kind: 'waste', qty: 1, reason: 'x', costCents: 100 }), 'delivery'],
    ['a negative cost', mv({ costCents: -1 }), 'cost'],
    ['a fractional centavo', mv({ costCents: 12.5 }), 'cost'],
    ['a cost over a million pesos', mv({ costCents: 100_000_001 }), 'cost'],
    ['a supplier of 81', mv({ supplier: 's'.repeat(81) }), '80'],
    [
      'a control character in the reason',
      mv({ kind: 'waste', costCents: null, qty: 1, reason: 'a\u0007' }),
      '80'
    ],
    [
      'a waste with no reason',
      mv({ kind: 'waste', costCents: null, qty: 1, reason: '  ' }),
      'reason'
    ],
    [
      'an adjustment with no reason',
      mv({ kind: 'adjust', costCents: null, qty: 1, reason: '' }),
      'reason'
    ],
    ['a time in seconds', mv({ at: 1_790_000_000 }), 'time']
  ])('refuses %s', (_n, f, word) => {
    expect(movementError(f)?.toLowerCase()).toContain(word);
    // Mutation: dropping any one of these checks sends what the database refuses; each row fails without its check.
  });
});

describe('recordStockMovement', () => {
  const client = (result: unknown) => {
    const rpc = vi.fn(async () => result);
    return { rpc, client: { rpc } as unknown as LedgerClient };
  };

  it('sends exactly the eight keys, trimmed, and returns the quantity the database now holds', async () => {
    const f = client({
      data: [{ item_id: 'butter', on_hand: 1900, duplicate: false }],
      error: null
    });
    expect(await recordStockMovement(f.client, mv({ supplier: ' S&R Membership ' }))).toEqual({
      outcome: 'saved',
      onHand: 1900
    });
    const [name, args] = f.rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(name).toBe('record_stock_movement');
    expect(args.p_movement).toEqual({
      id: ID,
      item_id: 'butter',
      kind: 'receipt',
      qty: 1000,
      cost_cents: 42000,
      supplier: 'S&R Membership',
      reason: '',
      at: AT
    });
    // Mutation: sending a quantity key the function does not list, or not trimming, is refused (22023).
  });

  it('an empty answer is unconfirmed and must retain the retry identity', async () => {
    expect(await recordStockMovement(client({ data: [], error: null }).client, mv())).toEqual({
      outcome: 'offline',
      onHand: null
    });
  });

  it('does not acknowledge a different item or a malformed balance', async () => {
    for (const row of [
      { item_id: 'another', on_hand: 1900, duplicate: false },
      { item_id: 'butter', on_hand: -1, duplicate: false },
      { item_id: 'butter', on_hand: '1900', duplicate: false },
      { item_id: 'butter', on_hand: 1900 }
    ])
      expect(await recordStockMovement(client({ data: [row], error: null }).client, mv())).toEqual({
        outcome: 'offline',
        onHand: null
      });
  });

  it('classifies a refusal, and everything else as not sent', async () => {
    for (const code of ['22023', '23505', '42501', 'P0002'])
      expect((await recordStockMovement(client({ error: { code } }).client, mv())).outcome).toBe(
        'refused'
      );
    for (const code of ['', '57014', '08006'])
      expect((await recordStockMovement(client({ error: { code } }).client, mv())).outcome).toBe(
        'offline'
      );
    const throwing = {
      rpc: vi.fn(async () => Promise.reject(new Error('net')))
    } as unknown as LedgerClient;
    expect(await recordStockMovement(throwing, mv())).toEqual({ outcome: 'offline', onHand: null });
    // Mutation: treating a timeout as refused tells her the change was wrong when it may have been applied (a retry is safe).
  });
});

describe('what was last paid', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    item_name: 'Unsalted butter',
    cost_cents: 42000,
    qty: 1000,
    supplier: 'S&R Membership',
    at: AT,
    ...over
  });

  it('reads the rows, refuses anything unexpected, and gives the engine pesos', async () => {
    expect(parseLastPaid([row()])).toEqual([
      {
        itemName: 'Unsalted butter',
        costCents: 42000,
        qty: 1000,
        supplier: 'S&R Membership',
        at: AT
      }
    ]);
    for (const bad of [
      null,
      {},
      [null],
      [row({ cost_cents: '1' })],
      [row({ item_name: 1 })],
      [row({ at: 'x' })]
    ])
      expect(parseLastPaid(bad as never)).toBeNull();
    expect(enginePaid(parseLastPaid([row()])!)).toEqual({
      'Unsalted butter': { price: 420, qty: 1000, supplier: 'S&R Membership', at: AT }
    });
    const ok = {
      rpc: vi.fn(async () => ({ data: [row()], error: null }))
    } as unknown as LedgerClient;
    expect((await fetchLastPaid(ok))[0]!.costCents).toBe(42000);
    const down = {
      rpc: vi.fn(async () => ({ data: null, error: { code: '42501' } }))
    } as unknown as LedgerClient;
    await expect(fetchLastPaid(down)).rejects.toThrow('42501');
    // Mutation: giving the engine centavos makes every cost per cookie 100 times too big.
  });
});
