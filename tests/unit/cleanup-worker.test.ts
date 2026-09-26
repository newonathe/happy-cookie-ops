// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import worker, {
  runScheduledCleanup,
  ScheduledCleanupError,
  type CleanupLogEvent
} from '../../spikes/cleanup-worker/src/index';

const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(1)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const env = {
  SUPABASE_URL: 'https://provider.example.test',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_' + 'p'.repeat(32),
  SUPABASE_SERVICE_KEY: 'sb_secret_' + 's'.repeat(32),
  SUPABASE_SERVICE_KEY_KIND: 'sb_secret',
  SESSION_CRYPTO_CONFIG_JSON: JSON.stringify({ activeKeyId: 'k1', keys: { k1: key } })
};

describe('scheduled cleanup Worker boundary', () => {
  it('has no public HTTP handler and fails closed before network on missing bindings', async () => {
    expect('fetch' in worker).toBe(false);
    const fetchFn = vi.fn(async () => { throw new Error('NETWORK_CANARY'); }) as typeof globalThis.fetch;
    const events: CleanupLogEvent[] = [];
    await expect(runScheduledCleanup({}, fetchFn, event => events.push(event)))
      .rejects.toBeInstanceOf(ScheduledCleanupError);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(events).toEqual([{ event: 'scheduled_cleanup', outcome: 'failure', errorClass: 'configuration' }]);
  });

  it('rejects non-HTTPS and legacy service credentials before network', async () => {
    const fetchFn = vi.fn(async () => { throw new Error('NETWORK_CANARY'); }) as typeof globalThis.fetch;
    for (const bad of [
      { ...env, SUPABASE_URL: 'http://provider.example.test' },
      { ...env, SUPABASE_SERVICE_KEY_KIND: 'legacy_jwt' }
    ]) {
      const events: CleanupLogEvent[] = [];
      await expect(runScheduledCleanup(bad, fetchFn, event => events.push(event)))
        .rejects.toBeInstanceOf(ScheduledCleanupError);
      expect(events).toEqual([{ event: 'scheduled_cleanup', outcome: 'failure', errorClass: 'configuration' }]);
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('uses the existing claim RPC once with a three-row cap and reports only aggregate counts', async () => {
    const requests: Request[] = [];
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      return Response.json([]);
    }) as typeof globalThis.fetch;
    const events: CleanupLogEvent[] = [];
    const counts = await runScheduledCleanup(env, fetchFn, event => events.push(event));
    expect(counts).toEqual({ claimed: 0, completed: 0, failed: 0, timedOut: 0 });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe('https://provider.example.test/rest/v1/rpc/bff_session_claim_cleanup');
    expect(requests[0]?.headers.get('apikey')).toBe(env.SUPABASE_SERVICE_KEY);
    expect(requests[0]?.headers.get('authorization')).toBeNull();
    expect(await requests[0]?.json()).toEqual({ p_limit: 3 });
    expect(events).toEqual([{
      event: 'scheduled_cleanup', outcome: 'success', claimed: 0, completed: 0, failed: 0, timedOut: 0
    }]);
    expect(JSON.stringify(events)).not.toContain(env.SUPABASE_SERVICE_KEY);
  });

  it('reports dependency failures without exposing provider error text or secrets', async () => {
    const fetchFn = vi.fn(async () => { throw new Error('PROVIDER_CANARY'); }) as typeof globalThis.fetch;
    const events: CleanupLogEvent[] = [];
    await expect(runScheduledCleanup(env, fetchFn, event => events.push(event)))
      .rejects.toMatchObject({ message: 'scheduled_cleanup_unavailable' });
    expect(events).toEqual([{ event: 'scheduled_cleanup', outcome: 'failure', errorClass: 'dependency' }]);
    expect(JSON.stringify(events)).not.toContain('PROVIDER_CANARY');
    expect(JSON.stringify(events)).not.toContain(env.SUPABASE_SERVICE_KEY);
  });
});
