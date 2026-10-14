import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';

let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));

type Row = Record<string, unknown> & { clientId: string };
const store = new Map<string, Row>();
vi.mock('@/lib/offline/idb', () => ({
  idb: {
    put: async (v: Row) => void store.set(v.clientId, JSON.parse(JSON.stringify(v)) as Row),
    all: async () => [...store.values()],
    get: async (k: string) => store.get(k),
    delete: async (k: string) => void store.delete(k),
    supported: () => true
  }
}));
vi.mock('@/lib/device', () => ({ deviceId: () => 'dev1' }));

import { OpsRuntime } from '@/store/ops-runtime';
import { ScheduledEventsForm } from '@/components/live/scheduled-events-form';
import { BazaarModeScreen } from '@/components/screens/bazaar-mode';
import type { Role } from '@/store/engine/ops-engine';
import type { LiveScheduledRow } from '@/view-models/vals';

/**
 * D4: the owner's upcoming bazaars. Cine adds her real bookings in a form; the Bazaar screen lists the ones still to
 * come (in live mode the ported prototype events are never shown); a link saved before S2 is still retried, and the database books
 * the stall rent with the first link, so a retry can never book it twice. A day is started from the Bazaar page (S2). Each `Mutation:` line names a change one of these tests must catch.
 */
const STAMP = '2026-09-30T02:00:00.123456+00:00';
// Tuesday 20 Oct 2026, 11:00 in Manila.
const NOW = new Date('2026-10-20T03:00:00Z');
const ID1 = 'd4a00000-0000-4000-8000-000000000001';
const ID2 = 'd4a00000-0000-4000-8000-000000000002';

type Wire = Record<string, unknown>;
const wire = (over: Wire = {}): Wire => ({
  id: ID1,
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

interface Fake {
  rows: Wire[];
  link: { data: unknown; error: unknown };
  save: { data: unknown; error: unknown };
}
function fakeClient(state: Fake) {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown> = {}) => {
    if (name === 'get_scheduled_events') return { data: state.rows, error: null };
    if (name === 'save_scheduled_event') return state.save;
    if (name === 'link_scheduled_event') return state.link;
    if (name === 'start_event')
      return {
        data: [
          {
            event_id: args.p_event_id,
            starts_at: 'x',
            selling_device: 'dev1',
            prices: { dcf: 12500 }
          }
        ],
        error: null
      };
    if (name === 'add_event_expense') {
      const p = args.p_expense as { clientId: string };
      return { data: [{ client_id: p.clientId, duplicate: false }], error: null };
    }
    return { data: null, error: null };
  });
  return { rpc, client: { rpc } };
}
const called = (rpc: ReturnType<typeof fakeClient>['rpc'], name: string) =>
  rpc.mock.calls.filter((c) => c[0] === name) as unknown as Array<
    [string, Record<string, unknown>]
  >;

const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 30))));
const rentRows = (r: OpsRuntime) =>
  (r.state.ledger as Array<{ cat?: string; label?: string; amount?: number }>).filter(
    (e) => e.cat === 'Bazaar rent'
  );
const toasts = (r: OpsRuntime) => JSON.stringify(r.state.toast ?? r.state.toasts ?? '');

interface Bazaar {
  saleClient: unknown;
}
async function mounted(role: Role, state: Fake) {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
  const runtime = ref.current!;
  act(() => runtime.setRole(role));
  const f = fakeClient(state);
  (runtime as unknown as Bazaar).saleClient = f.client;
  await act(async () => {
    await runtime.loadScheduledEvents(f.client as never);
  });
  f.rpc.mockClear();
  return { runtime, ...f };
}
const fresh = (over: Partial<Fake> = {}): Fake => ({
  rows: [wire()],
  link: { data: [{ first_link: true }], error: null },
  save: { data: [{ id: ID1, updated_at: STAMP }], error: null },
  ...over
});
const events = (r: OpsRuntime) =>
  r.renderVals().events as Array<{ name: string; date: string; place: string; go: () => void }>;
const entry = (r: OpsRuntime) =>
  r
    .renderVals()
    .toolGroups.flatMap((g) => g.items)
    .find((i) => i.label === 'Bazaar events');

describe('D4: the Bazaar screen lists the owner’s bookings (live mode)', () => {
  beforeEach(() => {
    live = true;
    store.clear();
    localStorage.clear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('offers no start list in live mode: her bookings are planned by day on the Bazaar page, and the prototype events are never shown', async () => {
    const { runtime } = await mounted(
      'owner',
      fresh({ rows: [wire(), wire({ id: ID2, name: 'Christmas bazaar' })] })
    );
    expect(events(runtime)).toEqual([]);
    act(() => runtime.setState({ screen: 'bazaar' }));
    const { container } = render(<BazaarModeScreen v={runtime.renderVals()} />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/Katipunan Weekend Market|UP Town Center Pop-up|Katipunan market/);
    // Mutation: falling back to the ported list shows two prototype events that are not hers, one tap from a real start.
  });

  it('demo mode keeps the ported list and reads nothing', async () => {
    live = false;
    const ref: { current: OpsRuntime | null } = { current: null };
    render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
    const f = fakeClient(fresh());
    expect(await ref.current!.loadScheduledEvents(f.client as never)).toBe(false);
    expect(f.rpc).not.toHaveBeenCalled();
    expect(events(ref.current!).map((e) => e.name)).toEqual([
      'Katipunan Weekend Market',
      'UP Town Center Pop-up'
    ]);
  });

  it('an unconfirmed link saved by an earlier build is retried when the list loads; the first confirmed link says the rent is booked', async () => {
    const { runtime } = await mounted('owner', fresh());
    act(() =>
      runtime.setState({
        event: { id: 'e1', name: 'Katipunan market', stage: 'selling' } as never
      })
    );
    localStorage.setItem(
      'hc-pending-link',
      JSON.stringify([{ scheduledId: ID1, eventId: 'e1', rentCents: 250000, at: Date.now() }])
    );
    const later = fakeClient(fresh());
    await act(async () => {
      await runtime.loadScheduledEvents(later.client as never);
    });
    await settle();
    expect(called(later.rpc, 'link_scheduled_event')[0]![1]).toEqual({
      p_scheduled: ID1,
      p_event: 'e1'
    });
    expect(called(later.rpc, 'add_event_expense')).toHaveLength(0);
    expect(localStorage.getItem('hc-pending-link')).toBeNull();
    expect(rentRows(runtime)).toMatchObject([
      { label: 'Katipunan market — Stall rent', amount: 2500 }
    ]);
    // Mutation: booking the rent from the phone as well books it twice; a random client id could not tell.
  });

  it('a link that keeps failing stays pending, and one older than three days is dropped', async () => {
    const { runtime } = await mounted('owner', fresh());
    localStorage.setItem(
      'hc-pending-link',
      JSON.stringify([{ scheduledId: ID1, eventId: 'e1', rentCents: 100, at: Date.now() }])
    );
    const down = fakeClient(fresh({ link: { data: null, error: { code: '57014' } } }));
    await act(async () => {
      await runtime.loadScheduledEvents(down.client as never);
    });
    await settle();
    expect(localStorage.getItem('hc-pending-link')).not.toBeNull();
    localStorage.setItem(
      'hc-pending-link',
      JSON.stringify([
        { scheduledId: ID1, eventId: 'e1', rentCents: 100, at: Date.now() - 4 * 86_400_000 }
      ])
    );
    const up = fakeClient(fresh());
    await act(async () => {
      await runtime.loadScheduledEvents(up.client as never);
    });
    await settle();
    expect(called(up.rpc, 'link_scheduled_event')).toHaveLength(0);
  });

  it('several unconfirmed links are all kept and retried; one for an event no longer on screen only tells her', async () => {
    const { runtime } = await mounted('owner', fresh());
    localStorage.setItem(
      'hc-pending-link',
      JSON.stringify([
        { scheduledId: ID1, eventId: 'e1', rentCents: 250000, at: Date.now() },
        { scheduledId: ID2, eventId: 'e2', rentCents: 0, at: Date.now() }
      ])
    );
    const up = fakeClient(fresh());
    await act(async () => {
      await runtime.loadScheduledEvents(up.client as never);
    });
    await settle();
    expect(called(up.rpc, 'link_scheduled_event').map((c) => c[1].p_scheduled)).toEqual([ID1, ID2]);
    expect(localStorage.getItem('hc-pending-link')).toBeNull();
    expect(rentRows(runtime)).toEqual([]);
    expect(toasts(runtime)).toContain('₱2,500.00 stall rent booked as an event expense');
    // Mutation: one saved slot loses the first booking's link (and its rent) when a second start fails.
  });
});

describe('D4: the owner’s form', () => {
  beforeEach(() => {
    live = true;
    store.clear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const open = async (r: OpsRuntime) => {
    await act(async () => entry(r)!.go());
    await settle();
    return r.renderVals().liveScheduled!;
  };

  it('is the owner’s alone', async () => {
    const helper = await mounted('helper', fresh());
    expect(entry(helper.runtime)).toBeUndefined();
    act(() => helper.runtime.setRole('owner'));
    await open(helper.runtime);
    expect(helper.runtime.renderVals().liveScheduled).not.toBeNull();
    act(() => helper.runtime.setRole('helper'));
    act(() => helper.runtime.sheet('scheduledevents', {}));
    expect(helper.runtime.renderVals().liveScheduled ?? null).toBeNull();
    // Mutation: dropping the role test shows the form to a helper who opens the sheet kind directly.
  });

  it('opens on the bookings as read, with the id the blank row will use, rent in pesos', async () => {
    const { runtime } = await mounted('owner', fresh());
    const vals = await open(runtime);
    expect(runtime.renderVals().sheet).toMatchObject({ liveForm: true, title: 'Bazaar events' });
    expect(vals.rows).toEqual([
      {
        id: ID1,
        name: 'Katipunan market',
        startsOn: '2026-10-24',
        endsOn: '2026-10-25',
        place: 'Katipunan Ave, QC',
        rentPesos: 2500,
        active: true,
        started: false
      }
    ]);
    expect(vals.newId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('saves only what changed: a new booking with no stamp, an edited one with its stamp, and nothing else', async () => {
    const { runtime, rpc } = await mounted(
      'owner',
      fresh({
        rows: [
          wire(),
          wire({ id: ID2, name: 'Christmas', updated_at: '2026-09-30T03:00:00+00:00' })
        ]
      })
    );
    const vals = await open(runtime);
    rpc.mockClear();
    const add: LiveScheduledRow = {
      id: vals.newId,
      name: 'UP Town pop-up',
      startsOn: '2026-11-07',
      endsOn: '2026-11-08',
      place: 'UP Town Center',
      rentPesos: 1800.5,
      active: true,
      started: false
    };
    act(() => vals.save([{ ...vals.rows[0]!, rentPesos: 3000 }, vals.rows[1]!, add]));
    await settle();
    const saves = called(rpc, 'save_scheduled_event');
    expect(saves).toHaveLength(2);
    expect(saves[0]![1]).toMatchObject({ p_expected_updated_at: STAMP });
    expect((saves[0]![1].p_event as Wire).rent_cents).toBe(300000);
    expect(saves[1]![1].p_expected_updated_at).toBeNull();
    expect(saves[1]![1].p_event).toMatchObject({
      id: vals.newId,
      rent_cents: 180050,
      place: 'UP Town Center'
    });
    expect(toasts(runtime)).toContain('saved');
    expect(runtime.renderVals().liveScheduled ?? null).toBeNull(); // saved: the sheet closes
    // Mutation: sending every row re-stamps bookings nobody touched and turns a quiet edit into a conflict for the next person.
  });

  it('a booking the database would refuse is not sent, and nothing is sent when any row is bad', async () => {
    const { runtime, rpc } = await mounted('owner', fresh());
    const vals = await open(runtime);
    rpc.mockClear();
    const bad = { ...vals.rows[0]!, startsOn: '2026-10-26', endsOn: '2026-10-25' };
    const good: LiveScheduledRow = {
      ...vals.rows[0]!,
      id: vals.newId,
      name: 'Fine',
      rentPesos: 10
    };
    act(() => vals.save([good, bad]));
    await settle();
    expect(called(rpc, 'save_scheduled_event')).toEqual([]);
    expect(toasts(runtime)).toContain('before it starts');
    act(() => vals.save([{ ...vals.rows[0]!, rentPesos: Number.NaN }]));
    await settle();
    expect(called(rpc, 'save_scheduled_event')).toEqual([]);
    // Mutation: validating as each row is sent saves the good row and leaves the bad one behind on screen.
  });

  it('a change made elsewhere meanwhile shows their version, and a refusal or a lost connection say so', async () => {
    const stale = await mounted('owner', fresh({ save: { data: null, error: { code: 'P0002' } } }));
    const v1 = await open(stale.runtime);
    act(() => v1.save([{ ...v1.rows[0]!, name: 'Changed' }]));
    await settle();
    expect(toasts(stale.runtime)).toContain('Someone else');
    expect(called(stale.rpc, 'get_scheduled_events').length).toBeGreaterThanOrEqual(2);
    expect(stale.runtime.renderVals().liveScheduled).not.toBeNull();
    expect(stale.runtime.renderVals().liveScheduled!.version).toBeGreaterThan(v1.version);
    cleanup();
    for (const [save, words] of [
      [{ data: null, error: { code: '22023' } }, 'could not be saved'],
      [{ data: null, error: { code: '' } }, 'Offline']
    ] as const) {
      const f = await mounted('owner', fresh({ save }));
      const v = await open(f.runtime);
      act(() => v.save([{ ...v.rows[0]!, name: 'Changed' }]));
      await settle();
      expect(toasts(f.runtime)).toContain(words);
      expect(f.runtime.renderVals().liveScheduled).not.toBeNull();
      cleanup();
    }
  });

  it('a create whose reply was lost leaves a new blank row on a new id', async () => {
    const state = fresh({ save: { data: null, error: { code: '' } } });
    const { runtime } = await mounted('owner', state);
    const v = await open(runtime);
    state.rows.push(wire({ id: v.newId, name: 'Saved but unanswered' }));
    act(() =>
      v.save([
        {
          ...v.rows[0]!,
          id: v.newId,
          name: 'Saved but unanswered',
          startsOn: '2026-11-01',
          endsOn: '2026-11-01'
        }
      ])
    );
    await settle();
    const after = runtime.renderVals().liveScheduled!;
    expect(after.newId).not.toBe(v.newId);
    expect(after.version).toBeGreaterThan(v.version);
    // Mutation: keeping the id types the next booking onto the saved row and reads as a conflict.
  });

  it('a failed read does not open the sheet', async () => {
    const ref: { current: OpsRuntime | null } = { current: null };
    render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
    act(() => ref.current!.setRole('owner'));
    await act(async () => {
      await ref.current!.loadScheduledEvents({
        rpc: vi.fn(async () => ({ data: null, error: { code: '57014' } }))
      } as never);
    });
    await act(async () => entry(ref.current!)!.go());
    await settle();
    expect(ref.current!.renderVals().liveScheduled ?? null).toBeNull();
    expect(toasts(ref.current!)).toContain('Offline');
  });
});

describe('the form component reads itself back', () => {
  afterEach(() => cleanup());
  const rows: LiveScheduledRow[] = [
    {
      id: ID1,
      name: 'Katipunan market',
      startsOn: '2026-10-24',
      endsOn: '2026-10-25',
      place: 'Katipunan Ave, QC',
      rentPesos: 2500,
      active: true,
      started: false
    },
    {
      id: ID2,
      name: 'Christmas',
      startsOn: '2026-12-12',
      endsOn: '2026-12-13',
      place: '',
      rentPesos: 0,
      active: true,
      started: true
    }
  ];
  const setup = () => {
    const save = vi.fn();
    const view = render(
      <ScheduledEventsForm
        liveScheduled={{
          online: true,
          rows,
          newId: 'd4a00000-0000-4000-8000-0000000000aa',
          version: 0,
          save,
          close: vi.fn()
        }}
      />
    );
    const input = (name: string) =>
      view.container.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
    return {
      save,
      input,
      submit: () => fireEvent.submit(view.container.querySelector('form')!),
      view
    };
  };

  it('sends back exactly what it showed when nothing is touched, without the blank new row', () => {
    const { save, submit } = setup();
    submit();
    expect(save).toHaveBeenCalledWith(rows);
    // Mutation: not skipping the blank new row sends a booking with no name.
  });

  it('reads edits, a switched-off booking and a filled new row under the id it was given', () => {
    const { save, input, submit, view } = setup();
    fireEvent.change(input('evRent0'), { target: { value: '3000.5' } });
    fireEvent.click(input('evOn1'));
    fireEvent.change(input('evName2'), { target: { value: '  UP Town  ' } });
    fireEvent.change(input('evStart2'), { target: { value: '2026-11-07' } });
    fireEvent.change(input('evEnd2'), { target: { value: '2026-11-08' } });
    submit();
    const sent = save.mock.calls[0]![0] as LiveScheduledRow[];
    expect(sent[0]).toMatchObject({ id: ID1, rentPesos: 3000.5 });
    expect(sent[1]).toMatchObject({ id: ID2, active: false, started: true });
    expect(sent[2]).toMatchObject({
      id: 'd4a00000-0000-4000-8000-0000000000aa',
      name: 'UP Town',
      startsOn: '2026-11-07',
      endsOn: '2026-11-08',
      rentPesos: 0,
      active: true,
      started: false
    });
    expect(view.container.textContent).toContain('already started');
    // Mutation: minting a new id on every read makes a lost-reply retry create a second booking.
  });
});
