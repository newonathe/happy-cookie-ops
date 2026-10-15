import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BazaarDays, type BazaarDaysDeps } from '@/store/bazaar-days';
import type { BazaarClient } from '@/lib/data/bazaar-days';
import type { ScheduledEvent } from '@/lib/data/scheduled-events';
import example from '../fixtures/bazaar-example.json';

/**
 * U3: the events hub in the owner's bazaar store. Which group and pill each booking gets, the reads that decide it, and
 * adding one event. The database is a fake: `get_bazaar` answers with the hand-worked example, whose two days (24 and 25
 * October) are both closed. Each `Mutation:` line names a change one of these tests must catch.
 */
const BOOKING = example.summary.booking.id;
const OTHER = 'b0d0b000-0000-4000-8000-000000000002';
const NEW_ID = 'b0d0b000-0000-4000-8000-0000000000aa';
beforeEach(() => localStorage.clear());

type Wire = typeof example & Record<string, unknown>;
const clone = () => JSON.parse(JSON.stringify(example)) as Wire;
/** The example with day 1 still selling and the event not closed. */
function selling(): Wire {
  const w = clone();
  const d = w.summary.days[0] as Record<string, unknown>;
  Object.assign(d, { state: 'open', count: null, closed_at: null });
  w.summary.counted = false;
  return w;
}
/** The example as an event that was closed. */
function closed(profit?: { cents: number | null; why: string | null }): Wire {
  const w = clone();
  const booked = JSON.parse(JSON.stringify(w.summary)) as Record<string, unknown>;
  if (profit) booked.profit = { ...(booked.profit as object), ...profit };
  return Object.assign(w, {
    finalised_at: '2026-10-26T01:00:00+00:00',
    final_hash: 'f'.repeat(64),
    final_summary: booked
  });
}

const row = (over: Partial<ScheduledEvent> = {}): ScheduledEvent => ({
  id: BOOKING,
  name: 'Fixture fair',
  startsOn: '2026-10-24',
  endsOn: '2026-10-25',
  place: 'Hall',
  rentCents: 50000,
  active: true,
  started: true,
  updatedAt: '2026-10-20T00:00:00Z',
  ...over
});

function harness(bookings: ScheduledEvent[], answer: Wire | 'throw', today = '2026-10-24') {
  const state = { bookings, online: true, answer, today };
  const rpc = vi.fn(
    async (
      name: string,
      args?: Record<string, unknown>
    ): Promise<{ data: unknown; error: { code: string } | null }> => {
      if (name === 'get_bazaar') {
        if (state.answer === 'throw') throw new Error('network');
        // The same answer, re-aimed at whichever booking was asked for.
        const w = JSON.parse(JSON.stringify(state.answer)) as Wire;
        w.summary.booking.id = String(args?.p_booking);
        return { data: w, error: null };
      }
      return { data: null, error: null };
    }
  );
  const toast = vi.fn();
  const rerender = vi.fn();
  const refreshBookings = vi.fn(async () => true);
  const deps = {
    client: () => ({ rpc }) as unknown as BazaarClient,
    online: () => state.online,
    bookings: () => state.bookings,
    bookingsRead: () => true,
    flavours: () => [],
    holdsEvent: () => false,
    held: () => null,
    begin: vi.fn(async () => 'started' as const),
    dayClosed: vi.fn(),
    tillFigures: async () => null,
    closeInDoubt: vi.fn(),
    lossSaved: vi.fn(),
    lossVoided: vi.fn(),
    stockAdded: vi.fn(),
    dropNo: () => 32,
    finalised: vi.fn(),
    rerender,
    toast,
    today: () => state.today,
    now: () => new Date(`${state.today}T03:00:00Z`).getTime(),
    newId: () => NEW_ID,
    openAdd: vi.fn(),
    refreshBookings
  } satisfies BazaarDaysDeps;
  const store = new BazaarDays(deps);
  const calls = (name: string) =>
    rpc.mock.calls.filter((c) => c[0] === name).map((c) => c[1] as Record<string, unknown>);
  return { store, state, rpc, calls, toast, rerender, refreshBookings };
}
const settle = () => new Promise((r) => setTimeout(r, 0));
const summary = (h: ReturnType<typeof harness>) =>
  h.store.vals().list.map((r) => `${r.group}:${r.status}${r.reading ? ':reading' : ''}:${r.name}`);

describe('the hub list', () => {
  it('places each booking by its dates until it is read, with its dates written as "Sat, 24 Oct"', () => {
    const h = harness(
      [
        row({ id: 'u', name: 'Later', startsOn: '2026-12-12', endsOn: '2026-12-13' }),
        row({ id: 'p', name: 'Earlier', startsOn: '2026-09-01', endsOn: '2026-09-02' }),
        row({ id: 't', name: 'Now', startsOn: '2026-10-23', endsOn: '2026-10-25' }),
        row({ id: 'o', name: 'Off', active: false })
      ],
      'throw'
    );
    // Offline nothing is read: each is placed by its dates, claiming nothing more.
    h.state.online = false;
    expect(summary(h)).toEqual(['active:today:Now', 'upcoming:planned:Later', 'past:past:Earlier']);
    const list = h.store.vals().list;
    expect(list[0]).toMatchObject({ datesText: 'Fri, 23 Oct – Sun, 25 Oct', whenText: 'Today' });
    expect(list[1]).toMatchObject({ whenText: 'In 49 days' });
    expect(list[2]).toMatchObject({ whenText: null });
    // Mutation: listing switched-off bookings, or dropping the past, puts a dead event in the list she works from.
  });

  it('a booking that is not over is a placeholder until it is read, and a booking that is over never is', () => {
    const h = harness(
      [row({ id: 'p', name: 'Earlier', startsOn: '2026-09-01', endsOn: '2026-09-02' }), row()],
      selling()
    );
    expect(summary(h)).toEqual(['active:today:reading:Fixture fair', 'past:past:Earlier']);
    h.state.online = false;
    expect(summary(h)).toEqual(['active:today:Fixture fair', 'past:past:Earlier']);
    expect(h.store.vals().list[0]?.note).toMatch(/could not be read/);
  });
});

describe('reading the events that are under way', () => {
  it('a day that is selling makes the event Selling, with today’s takings and cookies sold', async () => {
    const h = harness([row()], selling());
    h.store.vals().readHub();
    await settle();
    expect(h.calls('get_bazaar')).toEqual([{ p_booking: BOOKING }]);
    const first = h.store.vals().list[0]!;
    expect(first).toMatchObject({ group: 'active', status: 'selling', reading: false });
    expect(first.figures).toEqual({ revenueText: '₱880.00', soldText: '7 sold' });
    expect(first.note).toBeNull();
    // Mutation: showing figures for an event that was not read prints a ₱0.00 for an unknown.
  });

  it('a closed event moves to Past as Closed, and as Cost pending when its booked profit was not known', async () => {
    const h = harness([row()], closed());
    h.store.vals().readHub();
    await settle();
    expect(summary(h)).toEqual(['past:closed:Fixture fair']);
    expect(h.store.vals().list[0]?.figures).toBeNull();
    // Read again: the same event, now with a profit that was never worked out.
    h.state.answer = closed({ cents: null, why: 'A flavour has no cost per cookie.' });
    h.store.vals().readHub();
    await settle();
    expect(summary(h)).toEqual(['past:costPending:Fixture fair']);
    // Mutation: leaving a closed event in Active until its dates pass keeps a test event pinned over the real one.
  });

  it('only the switched-on bookings that are not over are read, and each only once while a read is out', async () => {
    const h = harness(
      [
        row(),
        row({
          id: OTHER,
          name: 'Not started',
          started: false,
          startsOn: '2026-12-12',
          endsOn: '2026-12-13'
        }),
        row({ id: 'o', name: 'Over', startsOn: '2026-10-01', endsOn: '2026-10-02' }),
        row({ id: 'x', name: 'Off', active: false })
      ],
      selling()
    );
    const vals = h.store.vals();
    vals.readHub();
    vals.readHub();
    await settle();
    expect(
      h
        .calls('get_bazaar')
        .map((c) => c.p_booking)
        .sort()
    ).toEqual([BOOKING, OTHER].sort());
    // Mutation: reading every booking costs one round trip per past event, every time the hub opens.
  });

  it('a read that fails keeps the last answer, and with none says so', async () => {
    const h = harness([row()], 'throw');
    h.store.vals().readHub();
    await settle();
    expect(h.store.vals().list[0]).toMatchObject({
      status: 'today',
      reading: false,
      note: 'Its figures could not be read, so it may already be closed.'
    });
    h.state.answer = selling();
    h.store.vals().readHub();
    await settle();
    expect(h.store.vals().list[0]).toMatchObject({ status: 'selling', note: null });
    h.state.answer = 'throw';
    h.store.vals().readHub();
    await settle();
    expect(h.store.vals().list[0]).toMatchObject({ status: 'selling', note: null });
  });

  it('with no signal nothing is asked', async () => {
    const h = harness([row()], selling());
    h.state.online = false;
    h.store.vals().readHub();
    await settle();
    expect(h.rpc).not.toHaveBeenCalled();
  });
});

describe('adding one event', () => {
  const input = {
    id: NEW_ID,
    name: ' Fixture fair 2 ',
    place: 'Hall',
    startsOn: '2026-12-12',
    endsOn: '2026-12-13',
    rent: '2,500.00'
  };

  it('sends one booking with no stamp, reads the list again, thanks her, and marks the new row', async () => {
    const h = harness([row({ started: false })], 'throw');
    h.refreshBookings.mockImplementation(async () => {
      h.state.bookings = [
        ...h.state.bookings,
        row({
          id: NEW_ID,
          name: 'Fixture fair 2',
          startsOn: '2026-12-12',
          endsOn: '2026-12-13',
          started: false
        })
      ];
      return true;
    });
    expect(await h.store.addEvent(input)).toBeNull();
    expect(h.calls('save_scheduled_event')).toEqual([
      {
        p_event: {
          id: NEW_ID,
          name: 'Fixture fair 2',
          place: 'Hall',
          starts_on: '2026-12-12',
          ends_on: '2026-12-13',
          rent_cents: 250000,
          active: true
        },
        p_expected_updated_at: null
      }
    ]);
    expect(h.refreshBookings).toHaveBeenCalledTimes(1);
    expect(h.toast).toHaveBeenCalledWith('Event added.');
    expect(h.store.vals().justAdded).toBe(NEW_ID);
    // Placed at once as Planned: a just-created event needs no read, so it never sits on the placeholder pill.
    expect(h.store.vals().list.find((r) => r.id === NEW_ID)).toMatchObject({
      group: 'upcoming',
      status: 'planned',
      reading: false
    });
    expect(h.calls('get_bazaar')).toEqual([]);
    // Opening an event lets the mark go: it is a welcome for the new row, not state.
    h.store.open(NEW_ID);
    expect(h.store.vals().justAdded).toBeNull();
    // Mutation: a stamp of '' or the old row's would turn a create into a conflict.
  });

  it('checks the fields again before sending, and needs signal', async () => {
    const h = harness([], 'throw');
    expect(await h.store.addEvent({ ...input, name: '' })).toBe(
      'Enter the name of the event, like "Katipunan market".'
    );
    expect(await h.store.addEvent({ ...input, endsOn: '2026-12-01' })).toMatch(
      /end date must be on or after/
    );
    h.state.online = false;
    expect(await h.store.addEvent(input)).toMatch(/needs signal/);
    expect(h.calls('save_scheduled_event')).toEqual([]);
  });

  it('a refused save says so in words; the list is read again either way', async () => {
    const h = harness([], 'throw');
    h.rpc.mockImplementationOnce(async () => ({ data: null, error: { code: '22023' } }));
    expect(await h.store.addEvent(input)).toMatch(/could not be saved/);
    expect(h.refreshBookings).toHaveBeenCalledTimes(1);
    expect(h.store.vals().justAdded).toBeNull();
  });

  it('an event that is listed after a lost reply counts as saved', async () => {
    const h = harness([], 'throw');
    h.rpc.mockImplementationOnce(async () => {
      throw new Error('network');
    });
    h.refreshBookings.mockImplementation(async () => {
      h.state.bookings = [row({ id: NEW_ID, started: false })];
      return true;
    });
    expect(await h.store.addEvent(input)).toBeNull();
    expect(h.store.vals().justAdded).toBe(NEW_ID);
    // Mutation: trusting the reply alone leaves the sheet open on an event that was saved, and she saves it twice.
  });
});
