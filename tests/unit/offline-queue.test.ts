import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clientIdFor } from '@/lib/offline/queue';

/**
 * The one rule the queue must never break: a sale is only removed once the server has
 * named its client id. These tests cover the key's stability and the flush's refusal to
 * clear anything the server did not acknowledge.
 */
describe('idempotency key', () => {
  it('is stable for the same sale', () => {
    const sale = { saleId: 'S3', at: 1_760_000_000_000 };
    expect(clientIdFor(sale)).toBe(clientIdFor(sale));
  });

  it('differs between sales', () => {
    expect(clientIdFor({ saleId: 'S3', at: 1 })).not.toBe(clientIdFor({ saleId: 'S4', at: 1 }));
  });
});

describe('flushQueue', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('keeps rows the server did not accept', async () => {
    const rows = [
      { clientId: 'a', state: 'pending' },
      { clientId: 'b', state: 'pending' }
    ];
    const sent: string[] = [];
    const failed: string[] = [];

    vi.doMock('@/lib/offline/queue', () => ({
      pendingSales: async () => rows,
      markSent: async (ids: string[]) => sent.push(...ids),
      markFailed: async (id: string) => failed.push(id),
      pruneSent: async () => {}
    }));
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ accepted: ['a'], rejected: [{ clientId: 'b', error: 'boom' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
    );

    const { flushQueue } = await import('@/lib/offline/sync');
    const result = await flushQueue();

    expect(result.sent).toEqual(['a']);
    expect(sent).toEqual(['a']);
    expect(failed).toEqual(['b']);
  });

  it('does nothing at all when the device is offline', async () => {
    vi.doMock('@/lib/offline/queue', () => ({
      pendingSales: async () => [{ clientId: 'a', state: 'pending' }],
      markSent: async () => {},
      markFailed: async () => {},
      pruneSent: async () => {}
    }));
    vi.stubGlobal('navigator', { onLine: false });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { flushQueue } = await import('@/lib/offline/sync');
    const result = await flushQueue();

    expect(result.skipped).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
