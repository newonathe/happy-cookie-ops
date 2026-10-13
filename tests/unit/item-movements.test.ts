import { describe, expect, it, vi } from 'vitest';
import { fetchItemMovements } from '@/lib/data/item-movements';

/**
 * B5-1: the owner's read of one item's history (`get_item_movements`, migration 66). Read strictly, like `fetchShopIdentity`: `missing`
 * for a database before migration 66, `failed` for everything else that is not a good answer, and it never throws. Money is converted to
 * pesos in one place. Each `Mutation:` line names a change one of these tests must catch.
 */
type Answer = { data: unknown; error: unknown; status?: number };

const row = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'c0a80000-0000-4000-8000-000000000001',
  kind: 'receipt',
  qty_delta: 500,
  unit_cost: null,
  cost_source: null,
  paid_cents: 4500,
  supplier: 'S&R',
  reason: '',
  at: 1760000000000,
  ...over
});

function client(answer: Answer | (() => Answer | Promise<Answer>)) {
  const rpc = vi.fn(async () => (typeof answer === 'function' ? answer() : answer));
  return { rpc, client: { rpc } as never };
}

describe('fetchItemMovements', () => {
  it('asks for the item and the limit, and reads the rows in the order given (newest first)', async () => {
    const c = client({
      data: [row({ id: 'b', at: 2000 }), row({ id: 'a', at: 1000 })],
      error: null
    });
    const read = await fetchItemMovements(c.client, 'butter', 25);
    expect(c.rpc).toHaveBeenCalledWith('get_item_movements', { p_item: 'butter', p_limit: 25 });
    expect(read.status).toBe('ok');
    if (read.status !== 'ok') return;
    expect(read.rows.map((r) => r.id)).toEqual(['b', 'a']);
    // Mutation: sorting here (by date) would reorder what the database applied last.
  });

  it('an item with no movements is an ok empty list, not an error', async () => {
    const read = await fetchItemMovements(client({ data: [], error: null }).client, 'butter', 10);
    expect(read).toEqual({ status: 'ok', rows: [] });
  });

  it('reads every field, with money in pesos', async () => {
    const c = client({
      data: [
        row({ kind: 'receipt', qty_delta: 500, paid_cents: 4500 }),
        row({
          id: 'w',
          kind: 'waste',
          qty_delta: -20,
          unit_cost: 9.5,
          cost_source: 'average',
          paid_cents: null,
          supplier: '',
          reason: 'Dropped'
        })
      ],
      error: null
    });
    const read = await fetchItemMovements(c.client, 'butter', 10);
    if (read.status !== 'ok') throw new Error('not ok');
    expect(read.rows[0]).toEqual({
      id: 'c0a80000-0000-4000-8000-000000000001',
      kind: 'receipt',
      qtyDelta: 500,
      unitCost: null,
      costSource: null,
      paid: 45,
      supplier: 'S&R',
      reason: '',
      at: 1760000000000
    });
    expect(read.rows[1]).toMatchObject({
      kind: 'waste',
      qtyDelta: -20,
      unitCost: 0.095,
      costSource: 'average',
      paid: null,
      reason: 'Dropped'
    });
    // Mutation: reading centavos as pesos would show ₱4,500 and ₱9.50 per unit.
  });

  it('an unknown cost stays null, never 0', async () => {
    const c = client({
      data: [row({ kind: 'count', qty_delta: -30, unit_cost: null, paid_cents: null })],
      error: null
    });
    const read = await fetchItemMovements(c.client, 'butter', 10);
    if (read.status !== 'ok') throw new Error('not ok');
    expect(read.rows[0]!.unitCost).toBeNull();
    expect(read.rows[0]!.costSource).toBeNull();
    expect(read.rows[0]!.paid).toBeNull();
  });

  it('keeps a fraction of a centavo on a unit cost, and numbers that arrive as text', async () => {
    const c = client({
      data: [
        row({
          kind: 'use',
          qty_delta: '-100.5',
          unit_cost: '0.420000',
          cost_source: 'usual',
          paid_cents: null
        })
      ],
      error: null
    });
    const read = await fetchItemMovements(c.client, 'butter', 10);
    if (read.status !== 'ok') throw new Error('not ok');
    expect(read.rows[0]!.qtyDelta).toBe(-100.5);
    expect(read.rows[0]!.unitCost).toBeCloseTo(0.0042, 9);
  });

  it('every kind the database writes is read, including use', async () => {
    const kinds = ['opening', 'receipt', 'count', 'waste', 'adjust', 'use'];
    const c = client({ data: kinds.map((kind, i) => row({ id: 'k' + i, kind })), error: null });
    const read = await fetchItemMovements(c.client, 'butter', 10);
    if (read.status !== 'ok') throw new Error('not ok');
    expect(read.rows.map((r) => r.kind)).toEqual(kinds);
  });

  it('a database before migration 66 is missing (PGRST202, 42883 or HTTP 404), not failed', async () => {
    for (const answer of [
      { data: null, error: { code: 'PGRST202' }, status: 404 },
      { data: null, error: { code: '42883' } },
      { data: null, error: { code: '' }, status: 404 }
    ] as Answer[]) {
      expect(await fetchItemMovements(client(answer).client, 'butter', 10)).toEqual({
        status: 'missing'
      });
    }
    // Mutation: reporting these as failed would show "could not read" instead of nothing yet.
  });

  it('any other error is failed: a refusal, a bad limit, a server error', async () => {
    for (const code of ['42501', '22023', 'P0002', '500', undefined]) {
      expect(
        await fetchItemMovements(
          client({ data: null, error: { code }, status: 400 }).client,
          'x',
          10
        )
      ).toEqual({ status: 'failed' });
    }
  });

  it('never throws: a thrown call and a rejected promise are failed', async () => {
    const thrower = {
      rpc: vi.fn(() => {
        throw new Error('network');
      })
    } as never;
    expect(await fetchItemMovements(thrower, 'x', 10)).toEqual({ status: 'failed' });
    const rejecter = { rpc: vi.fn(() => Promise.reject(new Error('down'))) } as never;
    expect(await fetchItemMovements(rejecter, 'x', 10)).toEqual({ status: 'failed' });
  });

  it('an answer that is not a list is failed', async () => {
    for (const data of [null, undefined, {}, 'rows', 7, { rows: [] }]) {
      expect(await fetchItemMovements(client({ data, error: null }).client, 'x', 10)).toEqual({
        status: 'failed'
      });
    }
  });

  it('one malformed row fails the whole read', async () => {
    const bad: Array<Record<string, unknown>> = [
      row({ id: 7 }),
      row({ id: '' }),
      row({ kind: 'sale' }),
      row({ kind: undefined }),
      row({ qty_delta: null }),
      row({ qty_delta: 'many' }),
      row({ qty_delta: Number.POSITIVE_INFINITY }),
      row({ unit_cost: 'cheap' }),
      row({ unit_cost: 0, cost_source: 'average' }),
      row({ unit_cost: -1, cost_source: 'average' }),
      row({ cost_source: 7 }),
      row({ cost_source: 'guess' }),
      row({ unit_cost: 9, cost_source: null }),
      row({ unit_cost: null, cost_source: 'average' }),
      row({ paid_cents: 45.5 }),
      row({ paid_cents: -1 }),
      row({ paid_cents: 'lots' }),
      row({ supplier: null }),
      row({ reason: 5 }),
      row({ at: 'yesterday' }),
      row({ at: 1.5 }),
      row({ at: null })
    ];
    for (const one of bad) {
      const read = await fetchItemMovements(
        client({ data: [row({ id: 'good' }), one], error: null }).client,
        'x',
        10
      );
      expect(read, JSON.stringify(one)).toEqual({ status: 'failed' });
    }
    expect(
      await fetchItemMovements(client({ data: [row(), null], error: null }).client, 'x', 10)
    ).toEqual({ status: 'failed' });
    expect(
      await fetchItemMovements(client({ data: [row(), [1]], error: null }).client, 'x', 10)
    ).toEqual({ status: 'failed' });
  });

  it('never carries a person: only the nine fields are kept, whatever else the answer has', async () => {
    const c = client({
      data: [row({ created_by: 'b5a00000-0000-4000-8000-000000000001', payload_hash: 'abc' })],
      error: null
    });
    const read = await fetchItemMovements(c.client, 'x', 10);
    if (read.status !== 'ok') throw new Error('not ok');
    expect(Object.keys(read.rows[0]!).sort()).toEqual(
      [
        'at',
        'costSource',
        'id',
        'kind',
        'paid',
        'qtyDelta',
        'reason',
        'supplier',
        'unitCost'
      ].sort()
    );
    expect(JSON.stringify(read)).not.toContain('b5a00000');
  });
});
