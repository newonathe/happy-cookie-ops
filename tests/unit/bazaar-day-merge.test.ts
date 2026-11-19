import { describe, expect, it } from 'vitest';
import { mergeDay, type LocalDaySale } from '@/lib/bazaar/day-merge';
import { parseBazaarDay, type DayRead, type DaySale } from '@/lib/data/bazaar-days';
import { centavosToPesos } from '@/lib/money';

/**
 * S2: the till rebuilds a selling day from the server and lays this phone's unsent sales and voids on top. Each `Mutation:` line
 * names a change one of these tests must catch.
 */
const sale = (clientId: string, over: Partial<DaySale> = {}): DaySale => ({
  clientId,
  items: { a: 1 },
  grossCents: 13000,
  discountCents: 0,
  totalCents: 13000,
  pay: 'Cash',
  ref: '',
  clerk: 'Owner',
  at: 1_767_268_800_000,
  tenderedCents: 13000,
  changeCents: 0,
  voided: false,
  voidedAt: null,
  ...over
});
const day = (sales: DaySale[], stock: Record<string, number>): DayRead => ({
  dayId: 'b0930000-0000-4000-8000-000000000001',
  bookingId: 'b0930000-0000-4000-8000-000000000002',
  day: '2026-11-19',
  eventId: 'b0930000-0000-4000-8000-000000000003',
  status: 'open',
  closedAt: null,
  floatCents: 50000,
  priceVersion: 0,
  prices: { a: 13000, b: 15000 },
  loaded: { a: 20, b: 10 },
  tableStock: stock,
  sales
});
const mine = (clientId: string, over: Partial<LocalDaySale> = {}): LocalDaySale => ({
  clientId,
  items: { a: 1 },
  gross: 130,
  discount: 0,
  total: 130,
  pay: 'Cash',
  ref: '',
  clerk: 'Owner',
  at: 1_767_268_900_000,
  tendered: 130,
  change: 0,
  state: 'pending',
  ...over
});
const merge = (server: DayRead, local: LocalDaySale[] = [], voids: string[] = []) =>
  mergeDay({ server, local, localVoids: new Set(voids), toPesos: centavosToPesos });

describe('a day from the server alone', () => {
  it('shows every sale newest first with the server stock, in pesos, and nothing unsent', () => {
    const out = merge(
      day(
        [
          sale('devA:S1:1', { at: 1_767_268_800_000 }),
          sale('devB:S1:2', {
            at: 1_767_268_860_000,
            items: { b: 2 },
            grossCents: 30000,
            totalCents: 30000
          })
        ],
        { a: 19, b: 8 }
      )
    );
    expect(out.sales.map((s) => s.clientId)).toEqual(['devB:S1:2', 'devA:S1:1']);
    expect(out.sales.map((s) => s.id)).toEqual(['S2', 'S1']);
    expect(out.sales[0]).toMatchObject({ total: 300, gross: 300, synced: true, failed: false });
    expect(out.stock).toEqual({ a: 19, b: 8 });
    expect(out.loaded).toEqual({ a: 20, b: 10 });
    expect(out.unsynced).toBe(0);
  });

  it('leaves a voided sale out of the list and its cookies on the table the server reports', () => {
    const out = merge(
      day(
        [
          sale('devA:S1:1', { voided: true, voidedAt: 1_767_268_900_000 }),
          sale('devA:S2:2', { at: 1_767_268_900_000 })
        ],
        {
          a: 19,
          b: 10
        }
      )
    );
    expect(out.sales.map((s) => s.clientId)).toEqual(['devA:S2:2']);
    // Mutation: counting voided sales as shown would list devA:S1:1 here.
    expect(out.sales[0]!.id).toBe('S2'); // the voided sale keeps its number, so nothing is renumbered
    expect(out.stock).toEqual({ a: 19, b: 10 });
  });
});

describe('this phone’s unsent sales on top', () => {
  it('shows an unsent sale as waiting and takes its cookies off the server stock', () => {
    const out = merge(day([sale('devA:S1:1')], { a: 19, b: 10 }), [
      mine('devB:S1:9', { items: { a: 2, b: 1 } })
    ]);
    expect(out.sales.map((s) => s.clientId)).toEqual(['devB:S1:9', 'devA:S1:1']);
    expect(out.sales[0]).toMatchObject({ synced: false, failed: false, total: 130 });
    expect(out.stock).toEqual({ a: 17, b: 9 });
    expect(out.unsynced).toBe(1);
  });

  it('marks a failed sale as failed, still counted and still shown', () => {
    const out = merge(day([], { a: 20, b: 10 }), [mine('devB:S1:9', { state: 'failed' })]);
    expect(out.sales[0]).toMatchObject({ synced: false, failed: true });
    expect(out.stock.a).toBe(19);
    expect(out.unsynced).toBe(1);
  });

  it('shows a sale the server acknowledged after the read was made, once, and still takes its cookies off', () => {
    // The read answered before the sale landed: its row says sent, the server's list does not have it yet.
    const out = merge(day([], { a: 20, b: 10 }), [mine('devB:S1:9', { state: 'sent' })]);
    expect(out.sales).toHaveLength(1);
    expect(out.sales[0]).toMatchObject({ synced: true });
    expect(out.stock.a).toBe(19);
    expect(out.unsynced).toBe(0);
  });

  it('collapses a sale both sides hold: the server copy stands and the cookies come off once', () => {
    const out = merge(day([sale('devB:S1:9', { items: { a: 2 } })], { a: 18, b: 10 }), [
      mine('devB:S1:9', { items: { a: 2 } })
    ]);
    expect(out.sales).toHaveLength(1);
    expect(out.sales[0]!.synced).toBe(true);
    // Mutation: subtracting the phone's copy as well would leave 16.
    expect(out.stock.a).toBe(18);
    expect(out.unsynced).toBe(0);
  });

  it('lets the server copy win when the two disagree about the same client id', () => {
    const out = merge(day([sale('devB:S1:9', { totalCents: 13000 })], { a: 19, b: 10 }), [
      mine('devB:S1:9', { total: 999 })
    ]);
    expect(out.sales[0]!.total).toBe(130);
  });

  it('numbers the sales of every device by time, so two devices never share a number', () => {
    const out = merge(
      day(
        [sale('devA:S1:1', { at: 100_000_000_001 }), sale('devB:S1:2', { at: 100_000_000_002 })],
        { a: 18, b: 10 }
      ),
      [mine('devC:S1:3', { at: 100_000_000_003 })]
    );
    expect(out.sales.map((s) => s.id)).toEqual(['S3', 'S2', 'S1']);
    expect(new Set(out.sales.map((s) => s.id)).size).toBe(3);
  });
});

describe('a void arriving on either side', () => {
  it('hides a server sale this phone voided and puts its cookies back before the void is sent', () => {
    const out = merge(
      day([sale('devA:S1:1', { items: { a: 3 } })], { a: 17, b: 10 }),
      [],
      ['devA:S1:1']
    );
    expect(out.sales).toEqual([]);
    expect(out.stock.a).toBe(20);
  });

  it('does not put cookies back twice when the server has the void too', () => {
    const out = merge(
      day([sale('devA:S1:1', { items: { a: 3 }, voided: true, voidedAt: 1_767_268_900_000 })], {
        a: 20,
        b: 10
      }),
      [],
      ['devA:S1:1']
    );
    expect(out.sales).toEqual([]);
    // Mutation: adding the cookies back for a void the server already has would give 23.
    expect(out.stock.a).toBe(20);
  });

  it('hides an unsent sale that was voided here and takes nothing off the table', () => {
    const out = merge(
      day([], { a: 20, b: 10 }),
      [mine('devB:S1:9', { items: { a: 2 } })],
      ['devB:S1:9']
    );
    expect(out.sales).toEqual([]);
    expect(out.stock.a).toBe(20);
    expect(out.unsynced).toBe(0);
  });

  it('shows a sale the server holds as voided on another device as gone, with this phone’s copy of it', () => {
    const out = merge(
      day([sale('devB:S1:9', { voided: true, voidedAt: 1_767_268_900_000 })], { a: 20, b: 10 }),
      [mine('devB:S1:9')]
    );
    expect(out.sales).toEqual([]);
    expect(out.stock.a).toBe(20);
  });
});

describe('the stock', () => {
  it('never goes below zero, whether the server or the phone took the last cookie', () => {
    expect(merge(day([], { a: -2, b: 10 })).stock.a).toBe(0);
    expect(merge(day([], { a: 1, b: 10 }), [mine('devB:S1:9', { items: { a: 3 } })]).stock.a).toBe(
      0
    );
  });

  it('keeps a flavour the phone sold that the server stock does not name', () => {
    const out = merge(day([], { a: 20 }), [mine('devB:S1:9', { items: { b: 2 } })]);
    expect(out.stock).toEqual({ a: 20, b: 0 });
  });
});

describe('parsing get_bazaar_day', () => {
  const wire = (over: Record<string, unknown> = {}) => ({
    day_id: 'b0930000-0000-4000-8000-000000000001',
    booking_id: 'b0930000-0000-4000-8000-000000000002',
    day: '2026-11-19',
    event_id: 'b0930000-0000-4000-8000-000000000003',
    status: 'open',
    closed_at: null,
    float_cents: 25000,
    price_version: 1,
    prices: { a: 13000 },
    loaded: { a: 20 },
    table_stock: { a: 19 },
    sales: [
      {
        client_id: 'devA:S1:1767268800000',
        items: { a: 1 },
        gross_cents: 13000,
        discount_cents: 0,
        total_cents: 13000,
        pay: 'Cash',
        ref: '',
        clerk: 'Owner',
        at: 1_767_268_800_000,
        tendered_cents: 20000,
        change_cents: 7000,
        voided: false,
        voided_at: null
      }
    ],
    ...over
  });
  const parse = (v: unknown) => parseBazaarDay(v as never);

  it('reads a day', () => {
    const read = parse(wire())!;
    expect(read).toMatchObject({
      status: 'open',
      priceVersion: 1,
      tableStock: { a: 19 },
      floatCents: 25000
    });
    expect(read.sales[0]).toMatchObject({
      clientId: 'devA:S1:1767268800000',
      totalCents: 13000,
      voided: false
    });
  });

  it.each([
    ['not an object', null],
    ['a bad day id', wire({ day_id: 'x' })],
    ['an unknown state', wire({ status: 'paused' })],
    ['a plan with an event', wire({ status: 'planned', closed_at: null })],
    ['a started day with no event', wire({ event_id: null })],
    ['a closed day with no close time', wire({ status: 'closed' })],
    ['an open day with a close time', wire({ closed_at: 1_767_268_800_000 })],
    ['a fractional price', wire({ prices: { a: 130.5 } })],
    ['a flavour id off the pattern', wire({ loaded: { 'A B': 1 } })],
    ['stock that is not a number', wire({ table_stock: { a: '19' } })],
    ['sales that are not a list', wire({ sales: {} })]
  ])('refuses %s', (_why, value) => {
    expect(parse(value)).toBeNull();
  });

  it('refuses a sale that is malformed, repeated, empty or inconsistent', () => {
    const one = wire().sales[0]!;
    expect(parse(wire({ sales: [{ ...one, client_id: 'no-colon' }] }))).toBeNull();
    expect(parse(wire({ sales: [{ ...one }, { ...one }] }))).toBeNull(); // one client id is one sale
    expect(parse(wire({ sales: [{ ...one, items: {} }] }))).toBeNull();
    expect(parse(wire({ sales: [{ ...one, items: { a: 0 } }] }))).toBeNull();
    expect(parse(wire({ sales: [{ ...one, total_cents: -1 }] }))).toBeNull();
    expect(parse(wire({ sales: [{ ...one, discount_cents: 13001 }] }))).toBeNull();
    expect(parse(wire({ sales: [{ ...one, voided: true }] }))).toBeNull(); // voided says when
    expect(parse(wire({ sales: [{ ...one, voided_at: 1_767_268_900_000 }] }))).toBeNull();
    expect(parse(wire({ sales: [{ ...one, at: 5 }] }))).toBeNull();
    expect(parse(wire({ sales: [{ ...one, pay: '' }] }))).toBeNull();
  });

  it('accepts a voided sale that says when, and stock below zero as the server reports it', () => {
    const one = wire().sales[0]!;
    const read = parse(
      wire({
        table_stock: { a: -1 },
        sales: [{ ...one, voided: true, voided_at: 1_767_268_900_000 }]
      })
    )!;
    expect(read.sales[0]).toMatchObject({ voided: true, voidedAt: 1_767_268_900_000 });
    expect(read.tableStock.a).toBe(-1);
  });
});
