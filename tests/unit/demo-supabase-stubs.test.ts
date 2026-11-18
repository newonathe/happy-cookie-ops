import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createClient } from '@/lib/supabase/client-none';
import { isAuthRetryableFetchError as noneCheck } from '@/lib/supabase/auth-errors-none';
import { isAuthRetryableFetchError } from '@/lib/supabase/auth-errors';

/**
 * HCB-083 (19 November 2026): the demo build shipped the whole Supabase SDK (~860 KB of source) on /bazaar although it
 * never creates a client. Its browser bundle now swaps the two SDK entry points for these stubs.
 */
describe('demo builds leave the Supabase SDK out of the browser bundle', () => {
  it('the stub client fails loudly if anything ever reaches it', () => {
    expect(() => createClient()).toThrow(/no Supabase backend/);
  });

  it('the stub error check never reports a retryable auth error', () => {
    expect(noneCheck(new Error('offline'))).toBe(false);
  });

  it('the real wrapper still re-exports the SDK check for live and configured builds', () => {
    expect(typeof isAuthRetryableFetchError).toBe('function');
    expect(isAuthRetryableFetchError(new Error('plain'))).toBe(false);
  });

  it('swaps only in client builds that are not live and have no backend configured', () => {
    const config = readFileSync('next.config.ts', 'utf8');
    expect(config).toContain('/lib[\\\\/]supabase[\\\\/](client|auth-errors)$/');
    expect(config).toMatch(/NEXT_PUBLIC_APP_MODE !== 'live' && !isServer && noBackend/);
    expect(config).toMatch(
      /!process\.env\.NEXT_PUBLIC_SUPABASE_URL \|\| !process\.env\.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/
    );
    const gate = readFileSync('src/lib/auth/live-gate.ts', 'utf8');
    expect(gate).not.toMatch(
      /import \{[^}]*isAuthRetryableFetchError[^}]*\} from '@supabase\/supabase-js'/
    );
  });
});
