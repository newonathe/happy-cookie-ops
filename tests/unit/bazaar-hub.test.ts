import { describe, expect, it } from 'vitest';
import type { Bazaar } from '@/lib/data/bazaar-days';
import { scheduledEventError, type ScheduledEvent } from '@/lib/data/scheduled-events';
import { dayRange } from '@/lib/date/day-text';
import {
  eventFieldError,
  rentCentsOf,
  validateEventForm,
  type EventFormInput
} from '@/lib/bazaar/event-form';
import { hubFactsOf, hubNeedsRead, hubOrder, hubPlace, type HubFacts } from '@/lib/bazaar/hub';

/**
 * U3: the events hub's rules as pure functions. Each `Mutation:` line names a change one of these tests must catch.
 */
const TODAY = '2026-10-15';
const NOW = new Date('2026-10-15T03:00:00Z');
const ID = 'd5b00000-0000-4000-8000-000000000001';

const booking = (over: Partial<ScheduledEvent> = {}): ScheduledEvent => ({
  id: ID,
  name: 'Fixture fair',
  startsOn: '2026-10-24',
  endsOn: '2026-10-25',
  place: 'Hall',
  rentCents: 0,
  active: true,
  started: false,
  updatedAt: '2026-10-01T00:00:00Z',
  ...over
});
const facts = (over: Partial<HubFacts> = {}): HubFacts => ({
  finalised: false,
  sellingNow: false,
  dayStarted: false,
  costPending: false,
  today: null,
  ...over
});

describe('dayRange', () => {
  it('writes one day, and a run of days, as "Wed, 14 Oct"', () => {
    expect(dayRange('2026-10-14', '2026-10-14', NOW)).toBe('Wed, 14 Oct');
    expect(dayRange('2026-10-24', '2026-10-25', NOW)).toBe('Sat, 24 Oct – Sun, 25 Oct');
    expect(dayRange('2026-12-31', '2027-01-01', NOW)).toBe('Thu, 31 Dec – Fri, 1 Jan 2027');
    // Mutation: the US order ("Sat, Oct 24") or a numeric date (10/24/2026) is finding B6 again.
  });
});

describe('hubPlace: where each booking is drawn and what its pill says', () => {
  const inDates = { startsOn: '2026-10-14', endsOn: '2026-10-16' };
  const ahead = { startsOn: '2026-10-19', endsOn: '2026-10-21' };

  it('a switched-off booking is not listed', () => {
    expect(hubPlace(booking({ active: false }), TODAY, undefined)).toBeNull();
  });

  it('a booking that is over is simply Past, and is not read', () => {
    const over = booking({ startsOn: '2026-10-10', endsOn: '2026-10-12' });
    expect(hubNeedsRead(over, TODAY)).toBe(false);
    expect(hubPlace(over, TODAY, undefined)).toEqual({
      group: 'past',
      status: 'past',
      reading: false
    });
    expect(hubNeedsRead(booking(), TODAY)).toBe(true);
    expect(hubNeedsRead(booking({ active: false }), TODAY)).toBe(false);
    // Its last day is not over yet.
    expect(hubNeedsRead(booking({ startsOn: '2026-10-14', endsOn: '2026-10-15' }), TODAY)).toBe(
      true
    );
    // Mutation: comparing with < instead of <= reads and places an event on its last day as over.
  });

  it('until its read comes, or when it fails, a booking is placed by its dates and claims nothing more', () => {
    for (const read of [undefined, 'reading'] as const) {
      expect(hubPlace(booking(), TODAY, read)).toEqual({
        group: 'upcoming',
        status: 'planned',
        reading: true
      });
      expect(hubPlace(booking(inDates), TODAY, read)).toEqual({
        group: 'active',
        status: 'today',
        reading: true
      });
    }
    expect(hubPlace(booking(inDates), TODAY, 'failed')).toEqual({
      group: 'active',
      status: 'today',
      reading: false
    });
    expect(hubPlace(booking(), TODAY, 'failed')).toEqual({
      group: 'upcoming',
      status: 'planned',
      reading: false
    });
    // Mutation: placing from `started` or the dates alone pins a closed event as Active, finding B3 on real data.
  });

  it('a read decides it: Selling when a day is open, Today between days, Closed or Cost pending under Past', () => {
    expect(
      hubPlace(booking(inDates), TODAY, facts({ sellingNow: true, dayStarted: true }))
    ).toMatchObject({ group: 'active', status: 'selling' });
    expect(hubPlace(booking(inDates), TODAY, facts({ dayStarted: true }))).toMatchObject({
      group: 'active',
      status: 'today'
    });
    expect(hubPlace(booking(inDates), TODAY, facts({ finalised: true, dayStarted: true }))).toEqual(
      { group: 'past', status: 'closed', reading: false }
    );
    expect(
      hubPlace(
        booking(inDates),
        TODAY,
        facts({ finalised: true, dayStarted: true, costPending: true })
      )
    ).toMatchObject({ group: 'past', status: 'costPending' });
    // Nothing started: by its dates.
    expect(hubPlace(booking(inDates), TODAY, facts())).toMatchObject({
      group: 'active',
      status: 'today'
    });
    expect(hubPlace(booking(), TODAY, facts())).toMatchObject({
      group: 'upcoming',
      status: 'planned'
    });
    // Mutation: ignoring `finalised` leaves a closed test event pinned as Active until its dates pass.
  });

  it('an event whose days were started, with dates still ahead, is under way, not Upcoming; closed, it is Past', () => {
    // The Ateneo shape: `started` is false (the days flow never sets it), the dates are ahead, and it is closed.
    const early = booking({ ...ahead, started: false });
    expect(hubPlace(early, TODAY, facts({ dayStarted: true }))).toMatchObject({
      group: 'active',
      status: 'planned'
    });
    expect(hubPlace(early, TODAY, facts({ dayStarted: true, finalised: true }))).toMatchObject({
      group: 'past',
      status: 'closed'
    });
    // Mutation: trusting `started` shows a closed event under Upcoming as Planned.
  });
});

describe('hubOrder', () => {
  it('runs active and upcoming soonest first, and past the most recent first', () => {
    const a = booking({ id: 'a', name: 'A', startsOn: '2026-10-24', endsOn: '2026-10-25' });
    const b = booking({ id: 'b', name: 'B', startsOn: '2026-12-12', endsOn: '2026-12-13' });
    expect([b, a].sort((x, y) => hubOrder('upcoming', x, y)).map((e) => e.id)).toEqual(['a', 'b']);
    expect([a, b].sort((x, y) => hubOrder('past', x, y)).map((e) => e.id)).toEqual(['b', 'a']);
  });
});

describe('hubFactsOf', () => {
  const day = (over: Record<string, unknown>) => ({
    day: '2026-10-15',
    state: 'open',
    revenueCents: 123456,
    lines: [{ sold: 3 }, { sold: 4 }],
    ...over
  });
  const data = (over: Record<string, unknown> = {}) =>
    ({
      finalised: false,
      days: [day({})],
      profit: { cents: 100, why: null },
      finalSummary: null,
      ...over
    }) as unknown as Bazaar;

  it("reads today's takings and cookies sold, and whether a day is open", () => {
    expect(hubFactsOf(data(), TODAY)).toEqual({
      finalised: false,
      sellingNow: true,
      dayStarted: true,
      costPending: false,
      today: { revenueCents: 123456, sold: 7 }
    });
    expect(
      hubFactsOf(data({ days: [day({ day: '2026-10-14', state: 'closed' })] }), TODAY)
    ).toMatchObject({ sellingNow: false, today: null });
  });

  it('a closed event is Cost pending by the profit that was booked, not the one read now', () => {
    const closed = data({
      finalised: true,
      profit: { cents: 500, why: null },
      finalSummary: { profit: { cents: null, why: 'no cost' } }
    });
    expect(hubFactsOf(closed, TODAY).costPending).toBe(true);
    // Mutation: reading `profit` instead of `finalSummary.profit` shows a different answer than the books hold.
  });
});

describe('rentCentsOf', () => {
  it('takes pesos as typed: commas, a peso sign, two decimals, or nothing', () => {
    expect(rentCentsOf('')).toBe(0);
    expect(rentCentsOf('2500')).toBe(250000);
    expect(rentCentsOf('2,500.00')).toBe(250000);
    expect(rentCentsOf('₱ 2,500.5')).toBe(250050);
    expect(rentCentsOf('0.07')).toBe(7);
    expect(rentCentsOf('12.345')).toBeNull();
    expect(rentCentsOf('abc')).toBeNull();
    expect(rentCentsOf('-5')).toBeNull();
    // Mutation: Number('2,500') is NaN, so a comma silently becomes a refusal or ₱0.
  });
});

const good = (over: Partial<EventFormInput> = {}): EventFormInput => ({
  id: ID,
  name: ' Fixture fair ',
  place: ' Hall ',
  startsOn: '2026-10-24',
  endsOn: '2026-10-25',
  rent: '2,500.00',
  ...over
});

describe('validateEventForm', () => {
  it('turns what was typed into the booking, trimmed, in whole centavos, switched on', () => {
    expect(validateEventForm(good(), NOW)).toEqual({
      ok: true,
      fields: {
        id: ID,
        name: 'Fixture fair',
        startsOn: '2026-10-24',
        endsOn: '2026-10-25',
        place: 'Hall',
        rentCents: 250000,
        active: true
      }
    });
    expect(validateEventForm(good({ place: '', rent: '' }), NOW)).toMatchObject({
      ok: true,
      fields: { place: '', rentCents: 0 }
    });
  });

  it('says what is wrong, field by field, in the words the summary and the field share', () => {
    const result = validateEventForm(
      good({ name: '  ', startsOn: '', endsOn: '', rent: 'lots' }),
      NOW
    );
    expect(result).toEqual({
      ok: false,
      errors: [
        { field: 'name', message: 'Enter the name of the event, like "Katipunan market".' },
        { field: 'startsOn', message: 'Pick the first day of the event.' },
        { field: 'endsOn', message: 'Pick the last day of the event.' },
        {
          field: 'rent',
          message: 'Enter the stall rent in pesos, like 2,500.00, or leave it blank.'
        }
      ]
    });
    expect(
      eventFieldError('endsOn', good({ startsOn: '2026-12-12', endsOn: '2026-12-11' }), NOW)
    ).toBe('The end date must be on or after Sat, 12 Dec.');
  });

  it('never accepts what the database refuses, and never refuses what it accepts', () => {
    const cases: Array<Partial<EventFormInput>> = [
      {},
      { name: 'x'.repeat(80) },
      { name: 'x'.repeat(81) },
      { name: 'tab\tinside' },
      { place: 'y'.repeat(80) },
      { place: 'y'.repeat(81) },
      { place: 'bell\u0007' },
      { startsOn: '2026-10-01', endsOn: '2026-10-15' }, // 15 days
      { startsOn: '2026-10-01', endsOn: '2026-10-16' }, // 16 days
      { startsOn: '2026-10-25', endsOn: '2026-10-24' },
      { startsOn: '2026-02-30', endsOn: '2026-03-01' },
      { rent: '1000000' },
      { rent: '1000000.01' },
      { rent: '10000000' }
    ];
    for (const over of cases) {
      const input = good(over);
      const mine = validateEventForm(input, NOW);
      const cents = rentCentsOf(input.rent);
      const theirs =
        cents === null
          ? 'rent'
          : scheduledEventError({
              id: input.id,
              name: input.name,
              place: input.place,
              startsOn: input.startsOn,
              endsOn: input.endsOn,
              rentCents: cents,
              active: true
            });
      expect([JSON.stringify(over), mine.ok]).toEqual([JSON.stringify(over), theirs === null]);
    }
    // Mutation: a bound loosened here but not in scheduledEventError (or the other way) breaks this list at once.
  });
});
