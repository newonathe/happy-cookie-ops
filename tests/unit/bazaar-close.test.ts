import { describe, expect, it, vi } from 'vitest';
import {
  addBazaarDayStock,
  closeBazaarDay,
  closeBody,
  feeError,
  finaliseBazaar,
  lossError,
  parseBazaar,
  saveBazaarCost,
  saveBazaarFee,
  saveBazaarLoss,
  saveBazaarTarget,
  type BazaarClient,
  type DayClose
} from '@/lib/data/bazaar-days';
import { parseBooks } from '@/lib/data/books';
import example from '../fixtures/bazaar-example.json';

/**
 * S3: the data layer for everything after selling. The fixture is the hand-worked two-day example in the header of
 * `tests/integration/security/bazaar-days.sql`, as `get_bazaar` answers it once both days are closed: the database is
 * held to those figures there, and the parser is held to them here, to the centavo. Each `Mutation:` line names a change
 * one of these tests must catch.
 */
const BOOKING = 'b0d0b000-0000-4000-8000-000000000001';
const DAY1 = 'b0d0d000-0000-4000-8000-000000000011';
const clone = () => JSON.parse(JSON.stringify(example)) as typeof example;
const sum = (parts: ReadonlyArray<{ amountCents: number | null }>) =>
  parts.reduce((t, p) => t + (p.amountCents ?? 0), 0);

describe('the hand-worked example, as the parser reads it', () => {
  const b = parseBazaar(example as never)!;

  it('is understood whole', () => {
    expect(b).not.toBeNull();
    expect(b.days.map((d) => d.state)).toEqual(['closed', 'closed']);
    expect(b.counted).toBe(true);
  });

  it('revenue: 880.00 on day 1 and 870.00 on day 2 make 1,750.00, by how it was paid', () => {
    expect(b.days.map((d) => d.revenueCents)).toEqual([88000, 87000]);
    expect(b.revenue.revenueCents).toBe(175000);
    expect(b.revenue.byPay).toEqual({ Cash: 98000, GCash: 38000, Maya: 39000 });
    // Gross less discounts less freebies at their price is the revenue.
    expect(b.revenue.grossCents - b.revenue.discountCents - b.revenue.freebieCents).toBe(175000);
    expect(b.revenue).toMatchObject({ sales: 7, voided: 1 });
  });

  it('cash: day 1 is 5.00 short of 1,000.00 expected, day 2 is exact', () => {
    expect(b.days[0]).toMatchObject({
      cashExpectedCents: 100000,
      countedCents: 99500,
      overCents: 0,
      shortCents: 500
    });
    expect(b.days[1]).toMatchObject({
      cashExpectedCents: 78000,
      countedCents: 78000,
      overCents: 0,
      shortCents: 0
    });
    expect(b.cash).toEqual({ overCents: 0, shortCents: 500 });
  });

  it('fees: the rent, the permit and day 1 parking are 800.00, 750.00 of it for the whole event', () => {
    expect(b.fees.totalCents).toBe(80000);
    expect(b.fees.eventCents).toBe(75000);
    expect(b.fees.parts.map((p) => [p.label, p.amountCents, p.dayId])).toEqual([
      ['Stall rent', 50000, null],
      ['Permit', 25000, null],
      ['Parking', 5000, DAY1]
    ]);
    expect(b.feesCents).toBe(80000);
  });

  it('cookie cost: 555.62, each flavour line rounded half up, the parts adding up with the rounding', () => {
    expect(b.cookieCost.cents).toBe(55562);
    expect(b.cookieCost.madeCents! - b.cookieCost.toShopCents!).toBe(55562);
    expect(sum(b.cookieCost.parts)).toBe(55562);
    expect(b.cookieCost.parts.map((p) => [p.label, p.quantity, p.amountCents])).toEqual([
      ['Sold', 14, 21431],
      ['Given away', 2, 4076],
      ['Lost', 2, 2201],
      ['Written off', 12, 22780],
      ['Not accounted', 3, 5076],
      ['Rounding', null, -2]
    ]);
    const a = b.cookieCost.lines.find((l) => l.productId === 'mp0s-a')!;
    // 32 x 1200.5 = 38416; 13 to the shop x 1200.5 = 15606.5, half up 15607.
    expect(a).toMatchObject({
      unitCents: 1200.5,
      source: 'recipe',
      madeCents: 38416,
      toShopCents: 15607,
      costCents: 22809,
      roundingCents: -3
    });
    expect(b.cookieCost.lines.find((l) => l.productId === 'mp0s-b')).toMatchObject({
      unitCents: 2875.25,
      source: 'typed',
      costCents: 28753,
      roundingCents: 1
    });
  });

  it('profit: 1,750.00 - 800.00 - 555.62 - 5.00 short = 389.38, 110.62 under the 500.00 target', () => {
    expect(b.profit.cents).toBe(38938);
    expect(sum(b.profit.parts)).toBe(38938);
    expect(b.target).toEqual({ cents: 50000, againstCents: -11062, revenueNeededCents: 11062 });
  });

  it("her count: day 1's flavour A is 13 left as 8 carried, 3 to the shop, 2 written off, 1 not accounted", () => {
    expect(b.days[0]!.count!.find((c) => c.productId === 'mp0s-a')).toEqual({
      productId: 'mp0s-a',
      left: 13,
      carryNext: 8,
      toShop: 3,
      writtenOff: 2,
      notAccounted: 1
    });
    // Every flavour of the day is counted, the one with no stock too.
    expect(b.days[0]!.count!.map((c) => c.productId)).toEqual([
      'mp0s-a',
      'mp0s-b',
      'mp0s-c',
      'mp0s-d'
    ]);
  });
});

describe('an unknown cost is never a zero', () => {
  const unknown = () => {
    const j = clone() as unknown as Record<string, never>;
    const s = (j as unknown as { summary: Record<string, Record<string, unknown>> }).summary;
    const why = 'no cost per cookie for: Fixture C';
    s.cookie_cost!.cents = null;
    s.cookie_cost!.why = why;
    s.cookie_cost!.made_cents = null;
    s.cookie_cost!.to_shop_cents = null;
    s.profit!.cents = null;
    s.profit!.why = why;
    s.target!.against_cents = null;
    s.target!.revenue_needed_cents = null;
    return j;
  };

  it('keeps cookie cost, profit and the target figures null, with the why', () => {
    const b = parseBazaar(unknown())!;
    expect(b.cookieCost).toMatchObject({
      cents: null,
      why: 'no cost per cookie for: Fixture C'
    });
    expect(b.profit).toMatchObject({ cents: null, why: 'no cost per cookie for: Fixture C' });
    expect(b.target).toEqual({ cents: 50000, againstCents: null, revenueNeededCents: null });
    // Mutation: `cents ?? 0` anywhere in the parser fails here.
  });

  it('refuses an unknown cookie cost that does not say why', () => {
    const j = unknown() as unknown as { summary: { cookie_cost: { why: unknown } } };
    j.summary.cookie_cost.why = null;
    expect(parseBazaar(j as never)).toBeNull();
  });

  it('refuses a flavour marked as having no cost that carries a cost of 0', () => {
    const j = clone();
    const line = j.summary.cookie_cost.lines[2]! as Record<string, unknown>;
    line.uncosted = true;
    line.unit_cents = null;
    expect(parseBazaar(j as never)).toBeNull();
    // Mutation: dropping the uncosted check lets a ₱0 cost through for cookies whose cost nobody knows.
  });
});

describe('parseBazaar refuses a malformed S3 answer as no answer at all', () => {
  const cases: Array<[string, (j: ReturnType<typeof clone>) => void]> = [
    [
      'a closed day with no count',
      (j) => void ((j.summary.days[0] as { count: unknown }).count = null)
    ],
    ['a count that leaves a flavour out', (j) => void j.summary.days[0]!.count.pop()],
    [
      'a count for a flavour that is not on the day',
      (j) => void (j.summary.days[0]!.count[0]!.product_id = 'mp0s-z')
    ],
    ['a fractional count', (j) => void (j.summary.days[0]!.count[0]!.left = 12.5)],
    ['negative takings by how paid', (j) => void (j.summary.revenue.by_pay.Cash = -1)],
    ['a fee of nothing', (j) => void (j.summary.fees.parts[1]!.amount_cents = 0)],
    ['a fractional cookie cost', (j) => void (j.summary.cookie_cost.cents = 55562.5)],
    [
      'a part with a text amount',
      (j) => void ((j.summary.profit.parts[0] as { amount_cents: unknown }).amount_cents = '175000')
    ],
    [
      'a cost source it does not know',
      (j) => void (j.summary.cookie_cost.lines[0]!.source = 'guess')
    ],
    ['no counted flag', (j) => void delete (j.summary as { counted?: boolean }).counted],
    ['a loss of nothing', (j) => void (j.losses[0]!.qty = 0)],
    ['no costs list', (j) => void delete (j as { costs?: unknown }).costs],
    [
      'a finalised event with no stored summary',
      (j) => void ((j as { finalised_at: unknown }).finalised_at = '2026-10-26T01:00:00+00:00')
    ]
  ];
  it.each(cases)('%s', (_name, change) => {
    const j = clone();
    change(j);
    expect(parseBazaar(j as never)).toBeNull();
    // Mutation: a parser that skips any one of these checks fails the matching row.
  });

  it('reads a finalised event with the summary that was booked', () => {
    const j = clone() as unknown as Record<string, unknown>;
    j.finalised_at = '2026-10-26T01:00:00+00:00';
    j.final_hash = example.summary.hash;
    j.final_summary = example.summary;
    const b = parseBazaar(j as never)!;
    expect(b.finalised).toBe(true);
    expect(b.finalSummary!.profit.cents).toBe(38938);
    expect(b.finalSummary!.hash).toBe(example.summary.hash);
  });
});

const HASH = 'c'.repeat(64);
const close = (over: Partial<DayClose> = {}): DayClose => ({
  dayId: DAY1,
  at: 1_792_846_800_000,
  countedCents: 99500,
  lines: {
    'mp0s-a': { left: 13, carryNext: 8, toShop: 3, writtenOff: 2 },
    'mp0s-d': { left: 0, carryNext: 0, toShop: 0, writtenOff: 0 }
  },
  expected: HASH,
  ...over
});
const client = (answer: { data?: unknown; error?: { code?: string } | null }) => {
  const rpc = vi.fn(async () => ({ data: answer.data ?? null, error: answer.error ?? null }));
  return { rpc, client: { rpc } as unknown as BazaarClient };
};

describe('closeBazaarDay', () => {
  it('sends exactly day_id, at, counted_cents, lines and expected, as she was shown them', async () => {
    const { rpc, client: c } = client({ data: { hash: HASH } });
    expect(await closeBazaarDay(c, close())).toBe('saved');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('close_bazaar_day', {
      p_close: {
        day_id: DAY1,
        at: 1_792_846_800_000,
        counted_cents: 99500,
        lines: {
          'mp0s-a': { left: 13, carry_next: 8, to_shop: 3, written_off: 2 },
          'mp0s-d': { left: 0, carry_next: 0, to_shop: 0, written_off: 0 }
        },
        expected: HASH
      }
    });
    expect(Object.keys(closeBody(close())).sort()).toEqual([
      'at',
      'counted_cents',
      'day_id',
      'expected',
      'lines'
    ]);
    // Mutation: an extra key, or a line renamed, is refused by the database (22023): it fails the exact body here first.
  });

  it('sends no count as null, never as 0', async () => {
    const { rpc, client: c } = client({ data: {} });
    await closeBazaarDay(c, close({ countedCents: null }));
    const body = (
      rpc.mock.calls[0] as unknown as [string, { p_close: { counted_cents: unknown } }]
    )[1];
    expect(body.p_close.counted_cents).toBeNull();
  });

  it.each([
    ['40001', 'stale'],
    ['55000', 'refused'],
    ['22023', 'refused'],
    ['23505', 'refused'],
    ['42501', 'refused'],
    ['08006', 'offline']
  ])('answers %s as %s', async (code, wanted) => {
    const { client: c } = client({ error: { code } });
    expect(await closeBazaarDay(c, close())).toBe(wanted);
    // Mutation: treating 40001 as offline would send the same stale close again on a retry.
  });

  it('is not saved when the reply is not the summary, or the call throws', async () => {
    expect(await closeBazaarDay(client({ data: null }).client, close())).toBe('offline');
    const thrower = {
      rpc: vi.fn(async () => {
        throw new Error('network');
      })
    } as unknown as BazaarClient;
    expect(await closeBazaarDay(thrower, close())).toBe('offline');
  });

  it('asks the database nothing for a close with no hash or a count below zero', async () => {
    const { rpc, client: c } = client({ data: {} });
    expect(await closeBazaarDay(c, close({ expected: 'nope' }))).toBe('refused');
    expect(await closeBazaarDay(c, close({ countedCents: -1 }))).toBe('refused');
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('finaliseBazaar', () => {
  it('sends the hash she was shown and the drop the shop cookies belong to', async () => {
    const { rpc, client: c } = client({ data: { hash: HASH } });
    expect(await finaliseBazaar(c, BOOKING, HASH, 32)).toBe('saved');
    expect(rpc).toHaveBeenCalledWith('finalise_bazaar', {
      p_booking: BOOKING,
      p_expected: HASH,
      p_drop: 32
    });
  });

  it('a changed event is stale, a day still open is refused', async () => {
    expect(
      await finaliseBazaar(client({ error: { code: '40001' } }).client, BOOKING, HASH, 32)
    ).toBe('stale');
    expect(
      await finaliseBazaar(client({ error: { code: '55000' } }).client, BOOKING, HASH, 32)
    ).toBe('refused');
  });
});

describe('losses, fees, costs, the target and more stock', () => {
  const loss = {
    clientId: 'loss:11111111-1111-4111-8111-111111111111',
    dayId: DAY1,
    productId: 'mp0s-a',
    qty: 1,
    reason: ' Dropped ',
    at: 1_792_830_000_000
  };
  const fee = {
    clientId: 'fee:22222222-2222-4222-8222-222222222222',
    scheduledId: BOOKING,
    dayId: null,
    label: ' Permit ',
    category: 'Bazaar fees',
    amountCents: 25000,
    paidOn: '2026-10-24'
  };

  it('a loss is sent exactly, trimmed, under its own id and time', async () => {
    const { rpc, client: c } = client({ data: [{ client_id: loss.clientId, duplicate: false }] });
    expect(lossError(loss)).toBeNull();
    expect(await saveBazaarLoss(c, loss)).toBe('saved');
    expect(rpc).toHaveBeenCalledWith('save_bazaar_loss', {
      p_loss: {
        client_id: loss.clientId,
        day_id: DAY1,
        product_id: 'mp0s-a',
        qty: 1,
        reason: 'Dropped',
        at: 1_792_830_000_000
      }
    });
  });

  it('a loss needs a whole quantity and a reason', () => {
    expect(lossError({ ...loss, qty: 0 })).not.toBeNull();
    expect(lossError({ ...loss, qty: 1.5 })).not.toBeNull();
    expect(lossError({ ...loss, reason: '  ' })).not.toBeNull();
  });

  it('a fee is sent exactly; the id kept for the stall rent is never used', async () => {
    const { rpc, client: c } = client({});
    expect(feeError(fee)).toBeNull();
    expect(await saveBazaarFee(c, fee)).toBe('saved');
    expect(rpc).toHaveBeenCalledWith('save_bazaar_fee', {
      p_fee: {
        client_id: fee.clientId,
        scheduled_id: BOOKING,
        day_id: null,
        label: 'Permit',
        category: 'Bazaar fees',
        amount_cents: 25000,
        paid_on: '2026-10-24'
      }
    });
    expect(feeError({ ...fee, clientId: 'rent:' + BOOKING })).not.toBeNull();
    expect(feeError({ ...fee, amountCents: 0 })).not.toBeNull();
    expect(feeError({ ...fee, paidOn: '2026-02-30' })).not.toBeNull();
  });

  it('a typed cost goes as centavos with its decimals, and null goes back to the recipe', async () => {
    const { rpc, client: c } = client({});
    expect(await saveBazaarCost(c, BOOKING, 'mp0s-b', 2875.25)).toBe('saved');
    expect(await saveBazaarCost(c, BOOKING, 'mp0s-b', null)).toBe('saved');
    expect(rpc.mock.calls).toEqual([
      ['save_bazaar_cost', { p_booking: BOOKING, p_product: 'mp0s-b', p_typed_cents: 2875.25 }],
      ['save_bazaar_cost', { p_booking: BOOKING, p_product: 'mp0s-b', p_typed_cents: null }]
    ]);
    expect(await saveBazaarCost(c, BOOKING, 'mp0s-b', -1)).toBe('refused');
  });

  it('a target is whole centavos; a fraction is never sent', async () => {
    const { rpc, client: c } = client({});
    expect(await saveBazaarTarget(c, BOOKING, 50000)).toBe('saved');
    expect(await saveBazaarTarget(c, BOOKING, 500.5)).toBe('refused');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('more stock is saved only when the reply says what the day now holds', async () => {
    const add = {
      clientId: '33333333-3333-4333-8333-333333333333',
      dayId: DAY1,
      productId: 'mp0s-a',
      qty: 2,
      kind: 'made' as const
    };
    const ok = client({
      data: [{ product_id: 'mp0s-a', made_qty: 12, carried_qty: 8, loaded: 20, duplicate: false }]
    });
    expect(await addBazaarDayStock(ok.client, add)).toEqual({ result: 'saved', loaded: 20 });
    expect(ok.rpc).toHaveBeenCalledWith('add_bazaar_day_stock', {
      p_day: DAY1,
      p_product: 'mp0s-a',
      p_qty: 2,
      p_kind: 'made',
      p_client_id: add.clientId
    });
    expect(await addBazaarDayStock(client({ data: [] }).client, add)).toEqual({
      result: 'offline',
      loaded: null
    });
  });
});

describe("the books' hold", () => {
  const wire = { basis: 'bought', lines: [], receipts: [] };
  const held = [
    {
      scheduled_id: BOOKING,
      name: 'Fixture fair',
      count: 5,
      revenue_cents: 88000,
      expense_cents: 1500
    }
  ];

  it('reads a bazaar in progress with its count and sums', () => {
    expect(parseBooks({ ...wire, held } as never)?.held).toEqual([
      {
        scheduledId: BOOKING,
        name: 'Fixture fair',
        count: 5,
        revenueCents: 88000,
        expenseCents: 1500
      }
    ]);
  });

  it('none is an empty list: an answer with no key (an older database) and an empty one', () => {
    expect(parseBooks(wire as never)?.held).toEqual([]);
    expect(parseBooks({ ...wire, held: [] } as never)?.held).toEqual([]);
  });

  it('a hold that cannot be read is no books at all', () => {
    expect(parseBooks({ ...wire, held: 'x' } as never)).toBeNull();
    expect(
      parseBooks({ ...wire, held: [{ ...held[0], revenue_cents: '88000' }] } as never)
    ).toBeNull();
    // Mutation: skipping an unreadable row (as `uncosted` does) would show totals with money silently missing.
  });
});
