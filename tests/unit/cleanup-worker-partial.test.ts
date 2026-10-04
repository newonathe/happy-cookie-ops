// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/auth/persistent-session-authority', () => ({
  createPersistentSessionAuthority: () => ({
    claimCleanup: async () => ({ claimed: 2, completed: 1, failed: 1, timedOut: 0 })
  })
}));

import worker, {
  runScheduledCleanup,
  ScheduledCleanupError,
  type CleanupLogEvent
} from '../../spikes/cleanup-worker/src/index';

const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(1)))
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '');
const env = {
  SUPABASE_URL: 'https://provider.example.test',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_' + 'p'.repeat(32),
  SUPABASE_SERVICE_KEY: 'sb_secret_' + 's'.repeat(32),
  SUPABASE_SERVICE_KEY_KIND: 'sb_secret',
  SESSION_CRYPTO_CONFIG_JSON: JSON.stringify({ activeKeyId: 'k1', keys: { k1: key } })
};

describe('scheduled cleanup partial batch reporting', () => {
  it('preserves aggregate partial outcome and marks the Cron invocation failed', async () => {
    const events: CleanupLogEvent[] = [];
    const fetchFn = vi.fn(async () => {
      throw new Error('UNEXPECTED_NETWORK');
    }) as typeof globalThis.fetch;
    await expect(runScheduledCleanup(env, fetchFn, (event) => events.push(event))).resolves.toEqual(
      {
        claimed: 2,
        completed: 1,
        failed: 1,
        timedOut: 0
      }
    );
    expect(events).toEqual([
      {
        event: 'scheduled_cleanup',
        outcome: 'partial_failure',
        claimed: 2,
        completed: 1,
        failed: 1,
        timedOut: 0
      }
    ]);
    expect(fetchFn).not.toHaveBeenCalled();

    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    try {
      await expect(worker.scheduled({}, env)).rejects.toBeInstanceOf(ScheduledCleanupError);
      expect(log).toHaveBeenCalledExactlyOnceWith(JSON.stringify(events[0]));
    } finally {
      log.mockRestore();
    }
  });
});
