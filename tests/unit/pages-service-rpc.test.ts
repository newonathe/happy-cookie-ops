// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createPagesServiceRpc, ServiceRpcError } from '../../spikes/pages/functions/lib/service-rpc';

const origin = 'https://project.example.test';
const secret = 'sb_secret_CANARY';
const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature';
const signal = () => new AbortController().signal;
const response = (value: unknown = []) => Response.json(value);

function setup(overrides: Partial<Parameters<typeof createPagesServiceRpc>[0]> = {}) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response());
  return { fetch, rpc: createPagesServiceRpc({ origin, serviceKey: secret, keyKind: 'sb_secret', fetch, ...overrides }) };
}

async function fails(operation: Promise<unknown>, canary = ''): Promise<void> {
  try { await operation; throw new Error('expected failure'); }
  catch (error) {
    expect(error).toBeInstanceOf(ServiceRpcError);
    expect(String(error)).toBe('ServiceRpcError: service_rpc_unavailable');
    if (canary) expect(String(error)).not.toContain(canary);
  }
}

describe('Pages service RPC adapter', () => {
  it('uses only the fixed typed RPC target and secret-key apikey header', async () => {
    const { rpc, fetch } = setup();
    const abort = signal();
    await rpc('bff_session_read', { p_session_hash: 'a'.repeat(64) }, abort);
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe(`${origin}/rest/v1/rpc/bff_session_read`);
    expect(init).toMatchObject({ method: 'POST', cache: 'no-store', redirect: 'manual', signal: abort });
    const headers = new Headers(init?.headers);
    expect(headers.get('apikey')).toBe(secret);
    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('accept')).toBe('application/json');
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('accept-profile')).toBe('public');
    expect(headers.get('content-profile')).toBe('public');
    expect(init?.body).toBe(JSON.stringify({ p_session_hash: 'a'.repeat(64) }));
  });

  it('uses a bearer header only for an explicit legacy fixture JWT', async () => {
    const { rpc, fetch } = setup({ serviceKey: jwt, keyKind: 'legacy_jwt' });
    await rpc('consume_rate_limit', { p_key: 'login:edge', p_limit: 1, p_window_s: 60 }, signal());
    const headers = new Headers(fetch.mock.calls[0]![1]?.headers);
    expect(headers.get('apikey')).toBe(jwt);
    expect(headers.get('authorization')).toBe(`Bearer ${jwt}`);
  });

  it('calls the supplied fetch without an adapter object as its receiver', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(function (this: unknown) {
      expect(this).toBeUndefined();
      return Promise.resolve(response());
    });
    const rpc = createPagesServiceRpc({ origin, serviceKey: secret, keyKind: 'sb_secret', fetch });
    await rpc('consume_rate_limit', { p_key: 'login:edge', p_limit: 1, p_window_s: 60 }, signal());
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    { origin: 'http://project.example.test' }, { origin: `${origin}/path` },
    { origin: `${origin}/` }, { serviceKey: 'sb_secret_bad\nheader' },
    { keyKind: 'legacy_jwt' as const }, { serviceKey: jwt },
    { serviceKey: secret, keyKind: 'wrong' as never }
  ])('rejects invalid origin or key configuration', bad => {
    expect(() => createPagesServiceRpc({ origin, serviceKey: secret, keyKind: 'sb_secret', fetch: vi.fn(), ...bad })).toThrow(ServiceRpcError);
  });

  it('rejects an unallowlisted name before fetch', async () => {
    const { rpc, fetch } = setup();
    await fails(rpc('unknown_rpc' as never, {} as never, signal()));
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    new Response('PROVIDER_CANARY', { status: 500, headers: { 'content-type': 'application/json' } }),
    new Response(null, { status: 302, headers: { location: 'https://other.example.test' } }),
    new Response('PROVIDER_CANARY', { headers: { 'content-type': 'text/plain' } }),
    response({ error: 'PROVIDER_CANARY' }), new Response(null, { headers: { 'content-type': 'application/json' } })
  ])('maps status and malformed bodies to an opaque error', async bad => {
    const { rpc } = setup({ fetch: vi.fn().mockResolvedValue(bad) });
    await fails(rpc('bff_session_read', { p_session_hash: 'a'.repeat(64) }, signal()), 'PROVIDER_CANARY');
  });

  it('bounds body reads and propagates aborts without exposing causes', async () => {
    const chunks = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(5 * 1024 * 1024 + 1)); controller.close(); }
    });
    const oversized = new Response(chunks, { headers: { 'content-type': 'application/json' } });
    await fails(setup({ fetch: vi.fn().mockResolvedValue(oversized) }).rpc('bff_session_claim_cleanup', { p_limit: 50 }, signal()));
    const controller = new AbortController(); controller.abort();
    const { rpc, fetch } = setup();
    await fails(rpc('bff_session_read', { p_session_hash: 'a'.repeat(64) }, controller.signal));
    expect(fetch).not.toHaveBeenCalled();
    await fails(setup({ fetch: vi.fn().mockRejectedValue(new Error('NETWORK_CANARY')) }).rpc('bff_session_read', { p_session_hash: 'a'.repeat(64) }, signal()), 'NETWORK_CANARY');
  });
});
