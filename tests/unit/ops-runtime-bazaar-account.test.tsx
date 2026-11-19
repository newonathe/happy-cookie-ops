import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, render } from '@testing-library/react';

let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));

type Row = Record<string, unknown> & { clientId: string };
const store = new Map<string, Row>();
let queueBroken = false;
vi.mock('@/lib/offline/idb', () => ({
  idb: {
    put: async (v: Row) => void store.set(v.clientId, JSON.parse(JSON.stringify(v)) as Row),
    all: async () => {
      if (queueBroken) throw new Error('queue unreadable');
      return [...store.values()];
    },
    get: async (k: string) => store.get(k),
    delete: async (k: string) => void store.delete(k),
    supported: () => true
  }
}));
vi.mock('@/lib/device', () => ({ deviceId: () => 'dev1' }));

import { OpsRuntime } from '@/store/ops-runtime';
import { OfflineBridge } from '@/components/app/offline-bridge';
import { dayEventId } from '@/lib/data/bazaar-days';
import { clearBazaar } from '@/lib/offline/bazaar-state';
import type { EventSale } from '@/store/engine/ops-engine';

/**
 * S2 (19 November 2026): a bazaar selling day belongs to the account, not the device. Opening the day on any device rebuilds
 * the till from `get_bazaar_day`, lays this phone's unsent sales and voids on top, and moves nothing. Each `Mutation:` line
 * names a change one of these tests must catch.
 */
const DAY = 'd5a00000-0000-4000-8000-000000000001';
const BOOKING = 'd5b00000-0000-4000-8000-000000000001';

interface Days {
  beginBazaarDay: (
    booking: { id: string; name: string },
    day: { id: string; day: string }
  ) => Promise<'started' | 'offline' | 'refused'>;
  refreshHeldDay: (opts?: { force?: boolean }) => Promise<void>;
  saleClient: unknown;
}
const days = (runtime: OpsRuntime) => runtime as unknown as Days;
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 20))));
const toastText = (runtime: OpsRuntime) => JSON.stringify(runtime.state.toast ?? null);
type TillSale = EventSale & { clientId?: string };
const sales = (runtime: OpsRuntime) => runtime.state.sales as TillSale[];

function mounted(withBridge = false) {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(
    <OpsRuntime ref={(r) => void (ref.current = r)}>
      {withBridge ? <OfflineBridge /> : null}
    </OpsRuntime>
  );
  return ref.current!;
}

const wireSale = (clientId: string, at: number, over: Record<string, unknown> = {}) => ({
  client_id: clientId,
  items: { dcf: 1 },
  gross_cents: 12500,
  discount_cents: 0,
  total_cents: 12500,
  pay: 'Cash',
  ref: '',
  clerk: 'Owner',
  at,
  tendered_cents: 12500,
  change_cents: 0,
  voided: false,
  voided_at: null,
  ...over
});
const dayRead = async (over: Record<string, unknown> = {}) => ({
  day_id: DAY,
  booking_id: BOOKING,
  day: '2026-10-24',
  event_id: await dayEventId(DAY),
  status: 'open',
  closed_at: null,
  float_cents: 50000,
  price_version: 0,
  prices: { dcf: 12500, wcb: 9000 },
  loaded: { dcf: 20, wcb: 5 },
  table_stock: { dcf: 18, wcb: 5 },
  sales: [
    wireSale('devA:S1:1767268800000', 1_767_268_800_000),
    wireSale('devB:S1:1767268860000', 1_767_268_860_000)
  ],
  ...over
});

type Reply = { data: unknown; error: unknown };
function server(handlers: { read?: () => Promise<Reply> | Reply; selling?: string } = {}) {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>): Promise<Reply> => {
    if (name === 'start_bazaar_day')
      return {
        data: [
          {
            event_id: args.p_event_id,
            selling_device: handlers.selling ?? 'dev1',
            float_cents: 50000,
            prices: { dcf: 12500, wcb: 9000 },
            loaded: { dcf: 20, wcb: 5 }
          }
        ],
        error: null
      };
    if (name === 'get_bazaar_day')
      return handlers.read ? handlers.read() : { data: await dayRead(), error: null };
    if (name === 'set_event_device') return { data: args.p_device, error: null };
    return { data: null, error: { code: 'PGRST202' } };
  });
  return { client: { rpc }, rpc };
}
const begin = (runtime: OpsRuntime) =>
  days(runtime).beginBazaarDay(
    { id: BOOKING, name: 'Katipunan market' },
    { id: DAY, day: '2026-10-24' }
  );
const open = async (runtime: OpsRuntime) => {
  let outcome: string | undefined;
  await act(async () => {
    outcome = await begin(runtime);
  });
  return outcome;
};
const queued = (over: Record<string, unknown>): Row =>
  ({
    kind: 'sale',
    saleId: 'S1',
    eventId: null,
    items: { dcf: 1 },
    gross: 125,
    discount: 0,
    total: 125,
    pay: 'Cash',
    ref: '',
    clerk: 'Owner',
    at: 1_767_268_900_000,
    tendered: 125,
    change: 0,
    state: 'pending',
    attempts: 0,
    lastError: null,
    ...over
  }) as unknown as Row;

beforeEach(() => {
  live = true;
  queueBroken = false;
  store.clear();
  localStorage.clear();
  clearBazaar();
});
afterEach(() => cleanup());

describe('opening the day on a second device (S2)', () => {
  it('shows every sale the account made and the true table stock, and moves nothing', async () => {
    const runtime = mounted();
    // Another phone started the day and is the selling device on the server's record.
    const { client, rpc } = server({ selling: 'other-phone' });
    days(runtime).saleClient = client;
    expect(await open(runtime)).toBe('started');

    // Mutation: calling set_event_device, as before migration 93, would move the day off the other phone.
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(['start_bazaar_day', 'get_bazaar_day']);
    expect(rpc.mock.calls[1]![1]).toEqual({ p_day: DAY });
    expect(sales(runtime).map((s) => s.clientId)).toEqual([
      'devB:S1:1767268860000',
      'devA:S1:1767268800000'
    ]);
    expect(sales(runtime).map((s) => s.id)).toEqual(['S2', 'S1']);
    expect(sales(runtime)[0]).toMatchObject({
      total: 125,
      pay: 'Cash',
      synced: true,
      failed: false
    });
    // Mutation: starting from the planned stock would show 20 and 5 here.
    expect(runtime.state.eventStock).toMatchObject({ dcf: 18, wcb: 5 });
    expect(runtime.state.eventLoaded).toMatchObject({ dcf: 20, wcb: 5 });
    expect(runtime.state.unsynced).toBe(0);
    expect(toastText(runtime)).not.toContain('planned stock');
    expect(toastText(runtime)).not.toContain('Selling now');
  });

  it('lays this phone’s unsent sale on top, once, and never drops its row', async () => {
    const eventId = await dayEventId(DAY);
    store.set('dev1:S1:1767268900000', queued({ clientId: 'dev1:S1:1767268900000', eventId }));
    // A sent row the server's read already has: one sale, not two.
    store.set(
      'devA:S1:1767268800000',
      queued({ clientId: 'devA:S1:1767268800000', eventId, at: 1_767_268_800_000, state: 'sent' })
    );
    const runtime = mounted();
    const { client } = server();
    days(runtime).saleClient = client;
    await open(runtime);

    expect(sales(runtime).map((s) => s.clientId)).toEqual([
      'dev1:S1:1767268900000',
      'devB:S1:1767268860000',
      'devA:S1:1767268800000'
    ]);
    expect(sales(runtime)[0]).toMatchObject({ synced: false, failed: false, total: 125 });
    expect(runtime.state.eventStock).toMatchObject({ dcf: 17, wcb: 5 });
    expect(runtime.state.unsynced).toBe(1);
    // The unacknowledged row is exactly as it was: still pending, still there.
    expect(store.get('dev1:S1:1767268900000')).toMatchObject({ state: 'pending', total: 125 });
  });

  it('hides a sale this phone voided that the server does not have the void for yet, and puts its cookies back', async () => {
    const eventId = await dayEventId(DAY);
    store.set('void:devA:S1:1767268800000', {
      clientId: 'void:devA:S1:1767268800000',
      kind: 'void',
      saleClientId: 'devA:S1:1767268800000',
      at: 1_767_268_950_000,
      state: 'pending',
      attempts: 0,
      lastError: null
    } as Row);
    void eventId;
    const runtime = mounted();
    days(runtime).saleClient = server().client;
    await open(runtime);
    expect(sales(runtime).map((s) => s.clientId)).toEqual(['devB:S1:1767268860000']);
    expect(runtime.state.eventStock).toMatchObject({ dcf: 19 });
  });

  it('keeps a sale another device voided out of the list, and its cookies on the table the server reports', async () => {
    const runtime = mounted();
    const read = await dayRead({
      table_stock: { dcf: 19, wcb: 5 },
      sales: [
        wireSale('devA:S1:1767268800000', 1_767_268_800_000, {
          voided: true,
          voided_at: 1_767_268_900_000
        }),
        wireSale('devB:S1:1767268860000', 1_767_268_860_000)
      ]
    });
    days(runtime).saleClient = server({ read: () => ({ data: read, error: null }) }).client;
    await open(runtime);
    expect(sales(runtime).map((s) => s.clientId)).toEqual(['devB:S1:1767268860000']);
    expect(runtime.state.eventStock).toMatchObject({ dcf: 19 });
  });
});

describe('a database without the read yet', () => {
  it('falls back to moving the selling device here, with the existing toast', async () => {
    const runtime = mounted();
    const { client, rpc } = server({
      selling: 'other-phone',
      read: () => ({ data: null, error: { code: 'PGRST202', message: 'no function' } })
    });
    days(runtime).saleClient = client;
    expect(await open(runtime)).toBe('started');
    const moved = rpc.mock.calls.find((c) => c[0] === 'set_event_device');
    expect(moved?.[1]).toEqual({ p_event: await dayEventId(DAY), p_device: 'dev1' });
    expect(runtime.state.eventStock).toMatchObject({ dcf: 20, wcb: 5 });
    expect(sales(runtime)).toEqual([]);
    expect(toastText(runtime)).toContain('starts from the planned stock');
  });

  it('opens a day this phone started with no move at all', async () => {
    const runtime = mounted();
    const { client, rpc } = server({ read: () => ({ data: null, error: { code: '42883' } }) });
    days(runtime).saleClient = client;
    expect(await open(runtime)).toBe('started');
    expect(rpc.mock.calls.some((c) => c[0] === 'set_event_device')).toBe(false);
  });
});

describe('a read that fails', () => {
  it.each([
    ['no answer', { data: null, error: { code: '08006' } }, 'offline'],
    ['a refusal', { data: null, error: { code: '42501' } }, 'refused'],
    ['an answer that is not understood', { data: { day_id: 'x' }, error: null }, 'offline']
  ])('%s opens no till and says so', async (_why, reply, expected) => {
    const runtime = mounted();
    days(runtime).saleClient = server({ read: () => reply }).client;
    expect(await open(runtime)).toBe(expected);
    expect(runtime.state.event).toBeNull();
    expect(toastText(runtime)).toContain('could not be loaded');
  });

  it('refuses a read that names another event', async () => {
    const runtime = mounted();
    const read = await dayRead({ event_id: 'aaaaaaaa-0000-4000-8000-000000000009' });
    days(runtime).saleClient = server({ read: () => ({ data: read, error: null }) }).client;
    expect(await open(runtime)).toBe('offline');
    expect(runtime.state.event).toBeNull();
  });
});

describe('a queue that cannot be read', () => {
  it('opens no till rather than show the server’s day without this phone’s unsent sales', async () => {
    const runtime = mounted();
    days(runtime).saleClient = server().client;
    queueBroken = true;
    expect(await open(runtime)).toBe('offline');
    expect(runtime.state.event).toBeNull();
    expect(toastText(runtime)).toContain('could not be loaded');
  });
});

describe('reading the open day again', () => {
  it('brings in a sale rung on another device, and a void, without disturbing this phone’s unsent sale', async () => {
    const runtime = mounted();
    let read = await dayRead();
    days(runtime).saleClient = server({ read: () => ({ data: read, error: null }) }).client;
    await open(runtime);
    act(() => runtime.setState({ role: 'owner' }));
    const eventId = await dayEventId(DAY);
    store.set(
      'dev1:S3:1767268900000',
      queued({ clientId: 'dev1:S3:1767268900000', eventId, saleId: 'S3' })
    );

    // Meanwhile on her other device: a third sale, and the first is voided.
    read = await dayRead({
      table_stock: { dcf: 17, wcb: 5 },
      sales: [
        wireSale('devA:S1:1767268800000', 1_767_268_800_000, {
          voided: true,
          voided_at: 1_767_268_920_000
        }),
        wireSale('devB:S1:1767268860000', 1_767_268_860_000),
        wireSale('devB:S2:1767268880000', 1_767_268_880_000)
      ]
    });
    await act(async () => void (await days(runtime).refreshHeldDay({ force: true })));
    expect(sales(runtime).map((s) => s.clientId)).toEqual([
      'dev1:S3:1767268900000',
      'devB:S2:1767268880000',
      'devB:S1:1767268860000'
    ]);
    expect(runtime.state.eventStock).toMatchObject({ dcf: 16 });
    expect(runtime.state.unsynced).toBe(1);
  });

  it('changes nothing when the read cannot be made', async () => {
    const runtime = mounted();
    let fail = false;
    days(runtime).saleClient = server({
      read: async () =>
        fail ? { data: null, error: { code: '08006' } } : { data: await dayRead(), error: null }
    }).client;
    await open(runtime);
    act(() => runtime.setState({ role: 'owner' }));
    const before = sales(runtime);
    fail = true;
    await act(async () => void (await days(runtime).refreshHeldDay({ force: true })));
    expect(sales(runtime)).toEqual(before);
    expect(runtime.state.eventStock).toMatchObject({ dcf: 18 });
  });

  it('asks nothing while offline, and at most once in a while without force', async () => {
    const runtime = mounted();
    const { client, rpc } = server();
    days(runtime).saleClient = client;
    await open(runtime);
    act(() => runtime.setState({ role: 'owner' }));
    rpc.mockClear();
    act(() => runtime.setState({ online: false }));
    await act(async () => void (await days(runtime).refreshHeldDay({ force: true })));
    expect(rpc).not.toHaveBeenCalled();
    act(() => runtime.setState({ online: true }));
    await act(async () => void (await days(runtime).refreshHeldDay({ force: true })));
    await act(async () => void (await days(runtime).refreshHeldDay()));
    expect(rpc.mock.calls.filter((c) => c[0] === 'get_bazaar_day')).toHaveLength(1);
  });
});

describe('sales taken back from the server are never sent again', () => {
  it('the offline bridge queues nothing for them', async () => {
    const runtime = mounted(true);
    days(runtime).saleClient = server({ selling: 'other-phone' }).client;
    await open(runtime);
    await settle();
    // devA's and devB's sales are on the server already: queueing them as this device's would send each twice.
    expect([...store.values()].filter((r) => r.kind !== 'void' && r.kind !== 'sale')).toEqual([]);
    expect([...store.keys()].filter((k) => k.startsWith('dev1:'))).toEqual([]);
  });
});

describe('the bridge and a reload keep every sale exactly once', () => {
  it('queues a sale that has an id of its own but is not synced and not in the queue, under that id', async () => {
    const runtime = mounted(true);
    days(runtime).saleClient = server().client;
    await open(runtime);
    await settle();
    // A phone's own sale whose copy into IndexedDB had not landed when the day was read again: it carries its id, unsynced.
    act(() =>
      runtime.setState({
        sales: [
          {
            id: 'S9',
            clientId: 'dev1:S4:1767268900000',
            items: { dcf: 1 },
            total: 125,
            gross: 125,
            discount: 0,
            pay: 'Cash',
            ref: '',
            clerk: 'Owner',
            at: 1_767_268_900_000,
            tendered: 125,
            change: 0,
            synced: false,
            failed: false,
            ledgerId: null
          },
          ...sales(runtime)
        ]
      } as never)
    );
    await settle();
    // (the mock server refuses the send, so the row may already be marked failed: what matters is that it is held)
    expect(store.get('dev1:S4:1767268900000')).toMatchObject({ total: 125 });
    expect(store.get('dev1:S4:1767268900000')?.state).not.toBe('sent');
    expect([...store.keys()].filter((k) => k.startsWith('dev1:'))).toEqual([
      'dev1:S4:1767268900000'
    ]);
  });

  it('after a reload the day on the phone sends nothing new', async () => {
    const eventId = await dayEventId(DAY);
    store.set('dev1:S1:1767268900000', queued({ clientId: 'dev1:S1:1767268900000', eventId }));
    const first = mounted(true);
    days(first).saleClient = server().client;
    await open(first);
    await settle();
    act(() => first.persist(true));
    const keys = [...store.keys()].sort();
    cleanup();
    mounted(true);
    await settle();
    // The own unsent sale is renumbered on screen, but it is still the one row under its own id; the server's two are not queued.
    expect([...store.keys()].sort()).toEqual(keys);
    expect(keys).toEqual(['dev1:S1:1767268900000']);
  });
});
