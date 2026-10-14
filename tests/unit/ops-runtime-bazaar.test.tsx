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
import { dayEventId } from '@/lib/data/bazaar-days';
import { clearBazaar } from '@/lib/offline/bazaar-state';

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
  // The saved copy is skipped when it equals the last one written, and that memory outlives each test.
  clearBazaar();
});
afterEach(() => cleanup());

const DAY = 'd5a00000-0000-4000-8000-000000000001';
const BOOKING = 'd5b00000-0000-4000-8000-000000000001';

interface Days {
  beginBazaarDay: (
    booking: { id: string; name: string },
    day: { id: string; day: string }
  ) => Promise<'started' | 'offline' | 'refused'>;
}
const days = (runtime: OpsRuntime) => runtime as unknown as Days;
const startReply = (args: Record<string, unknown>) => ({
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
});
const begin = (runtime: OpsRuntime) =>
  days(runtime).beginBazaarDay(
    { id: BOOKING, name: 'Katipunan market' },
    { id: DAY, day: '2026-10-24' }
  );

describe('the old start is closed in live mode (S2)', () => {
  it('startEvent asks the server nothing and opens no event', async () => {
    const runtime = mounted();
    const { client, rpc } = rpcThatStarts(() => ({ data: [], error: null }));
    bazaar(runtime).saleClient = client;
    act(() => bazaar(runtime).startEvent({ name: 'Katipunan', date: 'Oct 24' }));
    await settle();
    expect(rpc).not.toHaveBeenCalled();
    expect(runtime.state.event).toBeNull();
    expect(toastText(runtime)).toContain('plan the day');
    // Mutation: letting startEvent through starts an event at the menu prices with no plan, and no day to close it from.
  });

  it('offers no start list: the ported prototype events and the old booking rows are gone', () => {
    const runtime = mounted();
    expect(runtime.renderVals().events).toEqual([]);
  });
});

describe('beginBazaarDay (live)', () => {
  it('starts the day on the server under its own event id and puts it in the till exactly as the day plans it', async () => {
    const runtime = mounted();
    const { client, rpc } = rpcThatStarts(startReply);
    bazaar(runtime).saleClient = client;
    act(() => runtime.setState({ baked: { dcf: 3, wcb: 4 } }));
    let outcome: string | undefined;
    await act(async () => {
      outcome = await begin(runtime);
    });
    expect(outcome).toBe('started');
    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, args] = rpc.mock.calls[0]!;
    expect(name).toBe('start_bazaar_day');
    expect(args).toMatchObject({ p_day: DAY, p_device: 'dev1' });
    expect(args.p_event_id).toBe(await dayEventId(DAY));
    expect(runtime.state.event).toMatchObject({
      id: args.p_event_id,
      stage: 'selling',
      name: 'Katipunan market',
      dayId: DAY,
      scheduledId: BOOKING
    });
    expect((runtime.state.eventPrices as Record<string, number>).dcf).toBe(125);
    expect((runtime.state.eventPrices as Record<string, number>).wcb).toBe(90);
    expect(runtime.state.eventStock).toMatchObject({ dcf: 20, wcb: 5 });
    expect(runtime.state.drawer).toMatchObject({ float: 500 });
    expect(runtime.state.sales).toEqual([]);
    // The day's cookies are its own plan, not shop stock: baked does not move.
    expect(runtime.state.baked).toMatchObject({ dcf: 3, wcb: 4 });
    // Mutation: openSelling's move out of baked would take 20 cookies the shop never held.
  });

  it('keeps the day on the phone: a reload carries on with its id, prices, stock and day', async () => {
    const first = mounted();
    bazaar(first).saleClient = rpcThatStarts(startReply).client;
    await act(async () => void (await begin(first)));
    act(() => first.persist(true));
    cleanup();
    const second = mounted();
    await settle();
    expect(second.state.event).toMatchObject({
      id: await dayEventId(DAY),
      stage: 'selling',
      dayId: DAY,
      scheduledId: BOOKING
    });
    expect((second.state.eventPrices as Record<string, number>).dcf).toBe(125);
    expect(second.state.eventStock).toMatchObject({ dcf: 20 });
  });

  it('with no signal asks the server nothing and starts nothing', async () => {
    const runtime = mounted();
    const { client, rpc } = rpcThatStarts(startReply);
    bazaar(runtime).saleClient = client;
    act(() => runtime.setState({ online: false }));
    let outcome: string | undefined;
    await act(async () => {
      outcome = await begin(runtime);
    });
    expect(outcome).toBe('offline');
    expect(rpc).not.toHaveBeenCalled();
    expect(runtime.state.event).toBeNull();
    expect(toastText(runtime)).toContain('signal');
  });

  it('a refusal starts nothing and says the day cannot start now', async () => {
    const runtime = mounted();
    bazaar(runtime).saleClient = rpcThatStarts(() => ({
      data: null,
      error: { code: '55000', message: 'rule:day_open' }
    })).client;
    let outcome: string | undefined;
    await act(async () => {
      outcome = await begin(runtime);
    });
    expect(outcome).toBe('refused');
    expect(runtime.state.event).toBeNull();
    expect(toastText(runtime)).toContain('cannot be started');
  });

  it('adopts nothing from a reply that names another event', async () => {
    const runtime = mounted();
    bazaar(runtime).saleClient = rpcThatStarts((args) =>
      startReply({
        ...args,
        p_event_id: 'aaaaaaaa-0000-4000-8000-000000000009'
      })
    ).client;
    let outcome: string | undefined;
    await act(async () => {
      outcome = await begin(runtime);
    });
    expect(outcome).toBe('offline');
    expect(runtime.state.event).toBeNull();
    // Mutation: adopting the reply's event would sell into an event this day never asked for.
  });

  it('a day another phone is selling is not taken over: nothing changes and the owner is told', async () => {
    const runtime = mounted();
    bazaar(runtime).saleClient = rpcThatStarts((args) => {
      const reply = startReply(args);
      return { ...reply, data: [{ ...reply.data[0]!, selling_device: 'other-phone' }] };
    }).client;
    let outcome: string | undefined;
    await act(async () => {
      outcome = await begin(runtime);
    });
    expect(outcome).toBe('refused');
    expect(runtime.state.event).toBeNull();
    expect(runtime.state.eventStock).toEqual({});
    expect(toastText(runtime)).toContain('another phone');
    // Mutation: adopting the day here would show the full planned stock and no sales, and every sale rung up would be refused.
  });

  it('a second start of the same day is the same event, so a lost reply or a second tap never opens another', async () => {
    const runtime = mounted();
    const { client, rpc } = rpcThatStarts(startReply);
    bazaar(runtime).saleClient = client;
    await act(async () => void (await begin(runtime)));
    await act(async () => void (await begin(runtime)));
    expect(rpc.mock.calls[1]![1].p_event_id).toBe(rpc.mock.calls[0]![1].p_event_id);
  });
});

describe('a started day cannot be closed or left from the till (S2)', () => {
  interface Till {
    closeEvent: () => void;
    resetEvent: () => void;
  }
  const till = (runtime: OpsRuntime) => runtime as unknown as Till;

  it('the old close-out queues nothing and the day stays selling; leaving keeps the day and its stock', async () => {
    const runtime = mounted();
    const { client, rpc } = rpcThatStarts(startReply);
    bazaar(runtime).saleClient = client;
    act(() => runtime.setState({ baked: { dcf: 3 } }));
    await act(async () => void (await begin(runtime)));
    rpc.mockClear();
    act(() => till(runtime).closeEvent());
    await settle();
    expect(runtime.state.event).toMatchObject({ stage: 'selling', dayId: DAY });
    expect([...store.values()].filter((r) => r.kind === 'close')).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
    expect(toastText(runtime)).toContain('review');
    act(() => till(runtime).resetEvent());
    expect(runtime.state.event).toMatchObject({ stage: 'selling', dayId: DAY });
    expect(runtime.state.eventStock).toMatchObject({ dcf: 20 });
    expect(runtime.state.baked).toMatchObject({ dcf: 3 });
    // Mutation: the engine's own Leave moves the day's 25 cookies into baked stock and forgets a day that is open on the server.
  });

  it('starting the books over leaves a started day on the phone', async () => {
    const runtime = mounted();
    bazaar(runtime).saleClient = rpcThatStarts(startReply).client;
    await act(async () => void (await begin(runtime)));
    act(() => runtime.resetData());
    await settle();
    expect(runtime.state.event).toMatchObject({ dayId: DAY, stage: 'selling' });
    expect(localStorage.getItem('hc-live-bazaar')).not.toBeNull();
    expect(toastText(runtime)).toContain('Close it before starting over');
  });

  it('an event that is not a day still leaves as before', () => {
    const runtime = mounted();
    act(() =>
      runtime.setState({
        event: {
          id: EVENT,
          name: 'Fair',
          stage: 'selling',
          snapshot: ['dcf']
        } as never,
        eventStock: { dcf: 2 },
        baked: { dcf: 1 }
      })
    );
    act(() => till(runtime).resetEvent());
    expect(runtime.state.event).toBeNull();
    expect(runtime.state.baked).toMatchObject({ dcf: 3 });
  });
});
describe('event prices and the demo start', () => {
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
    act(() =>
      runtime.setState({ ...state, sales: state.sales.map((s) => ({ ...s, synced: true })) })
    );
    store.set('dev1:S1:100', row('S1', 100, 'sent'));
    store.set('dev1:S2:200', row('S2', 200, 'pending'));
    const { client } = rpcThatStarts(() => ({
      data: null,
      error: { code: '22023', message: 'refused' }
    }));
    bazaar(runtime).saleClient = client;
    await act(async () => {
      await (runtime as unknown as { flushSales: () => Promise<unknown> }).flushSales();
    });
    const flags = Object.fromEntries(
      (runtime.state.sales as Array<{ id: string; synced: boolean; failed: boolean }>).map((s) => [
        s.id,
        [s.synced, s.failed]
      ])
    );
    expect(flags).toEqual({ S1: [true, false], S2: [false, true] });
    expect(runtime.state.unsynced).toBe(1);
  });
});

describe('the close-out (live)', () => {
  interface Closeout {
    setEventStock: (pid: string, d: number) => void;
    openSelling: () => void;
    addEventExpense: (label: string, amount: unknown, cat?: string) => void;
    closeEvent: () => void;
    reopenEvent: () => void;
    saleClient: unknown;
  }
  const co = (runtime: OpsRuntime) => runtime as unknown as Closeout;
  const ack = (name: string, args: Record<string, unknown>) => {
    if (name === 'add_event_expense')
      return {
        data: [{ client_id: (args.p_expense as { clientId: string }).clientId, duplicate: false }],
        error: null
      };
    if (name === 'load_event_stock') return { data: [{ event_id: args.p_event }], error: null };
    if (name === 'close_event')
      return {
        data: [{ event_id: (args.p_close as { eventId: string }).eventId, closed: true }],
        error: null
      };
    return { data: [], error: null };
  };
  function withEvent(stage: string, extra: Record<string, unknown> = {}) {
    const runtime = mounted();
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => ack(name, args));
    co(runtime).saleClient = { rpc };
    act(() =>
      runtime.setState({
        event: { id: EVENT, name: 'Fair', stage, snapshot: ['dcf'] } as unknown as { id: string },
        eventStock: { dcf: 0 },
        baked: { dcf: 10, wcb: 10 },
        eventPrices: { dcf: 125 },
        ...extra
      })
    );
    return { runtime, rpc };
  }
  const sent = (rpc: { mock: { calls: unknown[][] } }, name: string) =>
    rpc.mock.calls.filter((c) => c[0] === name).map((c) => c[1] as Record<string, unknown>);

  it('will not put a flavour on the table that the event menu does not have', async () => {
    const { runtime } = withEvent('stock');
    act(() => co(runtime).setEventStock('wcb', 1));
    expect((runtime.state.eventStock as Record<string, number>).wcb ?? 0).toBe(0);
    expect(toastText(runtime)).toContain('not on this event');
    act(() => co(runtime).setEventStock('dcf', 3));
    expect((runtime.state.eventStock as Record<string, number>).dcf).toBe(3);
  });

  it('queues the stock load and float when selling opens, and sends it', async () => {
    const { runtime, rpc } = withEvent('stock', { eventStock: { dcf: 5 } });
    act(() => co(runtime).openSelling());
    await settle();
    expect(runtime.state.event).toMatchObject({ stage: 'selling' });
    expect(sent(rpc, 'load_event_stock')).toEqual([
      { p_event: EVENT, p_loaded: { dcf: 5 }, p_float_cents: 100000 }
    ]);
    expect(store.get('open:' + EVENT)).toMatchObject({ kind: 'open', state: 'sent' });
  });

  it('never loads a flavour the event menu does not have, even if it reached the table', async () => {
    const { runtime, rpc } = withEvent('stock', { eventStock: { dcf: 5, wcb: 2 } });
    act(() => co(runtime).openSelling());
    await settle();
    expect(sent(rpc, 'load_event_stock')[0]!.p_loaded).toEqual({ dcf: 5 });
  });

  it('sends the float and the cash the phone took, so the server can check it holds the same', async () => {
    const sale = (id: string, pay: string, total: number) => ({
      id,
      pay,
      total,
      at: 1,
      items: { dcf: 1 },
      gross: total,
      discount: 0,
      ref: '',
      clerk: 'Owner',
      tendered: 0,
      change: 0,
      synced: true,
      failed: false,
      ledgerId: null
    });
    const { runtime, rpc } = withEvent('selling', {
      drawer: { float: 500, counted: '900' },
      unsynced: 0,
      sales: [sale('S3', 'Cash', 100), sale('S2', 'GCash', 250), sale('S1', 'Cash', 25.5)]
    });
    act(() => co(runtime).closeEvent());
    await settle();
    expect(sent(rpc, 'close_event')[0]!.p_close).toMatchObject({
      floatCents: 50000,
      cashCents: 12550
    });
  });

  it('queues nothing when opening the table is refused (no cookies loaded)', async () => {
    const { runtime, rpc } = withEvent('stock');
    act(() => co(runtime).openSelling());
    await settle();
    expect(rpc).not.toHaveBeenCalled();
    expect(store.size).toBe(0);
  });

  it('sends an expense in centavos under its own key', async () => {
    const { runtime, rpc } = withEvent('selling');
    act(() => co(runtime).addEventExpense('Table rent', '1500', 'Bazaar rent'));
    await settle();
    const [call] = sent(rpc, 'add_event_expense');
    expect(call!.p_expense).toMatchObject({
      eventId: EVENT,
      label: 'Table rent',
      category: 'Bazaar rent',
      amountCents: 150000
    });
    expect((call!.p_expense as { clientId: string }).clientId).toMatch(/^expense:/);
  });

  it.each([
    ['blank label', '  ', '1500'],
    ['zero amount', 'Rent', '0'],
    ['negative amount', 'Rent', '-5'],
    ['not a number', 'Rent', 'abc']
  ])('refuses an expense with a %s and queues nothing', async (_name, label, amount) => {
    const { runtime, rpc } = withEvent('selling');
    act(() => co(runtime).addEventExpense(label, amount, 'Bazaar rent'));
    await settle();
    expect(rpc).not.toHaveBeenCalled();
    expect(store.size).toBe(0);
  });

  it('queues the close with the count in centavos and only the menu flavours returned', async () => {
    const { runtime, rpc } = withEvent('selling', {
      drawer: { float: 1000, counted: '1500' },
      eventStock: { dcf: 2, wcb: 1 },
      unsynced: 0
    });
    act(() => co(runtime).closeEvent());
    await settle();
    expect(runtime.state.event).toMatchObject({ stage: 'closed' });
    const [call] = sent(rpc, 'close_event');
    expect(call!.p_close).toMatchObject({
      eventId: EVENT,
      countedCents: 150000,
      returned: { dcf: 2 },
      floatCents: 100000,
      cashCents: 0
    });
    expect(typeof (call!.p_close as { at: number }).at).toBe('number');
  });

  it('closes without a count as a null count, and refuses a negative one', async () => {
    const a = withEvent('selling', { drawer: { float: 1000, counted: '' }, unsynced: 0 });
    act(() => co(a.runtime).closeEvent());
    await settle();
    expect(
      (sent(a.rpc, 'close_event')[0]!.p_close as { countedCents: unknown }).countedCents
    ).toBeNull();
    cleanup();
    store.clear();
    const b = withEvent('selling', { drawer: { float: 1000, counted: '-40' }, unsynced: 0 });
    act(() => co(b.runtime).closeEvent());
    await settle();
    expect(
      (sent(b.rpc, 'close_event')[0]!.p_close as { countedCents: unknown }).countedCents
    ).toBeNull();
  });

  it('queues no close while sales are still waiting to sync (the engine refuses)', async () => {
    const { runtime, rpc } = withEvent('selling', {
      drawer: { float: 1000, counted: '1500' },
      unsynced: 2
    });
    act(() => co(runtime).closeEvent());
    await settle();
    expect(runtime.state.event).toMatchObject({ stage: 'selling' });
    expect(sent(rpc, 'close_event')).toEqual([]);
    expect(store.has('close:' + EVENT)).toBe(false);
  });

  it('a closed event cannot be reopened', async () => {
    const { runtime } = withEvent('closed');
    act(() => co(runtime).reopenEvent());
    expect(runtime.state.event).toMatchObject({ stage: 'closed' });
    expect(toastText(runtime)).toContain('stays closed');
  });

  it('demo mode keeps the prototype: nothing is queued', async () => {
    live = false;
    const runtime = mounted();
    act(() =>
      runtime.setState({
        event: { name: 'Fair', stage: 'selling' },
        drawer: { float: 1000, counted: '' },
        unsynced: 0,
        eventStock: { dcf: 1 }
      })
    );
    act(() => co(runtime).closeEvent());
    act(() => co(runtime).addEventExpense('Rent', '100', 'Bazaar rent'));
    await settle();
    expect(store.size).toBe(0);
  });
});
