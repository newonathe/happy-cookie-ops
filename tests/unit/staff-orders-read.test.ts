import { afterEach, describe, expect, it, vi } from 'vitest';
import { StaffOrderSync, parseStaffOrders, type StaffOrderClient } from '@/lib/data/staff-orders';
import { ordersRead } from '@/lib/orders/orders-read-state';

/**
 * HCB-002a: the owner's order read says what happened. A failed read, a malformed answer or a
 * partly unreadable list is never presented as a genuine empty or complete read, and an older
 * answer can never overwrite a newer one (backlog HCB-002, with the Orders slice of HCB-004).
 */
type Row = Record<string, unknown>;
const row = (id: string, over: Row = {}): Row => ({
  id,
  name: 'Customer ' + id,
  phone: '09171234567',
  ig: '',
  state: 'Confirmed',
  pay_state: 'confirmed',
  pay_method: 'GCash',
  pay_ref: 'REF',
  total_cents: 26000,
  paid_cents: 26000,
  refund_ref: null,
  pickup_date: '2026-11-11',
  pickup_window: '10:00',
  placed_at: '2026-11-09T01:00:00.000Z',
  updated_at: '2026-11-09T02:00:00.000000+00:00',
  status_token: 'b'.repeat(64),
  holds: true,
  items: [{ product_id: 'dcf', qty: 2, unit_price_cents: 13000, unavailable: false }],
  swaps: [],
  ...over
});

type Answer = { data?: unknown; error?: { code?: string } | null };
/** Each `get_staff_orders` call waits until the test settles it, in any order. */
function scripted() {
  const pending: Array<(a: Answer) => void> = [];
  const rpc = vi.fn(
    (name: string) =>
      new Promise<Answer>((resolve) => {
        if (name !== 'get_staff_orders')
          return resolve({ data: [{ replayed: false }], error: null });
        pending.push(resolve);
      })
  );
  return { rpc, pending, client: { rpc } as unknown as StaffOrderClient };
}
function sync(client: StaffOrderClient) {
  const apply = vi.fn();
  const s = new StaffOrderSync(client, {
    apply,
    online: () => true,
    toast: () => undefined,
    pickupDays: () => [1, 4],
    today: () => '2026-11-10'
  });
  return { s, apply };
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const ids = (s: StaffOrderSync) => s.current().map((o) => o.id);

afterEach(() => ordersRead.reset());

describe('the order read never calls a malformed answer an empty read', () => {
  it('a non-array answer is a failed read, not "no orders"', async () => {
    const f = scripted();
    const { s, apply } = sync(f.client);
    const done = s.load();
    f.pending[0]!({ data: { rows: [] }, error: null });
    expect(await done).toBe(false);
    expect(s.loaded).toBe(false);
    expect(apply).not.toHaveBeenCalled();
    expect(ordersRead.get()).toMatchObject({ phase: 'failed', everRead: false });
  });

  it('a null answer is a failed read too', async () => {
    const f = scripted();
    const { s } = sync(f.client);
    const done = s.load();
    f.pending[0]!({ data: null, error: null });
    expect(await done).toBe(false);
    expect(ordersRead.get().phase).toBe('failed');
  });

  it('an answered empty array is a genuine empty read', async () => {
    const f = scripted();
    const { s, apply } = sync(f.client);
    const done = s.load();
    f.pending[0]!({ data: [], error: null });
    expect(await done).toBe(true);
    expect(apply).toHaveBeenCalledWith([]);
    expect(ordersRead.get()).toMatchObject({ phase: 'read', everRead: true, dropped: 0 });
  });

  it('rows the screens cannot use are counted, never silently left out', async () => {
    const f = scripted();
    const { s } = sync(f.client);
    const done = s.load();
    f.pending[0]!({ data: [row('HC-1'), { id: 'HC-2' }, row('HC-3', { items: [] })], error: null });
    expect(await done).toBe(true);
    expect(ids(s)).toEqual(['HC-1']);
    expect(ordersRead.get()).toMatchObject({ phase: 'read', dropped: 2 });
  });

  it('the pure parser keeps its contract for direct callers', () => {
    expect(parseStaffOrders(null)).toEqual([]);
    expect(parseStaffOrders([row('HC-1'), { id: 'x' }]).map((o) => o.id)).toEqual(['HC-1']);
  });
});

describe('initial failure, reload failure, stale data and Retry stay distinct', () => {
  it('starts in loading, then a failure is failed with nothing ever read', async () => {
    const f = scripted();
    const { s } = sync(f.client);
    const done = s.load();
    expect(ordersRead.get()).toMatchObject({ phase: 'loading', everRead: false });
    f.pending[0]!({ error: { code: '08006' } });
    await done;
    expect(ordersRead.get()).toMatchObject({ phase: 'failed', everRead: false, readAt: null });
  });

  it('a failed reload keeps the last good list and its time: stale, not empty', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T02:00:00Z'));
    const f = scripted();
    const { s } = sync(f.client);
    const first = s.load();
    f.pending[0]!({ data: [row('HC-1')], error: null });
    await first;
    const readAt = ordersRead.get().readAt;
    expect(readAt).toBe(Date.parse('2026-11-10T02:00:00Z'));
    vi.setSystemTime(new Date('2026-11-10T03:00:00Z'));
    const second = s.load();
    f.pending[1]!({ error: { code: '08006' } });
    expect(await second).toBe(false);
    expect(ids(s)).toEqual(['HC-1']);
    expect(ordersRead.get()).toMatchObject({ phase: 'failed', everRead: true, readAt });
    vi.useRealTimers();
  });

  it('Retry reads again through the same reader and clears the failure on success', async () => {
    const f = scripted();
    const { s } = sync(f.client);
    const first = s.load();
    f.pending[0]!({ error: { code: '08006' } });
    await first;
    const retry = ordersRead.get().retry;
    expect(retry).toBeTypeOf('function');
    retry!();
    expect(f.rpc).toHaveBeenCalledTimes(2);
    f.pending[1]!({ data: [row('HC-1')], error: null });
    await flush();
    expect(ids(s)).toEqual(['HC-1']);
    expect(ordersRead.get()).toMatchObject({ phase: 'read', everRead: true });
  });
});

describe('concurrent and out-of-order reads cannot overwrite newer results', () => {
  it('an older answer arriving last does not replace the newer list', async () => {
    const f = scripted();
    const { s } = sync(f.client);
    const older = s.load();
    const newer = s.load();
    f.pending[1]!({ data: [row('HC-NEW')], error: null });
    await newer;
    f.pending[0]!({ data: [row('HC-OLD')], error: null });
    await older;
    expect(ids(s)).toEqual(['HC-NEW']);
    expect(ordersRead.get().phase).toBe('read');
  });

  it('an older failure arriving last does not mark a newer success as failed', async () => {
    const f = scripted();
    const { s } = sync(f.client);
    const older = s.load();
    const newer = s.load();
    f.pending[1]!({ data: [row('HC-1')], error: null });
    await newer;
    f.pending[0]!({ error: { code: '08006' } });
    await older;
    expect(ordersRead.get()).toMatchObject({ phase: 'read', everRead: true });
  });

  it('an older success after a newer failure shows that data, still flagged as not refreshed', async () => {
    const f = scripted();
    const { s } = sync(f.client);
    const older = s.load();
    const newer = s.load();
    f.pending[1]!({ error: { code: '08006' } });
    await newer;
    f.pending[0]!({ data: [row('HC-1')], error: null });
    await older;
    expect(ids(s)).toEqual(['HC-1']);
    expect(ordersRead.get()).toMatchObject({ phase: 'failed', everRead: true });
  });
});

describe('a replaced reader cannot write', () => {
  it("a new owner session's reader takes over; the old reader's late answers are ignored", async () => {
    const a = scripted();
    const b = scripted();
    const first = sync(a.client).s;
    const pendingOld = first.load();
    const second = sync(b.client).s;
    expect(ordersRead.get().phase).toBe('idle');
    const pendingNew = second.load();
    b.pending[0]!({ data: [row('HC-B')], error: null });
    await pendingNew;
    a.pending[0]!({ error: { code: '08006' } });
    await pendingOld;
    expect(ordersRead.get()).toMatchObject({ phase: 'read', everRead: true });
    expect(ordersRead.get().retry).not.toBeNull();
    ordersRead.get().retry!();
    expect(b.rpc).toHaveBeenCalledTimes(2);
    expect(a.rpc).toHaveBeenCalledTimes(1);
  });
});
