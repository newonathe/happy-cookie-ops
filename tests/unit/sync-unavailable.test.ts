import { beforeEach, describe, expect, it, vi } from 'vitest';

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
