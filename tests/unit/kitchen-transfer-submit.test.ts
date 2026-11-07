import { describe, expect, it, vi } from 'vitest';
import type { BazaarClient } from '@/lib/data/bazaar-days';
import { KitchenTransferSession } from '@/lib/bazaar/kitchen-transfer-session';
import { readKitchenTransferRecovery } from '@/lib/bazaar/kitchen-transfer-recovery';
import type { KitchenTransferRequest } from '@/lib/bazaar/kitchen-transfer';

const scope = {
  userId: 'a0810000-0000-4000-8000-000000000001',
  business: 'https://synthetic.example'
};
const target = {
  day_id: 'a0811000-0000-4000-8000-000000000001',
  product_id: 'cookie',
  source_drop: 5
};
const ack = (body: KitchenTransferRequest, duplicate = false) => ({
  ...body,
  duplicate,
  kitchen_remaining: 2,
  day_total: body.qty,
  source_records: ['a0812000-0000-4000-8000-000000000001']
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function fixture() {
  const values = new Map<string, string>();
  let available = true,
    current = true,
    online = true,
    counter = 0;
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (!available) throw Error('quota');
      values.set(key, value);
    }
  };
  const rpc = vi.fn(async (_name: string, args: { p_transfer: KitchenTransferRequest }) => ({
    data: ack(args.p_transfer),
    error: null as null | { code: string }
  }));
  const refresh = vi.fn(async () => false),
    release = vi.fn(),
    changed = vi.fn();
  const ports = {
    scope,
    client: { rpc } as unknown as BazaarClient,
    current: () => current,
    online: () => online,
    newId: () => 'a0813000-0000-4000-8000-' + String(++counter).padStart(12, '0'),
    now: () => 1794045600000,
    storage,
    refresh,
    changed,
    lock: async () => release
  };
  return {
    values,
    storage,
    rpc,
    refresh,
    release,
    changed,
    ports,
    quota: (ok: boolean) => {
      available = ok;
    },
    authority: (ok: boolean) => {
      current = ok;
    },
    connection: (ok: boolean) => {
      online = ok;
    },
    session: () => new KitchenTransferSession(ports)
  };
}
function add(session: KitchenTransferSession, qty = '4') {
  const id = session.add(target);
  if (!id) throw Error('draft not created');
  expect(session.edit(id, qty)).toBe(true);
  return id;
}

describe('kitchen transfer session', () => {
  it('reloads an uncertain exact request without submitting, preserving independent work', async () => {
    const f = fixture();
    let writes = 0;
    const seen = new Set<string>();
    f.rpc.mockImplementation(async (_name, args) => {
      if (!seen.has(args.p_transfer.id)) {
        seen.add(args.p_transfer.id);
        writes++;
        throw Error('lost committed ACK');
      }
      return { data: ack(args.p_transfer, true), error: null };
    });
    const first = f.session();
    await first.open();
    const id = add(first),
      second = add(first, 'not a number');
    expect(await first.submit(id)).toEqual({ outcome: 'unknown' });
    expect(first.edit(id, '9')).toBe(false);
    expect(first.discard(id)).toBe(false);
    const body = first.snapshot().find((row) => row.work_id === id)?.submitted;
    first.close();
    const restored = f.session();
    await restored.open();
    expect(f.rpc).toHaveBeenCalledTimes(1);
    expect(restored.snapshot().find((row) => row.work_id === second)?.qty_text).toBe(
      'not a number'
    );
    const result = await restored.submit(id);
    expect(result.outcome).toBe('saved');
    expect(writes).toBe(1);
    expect(f.rpc.mock.calls.map(([, args]) => args.p_transfer)).toEqual([body, body]);
    restored.close();
    const confirmed = f.session();
    await confirmed.open();
    expect(confirmed.snapshot().find((row) => row.work_id === id)?.receipt).toBeDefined();
    await confirmed.submit(id);
    expect(f.rpc).toHaveBeenCalledTimes(2);
    expect(confirmed.edit(id, '9')).toBe(false);
    expect(confirmed.discard(id)).toBe(true);
    expect(confirmed.snapshot().map((row) => row.work_id)).toEqual([second]);
    confirmed.close();
  });

  it('does not send until the exact frozen request is durably stored', async () => {
    const f = fixture(),
      session = f.session();
    await session.open();
    const id = add(session);
    f.quota(false);
    expect(await session.submit(id)).toEqual({ outcome: 'blocked', reason: 'storage' });
    expect(f.rpc).not.toHaveBeenCalled();
    const body = session.snapshot()[0].submitted;
    f.quota(true);
    await session.open();
    expect((await session.submit(id)).outcome).toBe('saved');
    expect(f.rpc.mock.calls[0][1].p_transfer).toEqual(body);
    session.close();
  });

  it('does not apply late confirmations after the captured authority changes', async () => {
    const f = fixture(),
      reply = deferred<{ data: ReturnType<typeof ack>; error: null }>();
    f.rpc.mockImplementation(() => reply.promise);
    const session = f.session();
    await session.open();
    const id = add(session);
    const pending = session.submit(id);
    const body = session.snapshot()[0].submitted;
    if (!body) throw Error('request not frozen');
    const changed = f.changed.mock.calls.length;
    f.authority(false);
    reply.resolve({ data: ack(body), error: null });
    expect(await pending).toEqual({ outcome: 'blocked', reason: 'inactive' });
    expect(f.refresh).not.toHaveBeenCalled();
    expect(f.changed).toHaveBeenCalledTimes(changed);
    expect(readKitchenTransferRecovery(scope, f.storage).value?.works[0].receipt).toBeUndefined();
    expect(session.snapshot()).toEqual([]);
    session.close();
    expect(f.release).toHaveBeenCalledTimes(1);
  });

  it('retains raw inputs after a definite refusal, allowing an explicit changed attempt', async () => {
    const f = fixture();
    f.rpc.mockResolvedValue({
      data: ack({ ...target, id: scope.userId, qty: 4, at: 1794045600000 }),
      error: { code: 'ZB001' }
    });
    const session = f.session();
    await session.open();
    const id = add(session);
    expect(await session.submit(id)).toEqual({ outcome: 'refused', reason: 'shortage' });
    expect(session.snapshot()[0].qty_text).toBe('4');
    expect(session.snapshot()[0].submitted).toBeNull();
    expect(session.edit(id, '1')).toBe(true);
    await session.submit(id);
    expect(f.rpc.mock.calls[0][1].p_transfer.id).not.toBe(f.rpc.mock.calls[1][1].p_transfer.id);
    session.close();
  });

  it.each(['send', 'refresh'])('rechecks authority immediately before %s', async (boundary) => {
    const f = fixture();
    const session = new KitchenTransferSession({
      ...f.ports,
      storage: {
        getItem: f.storage.getItem,
        setItem: (key, value) => {
          f.storage.setItem(key, value);
          if (boundary === 'refresh' && value.includes('"receipt":')) f.authority(false);
        }
      }
    });
    await session.open();
    const id = add(session);
    f.changed.mockImplementation(() => {
      if (boundary === 'send' && session.isBusy(id)) f.authority(false);
    });
    expect(await session.submit(id)).toEqual({ outcome: 'blocked', reason: 'inactive' });
    expect(f.rpc).toHaveBeenCalledTimes(boundary === 'send' ? 0 : 1);
    expect(f.refresh).not.toHaveBeenCalled();
    session.close();
  });

  it('separates confirmed recording from a failed balance refresh', async () => {
    const f = fixture();
    f.refresh.mockRejectedValue(Error('read failed'));
    const session = f.session();
    await session.open();
    const id = add(session);
    expect(await session.submit(id)).toMatchObject({ outcome: 'saved', refreshed: false });
    expect(readKitchenTransferRecovery(scope, f.storage).value?.works[0].receipt).toBeDefined();
    session.close();
  });

  it('blocks offline, duplicate in-flight and lockless writes', async () => {
    const f = fixture(),
      session = f.session();
    await session.open();
    const id = add(session);
    f.connection(false);
    expect(await session.submit(id)).toEqual({ outcome: 'blocked', reason: 'offline' });
    expect(f.rpc).not.toHaveBeenCalled();
    f.connection(true);
    const reply = deferred<{ data: ReturnType<typeof ack>; error: null }>();
    f.rpc.mockImplementation(() => reply.promise);
    const pending = session.submit(id),
      body = session.snapshot()[0].submitted;
    expect(await session.submit(id)).toEqual({ outcome: 'blocked', reason: 'busy' });
    if (!body) throw Error('request not frozen');
    reply.resolve({ data: ack(body), error: null });
    await pending;
    expect(f.rpc).toHaveBeenCalledTimes(1);
    session.close();
    const locked = new KitchenTransferSession({ ...f.ports, lock: async () => null });
    await locked.open();
    expect(locked.phase).toBe('locked');
    expect(locked.add(target)).toBeNull();
    locked.close();
  });

  it('keeps unreadable recovery blocked and releases a late acquired lock', async () => {
    const f = fixture(),
      initial = f.session();
    await initial.open();
    add(initial);
    initial.close();
    const key = [...f.values.keys()][0];
    f.values.set(key, 'unreadable');
    const invalid = f.session();
    await invalid.open();
    expect(invalid.phase).toBe('invalid');
    expect(invalid.add(target)).toBeNull();
    expect(f.values.get(key)).toBe('unreadable');
    invalid.close();
    const release = vi.fn(),
      lock = deferred<(() => void) | null>();
    const late = new KitchenTransferSession({ ...f.ports, lock: () => lock.promise });
    const opening = late.open();
    late.close();
    lock.resolve(release);
    await opening;
    expect(release).toHaveBeenCalledTimes(1);
    expect(f.rpc).not.toHaveBeenCalled();
  });
});
