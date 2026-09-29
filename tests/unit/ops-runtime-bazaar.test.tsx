import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, render } from '@testing-library/react';

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

/**
 * D1: the bazaar wrappers on the runtime — the server-priced event start (live only), the
 * void that queues instead of deleting, and the sale id that stays unique after a void.
 */
const EVENT = 'd1e0c105-0000-4000-8000-0000000000e1';

interface Bazaar {
  startEvent: (ev: { name: string; date: string }) => void;
  setEventPrice: (pid: string, value: unknown) => void;
  recordSale: (pay: string, freebie?: boolean) => void;
  voidSale: (id: string) => void;
  saleClient: unknown;
}

function mounted() {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
  return ref.current!;
}
const bazaar = (runtime: OpsRuntime) => runtime as unknown as Bazaar;
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 20))));
const toastText = (runtime: OpsRuntime) => JSON.stringify(runtime.state.toast ?? null);

function rpcThatStarts(
  reply: (args: Record<string, unknown>) => { data: unknown; error: unknown }
) {
  const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => reply(args));
  return { client: { rpc }, rpc };
}

beforeEach(() => {
  live = true;
  store.clear();
  localStorage.clear();
});
afterEach(() => cleanup());

describe('startEvent (live)', () => {
  it('opens the event on the server, then adopts its id and its price snapshot', async () => {
    const runtime = mounted();
    const { client, rpc } = rpcThatStarts((args) => ({
      data: [
        {
          event_id: args.p_event_id,
          starts_at: 'x',
          selling_device: 'dev1',
          prices: { dcf: 12500 }
        }
      ],
      error: null
    }));
    bazaar(runtime).saleClient = client;
    act(() => bazaar(runtime).startEvent({ name: 'Katipunan', date: 'Oct 24' }));
    await settle();
    expect(rpc).toHaveBeenCalledTimes(1);
    const args = rpc.mock.calls[0]![1];
    expect(rpc.mock.calls[0]![0]).toBe('start_event');
    expect(args).toMatchObject({ p_name: 'Katipunan', p_device: 'dev1', p_float_cents: 0 });
    expect(runtime.state.event).toMatchObject({ id: args.p_event_id, name: 'Katipunan' });
    expect((runtime.state.eventPrices as Record<string, number>).dcf).toBe(125);
  });

  it('refuses to start with no signal, and asks nothing of the server', async () => {
    const runtime = mounted();
    const { client, rpc } = rpcThatStarts(() => ({ data: [], error: null }));
    bazaar(runtime).saleClient = client;
    act(() => runtime.setState({ online: false }));
    act(() => bazaar(runtime).startEvent({ name: 'Katipunan', date: 'Oct 24' }));
    await settle();
    expect(rpc).not.toHaveBeenCalled();
    expect(runtime.state.event).toBeNull();
    expect(toastText(runtime)).toContain('signal');
  });

  it('a start whose reply was lost is retried under the same event id', async () => {
    const runtime = mounted();
    let first = true;
    const { client, rpc } = rpcThatStarts((args) => {
      if (first) {
        first = false;
        return { data: null, error: { code: '', message: 'Failed to fetch' } };
      }
      return { data: [{ event_id: args.p_event_id, prices: { dcf: 12500 } }], error: null };
    });
    bazaar(runtime).saleClient = client;
    act(() => bazaar(runtime).startEvent({ name: 'Katipunan', date: 'Oct 24' }));
    await settle();
    expect(runtime.state.event).toBeNull();
    act(() => bazaar(runtime).startEvent({ name: 'Katipunan', date: 'Oct 24' }));
    await settle();
    expect(rpc.mock.calls[1]![1].p_event_id).toBe(rpc.mock.calls[0]![1].p_event_id);
    expect(runtime.state.event).toMatchObject({ id: rpc.mock.calls[0]![1].p_event_id });
  });

  it('does not let a stall change a price once the event has started', async () => {
    const runtime = mounted();
    act(() => runtime.setState({ eventPrices: { dcf: 125 } }));
    act(() => bazaar(runtime).setEventPrice('dcf', 1));
    expect((runtime.state.eventPrices as Record<string, number>).dcf).toBe(125);
  });

  it('demo mode keeps the prototype start: no server call, no event id', async () => {
    live = false;
    const runtime = mounted();
    const { client, rpc } = rpcThatStarts(() => ({ data: [], error: null }));
    bazaar(runtime).saleClient = client;
    act(() => bazaar(runtime).startEvent({ name: 'Katipunan', date: 'Oct 24' }));
    await settle();
    expect(rpc).not.toHaveBeenCalled();
    expect(runtime.state.event).toMatchObject({ name: 'Katipunan' });
    expect((runtime.state.event as { id?: string }).id).toBeUndefined();
  });
});

const saleState = (sales: Array<{ id: string; at: number }>) => ({
  event: { id: EVENT, name: 'Fair', stage: 'selling' },
  eventStock: { dcf: 5 },
  eventPrices: { dcf: 100 },
  cart: { dcf: 1 },
  sales: sales.map((s) => ({
    ...s,
    items: { dcf: 1 },
    total: 100,
    gross: 100,
    discount: 0,
    pay: 'Cash',
    ref: '',
    clerk: 'Owner',
    tendered: 0,
    change: 0,
    synced: false,
    failed: false,
    ledgerId: null
  }))
});

describe('recordSale', () => {
  it('gives a new sale a fresh id when an earlier void left its number in use', () => {
    live = false;
    const runtime = mounted();
    // S1 was voided, so the engine would number the next sale S2 again.
    act(() => runtime.setState(saleState([{ id: 'S2', at: 100 }])));
    act(() => bazaar(runtime).recordSale('Cash'));
    const ids = (runtime.state.sales as Array<{ id: string }>).map((s) => s.id);
    expect(ids).toEqual(['S3', 'S2']);
  });

  it('leaves ids alone when nothing collides', () => {
    live = false;
    const runtime = mounted();
    act(() => runtime.setState(saleState([{ id: 'S1', at: 100 }])));
    act(() => bazaar(runtime).recordSale('Cash'));
    expect((runtime.state.sales as Array<{ id: string }>).map((s) => s.id)).toEqual(['S2', 'S1']);
  });
});

describe('voidSale', () => {
  it('queues a void for the sale and does not touch the sale row', async () => {
    live = false;
    const runtime = mounted();
    act(() => runtime.setState(saleState([{ id: 'S1', at: 100 }])));
    store.set('dev1:S1:100', { clientId: 'dev1:S1:100', at: 100, state: 'pending' });
    act(() => bazaar(runtime).voidSale('S1'));
    await settle();
    expect(runtime.state.sales).toEqual([]);
    expect(store.get('void:dev1:S1:100')).toMatchObject({
      kind: 'void',
      saleClientId: 'dev1:S1:100',
      state: 'pending'
    });
    expect(store.get('dev1:S1:100')).toMatchObject({ state: 'pending' });
  });

  it('queues nothing for a sale that does not exist', async () => {
    live = false;
    const runtime = mounted();
    act(() => bazaar(runtime).voidSale('S404'));
    await settle();
    expect(store.size).toBe(0);
  });
});

describe('a reload at the stall (live)', () => {
  it('carries on with the same event: id, snapshot prices and the day’s sales come back', async () => {
    const first = mounted();
    const { client } = rpcThatStarts((args) => ({
      data: [{ event_id: args.p_event_id, prices: { dcf: 12500 } }],
      error: null
    }));
    bazaar(first).saleClient = client;
    act(() => bazaar(first).startEvent({ name: 'Katipunan', date: 'Oct 24' }));
    await settle();
    const eventId = (first.state.event as { id: string }).id;
    act(() => first.persist(true));
    expect(JSON.parse(localStorage.getItem('hc-live-bazaar') ?? '{}').event.id).toBe(eventId);

    cleanup();
    const second = mounted();
    await settle();
    expect(second.state.event).toMatchObject({ id: eventId, name: 'Katipunan' });
    expect((second.state.eventPrices as Record<string, number>).dcf).toBe(125);
  });

  it('never overwrites the saved event with the empty start before it is read back', () => {
    localStorage.setItem(
      'hc-live-bazaar',
      JSON.stringify({ event: { id: EVENT, name: 'Fair' }, sales: [], eventPrices: { dcf: 100 } })
    );
    const runtime = mounted();
    act(() => runtime.persist(true));
    expect(runtime.state.event).toMatchObject({ id: EVENT });
    expect(JSON.parse(localStorage.getItem('hc-live-bazaar') ?? '{}').event.id).toBe(EVENT);
  });

  it('a reset clears the saved event but leaves the queued sales alone', () => {
    localStorage.setItem('hc-live-bazaar', JSON.stringify({ event: { id: EVENT }, sales: [] }));
    store.set('dev1:S1:100', { clientId: 'dev1:S1:100', at: 100, state: 'pending' });
    const runtime = mounted();
    act(() => runtime.resetData());
    expect(localStorage.getItem('hc-live-bazaar')).toBeNull();
    expect(store.size).toBe(1);
  });
});

describe('sale flags follow the queue (live)', () => {
  const row = (saleId: string, at: number, state: string) => ({
    clientId: 'dev1:' + saleId + ':' + at,
    saleId,
    eventId: EVENT,
    items: { dcf: 1 },
    gross: 100,
    discount: 0,
    total: 100,
    pay: 'Cash',
    ref: '',
    clerk: 'Owner',
    at,
    tendered: 0,
    change: 0,
    state,
    attempts: 0,
    lastError: null
  });

  it('marks a sale sent automatically as synced, and one the server refused as failed', async () => {
    const runtime = mounted();
    const state = saleState([
      { id: 'S2', at: 200 },
      { id: 'S1', at: 100 }
    ]);
    // The engine calls every sale recorded while online "synced"; the queue knows better.
    act(() => runtime.setState({ ...state, sales: state.sales.map((s) => ({ ...s, synced: true })) }));
    store.set('dev1:S1:100', row('S1', 100, 'sent'));
    store.set('dev1:S2:200', row('S2', 200, 'pending'));
    const { client } = rpcThatStarts(() => ({ data: null, error: { code: '22023', message: 'refused' } }));
    bazaar(runtime).saleClient = client;
    await act(async () => {
      await (runtime as unknown as { flushSales: () => Promise<unknown> }).flushSales();
    });
    const flags = Object.fromEntries(
      (runtime.state.sales as Array<{ id: string; synced: boolean; failed: boolean }>).map((s) => [s.id, [s.synced, s.failed]])
    );
    expect(flags).toEqual({ S1: [true, false], S2: [false, true] });
    expect(runtime.state.unsynced).toBe(1);
  });
});
