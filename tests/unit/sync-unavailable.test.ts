import { beforeEach, describe, expect, it, vi } from 'vitest';

const sale = (saleId: string, at: number) => ({
  saleId,
  eventId: null,
  items: { cookie: 2 },
  gross: 200,
  discount: 0,
  total: 200,
  pay: 'cash',
  ref: '',
  clerk: 'Mia',
  at,
  tendered: 200,
  change: 0
});

async function unavailable(request: Request): Promise<Response> {
  const { POST } = await import('@/app/api/sync/route');
  const handler: (request: Request) => ReturnType<typeof POST> = POST;
  return handler(request);
}

describe('the quarantined sync endpoint', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock('@/lib/supabase/server');
  });

  it('returns a non-cacheable unavailable response to an ordinary request', async () => {
    const response = await unavailable(new Request('http://localhost/api/sync', { method: 'POST', body: '{"sales":[]}' }));

    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ error: 'sync_unavailable', accepted: [] });
  });

  it('returns unavailable when a malformed request body would throw if read', async () => {
    const request = new Request('http://localhost/api/sync', { method: 'POST', body: '{bad json' });
    const readBody = vi.fn(() => Promise.reject(new Error('body was read')));
    Object.assign(request, { json: readBody, text: readBody, arrayBuffer: readBody });

    await expect(unavailable(request)).resolves.toMatchObject({ status: 503 });
    expect(readBody).not.toHaveBeenCalled();
    expect(request.bodyUsed).toBe(false);
  });

  it('returns unavailable without consuming a large request body', async () => {
    const request = new Request('http://localhost/api/sync', {
      method: 'POST',
      body: JSON.stringify({ sales: 'x'.repeat(1_000_000) })
    });

    const response = await unavailable(request);
    expect(request.bodyUsed).toBe(false);
    expect(response.status).toBe(503);
  });

  it('returns unavailable even when constructing a server client would throw', async () => {
    const createClient = vi.fn(() => { throw new Error('server client must not be constructed'); });
    vi.doMock('@/lib/supabase/server', () => ({ createClient }));

    const response = await unavailable(new Request('http://localhost/api/sync', { method: 'POST' }));
    expect(response.status).toBe(503);
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe('a 503 sync response', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('retains every queued sale and increments failure metadata across retries', async () => {
    const rows = new Map<string, Record<string, unknown>>();
    vi.doMock('@/lib/offline/idb', () => ({
      idb: {
        supported: () => true,
        get: async <T>(key: string) => rows.get(key) as T | undefined,
        put: async <T extends { clientId: string }>(row: T) => rows.set(row.clientId, structuredClone(row)),
        all: async <T>() => [...rows.values()].map((row) => structuredClone(row)) as T[],
        delete: async (key: string) => rows.delete(key)
      }
    }));
    vi.doMock('@/lib/device', () => ({ deviceId: () => 'device-a' }));
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('fetch', async () => unavailable(new Request('http://localhost/api/sync', { method: 'POST' })));

    const { enqueueSale, allSales } = await import('@/lib/offline/queue');
    const { flushQueue } = await import('@/lib/offline/sync');
    const first = await enqueueSale(sale('S1', 1_760_000_000_001));
    const second = await enqueueSale(sale('S2', 1_760_000_000_002));

    await expect(flushQueue()).resolves.toMatchObject({ sent: [], failed: [{ clientId: first.clientId }, { clientId: second.clientId }] });
    await expect(flushQueue()).resolves.toMatchObject({ sent: [], failed: [{ clientId: first.clientId }, { clientId: second.clientId }] });

    expect(await allSales()).toEqual([
      { ...first, state: 'failed', attempts: 2, lastError: '503 {"error":"sync_unavailable","accepted":[]}' },
      { ...second, state: 'failed', attempts: 2, lastError: '503 {"error":"sync_unavailable","accepted":[]}' }
    ]);
  });
});
