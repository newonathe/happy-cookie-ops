import { describe, expect, it, vi } from 'vitest';
import {
  dateRange,
  fetchScheduledEvents,
  linkScheduledEvent,
  parseScheduledEvents,
  saveScheduledEvent,
  scheduledEventError,
  upcomingEvents,
  type ScheduledClient,
  type ScheduledEvent,
  type ScheduledEventFields
} from '@/lib/data/scheduled-events';

/**
 * D4: the owner's upcoming bazaars, as pure functions and the RPC wrappers. Each `Mutation:` line names a change
 * one of these tests must catch (each was applied and seen to fail).
 */
const ID = 'd4a00000-0000-4000-8000-000000000001';
const STAMP = '2026-09-30T02:00:00.123456+00:00';

const wire = (over: Record<string, unknown> = {}) => ({
  id: ID,
  name: 'Katipunan market',
  starts_on: '2026-10-24',
  ends_on: '2026-10-25',
  place: 'Katipunan Ave, QC',
  rent_cents: 250000,
  active: true,
  started: false,
  updated_at: STAMP,
  ...over
});
const row = (over: Partial<ScheduledEvent> = {}): ScheduledEvent => ({
  ...parseScheduledEvents([wire()])![0]!,
  ...over
});
const fields = (over: Partial<ScheduledEventFields> = {}): ScheduledEventFields => ({
  id: ID,
  name: 'Katipunan market',
  startsOn: '2026-10-24',
  endsOn: '2026-10-25',
  place: 'Katipunan Ave, QC',
  rentCents: 250000,
  active: true,
  ...over
});

describe('parseScheduledEvents', () => {
  it('reads the owner list', () => {
    expect(parseScheduledEvents([wire()])).toEqual([
      {
        id: ID,
        name: 'Katipunan market',
        startsOn: '2026-10-24',
        endsOn: '2026-10-25',
        place: 'Katipunan Ave, QC',
        rentCents: 250000,
        active: true,
        started: false,
        updatedAt: STAMP
      }
    ]);
    expect(parseScheduledEvents([])).toEqual([]);
  });

  it('refuses anything unexpected, so the Bazaar screen never shows a half-read booking', () => {
    for (const bad of [
      null,
      {},
      'x',
      [null],
      [wire({ id: 'nope' })],
      [wire({ name: 3 })],
      [wire({ starts_on: '24/10/2026' })],
      [wire({ ends_on: '2026-02-30' })],
      [wire({ rent_cents: -1 })],
      [wire({ rent_cents: 1.5 })],
      [wire({ active: 'yes' })],
      [wire({ started: null })],
      [wire({ updated_at: 5 })],
      [wire(), wire({ place: 9 })]
    ])
      expect(parseScheduledEvents(bad as never)).toBeNull();
    // Mutation: accepting an impossible date offers a booking the calendar labels wrongly.
  });
});

describe('scheduledEventError mirrors the database bounds', () => {
  it('accepts a sound booking, one day or two weeks long, with no place and no rent', () => {
    expect(scheduledEventError(fields())).toBeNull();
    expect(
      scheduledEventError(fields({ startsOn: '2026-10-24', endsOn: '2026-10-24' }))
    ).toBeNull();
    expect(
      scheduledEventError(fields({ startsOn: '2026-10-01', endsOn: '2026-10-15' }))
    ).toBeNull();
    expect(scheduledEventError(fields({ place: '', rentCents: 0 }))).toBeNull();
  });

  it.each([
    ['an id that is not a uuid', fields({ id: 'x' }), 'no id'],
    ['a blank name', fields({ name: '   ' }), 'name'],
    ['a name of 81', fields({ name: 'n'.repeat(81) }), 'name'],
    ['a control character in the name', fields({ name: 'a\u0007b' }), 'name'],
    ['a place of 81', fields({ place: 'p'.repeat(81) }), 'place'],
    ['no start date', fields({ startsOn: '' }), 'dates'],
    [
      'a date that does not exist',
      fields({ startsOn: '2026-02-30', endsOn: '2026-03-01' }),
      'dates'
    ],
    ['an end before the start', fields({ startsOn: '2026-10-25', endsOn: '2026-10-24' }), 'before'],
    ['sixteen days', fields({ startsOn: '2026-10-01', endsOn: '2026-10-16' }), '15 days'],
    ['negative rent', fields({ rentCents: -1 }), 'rent'],
    ['a fractional centavo', fields({ rentCents: 1.5 }), 'rent'],
    ['rent over a million pesos', fields({ rentCents: 100_000_001 }), 'rent']
  ])('refuses %s', (_name, f, word) => {
    expect(scheduledEventError(f)?.toLowerCase()).toContain(word);
    // Mutation: dropping any one of these checks sends what the database refuses; each row fails without its check.
  });
});

describe('upcomingEvents and dateRange', () => {
  const list = [
    row({ id: 'a', name: 'Later', startsOn: '2026-12-12', endsOn: '2026-12-13' }),
    row({ id: 'b', name: 'Past', startsOn: '2026-09-01', endsOn: '2026-09-02' }),
    row({ id: 'c', name: 'On now', startsOn: '2026-10-19', endsOn: '2026-10-21' }),
    row({ id: 'd', name: 'Off', active: false }),
    row({ id: 'e', name: 'Started', started: true }),
    row({ id: 'f', name: 'Ends today', startsOn: '2026-10-20', endsOn: '2026-10-20' }),
    row({ id: 'g', name: 'Soon', startsOn: '2026-10-24', endsOn: '2026-10-25' })
  ];
  it('keeps active, unstarted bookings that have not ended (today counts), soonest first', () => {
    expect(upcomingEvents(list, '2026-10-20').map((r) => r.name)).toEqual([
      'On now',
      'Ends today',
      'Soon',
      'Later'
    ]);
    expect(upcomingEvents(list, '2026-10-21').map((r) => r.name)).toEqual([
      'On now',
      'Soon',
      'Later'
    ]);
    // Mutation: `>` instead of `>=` drops a bazaar on its last day; ignoring `started` offers it twice.
  });

  it('words the dates the way the screens do', () => {
    expect(dateRange('2026-10-24', '2026-10-24')).toBe('Sat, Oct 24');
    expect(dateRange('2026-10-24', '2026-10-25')).toBe('Sat, Oct 24 – Sun, Oct 25');
  });
});

describe('the rpc wrappers', () => {
  const client = (result: unknown) => {
    const rpc = vi.fn(async () => result);
    return { rpc, client: { rpc } as unknown as ScheduledClient };
  };

  it('fetches and parses; a failed or unreadable read throws rather than showing nothing', async () => {
    const ok = client({ data: [wire()], error: null });
    expect((await fetchScheduledEvents(ok.client))[0]!.name).toBe('Katipunan market');
    expect(ok.rpc).toHaveBeenCalledWith('get_scheduled_events');
    await expect(
      fetchScheduledEvents(client({ data: null, error: { code: '42501' } }).client)
    ).rejects.toThrow('42501');
    await expect(
      fetchScheduledEvents(client({ data: { x: 1 }, error: null }).client)
    ).rejects.toThrow('not understood');
  });

  it('saves the seven keys, trimmed, against the stamp it read (or none for a new booking)', async () => {
    const f = client({ data: null, error: null });
    expect(
      await saveScheduledEvent(
        f.client,
        fields({ name: ' Katipunan market ', place: ' QC ' }),
        STAMP
      )
    ).toBe('saved');
    const [name, args] = f.rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(name).toBe('save_scheduled_event');
    expect(args.p_expected_updated_at).toBe(STAMP);
    expect(args.p_event).toEqual({
      id: ID,
      name: 'Katipunan market',
      place: 'QC',
      starts_on: '2026-10-24',
      ends_on: '2026-10-25',
      rent_cents: 250000,
      active: true
    });
    await saveScheduledEvent(f.client, fields(), null);
    expect(
      (f.rpc.mock.calls[1] as unknown as [string, Record<string, unknown>])[1].p_expected_updated_at
    ).toBeNull();
    // Mutation: sending a key the function does not list, or not trimming, is refused (22023).
  });

  it('classifies the outcome: stale, refused, or not sent', async () => {
    const send = (result: unknown) => saveScheduledEvent(client(result).client, fields(), STAMP);
    expect(await send({ error: { code: 'P0002' } })).toBe('conflict');
    expect(await send({ error: { code: '22023' } })).toBe('refused');
    expect(await send({ error: { code: '42501' } })).toBe('refused');
    expect(await send({ error: { code: '' } })).toBe('offline');
    const throwing = {
      rpc: vi.fn(async () => Promise.reject(new Error('net')))
    } as unknown as ScheduledClient;
    expect(await saveScheduledEvent(throwing, fields(), STAMP)).toBe('offline');
  });

  it('a link says first, again or failed, so the rent is booked once', async () => {
    const f = client({ data: [{ first_link: true }], error: null });
    expect(
      await linkScheduledEvent(f.client, ID, 'e'.repeat(8) + '-0000-4000-8000-000000000000')
    ).toBe('first');
    expect(f.rpc).toHaveBeenCalledWith('link_scheduled_event', {
      p_scheduled: ID,
      p_event: 'eeeeeeee-0000-4000-8000-000000000000'
    });
    expect(
      await linkScheduledEvent(
        client({ data: [{ first_link: false }], error: null }).client,
        ID,
        'x'
      )
    ).toBe('again');
    for (const bad of [
      { data: [], error: null },
      { data: [{ first_link: 'yes' }], error: null },
      { data: null, error: { code: '23505' } }
    ])
      expect(await linkScheduledEvent(client(bad).client, ID, 'x')).toBe('failed');
    const throwing = {
      rpc: vi.fn(async () => Promise.reject(new Error('net')))
    } as unknown as ScheduledClient;
    expect(await linkScheduledEvent(throwing, ID, 'x')).toBe('failed');
    // Mutation: reading a missing flag as true books the rent twice on a retry.
  });
});
