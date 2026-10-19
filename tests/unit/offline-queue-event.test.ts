import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * S3.1 (M2): what one bazaar day still owes the server. A sale the server refused outright cannot be sent again
 * ("Send again" repeats the refused body, and a void is its own row that never clears the sale), so it must not hold
 * the day's close for ever; but a sale that only failed to get an answer must, and nothing is ever deleted.
 */
const EVENT = 'd1e0c105-0000-4000-8000-0000000000e1';
const OTHER = 'd1e0c105-0000-4000-8000-0000000000e2';

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

const sale = (saleId: string, at: number, eventId = EVENT) => ({
  saleId,
  eventId,
  items: { dcf: 1 },
  gross: 100,
  discount: 0,
  total: 100,
  pay: 'Cash',
  ref: '',
  clerk: 'Owner',
  at,
  tendered: 100,
  change: 0
});

beforeEach(() => store.clear());

describe('unsentForEvent', () => {
  it('a sale that failed for want of an answer still blocks the close; one the server refused does not', async () => {
    const q = await import('@/lib/offline/queue');
    const blip = await q.enqueueSale(sale('S1', 1_792_900_000_001));
    const refused = await q.enqueueSale(sale('S2', 1_792_900_000_002));
    await q.markFailed(blip.clientId, 'network', false);
    await q.markFailed(refused.clientId, '55000 event closed before this sale', true);
    const { blocking, refused: kept } = await q.unsentForEvent(EVENT);
    expect(blocking.map((r) => r.clientId)).toEqual([blip.clientId]);
    expect(kept.map((r) => r.clientId)).toEqual([refused.clientId]);
    // Both are still on the phone, both still counted by the sign-out guard and the flush.
    expect(store.size).toBe(2);
    expect(await q.pendingCount()).toBe(2);
  });

  it('a refusal marks a row; a later failure with no answer unmarks it, so it blocks again', async () => {
    const q = await import('@/lib/offline/queue');
    const row = await q.enqueueSale(sale('S1', 1_792_900_000_001));
    await q.markFailed(row.clientId, 'network');
    expect((await q.unsentForEvent(EVENT)).blocking).toHaveLength(1);
    await q.markFailed(row.clientId, '22023 bad', true);
    expect((await q.unsentForEvent(EVENT)).refused).toHaveLength(1);
    await q.markFailed(row.clientId, 'network');
    // A failure with no answer says nothing new about the body: the row is no longer marked refused, so it blocks again.
    expect((await q.unsentForEvent(EVENT)).blocking).toHaveLength(1);
  });

  it("another event's rows do not hold this day", async () => {
    const q = await import('@/lib/offline/queue');
    await q.enqueueSale(sale('S1', 1_792_900_000_001, OTHER));
    await q.enqueueCommand({
      clientId: q.commandKey('expense', 'x'),
      kind: 'expense',
      eventId: OTHER,
      payload: {},
      at: 1
    });
    expect(await q.unsentForEvent(EVENT)).toEqual({ blocking: [], refused: [] });
  });

  it("a void of this event's sale blocks; a void whose sale row is gone blocks every day", async () => {
    const q = await import('@/lib/offline/queue');
    const mine = await q.enqueueSale(sale('S1', 1_792_900_000_001));
    await q.markSent([mine.clientId]);
    await q.enqueueVoid(mine.clientId, 2);
    await q.enqueueVoid('dev1:S9:1', 3);
    const { blocking } = await q.unsentForEvent(EVENT);
    expect(blocking.map((r) => r.clientId).sort()).toEqual([
      'void:dev1:S1:1792900000001',
      'void:dev1:S9:1'
    ]);
    expect((await q.unsentForEvent(OTHER)).blocking.map((r) => r.clientId)).toEqual([
      'void:dev1:S9:1'
    ]);
  });

  it('sent rows count nowhere', async () => {
    const q = await import('@/lib/offline/queue');
    const row = await q.enqueueSale(sale('S1', 1_792_900_000_001));
    await q.markSent([row.clientId]);
    expect(await q.unsentForEvent(EVENT)).toEqual({ blocking: [], refused: [] });
  });
});

describe('the flush marks a row refused only when the server refused its body', () => {
  it('a 55000 marks the sale refused; a thrown network error does not', async () => {
    const q = await import('@/lib/offline/queue');
    const { flushQueue } = await import('@/lib/offline/sync');
    const a = await q.enqueueSale(sale('S1', 1_792_900_000_001));
    const b = await q.enqueueSale(sale('S2', 1_792_900_000_002));
    const rpc = vi.fn(async (_name: string, args: { p_sale: { clientId: string } }) => {
      if (args.p_sale.clientId === a.clientId)
        return { data: null, error: { code: '55000', message: 'event closed before this sale' } };
      throw new Error('network');
    });
    await flushQueue({ rpc } as never);
    expect(store.get(a.clientId)).toMatchObject({ state: 'failed', refused: true });
    expect(store.get(b.clientId)).toMatchObject({ state: 'failed' });
    expect(store.get(b.clientId)!.refused).toBeUndefined();
  });
});
