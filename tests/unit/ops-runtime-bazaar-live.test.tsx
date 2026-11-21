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
 * S4 (20 November 2026): the held day is live. While a signed-in owner or helper with signal holds a started day, the runtime
 * listens to that day's changes and reads the day again (the S2 read and queue merge) after a burst settles. Each `Mutation:`
 * line names a change one of these tests must catch.
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
interface FakeChannel {
  name: string;
  filters: Array<Record<string, string>>;
  handlers: Array<() => void>;
  status?: (status: string) => void;
  removed: boolean;
  on: (type: string, filter: Record<string, string>, cb: () => void) => FakeChannel;
  subscribe: (cb?: (status: string) => void) => FakeChannel;
}
/** A client that answers the day's RPCs and can be listened to (the real browser client does both). */
function server(
  handlers: {
    read?: () => Promise<Reply> | Reply;
    openDay?: () => Reply;
    channels?: boolean;
  } = {}
) {
  const channels: FakeChannel[] = [];
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>): Promise<Reply> => {
    if (name === 'start_bazaar_day')
      return {
        data: [
          {
            event_id: args.p_event_id,
            selling_device: 'dev1',
            float_cents: 50000,
            prices: { dcf: 12500, wcb: 9000 },
            loaded: { dcf: 20, wcb: 5 }
          }
        ],
        error: null
      };
    if (name === 'get_bazaar_day')
      return handlers.read ? handlers.read() : { data: await dayRead(), error: null };
    if (name === 'get_open_bazaar_day' && handlers.openDay) return handlers.openDay();
    return { data: null, error: { code: 'PGRST202' } };
  });
  const base = { rpc };
  const client =
    handlers.channels === false
      ? base
      : {
          ...base,
          channel(name: string) {
            const ch: FakeChannel = {
              name,
              filters: [],
              handlers: [],
              removed: false,
              on(_type, filter, cb) {
                ch.filters.push(filter);
                ch.handlers.push(cb);
                return ch;
              },
              subscribe(cb) {
                ch.status = cb;
                return ch;
              }
            };
            channels.push(ch);
            return ch;
          },
          removeChannel: vi.fn((ch: FakeChannel) => void (ch.removed = true))
        };
  return { client, rpc, channels };
}
const reads = (rpc: ReturnType<typeof server>['rpc']) =>
  rpc.mock.calls.filter((c) => c[0] === 'get_bazaar_day').length;
const live1 = (channels: FakeChannel[]) => channels.filter((c) => !c.removed);
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

const IDENTITY = {
  userId: 'u0000000-0000-4000-8000-000000000001',
  business: 'https://happy-cookie.test'
};
const wait = (ms: number) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));
/** The day is open on this phone for a signed-in owner, with signal. */
async function held(runtime: OpsRuntime, client: unknown) {
  days(runtime).saleClient = client;
  act(() => runtime.setState({ role: 'owner', online: true, screen: 'bazaar' }));
  act(() => runtime.bindStaffIdentity(IDENTITY));
  expect(await open(runtime)).toBe('started');
}

describe('the held day, live (S4)', () => {
  it('listens to this day only once someone is signed in and a started day is held', async () => {
    const runtime = mounted();
    const { client, channels } = server();
    days(runtime).saleClient = client;
    act(() => runtime.setState({ role: 'owner', online: true, screen: 'bazaar' }));
    expect(await open(runtime)).toBe('started');
    // Mutation: listening before the staff identity is bound would open a subscription for an unverified page.
    expect(channels).toHaveLength(0);
    act(() => runtime.bindStaffIdentity(IDENTITY));
    expect(live1(channels)).toHaveLength(1);
    const event = (runtime.state.event as { id: string }).id;
    expect(channels[0]!.name).toMatch(new RegExp(`^bazaar-day-${DAY}-[0-9]+$`));
    expect(channels[0]!.filters.map((f) => `${f.table}:${f.filter}`)).toEqual([
      `event_sales:event_id=eq.${event}`,
      `bazaar_stock_adds:day_id=eq.${DAY}`,
      `bazaar_losses:day_id=eq.${DAY}`
    ]);
    // Re-rendering for any other reason does not open a second one.
    act(() => runtime.setState({}));
    expect(channels).toHaveLength(1);
  });

  it('shows a sale another device rang, and its void, a moment after the change is heard, with no reload', async () => {
    const runtime = mounted();
    let read = await dayRead();
    const { client, rpc, channels } = server({ read: () => ({ data: read, error: null }) });
    await held(runtime, client);
    expect(sales(runtime)).toHaveLength(2);
    const before = reads(rpc);

    // Her other device sells a third; the database tells this one.
    read = await dayRead({
      table_stock: { dcf: 17, wcb: 5 },
      sales: [...(await dayRead()).sales, wireSale('devB:S2:1767268980000', 1_767_268_980_000)]
    });
    channels[0]!.handlers[0]!();
    await wait(500);
    // Mutation: ignoring the change leaves the third sale off the till until a reload.
    expect(reads(rpc)).toBe(before + 1);
    expect(sales(runtime).map((x) => x.clientId)).toEqual([
      'devB:S2:1767268980000',
      'devB:S1:1767268860000',
      'devA:S1:1767268800000'
    ]);
    expect(runtime.state.eventStock).toMatchObject({ dcf: 17 });

    // The first sale is voided over there.
    read = await dayRead({
      table_stock: { dcf: 18, wcb: 5 },
      sales: [
        wireSale('devA:S1:1767268800000', 1_767_268_800_000, {
          voided: true,
          voided_at: 1_767_268_990_000
        }),
        wireSale('devB:S1:1767268860000', 1_767_268_860_000),
        wireSale('devB:S2:1767268980000', 1_767_268_980_000)
      ]
    });
    channels[0]!.handlers[0]!();
    await wait(500);
    expect(sales(runtime).map((x) => x.clientId)).toEqual([
      'devB:S2:1767268980000',
      'devB:S1:1767268860000'
    ]);
    expect(runtime.state.eventStock).toMatchObject({ dcf: 18 });
  });

  it('lets go when the server confirms the held day was closed elsewhere', async () => {
    const runtime = mounted();
    let closed = false;
    const { client, channels, rpc } = server({
      read: async () => ({
        data: await dayRead(closed ? { status: 'closed', closed_at: 1_767_268_900_000 } : {}),
        error: null
      })
    });
    await held(runtime, client);
    expect(runtime.state.event).not.toBeNull();
    const before = reads(rpc);
    closed = true;
    channels[0]!.handlers[0]!();
    await wait(600);
    expect(reads(rpc)).toBeGreaterThan(before);
    expect(runtime.state.event).toBeNull();
    expect(channels[0]!.removed).toBe(true);
  });

  it('confirms a helper’s denied day read through the open-day RPC before letting go', async () => {
    const runtime = mounted();
    let closed = false;
    const { client, channels, rpc } = server({
      read: async () =>
        closed ? { data: null, error: { code: '42501' } } : { data: await dayRead(), error: null },
      openDay: () => ({ data: null, error: null })
    });
    await held(runtime, client);
    act(() => runtime.setState({ role: 'helper' }));
    const watch = live1(channels)[0]!;
    expect(runtime.state.event).not.toBeNull();
    closed = true;
    watch.handlers[0]!();
    await wait(600);
    expect(rpc.mock.calls.some(([name]) => name === 'get_open_bazaar_day')).toBe(true);
    expect(runtime.state.event).toBeNull();
  });

  it('keeps the held day and its unacknowledged sale after a remote close', async () => {
    const runtime = mounted();
    const eventId = await dayEventId(DAY);
    const receipt = queued({ clientId: 'dev1:S1:1767268900000', eventId });
    store.set(receipt.clientId, receipt);
    let closed = false;
    const { client, channels, rpc } = server({
      read: async () => ({
        data: await dayRead(closed ? { status: 'closed', closed_at: 1_767_268_900_000 } : {}),
        error: null
      })
    });
    await held(runtime, client);
    const before = reads(rpc);
    closed = true;
    channels[0]!.handlers[0]!();
    await wait(600);
    expect(reads(rpc)).toBeGreaterThan(before);
    expect(runtime.state.event).toMatchObject({ dayId: DAY });
    expect(sales(runtime).some((sale) => sale.clientId === receipt.clientId)).toBe(true);
    expect(store.get(receipt.clientId)).toEqual(receipt);
  });

  it('a burst of changes is one read, and the change itself is never trusted or applied', async () => {
    const runtime = mounted();
    const { client, rpc, channels } = server();
    await held(runtime, client);
    const before = reads(rpc);
    for (const i of [0, 1, 2, 0, 1]) channels[0]!.handlers[i]!();
    await wait(500);
    // Mutation: reading on every event would make five reads.
    expect(reads(rpc)).toBe(before + 1);
    expect(sales(runtime)).toHaveLength(2);
  });

  it('keeps this phone’s unsent sale, row and all, through the read a change causes', async () => {
    const eventId = await dayEventId(DAY);
    store.set('dev1:S1:1767268900000', queued({ clientId: 'dev1:S1:1767268900000', eventId }));
    const runtime = mounted();
    const { client, channels } = server();
    await held(runtime, client);
    expect(sales(runtime).map((x) => x.clientId)).toContain('dev1:S1:1767268900000');
    channels[0]!.handlers[0]!();
    await wait(500);
    // Mutation: a re-read that replaced the till with the server's day would drop the unacknowledged sale.
    expect(sales(runtime).map((x) => x.clientId)).toContain('dev1:S1:1767268900000');
    expect(runtime.state.unsynced).toBe(1);
    expect(store.get('dev1:S1:1767268900000')).toMatchObject({ state: 'pending', total: 125 });
  });

  it('a change heard while a read is out is read again, not lost', async () => {
    const runtime = mounted();
    let release: (() => void) | null = null;
    let slow = false;
    let read = await dayRead();
    const { client, rpc, channels } = server({
      read: async () => {
        const answer = { data: read, error: null };
        if (slow) await new Promise<void>((r) => void (release = r));
        return answer;
      }
    });
    await held(runtime, client);
    const before = reads(rpc);
    slow = true;
    channels[0]!.handlers[0]!();
    await wait(450);
    expect(reads(rpc)).toBe(before + 1); // the read is out
    // A second sale lands while it is out.
    read = await dayRead({
      sales: [...(await dayRead()).sales, wireSale('devB:S2:1767268980000', 1_767_268_980_000)]
    });
    channels[0]!.handlers[0]!();
    await wait(450);
    slow = false;
    act(() => release?.());
    await wait(900);
    // Mutation: dropping a change that arrives during a read leaves the till one sale behind until the next change.
    expect(reads(rpc)).toBeGreaterThanOrEqual(before + 2);
    expect(sales(runtime).map((x) => x.clientId)).toContain('devB:S2:1767268980000');
  });

  it('joining the channel reads the day once, so a change between the open and the join is not missed', async () => {
    const runtime = mounted();
    const { client, rpc, channels } = server();
    await held(runtime, client);
    const before = reads(rpc);
    channels[0]!.status!('SUBSCRIBED');
    await wait(500);
    expect(reads(rpc)).toBe(before + 1);
  });

  it('lets go when the person signs out, and listens again for the next one', async () => {
    const runtime = mounted();
    const { client, channels } = server();
    await held(runtime, client);
    expect(live1(channels)).toHaveLength(1);
    act(() => runtime.bindStaffIdentity(null));
    // Mutation: a channel left open after sign-out keeps a signed-out page listening.
    expect(live1(channels)).toHaveLength(0);
    expect(channels[0]!.removed).toBe(true);
    act(() => runtime.setState({}));
    expect(channels).toHaveLength(1);
    act(() =>
      runtime.bindStaffIdentity({ ...IDENTITY, userId: 'u0000000-0000-4000-8000-000000000002' })
    );
    expect(live1(channels)).toHaveLength(1);
  });

  it('lets go when the day is no longer held, with no signal, on a customer page, and for staff who are not owner or helper', async () => {
    const runtime = mounted();
    const { client, channels } = server();
    await held(runtime, client);
    expect(live1(channels)).toHaveLength(1);

    act(() => runtime.setState({ online: false }));
    expect(live1(channels)).toHaveLength(0);
    act(() => runtime.setState({ online: true }));
    expect(live1(channels)).toHaveLength(1);

    act(() => runtime.setState({ screen: 'shop' }));
    expect(live1(channels)).toHaveLength(0);
    act(() => runtime.setState({ screen: 'bazaar' }));
    expect(live1(channels)).toHaveLength(1);

    act(() => runtime.setState({ role: 'support' }));
    expect(live1(channels)).toHaveLength(0);
    act(() => runtime.setState({ role: 'helper' }));
    expect(live1(channels)).toHaveLength(1);

    act(() => runtime.setState({ event: null }));
    expect(live1(channels)).toHaveLength(0);
  });

  it('closes on unmount', async () => {
    const runtime = mounted();
    const { client, channels } = server();
    await held(runtime, client);
    cleanup();
    expect(live1(channels)).toHaveLength(0);
  });

  it('opens nothing for a client that cannot listen (a build with no backend, a data-only double)', async () => {
    const runtime = mounted();
    const { client, channels } = server({ channels: false });
    await held(runtime, client);
    expect(channels).toHaveLength(0);
    expect(sales(runtime)).toHaveLength(2);
  });

  it('opens nothing outside live mode', async () => {
    live = false;
    const runtime = mounted();
    const { client, channels } = server();
    days(runtime).saleClient = client;
    act(() => runtime.bindStaffIdentity(IDENTITY));
    act(() => runtime.setState({ role: 'owner', online: true, screen: 'bazaar' }));
    expect(channels).toHaveLength(0);
  });
});
