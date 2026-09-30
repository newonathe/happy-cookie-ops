import { describe, expect, it, vi } from 'vitest';
import {
  booksCsv,
  correctionError,
  drawError,
  engineLedger,
  expenseError,
  fetchBooks,
  parseBooks,
  recordCostCorrection,
  recordDraw,
  recordExpense,
  saveCostBasis,
  type BooksClient,
  type CorrectionFields,
  type DrawFields,
  type ExpenseFields
} from '@/lib/data/books';

/**
 * E1: the books' pure functions and the RPC wrappers. Each `Mutation:` line names a change one of these tests must catch
 * (each was applied and seen to fail).
 */
const ID = 'c3e00000-0000-4000-8000-000000000001';
const MID = 'c3b00000-0000-4000-8000-0000000000b1';
const AT = 1_790_000_000_000;
const client = (rpc: unknown) => ({ rpc }) as unknown as BooksClient;

const WIRE = {
  basis: 'used',
  lines: [
    {
      id: 'o:HC-1',
      kind: 'revenue',
      cat: 'Orders',
      label: 'Order HC-1 · Ana',
      amount_cents: 20000,
      at: 2000
    },
    {
      id: 'l:1',
      kind: 'revenue',
      cat: 'Bazaar',
      label: 'Stall sale',
      amount_cents: 30000,
      at: 1000
    },
    {
      id: 'r:HC-2',
      kind: 'refund',
      cat: 'Refunds',
      label: 'Refund · order HC-2',
      amount_cents: 5000,
      at: 3000
    },
    {
      id: 'm:1',
      kind: 'expense',
      cat: 'Ingredients',
      label: 'Used: "Flour", fine',
      amount_cents: 1250,
      at: 500
    },
    {
      id: 'l:2',
      kind: 'expense',
      cat: 'Ingredients',
      label: 'Correction',
      amount_cents: -1000,
      at: 4000
    }
  ],
  receipts: [
    { movement_id: MID, item: 'Flour', qty: 1000, cost_cents: 10000, supplier: 'Landers', at: 900 }
  ]
};

describe('parseBooks', () => {
  it('reads the answer strictly', () => {
    const b = parseBooks(WIRE);
    expect(b?.basis).toBe('used');
    expect(b?.lines).toHaveLength(5);
    expect(b?.receipts[0]).toEqual({
      movementId: MID,
      item: 'Flour',
      qty: 1000,
      costCents: 10000,
      supplier: 'Landers',
      at: 900
    });
    for (const bad of [
      null,
      [],
      { ...WIRE, basis: 'sometimes' },
      { ...WIRE, lines: 'x' },
      { ...WIRE, receipts: null },
      { ...WIRE, lines: [{ ...WIRE.lines[0], kind: 'sale' }] },
      { ...WIRE, lines: [{ ...WIRE.lines[0], amount_cents: '1' }] },
      { ...WIRE, lines: [{ ...WIRE.lines[0], at: 'x' }] },
      { ...WIRE, receipts: [{ ...WIRE.receipts[0], cost_cents: null }] },
      { ...WIRE, receipts: [{ ...WIRE.receipts[0], supplier: 1 }] }
    ])
      expect(parseBooks(bad as never)).toBeNull();
  });

  it('fetchBooks asks for the period and throws on an error or an answer it cannot read', async () => {
    const rpc = vi.fn(async () => ({ data: WIRE, error: null }));
    expect((await fetchBooks(client(rpc), AT, AT + 1000)).lines).toHaveLength(5);
    expect(rpc).toHaveBeenCalledWith('get_books', {
      p_from: new Date(AT).toISOString(),
      p_to: new Date(AT + 1000).toISOString()
    });
    await expect(
      fetchBooks(
        client(async () => ({ data: null, error: { code: '42501' } })),
        AT,
        AT + 1
      )
    ).rejects.toThrow('42501');
    await expect(
      fetchBooks(
        client(async () => ({ data: [], error: null })),
        AT,
        AT + 1
      )
    ).rejects.toThrow('not understood');
  });
});

describe('engineLedger and booksCsv', () => {
  const books = parseBooks(WIRE)!;

  it('turns the lines into the engine’s entries in pesos: paid orders are booked drops, stall sales stay Bazaar', () => {
    const e = engineLedger(books.lines);
    expect(e[0]).toEqual({
      id: 'o:HC-1',
      kind: 'revenue',
      at: 2000,
      cat: 'Drops',
      label: 'Order HC-1 · Ana',
      amount: 200
    });
    expect(e[1]).toMatchObject({ kind: 'revenue', cat: 'Bazaar', amount: 300 });
    expect(e[2]).toMatchObject({ kind: 'refund', amount: 50 });
    expect(e[4]).toMatchObject({ kind: 'expense', amount: -10 }); // a correcting entry lowers a cost
    // Mutation: leaving paid orders under 'Orders' makes the P&L's booked-drops line read 0.
  });

  it('writes one CSV row per line, oldest first, quoted, in pesos with the cost basis', () => {
    const rows = booksCsv(books).trimEnd().split('\n');
    expect(rows[0]).toBe('Date,Type,Category,Description,Amount (pesos),Cost basis');
    expect(rows).toHaveLength(6);
    expect(rows[1]).toContain('"expense","Ingredients","Used: ""Flour"", fine",12.50,"used"'); // quotes are doubled, a comma stays inside its quotes
    expect(rows[5]).toContain('"expense","Ingredients","Correction",-10.00');
    expect(rows[3]?.split(',')[0]).toBe('"1970-01-01 00:00"');
    // Mutation: not doubling the quotes breaks the row for a description with a quote in it.
    // Mutation: sorting newest first reverses the file.
  });
});

const exp = (over: Partial<ExpenseFields> = {}): ExpenseFields => ({
  id: ID,
  category: 'Helper wages',
  memo: 'Week 1',
  amountCents: 50000,
  at: AT,
  ...over
});
const cor = (over: Partial<CorrectionFields> = {}): CorrectionFields => ({
  id: ID,
  movementId: MID,
  costCents: 9000,
  at: AT,
  ...over
});

describe('expenseError and correctionError mirror the database bounds', () => {
  it('accepts a normal expense and a correction to 0', () => {
    expect(expenseError(exp())).toBeNull();
    expect(expenseError(exp({ memo: '', amountCents: 1 }))).toBeNull();
    expect(
      expenseError(
        exp({ category: 'c'.repeat(60), memo: 'm'.repeat(120), amountCents: 100_000_000 })
      )
    ).toBeNull();
    expect(correctionError(cor())).toBeNull();
    expect(correctionError(cor({ costCents: 0 }))).toBeNull();
  });

  it.each([
    ['an id that is not a uuid', exp({ id: 'x' }), 'no id'],
    ['no category', exp({ category: '  ' }), 'category'],
    ['a category of 61', exp({ category: 'c'.repeat(61) }), 'category'],
    ['a memo of 121', exp({ memo: 'm'.repeat(121) }), 'category'],
    ['a control character', exp({ memo: 'a\u0007' }), 'category'],
    ['zero', exp({ amountCents: 0 }), 'amount'],
    ['a fraction of a centavo', exp({ amountCents: 10.5 }), 'amount'],
    ['over a million pesos', exp({ amountCents: 100_000_001 }), 'amount'],
    ['a time in seconds', exp({ at: 1_790_000_000 }), 'time']
  ])('refuses an expense with %s', (_l, f, text) => {
    expect(expenseError(f)).toContain(text);
    // Mutation: dropping the matching check returns null and the refusal test fails.
  });

  it.each([
    ['an id that is not a uuid', cor({ id: 'x' }), 'no id'],
    ['a movement that is not a uuid', cor({ movementId: 'x' }), 'no id'],
    ['a negative cost', cor({ costCents: -1 }), 'cost'],
    ['a fraction of a centavo', cor({ costCents: 90.5 }), 'cost'],
    ['over a million pesos', cor({ costCents: 100_000_001 }), 'cost'],
    ['a time in seconds', cor({ at: 5 }), 'time']
  ])('refuses a correction with %s', (_l, f, text) => {
    expect(correctionError(f)).toContain(text);
  });
});

describe('the RPC wrappers', () => {
  it('sends exactly the bodies (text trimmed) and reports a retry as saved', async () => {
    const rpc = vi.fn(async () => ({ data: [{ client_id: ID, duplicate: true }], error: null }));
    expect(
      await recordExpense(client(rpc), exp({ category: ' Helper wages ', memo: ' Week 1 ' }))
    ).toBe('saved');
    expect(rpc).toHaveBeenCalledWith('record_expense', {
      p_expense: { id: ID, category: 'Helper wages', memo: 'Week 1', amount_cents: 50000, at: AT }
    });
    const rpc2 = vi.fn(async () => ({
      data: [{ correction_id: ID, duplicate: false }],
      error: null
    }));
    expect(await recordCostCorrection(client(rpc2), cor())).toBe('saved');
    expect(rpc2).toHaveBeenCalledWith('record_cost_correction', {
      p_corr: { id: ID, movement_id: MID, cost_cents: 9000, at: AT }
    });
    const rpc3 = vi.fn(async () => ({ data: 'used', error: null }));
    expect(await saveCostBasis(client(rpc3), 'used')).toBe('saved');
    expect(rpc3).toHaveBeenCalledWith('set_cost_basis', { p_basis: 'used' });
  });

  it.each([
    ['22023', 'refused'],
    ['23505', 'refused'],
    ['42501', 'refused'],
    ['P0002', 'refused'],
    ['08006', 'offline'],
    [undefined, 'offline']
  ])(
    'an error %s is %s for every write; a thrown request and an unreadable answer are offline',
    async (code, outcome) => {
      const err = client(async () => ({ data: null, error: { code } }));
      expect(await recordExpense(err, exp())).toBe(outcome);
      expect(await recordCostCorrection(err, cor())).toBe(outcome);
      expect(await saveCostBasis(err, 'used')).toBe(outcome);
      const boom = client(async () => Promise.reject(new Error('net')));
      expect(await recordExpense(boom, exp())).toBe('offline');
      expect(await recordCostCorrection(boom, cor())).toBe('offline');
      expect(await saveCostBasis(boom, 'bought')).toBe('offline');
      const odd = client(async () => ({ data: [{ duplicate: 'x' }], error: null }));
      expect(await recordExpense(odd, exp())).toBe('offline');
      expect(await recordCostCorrection(odd, cor())).toBe('offline');
      expect(
        await saveCostBasis(
          client(async () => ({ data: 'bought', error: null })),
          'used'
        )
      ).toBe('offline'); // it must say what it saved
      // Mutation: treating a refusal as offline keeps a refused id alive for a retry.
    }
  );
});

const draw = (over: Partial<DrawFields> = {}): DrawFields => ({ id: ID, memo: 'Rent share', amountCents: 30000, at: AT, ...over });

describe('drawError and recordDraw', () => {
  it('accepts a draw with or without a description', () => {
    expect(drawError(draw())).toBeNull();
    expect(drawError(draw({ memo: '', amountCents: 1 }))).toBeNull();
    expect(drawError(draw({ memo: 'm'.repeat(120), amountCents: 100_000_000 }))).toBeNull();
  });

  it.each([
    ['an id that is not a uuid', draw({ id: 'x' }), 'no id'],
    ['a description of 121', draw({ memo: 'm'.repeat(121) }), 'description'],
    ['a control character', draw({ memo: 'a' }), 'description'],
    ['zero', draw({ amountCents: 0 }), 'amount'],
    ['a fraction of a centavo', draw({ amountCents: 10.5 }), 'amount'],
    ['over a million pesos', draw({ amountCents: 100_000_001 }), 'amount'],
    ['a time in seconds', draw({ at: 5 }), 'time']
  ])('refuses a draw with %s', (_l, f, text) => {
    expect(drawError(f)).toContain(text);
  });

  it('sends exactly the body and classifies the answer', async () => {
    const rpc = vi.fn(async () => ({ data: [{ client_id: ID, duplicate: true }], error: null }));
    expect(await recordDraw(client(rpc), draw({ memo: ' Rent share ' }))).toBe('saved');
    expect(rpc).toHaveBeenCalledWith('record_draw', { p_draw: { id: ID, memo: 'Rent share', amount_cents: 30000, at: AT } });
    expect(await recordDraw(client(async () => ({ data: null, error: { code: '22023' } })), draw())).toBe('refused');
    expect(await recordDraw(client(async () => ({ data: null, error: { code: '08006' } })), draw())).toBe('offline');
    expect(await recordDraw(client(async () => Promise.reject(new Error('net'))), draw())).toBe('offline');
    expect(await recordDraw(client(async () => ({ data: [{ duplicate: 'x' }], error: null })), draw())).toBe('offline');
  });

  it('a draw line becomes an engine draw entry, outside the expenses', () => {
    const e = engineLedger([{ id: 'l:3', kind: 'draw', cat: 'Owner draw', label: 'Rent share', amountCents: 10000, at: 5 }]);
    expect(e[0]).toEqual({ id: 'l:3', kind: 'draw', at: 5, cat: 'Owner drawings', label: 'Rent share', amount: 100 });
  });
});
