import { describe, expect, it, vi } from 'vitest';
import {
  dayEventId,
  engineStateForDay,
  fetchBazaar,
  parseBazaar,
  parseStartedDay,
  saveBazaarDay,
  startBazaarDay,
  type BazaarClient
} from '@/lib/data/bazaar-days';

/**
 * S2: the bazaar days data layer (`get_bazaar`, `save_bazaar_day`, `start_bazaar_day`, migration 20260101006700) as a
 * strict parser and thin RPC wrappers. Money stays in centavos here. Each `Mutation:` line names a change one of these
 * tests must catch.
 */
const BOOKING = 'b0d0b000-0000-4000-8000-000000000001';
const DAY1 = 'b0d0d000-0000-4000-8000-000000000011';
const EVENT1 = 'b0d0e000-0000-4000-8000-000000000011';
const STAMP = '2026-10-20T02:00:00.123456+00:00';
const HASH = 'a'.repeat(64);

const line = (over: Record<string, unknown> = {}) => ({
  product_id: 'mp0s-a',
  name: 'Fixture A',
  made: 20,
  carried: 0,
  price_cents: 13000,
  sold: 0,
  given: 0,
  lost: 0,
  ...over
});
const day = (over: Record<string, unknown> = {}) => ({
  id: DAY1,
  day: '2026-10-24',
  event_id: null,
  float_cents: 50000,
  lines: [line()],
  state: 'planned',
  hash: HASH,
  ...over
});
const answer = (over: Record<string, unknown> = {}) => ({
  summary: {
    booking: {
      id: BOOKING,
      name: 'Fixture fair',
      place: 'Hall',
      starts_on: '2026-10-24',
      ends_on: '2026-10-25',
      rent_cents: 50000,
      active: true
    },
    counted: true,
    days: [day()],
    fees: { total_cents: 50000 },
    profit: { cents: null, why: 'no cost per cookie for: Fixture A' },
    hash: HASH
  },
  target_profit_cents: 50000,
  updated_at: STAMP,
  finalised_at: null,
  stamps: [{ id: DAY1, day: '2026-10-24', updated_at: STAMP }],
  ...over
});

describe('parseBazaar', () => {
  it('reads a booking with a planned day', () => {
    const b = parseBazaar(answer());
    expect(b).not.toBeNull();
    expect(b!.booking).toEqual({
      id: BOOKING,
      name: 'Fixture fair',
      place: 'Hall',
      startsOn: '2026-10-24',
      endsOn: '2026-10-25',
      rentCents: 50000,
      active: true
    });
    expect(b!.days).toEqual([
      {
        id: DAY1,
        day: '2026-10-24',
        eventId: null,
        floatCents: 50000,
        state: 'planned',
        hash: HASH,
        updatedAt: STAMP,
        lines: [{ productId: 'mp0s-a', name: 'Fixture A', made: 20, carried: 0, priceCents: 13000 }]
      }
    ]);
    expect(b!.targetCents).toBe(50000);
    expect(b!.finalised).toBe(false);
  });

  it('keeps an unknown profit as null with its why, never 0', () => {
    const b = parseBazaar(answer())!;
    expect(b.profit).toEqual({ cents: null, why: 'no cost per cookie for: Fixture A' });
    // Mutation: coalescing a null profit to 0 fails here.
  });

  it('reads a started day with its event', () => {
    const b = parseBazaar(
      answer({
        summary: {
          ...answer().summary,
          days: [day({ event_id: EVENT1, state: 'open' })]
        }
      })
    )!;
    expect(b.days[0]).toMatchObject({ eventId: EVENT1, state: 'open' });
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['no summary', { ...answer(), summary: undefined }],
    [
      'a day with a fractional float',
      answer({ summary: { ...answer().summary, days: [day({ float_cents: 10.5 })] } })
    ],
    [
      'a day with a negative price',
      answer({
        summary: { ...answer().summary, days: [day({ lines: [line({ price_cents: -1 })] })] }
      })
    ],
    [
      'a day with a string quantity',
      answer({ summary: { ...answer().summary, days: [day({ lines: [line({ made: '20' })] })] } })
    ],
    [
      'a day with an unknown state',
      answer({ summary: { ...answer().summary, days: [day({ state: 'half' })] } })
    ],
    [
      'a day id that is not a uuid',
      answer({ summary: { ...answer().summary, days: [day({ id: 'nope' })] } })
    ],
    [
      'a bad date',
      answer({ summary: { ...answer().summary, days: [day({ day: '2026-02-30' })] } })
    ],
    ['a hash that is not 64 hex', answer({ summary: { ...answer().summary, hash: 'abc' } })],
    [
      'a booking with fractional rent',
      answer({
        summary: { ...answer().summary, booking: { ...answer().summary.booking, rent_cents: 1.5 } }
      })
    ],
    ['no stamp for a day', answer({ stamps: [] })],
    ['a fractional target', answer({ target_profit_cents: 100.5 })]
  ])('refuses %s as no answer at all', (_name, input) => {
    expect(parseBazaar(input as never)).toBeNull();
    // Mutation: a parser that skips any one of these checks fails the matching row.
  });
});

describe('dayEventId', () => {
  it('is the same lowercase uuid for the same day, whatever the storage state', async () => {
    const a = await dayEventId(DAY1);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(await dayEventId(DAY1)).toBe(a);
    expect(await dayEventId('b0d0d000-0000-4000-8000-000000000012')).not.toBe(a);
    // Mutation: a random id per call (a second start would open a second event) fails the equality.
  });
});

describe('parseStartedDay', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    event_id: EVENT1,
    starts_at: '2026-10-24T00:00:00+00:00',
    selling_device: 'devA',
    prices: { 'mp0s-a': 13000, 'mp0s-b': '15000' },
    loaded: { 'mp0s-a': 20, 'mp0s-b': 10 },
    float_cents: 50000,
    ...over
  });

  it('reads the event the server opened, prices as centavos', () => {
    expect(parseStartedDay([row()])).toEqual({
      eventId: EVENT1,
      sellingDevice: 'devA',
      prices: { 'mp0s-a': 13000, 'mp0s-b': 15000 },
      loaded: { 'mp0s-a': 20, 'mp0s-b': 10 },
      floatCents: 50000
    });
  });

  it.each([
    ['no row', []],
    ['not an array', {}],
    ['a loaded quantity that is fractional', [row({ loaded: { 'mp0s-a': 2.5 } })]],
    ['a negative price', [row({ prices: { 'mp0s-a': -1 } })]],
    ['an event id that is not a uuid', [row({ event_id: 'nope' })]],
    ['no selling device', [row({ selling_device: null })]],
    ['a float that is a string', [row({ float_cents: 'x' })]]
  ])('refuses %s', (_name, input) => {
    expect(parseStartedDay(input as never)).toBeNull();
  });
});

describe('the calls', () => {
  const client = (data: unknown, error: { code?: string; message?: string } | null = null) => {
    const rpc = vi.fn(async () => ({ data, error }));
    return { rpc, client: { rpc } as unknown as BazaarClient };
  };

  it('fetchBazaar names the booking and refuses an answer it cannot read', async () => {
    const ok = client(answer());
    expect((await fetchBazaar(ok.client, BOOKING)).booking.id).toBe(BOOKING);
    expect(ok.rpc).toHaveBeenCalledWith('get_bazaar', { p_booking: BOOKING });
    await expect(fetchBazaar(client({ nope: 1 }).client, BOOKING)).rejects.toThrow(
      'not understood'
    );
    await expect(fetchBazaar(client(null, { code: '42501' }).client, BOOKING)).rejects.toThrow(
      '42501'
    );
  });

  it('saveBazaarDay sends the plan with exact keys and the stamp, and classifies the answer', async () => {
    const c = client([{ id: DAY1, updated_at: STAMP }]);
    const out = await saveBazaarDay(
      c.client,
      {
        id: DAY1,
        scheduledId: BOOKING,
        day: '2026-10-24',
        floatCents: 50000,
        lines: [{ productId: 'mp0s-a', made: 20, carried: 0, priceCents: 13000 }]
      },
      STAMP
    );
    expect(out).toEqual({ result: 'saved', updatedAt: STAMP });
    expect(c.rpc).toHaveBeenCalledWith('save_bazaar_day', {
      p_day: {
        id: DAY1,
        scheduled_id: BOOKING,
        day: '2026-10-24',
        float_cents: 50000,
        lines: [{ product_id: 'mp0s-a', made_qty: 20, carried_qty: 0, price_cents: 13000 }]
      },
      p_expected_updated_at: STAMP
    });
    expect(
      (await saveBazaarDay(client(null, { code: 'P0002' }).client, planOf(), STAMP)).result
    ).toBe('conflict');
    expect(
      (await saveBazaarDay(client(null, { code: '55000' }).client, planOf(), STAMP)).result
    ).toBe('refused');
    expect(
      (await saveBazaarDay(client(null, { code: '08006' }).client, planOf(), null)).result
    ).toBe('offline');
  });

  it("startBazaarDay sends the day, this phone and the day's own event id", async () => {
    const c = client([
      {
        event_id: EVENT1,
        starts_at: '2026-10-24T00:00:00+00:00',
        selling_device: 'devA',
        prices: { 'mp0s-a': 13000 },
        loaded: { 'mp0s-a': 20 },
        float_cents: 50000
      }
    ]);
    const out = await startBazaarDay(c.client, DAY1, 'devA', EVENT1);
    expect(out).toMatchObject({ ok: true, started: { eventId: EVENT1, sellingDevice: 'devA' } });
    expect(c.rpc).toHaveBeenCalledWith('start_bazaar_day', {
      p_day: DAY1,
      p_device: 'devA',
      p_event_id: EVENT1
    });
    const other = client([
      {
        event_id: 'b0d0e000-0000-4000-8000-0000000000ff',
        selling_device: 'devA',
        prices: {},
        loaded: {},
        float_cents: 0
      }
    ]);
    expect((await startBazaarDay(other.client, DAY1, 'devA', EVENT1)).ok).toBe(false);
    expect(
      await startBazaarDay(
        client(null, { code: '55000', message: 'another day is open' }).client,
        DAY1,
        'devA',
        EVENT1
      )
    ).toEqual({
      ok: false,
      error: 'refused'
    });
    expect(
      (await startBazaarDay(client(null, { code: '08006' }).client, DAY1, 'devA', EVENT1)).ok
    ).toBe(false);
  });
});

function planOf() {
  return {
    id: DAY1,
    scheduledId: BOOKING,
    day: '2026-10-24',
    floatCents: 50000,
    lines: [{ productId: 'mp0s-a', made: 20, carried: 0, priceCents: 13000 }]
  };
}

describe('engineStateForDay', () => {
  const started = {
    eventId: EVENT1,
    sellingDevice: 'devA',
    prices: { 'mp0s-a': 13000, 'mp0s-b': 15050 },
    loaded: { 'mp0s-a': 20, 'mp0s-b': 10 },
    floatCents: 50000
  };
  const ctx = { name: 'Fixture fair', date: 'Sat, Oct 24', dayId: DAY1, scheduledId: BOOKING };
  const pesos = (c: number) => c / 100;

  it('puts the day in the engine selling, with its own prices and stock and no cookies taken from baked stock', () => {
    const s = engineStateForDay(started, ctx, ['mp0s-a', 'mp0s-b', 'mp0s-c'], pesos);
    expect(s.event).toEqual({
      name: 'Fixture fair',
      date: 'Sat, Oct 24',
      stage: 'selling',
      id: EVENT1,
      snapshot: ['mp0s-a', 'mp0s-b'],
      dayId: DAY1,
      scheduledId: BOOKING
    });
    expect(s.eventPrices).toEqual({ 'mp0s-a': 130, 'mp0s-b': 150.5 });
    expect(s.eventLoaded).toEqual({ 'mp0s-a': 20, 'mp0s-b': 10, 'mp0s-c': 0 });
    expect(s.eventStock).toEqual(s.eventLoaded);
    expect(s.drawer).toEqual({ float: 500, counted: '' });
    expect(s).not.toHaveProperty('baked');
    expect(s.sales).toEqual([]);
    // Mutation: copying openSelling's `baked` subtraction (adding a baked key) fails the not.toHaveProperty.
  });
});

describe('a started day survives a reload', () => {
  it('keeps the event, its day and its prices in the saved bazaar', async () => {
    const { saveBazaar, readBazaar, clearBazaar } = await import('@/lib/offline/bazaar-state');
    clearBazaar();
    const s = engineStateForDay(
      {
        eventId: EVENT1,
        sellingDevice: 'devA',
        prices: { 'mp0s-a': 13000 },
        loaded: { 'mp0s-a': 20 },
        floatCents: 50000
      },
      { name: 'Fixture fair', date: 'Sat, Oct 24', dayId: DAY1, scheduledId: BOOKING },
      ['mp0s-a'],
      (c) => c / 100
    );
    saveBazaar({ ...s, unsynced: 0 });
    const back = readBazaar();
    expect(back?.event).toMatchObject({
      id: EVENT1,
      dayId: DAY1,
      scheduledId: BOOKING,
      stage: 'selling'
    });
    expect(back?.eventPrices).toEqual({ 'mp0s-a': 130 });
    expect(back?.eventLoaded).toEqual({ 'mp0s-a': 20 });
    clearBazaar();
  });
});
