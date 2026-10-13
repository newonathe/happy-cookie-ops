import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The one rule the queue must never break: a row is only cleared once the server has named
 * its client id. These run the REAL queue and sync code over an in-memory IndexedDB and a
 * stand-in RPC client, so what is proven is the flush's own behaviour: which rows it sends,
 * which it keeps, and that a retry sends the same body under the same key.
 */
const EVENT = 'd1e0c105-0000-4000-8000-0000000000e1';

type Row = Record<string, unknown> & { clientId: string };
const store = new Map<string, Row>();
const copy = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));
vi.mock('@/lib/offline/idb', () => ({
  idb: {
    put: async (v: Row) => void store.set(v.clientId, copy(v)),
    all: async () => [...store.values()].map(copy),
    get: async (k: string) => copy(store.get(k)),
    delete: async (k: string) => void store.delete(k),
    supported: () => true
  }
}));
vi.mock('@/lib/device', () => ({ deviceId: () => 'dev1' }));

const sale = (saleId: string, at: number, extra: Record<string, unknown> = {}) => ({
  saleId,
  eventId: EVENT,
  items: { dcf: 2 },
  gross: 200,
  discount: 0,
  total: 200,
  pay: 'Cash',
  ref: '',
  clerk: 'Owner',
  at,
  tendered: 500,
  change: 300.5,
  ...extra
});

type Call = { name: string; args: Record<string, { clientId: string }> };
function fakeClient(reply?: (call: Call) => { data: unknown; error: unknown }) {
  const calls: Call[] = [];
  const rpc = vi.fn(async (name: string, args: Call['args']) => {
    calls.push({ name, args });
    const id = (args.p_sale ?? args.p_void)?.clientId;
    return reply
      ? reply({ name, args })
      : {
          data: [
            { client_id: id, sale_id: 'x', duplicate: false, voided: false, sale_known: true }
          ],
          error: null
        };
  });
  return { client: { rpc } as never, rpc, calls };
}

async function load() {
  const queue = await import('@/lib/offline/queue');
  const sync = await import('@/lib/offline/sync');
  return { ...queue, ...sync };
}

beforeEach(() => {
  // The queue prunes sent rows older than a day; the fixtures' small `at` values must not be.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(100);
  store.clear();
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.doUnmock('@/lib/supabase/config');
});

afterEach(() => vi.useRealTimers());

describe('idempotency key', () => {
  it('is stable for the same sale and differs between sales', async () => {
    const { clientIdFor } = await load();
    expect(clientIdFor({ saleId: 'S3', at: 9 })).toBe('dev1:S3:9');
    expect(clientIdFor({ saleId: 'S3', at: 9 })).toBe(clientIdFor({ saleId: 'S3', at: 9 }));
    expect(clientIdFor({ saleId: 'S3', at: 1 })).not.toBe(clientIdFor({ saleId: 'S4', at: 1 }));
  });

  it('queues a sale once however many times it is offered, and a void once', async () => {
    const { enqueueSale, enqueueVoid, allSales } = await load();
    await enqueueSale(sale('S1', 1));
    await enqueueSale(sale('S1', 1));
    await enqueueVoid('dev1:S1:1', 5);
    await enqueueVoid('dev1:S1:1', 6);
    const rows = await allSales();
    expect(rows.map((r) => r.clientId).sort()).toEqual(['dev1:S1:1', 'void:dev1:S1:1']);
  });
});

describe('flushQueue: sales', () => {
  it('sends whole centavos and the device id, then clears only what was named', async () => {
    const { enqueueSale, flushQueue, allSales } = await load();
    await enqueueSale(sale('S1', 1));
    const { client, calls } = fakeClient();
    const result = await flushQueue(client);
    expect(result.sent).toEqual(['dev1:S1:1']);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.name).toBe('record_event_sale');
    expect(calls[0]!.args.p_sale).toEqual({
      clientId: 'dev1:S1:1',
      deviceId: 'dev1',
      eventId: EVENT,
      items: { dcf: 2 },
      discountCents: 0,
      totalCents: 20000,
      pay: 'Cash',
      ref: '',
      clerk: 'Owner',
      at: 1,
      tenderedCents: 50000,
      changeCents: 30050
    });
    expect((await allSales())[0]!.state).toBe('sent');
  });

  it('repeat delivery: a sent sale is never sent again', async () => {
    const { enqueueSale, flushQueue } = await load();
    await enqueueSale(sale('S1', 1));
    const { client, rpc } = fakeClient();
    await flushQueue(client);
    await flushQueue(client);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('keeps a sale the server did not name, and retries it with the same key and body', async () => {
    const { enqueueSale, flushQueue, allSales } = await load();
    await enqueueSale(sale('S1', 1));
    const refuse = fakeClient(() => ({ data: [{ client_id: 'someone-else' }], error: null }));
    const first = await flushQueue(refuse.client);
    expect(first.sent).toEqual([]);
    expect(first.failed).toHaveLength(1);
    const kept = (await allSales())[0]!;
    expect(kept.state).toBe('failed');
    expect(kept.attempts).toBe(1);

    const accept = fakeClient();
    const second = await flushQueue(accept.client);
    expect(second.sent).toEqual(['dev1:S1:1']);
    expect(accept.calls[0]!.args.p_sale).toEqual(refuse.calls[0]!.args.p_sale);
  });

  it('keeps a sale when the server errors, and counts every failed try', async () => {
    const { enqueueSale, flushQueue, allSales } = await load();
    await enqueueSale(sale('S1', 1));
    await enqueueSale(sale('S2', 2));
    const { client } = fakeClient(() => ({
      data: null,
      error: { code: '23505', message: 'client id was already used' }
    }));
    const first = await flushQueue(client);
    await flushQueue(client);
    expect(first.failed[0]!.error).toContain('23505');
    expect(first.failed.map((f) => f.clientId)).toEqual(['dev1:S1:1', 'dev1:S2:2']);
    expect((await allSales()).map((r) => [r.state, r.attempts, r.lastError])).toEqual([
      ['failed', 2, '23505 client id was already used'],
      ['failed', 2, '23505 client id was already used']
    ]);
  });

  // The server takes a bazaar sale from an owner only (`record_event_sale` answers 42501 to anyone
  // else). A sale rung up under a helper's sign-in waits on the phone and goes up, once and
  // unchanged, when an owner's session sends the queue.
  it('a sale refused for the signed-in role stays queued, and goes up unchanged once a session is accepted', async () => {
    const { enqueueSale, flushQueue, allSales, pendingCount } = await load();
    await enqueueSale(sale('S1', 1, { clerk: 'Mika' }));
    const helper = fakeClient(() => ({
      data: null,
      error: { code: '42501', message: 'only the owner may record a bazaar sale' }
    }));
    const first = await flushQueue(helper.client);
    await flushQueue(helper.client);
    expect(first.sent).toEqual([]);
    expect(first.failed).toEqual([
      {
        clientId: 'dev1:S1:1',
        error: '42501 only the owner may record a bazaar sale',
        permanent: true
      }
    ]);
    expect(helper.rpc).toHaveBeenCalledTimes(2);
    expect(await pendingCount()).toBe(1);

    const owner = fakeClient();
    const second = await flushQueue(owner.client);
    expect(second.sent).toEqual(['dev1:S1:1']);
    expect(owner.calls[0]!.args.p_sale).toEqual(helper.calls[0]!.args.p_sale);
    expect((owner.calls[0]!.args.p_sale as unknown as { clerk: string }).clerk).toBe('Mika');
    expect((await allSales())[0]!.state).toBe('sent');
    expect(await pendingCount()).toBe(0);
    await flushQueue(owner.client);
    expect(owner.rpc).toHaveBeenCalledTimes(1);
  });

  it('acknowledges rows one by one: a partial reply clears only the named sale', async () => {
    const { enqueueSale, flushQueue, allSales } = await load();
    await enqueueSale(sale('S1', 1));
    await enqueueSale(sale('S2', 2));
    // The earlier sale fails and the later one is acknowledged, so a flush that marked
    // everything sent on the later ack would wrongly clear the earlier one.
    const { client } = fakeClient(({ args }) =>
      args.p_sale!.clientId === 'dev1:S2:2'
        ? { data: [{ client_id: 'dev1:S2:2', duplicate: false }], error: null }
        : { data: null, error: { code: '', message: 'Failed to fetch' } }
    );
    const result = await flushQueue(client);
    expect(result.sent).toEqual(['dev1:S2:2']);
    const states = Object.fromEntries((await allSales()).map((r) => [r.clientId, r.state]));
    expect(states).toEqual({ 'dev1:S1:1': 'failed', 'dev1:S2:2': 'sent' });
  });

  it('a freebie is sent as a zero-charge sale', async () => {
    const { enqueueSale, flushQueue } = await load();
    await enqueueSale(
      sale('S1', 1, { pay: 'Freebie', discount: 200, total: 0, tendered: 0, change: 0 })
    );
    const { client, calls } = fakeClient();
    await flushQueue(client);
    expect(calls[0]!.args.p_sale).toMatchObject({
      pay: 'Freebie',
      discountCents: 20000,
      totalCents: 0
    });
  });

  it('never sends a sale that has no server event, and keeps it', async () => {
    const { enqueueSale, flushQueue, allSales } = await load();
    await enqueueSale(sale('S1', 1, { eventId: 'g0-synthetic-event' }));
    await enqueueSale(sale('S2', 2, { eventId: null }));
    const { client, rpc } = fakeClient();
    const result = await flushQueue(client);
    expect(rpc).not.toHaveBeenCalled();
    expect(result.failed).toHaveLength(2);
    expect((await allSales()).every((r) => r.state === 'failed')).toBe(true);
  });

  it('does nothing while the phone is offline, and nothing with no backend', async () => {
    const { enqueueSale, flushQueue, pendingCount } = await load();
    await enqueueSale(sale('S1', 1));
    vi.stubGlobal('navigator', { onLine: false });
    const off = fakeClient();
    expect((await flushQueue(off.client)).skipped).toBe(true);
    expect(off.rpc).not.toHaveBeenCalled();
    vi.stubGlobal('navigator', { onLine: true });
    vi.doMock('@/lib/supabase/config', () => ({ hasSupabaseConfig: () => false }));
    vi.resetModules();
    const again = await load();
    expect((await again.flushQueue()).skipped).toBe(true);
    expect(await again.pendingCount()).toBe(1);
    expect(await pendingCount()).toBe(1);
  });

  it('overlapping flushes share one run: each sale is sent once', async () => {
    const { enqueueSale, flushQueue } = await load();
    await enqueueSale(sale('S1', 1));
    await enqueueSale(sale('S2', 2));
    const { client, rpc } = fakeClient();
    await Promise.all([flushQueue(client), flushQueue(client), flushQueue(client)]);
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});

describe('pruning', () => {
  it('drops sent rows older than a day and never an unsent one', async () => {
    const { enqueueSale, markSent, pruneSent, allSales } = await load();
    await enqueueSale(sale('S1', 1));
    await enqueueSale(sale('S2', 2));
    await enqueueSale(sale('S3', 150_000_000));
    await markSent(['dev1:S1:1', 'dev1:S3:150000000']);
    vi.setSystemTime(200_000_000);
    await pruneSent();
    expect((await allSales()).map((r) => r.clientId)).toEqual(['dev1:S2:2', 'dev1:S3:150000000']);
  });

  // After a reload the bridge offers every sale on screen to the queue again. One whose sent row
  // was pruned is queued afresh: the same client id and the same body, so `record_event_sale`
  // answers "repeat" and no second sale is booked.
  it('a sent sale pruned after a day and offered again goes under the same key and body, and a repeat reply settles it', async () => {
    const { enqueueSale, flushQueue, allSales, pendingCount } = await load();
    await enqueueSale(sale('S1', 1));
    const first = fakeClient();
    await flushQueue(first.client);
    vi.setSystemTime(200_000_000);
    // A flush only prunes when it has something to send.
    await enqueueSale(sale('S2', 199_999_000));
    await flushQueue(first.client);
    expect((await allSales()).map((r) => r.clientId)).toEqual(['dev1:S2:199999000']);

    const again = await enqueueSale(sale('S1', 1));
    expect([again.clientId, again.state]).toEqual(['dev1:S1:1', 'pending']);
    const second = fakeClient(({ args }) => ({
      data: [{ client_id: args.p_sale?.clientId, sale_id: 'x', duplicate: true, voided: false }],
      error: null
    }));
    const result = await flushQueue(second.client);
    expect(result.sent).toEqual(['dev1:S1:1']);
    expect(second.calls).toHaveLength(1);
    expect(second.calls[0]!.args.p_sale).toEqual(first.calls[0]!.args.p_sale);
    expect(await pendingCount()).toBe(0);
  });
});

describe('flushQueue: voids', () => {
  it('sends the sale first and its void after, both by the sale client id', async () => {
    const { enqueueSale, enqueueVoid, flushQueue, allSales } = await load();
    await enqueueVoid('dev1:S1:1', 50);
    await enqueueSale(sale('S1', 1));
    const { client, calls } = fakeClient();
    const result = await flushQueue(client);
    expect(calls.map((c) => c.name)).toEqual(['record_event_sale', 'void_event_sale']);
    expect(calls[1]!.args.p_void).toEqual({ clientId: 'dev1:S1:1', deviceId: 'dev1', at: 50 });
    expect(result.sent).toEqual(['dev1:S1:1', 'void:dev1:S1:1']);
    expect((await allSales()).map((r) => r.state)).toEqual(['sent', 'sent']);
  });

  it('a void whose sale never reached the queue is still sent (out of order)', async () => {
    const { enqueueVoid, flushQueue } = await load();
    await enqueueVoid('dev1:S9:9', 60);
    const { client, calls } = fakeClient();
    const result = await flushQueue(client);
    expect(calls.map((c) => c.name)).toEqual(['void_event_sale']);
    expect(result.sent).toEqual(['void:dev1:S9:9']);
  });

  it('keeps a void the server did not acknowledge', async () => {
    const { enqueueVoid, flushQueue, allSales } = await load();
    await enqueueVoid('dev1:S9:9', 60);
    const { client } = fakeClient(() => ({ data: [], error: null }));
    await flushQueue(client);
    expect((await allSales())[0]!.state).toBe('failed');
  });
});

describe('flushQueue: bazaar commands', () => {
  type Args = Record<string, Record<string, unknown> | string | number>;
  function commandClient(reply?: (name: string, args: Args) => { data: unknown; error: unknown }) {
    const calls: Array<{ name: string; args: Args }> = [];
    const rpc = vi.fn(async (name: string, args: Args) => {
      calls.push({ name, args });
      if (reply) return reply(name, args);
      if (name === 'add_event_expense')
        return {
          data: [
            { client_id: (args.p_expense as { clientId: string }).clientId, duplicate: false }
          ],
          error: null
        };
      if (name === 'load_event_stock') return { data: [{ event_id: args.p_event }], error: null };
      if (name === 'close_event')
        return {
          data: [{ event_id: (args.p_close as { eventId: string }).eventId, closed: true }],
          error: null
        };
      const id = ((args.p_sale ?? args.p_void) as { clientId: string }).clientId;
      return { data: [{ client_id: id, duplicate: false }], error: null };
    });
    return { client: { rpc } as never, rpc, calls };
  }
  const expense = {
    clientId: 'expense:u1',
    eventId: EVENT,
    label: 'Table rent',
    category: 'Bazaar rent',
    amountCents: 150000,
    at: 5
  };
  const close = { eventId: EVENT, at: 9, countedCents: 62500, returned: { dcf: 2 } };
  const queueAll = async () => {
    const q = await load();
    await q.enqueueCommand({
      clientId: 'close:' + EVENT,
      kind: 'close',
      eventId: EVENT,
      payload: close,
      at: 9
    });
    await q.enqueueCommand({
      clientId: 'expense:u1',
      kind: 'expense',
      eventId: EVENT,
      payload: expense,
      at: 5
    });
    await q.enqueueCommand({
      clientId: 'open:' + EVENT,
      kind: 'open',
      eventId: EVENT,
      payload: { loaded: { dcf: 5 }, floatCents: 100000 },
      at: 3
    });
    await q.enqueueVoid('dev1:S1:1', 4);
    await q.enqueueSale(sale('S1', 1));
    return q;
  };

  it('sends sales, then voids, stock, expenses, and the close last, whatever order they were queued', async () => {
    const q = await queueAll();
    const { client, calls } = commandClient();
    const result = await q.flushQueue(client);
    expect(calls.map((c) => c.name)).toEqual([
      'record_event_sale',
      'void_event_sale',
      'load_event_stock',
      'add_event_expense',
      'close_event'
    ]);
    expect(result.sent).toHaveLength(5);
  });

  it('sends each command body exactly as queued', async () => {
    const q = await queueAll();
    const { client, calls } = commandClient();
    await q.flushQueue(client);
    const by = Object.fromEntries(calls.map((c) => [c.name, c.args]));
    expect(by.load_event_stock).toEqual({
      p_event: EVENT,
      p_loaded: { dcf: 5 },
      p_float_cents: 100000
    });
    expect(by.add_event_expense).toEqual({ p_expense: expense });
    expect(by.close_event).toEqual({ p_close: close });
  });

  it('a repeat delivery sends nothing, and a command queued twice keeps its first body', async () => {
    const q = await queueAll();
    await q.enqueueCommand({
      clientId: 'close:' + EVENT,
      kind: 'close',
      eventId: EVENT,
      payload: { ...close, countedCents: 1 },
      at: 10
    });
    const { client, rpc } = commandClient();
    await q.flushQueue(client);
    expect((rpc.mock.calls.find((c) => c[0] === 'close_event')![1] as Args).p_close).toEqual(close);
    rpc.mockClear();
    await q.flushQueue(client);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('keeps a close the server did not confirm as closed', async () => {
    const q = await load();
    await q.enqueueCommand({
      clientId: 'close:' + EVENT,
      kind: 'close',
      eventId: EVENT,
      payload: close,
      at: 9
    });
    const { client } = commandClient(() => ({
      data: [{ event_id: EVENT, closed: false }],
      error: null
    }));
    const result = await q.flushQueue(client);
    expect(result.sent).toEqual([]);
    expect((await q.allSales())[0]!.state).toBe('failed');
  });

  it('tells a refusal from a lost connection', async () => {
    const q = await queueAll();
    const refuse = commandClient((name) =>
      name === 'add_event_expense'
        ? { data: null, error: { code: '23505', message: 'client id was already used' } }
        : { data: null, error: { code: '', message: 'Failed to fetch' } }
    );
    const result = await q.flushQueue(refuse.client);
    const flag = Object.fromEntries(result.failed.map((f) => [f.clientId, f.permanent]));
    expect(flag['expense:u1']).toBe(true);
    expect(flag['close:' + EVENT]).toBe(false);
    expect(flag['dev1:S1:1']).toBe(false);
  });

  it('holds a command whose event is not a server event, and keeps it', async () => {
    const q = await load();
    await q.enqueueCommand({
      clientId: 'expense:u2',
      kind: 'expense',
      eventId: 'g0-synthetic-event',
      payload: expense,
      at: 5
    });
    const { client, rpc } = commandClient();
    const result = await q.flushQueue(client);
    expect(rpc).not.toHaveBeenCalled();
    expect(result.failed).toHaveLength(1);
    expect((await q.allSales())[0]!.state).toBe('failed');
  });

  it('tells sale keys from command keys', async () => {
    const { isSaleKey } = await load();
    expect(isSaleKey('dev1:S1:1')).toBe(true);
    expect(['void:dev1:S1:1', 'open:x', 'expense:x', 'close:x'].some(isSaleKey)).toBe(false);
  });
});
