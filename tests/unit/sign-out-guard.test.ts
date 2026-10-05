import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Slice A3 (N3): before a deliberate sign-out the phone counts what it still holds. The count
 * is a read: it must never mark, fail or prune a row. The queue and IndexedDB modules are mocked
 * with `vi.doMock` inside each test, as tests/unit/live-gate-signout.test.ts does.
 */
describe('queuedBeforeSignOut', () => {
  const markSent = vi.fn();
  const markFailed = vi.fn();
  const pruneSent = vi.fn();
  const enqueueSale = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    markSent.mockClear();
    markFailed.mockClear();
    pruneSent.mockClear();
    enqueueSale.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  type Row = { clientId: string; state: 'pending' | 'sent' | 'failed' };
  const mockQueue = (allSales: () => Promise<Row[]>, supported = true) => {
    vi.doMock('@/lib/offline/idb', () => ({ idb: { supported: () => supported } }));
    vi.doMock('@/lib/offline/queue', () => ({
      allSales,
      clientIdFor: (sale: { saleId: string; at: number }) => `${sale.saleId}@${sale.at}`,
      markSent,
      markFailed,
      pruneSent,
      enqueueSale
    }));
  };

  it('counts the rows the server has not acknowledged, pending and failed', async () => {
    mockQueue(async () => [
      { clientId: 'a', state: 'pending' },
      { clientId: 'b', state: 'failed' },
      { clientId: 'void:a', state: 'pending' },
      { clientId: 'c', state: 'sent' }
    ]);
    const { queuedBeforeSignOut } = await import('@/lib/auth/sign-out-guard');
    expect(await queuedBeforeSignOut()).toBe(3);
  });

  it('is zero when nothing is waiting', async () => {
    mockQueue(async () => [{ clientId: 'c', state: 'sent' }]);
    const { queuedBeforeSignOut } = await import('@/lib/auth/sign-out-guard');
    expect(await queuedBeforeSignOut()).toBe(0);
  });

  it('is null, not zero, when the queue cannot be read', async () => {
    mockQueue(async () => {
      throw new Error('IndexedDB blocked');
    });
    const { queuedBeforeSignOut } = await import('@/lib/auth/sign-out-guard');
    expect(await queuedBeforeSignOut()).toBeNull();
  });

  it('is null, not zero, when this browser has no IndexedDB at all', async () => {
    mockQueue(async () => [], false);
    const { queuedBeforeSignOut } = await import('@/lib/auth/sign-out-guard');
    expect(await queuedBeforeSignOut([{ id: 'S1', at: 1 }])).toBeNull();
  });

  it('is null when the read never settles', async () => {
    vi.useFakeTimers();
    mockQueue(() => new Promise<Row[]>(() => undefined));
    const { queuedBeforeSignOut, COUNT_TIMEOUT_MS } = await import('@/lib/auth/sign-out-guard');
    const counted = queuedBeforeSignOut();
    await vi.advanceTimersByTimeAsync(COUNT_TIMEOUT_MS + 1);
    expect(await counted).toBeNull();
  });

  it('also counts a sale that is only in memory because writing it to the queue failed', async () => {
    mockQueue(async () => [
      { clientId: 'S1@10', state: 'pending' },
      { clientId: 'S2@20', state: 'sent' }
    ]);
    const { queuedBeforeSignOut } = await import('@/lib/auth/sign-out-guard');
    const local = [
      { id: 'S1', at: 10, synced: false }, // has a queue row: counted once, by the row
      { id: 'S2', at: 20, synced: true }, // sent
      { id: 'S3', at: 30, synced: false }, // no row, not synced: only on this phone's screen
      { id: 'S4', at: 40, synced: true } // synced and its row pruned: not counted
    ];
    expect(await queuedBeforeSignOut(local)).toBe(2);
  });

  it('never marks, fails, prunes or enqueues anything', async () => {
    mockQueue(async () => [{ clientId: 'a', state: 'pending' }]);
    const { queuedBeforeSignOut } = await import('@/lib/auth/sign-out-guard');
    await queuedBeforeSignOut([{ id: 'S9', at: 9, synced: false }]);
    expect(markSent).not.toHaveBeenCalled();
    expect(markFailed).not.toHaveBeenCalled();
    expect(pruneSent).not.toHaveBeenCalled();
    expect(enqueueSale).not.toHaveBeenCalled();
  });
});
