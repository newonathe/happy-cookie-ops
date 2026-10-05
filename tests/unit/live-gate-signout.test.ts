import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { STORE_KEY } from '@/store/engine/ops-engine';

/**
 * docs/state/G2-plan.md "Slice audit" (MP-09 a): signing out clears the live books, but
 * MASTER-PLAN invariant 2 and src/lib/auth/live-gate.ts's own doc comment both require
 * that a queued offline sale is untouched. jsdom has no IndexedDB (tests/setup.ts), so this
 * mocks src/lib/offline/queue.ts the same way tests/unit/offline-queue.test.ts does — with
 * `vi.doMock` inside the test, not a hoisted `vi.mock` — and proves signOutAndRedirect
 * never calls into it at all.
 */
describe('signOutAndRedirect: the offline sale queue survives sign-out', () => {
  const realLocation = window.location;
  const replace = vi.fn();

  const indexedDBOpen = vi.fn();
  const indexedDBDelete = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    replace.mockClear();
    indexedDBOpen.mockClear();
    indexedDBDelete.mockClear();
    window.localStorage.clear();
    window.sessionStorage.clear();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...realLocation, replace }
    });
    // jsdom has no IndexedDB (tests/setup.ts); this stub exists only so the assertion
    // below can prove signOutAndRedirect never calls indexedDB.open/deleteDatabase, on
    // top of the queue-module-mock proof that it never even imports src/lib/offline/queue.
    vi.stubGlobal('indexedDB', { open: indexedDBOpen, deleteDatabase: indexedDBDelete });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('clears the live books but never touches the IndexedDB sale queue', async () => {
    const rows = [{ clientId: 'seeded-1', saleId: 'S1', state: 'pending' }];
    const sent: string[] = [];
    const failed: string[] = [];
    vi.doMock('@/lib/offline/queue', () => ({
      pendingSales: async () => rows,
      markSent: async (ids: string[]) => sent.push(...ids),
      markFailed: async (id: string) => failed.push(id),
      pruneSent: async () => {}
    }));

    window.localStorage.setItem(STORE_KEY, JSON.stringify({ v: 1, data: {} }));
    window.sessionStorage.setItem(STORE_KEY, JSON.stringify({ v: 1, data: {} }));

    const { signOutAndRedirect } = await import('@/lib/auth/live-gate');
    const { pendingSales } = await import('@/lib/offline/queue');

    const supabase = {
      auth: { signOut: vi.fn(async () => ({ error: null })) }
    } as unknown as SupabaseClient<Database>;

    await signOutAndRedirect(supabase, '/today');

    expect(await pendingSales()).toEqual(rows);
    expect(sent).toEqual([]);
    expect(failed).toEqual([]);
    expect(indexedDBOpen).not.toHaveBeenCalled();
    expect(indexedDBDelete).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(STORE_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(STORE_KEY)).toBeNull();
    expect(replace).toHaveBeenCalledWith(expect.stringContaining('/sign-in'));
  });
});

/**
 * Slice A3: supabase-js puts no time limit on its logout call, and a hung call used to leave
 * the session on the phone. Past SIGN_OUT_LIMIT_MS the cookies are cleared by hand, and cleared
 * again if the call settles late (it can write a refreshed session back before it removes it).
 */
describe('signOutLocal: a logout call that hangs', () => {
  const cookie = 'sb-local-auth-token=x; path=/';
  const gone = 'sb-local-auth-token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';

  afterEach(() => {
    vi.useRealTimers();
    document.cookie = gone;
  });

  it('clears the session by hand after the limit, and again when the call finally settles', async () => {
    vi.useFakeTimers();
    document.cookie = cookie;
    let settle: () => void = () => undefined;
    const supabase = {
      auth: {
        signOut: vi.fn(
          () => new Promise<{ error: null }>((resolve) => (settle = () => resolve({ error: null })))
        )
      }
    } as unknown as SupabaseClient<Database>;
    const { signOutLocal, SIGN_OUT_LIMIT_MS } = await import('@/lib/auth/live-gate');

    const done = signOutLocal(supabase);
    await vi.advanceTimersByTimeAsync(SIGN_OUT_LIMIT_MS - 1);
    expect(document.cookie).toContain('sb-local-auth-token');
    await vi.advanceTimersByTimeAsync(2);
    await done;
    expect(document.cookie).not.toContain('sb-local-auth-token');

    // The late call wrote a refreshed session back before it settled.
    document.cookie = cookie;
    settle();
    await vi.advanceTimersByTimeAsync(0);
    expect(document.cookie).not.toContain('sb-local-auth-token');
  });
});
