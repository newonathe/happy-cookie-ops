import { afterEach, describe, expect, it, vi } from 'vitest';
import { ordersRead } from '@/lib/orders/orders-read-state';

/** HCB-002a: the read-state store the Orders page subscribes to with useSyncExternalStore. */
afterEach(() => ordersRead.reset());

const READ = { phase: 'read', everRead: true, readAt: 1, dropped: 0, retry: null } as const;

describe('ordersRead store', () => {
  it('starts idle, and the server snapshot is one constant idle object', () => {
    expect(ordersRead.get()).toMatchObject({
      phase: 'idle',
      everRead: false,
      readAt: null,
      dropped: 0,
      retry: null
    });
    expect(ordersRead.getServer()).toBe(ordersRead.getServer());
    expect(ordersRead.getServer()).toMatchObject({ phase: 'idle' });
  });

  it('returns the same snapshot object until something changes (no render loop)', () => {
    const owner = {};
    ordersRead.claim(owner);
    ordersRead.publish(owner, READ);
    const a = ordersRead.get();
    expect(ordersRead.get()).toBe(a);
    const listener = vi.fn();
    ordersRead.subscribe(listener);
    ordersRead.publish(owner, { ...READ });
    expect(ordersRead.get()).toBe(a);
    expect(listener).not.toHaveBeenCalled();
    ordersRead.publish(owner, { ...READ, dropped: 1 });
    expect(ordersRead.get()).not.toBe(a);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('a late subscriber reads the current state at once', () => {
    const owner = {};
    ordersRead.claim(owner);
    ordersRead.publish(owner, READ);
    const late = vi.fn();
    ordersRead.subscribe(late);
    expect(ordersRead.get().phase).toBe('read');
    expect(late).not.toHaveBeenCalled();
  });

  it('only the current owner can write; a claim resets to idle; unsubscribe stops notices', () => {
    const old = {};
    const next = {};
    ordersRead.claim(old);
    ordersRead.publish(old, READ);
    const listener = vi.fn();
    const off = ordersRead.subscribe(listener);
    ordersRead.claim(next);
    expect(ordersRead.get().phase).toBe('idle');
    ordersRead.publish(old, { ...READ, phase: 'failed' });
    expect(ordersRead.get().phase).toBe('idle');
    ordersRead.publish(next, { ...READ, phase: 'loading', everRead: false, readAt: null });
    expect(ordersRead.get().phase).toBe('loading');
    off();
    const calls = listener.mock.calls.length;
    ordersRead.publish(next, READ);
    expect(listener).toHaveBeenCalledTimes(calls);
  });

  it('snapshots are frozen: a caller cannot mutate shared state', () => {
    const owner = {};
    ordersRead.claim(owner);
    ordersRead.publish(owner, READ);
    expect(Object.isFrozen(ordersRead.get())).toBe(true);
    expect(Object.isFrozen(ordersRead.getServer())).toBe(true);
  });
});
