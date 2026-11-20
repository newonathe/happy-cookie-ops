import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { checkStaffProfile, signOutAndRedirect } from '@/lib/auth/live-gate';

function client(overrides: {
  user?: unknown;
  userError?: unknown;
  userThrows?: unknown;
  profile?: unknown;
  profileError?: unknown;
  profileThrows?: unknown;
  signOut?: ReturnType<typeof vi.fn>;
}) {
  const signOut = overrides.signOut ?? vi.fn(async () => ({ error: null }));
  return {
    auth: {
      getUser: vi.fn(async () => {
        if (overrides.userThrows) throw overrides.userThrows;
        return { data: { user: overrides.user ?? null }, error: overrides.userError ?? null };
      }),
      signOut
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => {
            if (overrides.profileThrows) throw overrides.profileThrows;
            return { data: overrides.profile ?? null, error: overrides.profileError ?? null };
          })
        }))
      }))
    }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('checkStaffProfile', () => {
  it('is "denied" when getUser returns a definite auth error', async () => {
    const c = client({ userError: new AuthApiError('bad token', 401, 'bad_jwt') });
    expect(await checkStaffProfile(c)).toEqual({ status: 'denied' });
  });

  it('is "unknown" when getUser returns a retryable fetch error', async () => {
    const c = client({ userError: new AuthRetryableFetchError('fetch failed', 0) });
    expect(await checkStaffProfile(c)).toEqual({ status: 'unknown' });
  });

  it('is "unknown" when getUser throws a retryable error instead of returning one', async () => {
    const c = client({ userThrows: new AuthRetryableFetchError('fetch failed', 0) });
    expect(await checkStaffProfile(c)).toEqual({ status: 'unknown' });
  });

  it('is "denied" when getUser throws a non-retryable error', async () => {
    const c = client({ userThrows: new Error('unexpected') });
    expect(await checkStaffProfile(c)).toEqual({ status: 'denied' });
  });

  it('is "denied" when there is no user', async () => {
    expect(await checkStaffProfile(client({ user: null }))).toEqual({ status: 'denied' });
  });

  it('is "unknown" when the profile query itself throws', async () => {
    const c = client({ user: { id: 'u1' }, profileThrows: new Error('network down') });
    expect(await checkStaffProfile(c)).toEqual({ status: 'unknown' });
  });

  it('is "unknown" when the profile query returns a query-level error', async () => {
    const c = client({ user: { id: 'u1' }, profileError: { message: 'timeout' } });
    expect(await checkStaffProfile(c)).toEqual({ status: 'unknown' });
  });

  it('is "denied" when the profile row is missing', async () => {
    expect(await checkStaffProfile(client({ user: { id: 'u1' }, profile: null }))).toEqual({
      status: 'denied'
    });
  });

  it('is "denied" when the account is deactivated', async () => {
    const c = client({ user: { id: 'u1' }, profile: { role: 'helper', active: false } });
    expect(await checkStaffProfile(c)).toEqual({ status: 'denied' });
  });

  it('is "denied" on an unrecognised role', async () => {
    const c = client({ user: { id: 'u1' }, profile: { role: 'admin', active: true } });
    expect(await checkStaffProfile(c)).toEqual({ status: 'denied' });
  });

  it('is "ok" with the role for an active, recognised profile', async () => {
    const c = client({ user: { id: 'u1' }, profile: { role: 'helper', active: true } });
    expect(await checkStaffProfile(c)).toEqual({ status: 'ok', role: 'helper', userId: 'u1' });
  });
});

describe('checkStaffProfile: helper expiry and the temporary password (S3)', () => {
  const HOUR = 3_600_000;
  const iso = (ms: number) => new Date(Date.now() + ms).toISOString();

  it('is "expired" for a profile whose time has passed: a definite answer, not a denial and not a lost signal', async () => {
    const c = client({
      user: { id: 'u1' },
      profile: { role: 'helper', active: true, access_expires_at: iso(-HOUR) }
    });
    expect(await checkStaffProfile(c)).toEqual({ status: 'expired' });
  });

  it('is "ok" before the time, and says when it ends', async () => {
    const at = iso(2 * HOUR);
    const c = client({
      user: { id: 'u1' },
      profile: { role: 'helper', active: true, access_expires_at: at }
    });
    expect(await checkStaffProfile(c)).toEqual({
      status: 'ok',
      role: 'helper',
      userId: 'u1',
      expiresAt: Date.parse(at)
    });
  });

  it('is "ok" with no expiry for a null time (permanent)', async () => {
    const c = client({
      user: { id: 'u1' },
      profile: { role: 'owner', active: true, access_expires_at: null }
    });
    expect(await checkStaffProfile(c)).toEqual({ status: 'ok', role: 'owner', userId: 'u1' });
  });

  it('removed beats expired: an inactive profile is denied', async () => {
    const c = client({
      user: { id: 'u1' },
      profile: { role: 'helper', active: false, access_expires_at: iso(-HOUR) }
    });
    expect(await checkStaffProfile(c)).toEqual({ status: 'denied' });
  });

  it('flags an account whose temporary password has not been replaced', async () => {
    const c = client({
      user: { id: 'u1', user_metadata: { must_change_password: true } },
      profile: { role: 'helper', active: true }
    });
    expect(await checkStaffProfile(c)).toMatchObject({ status: 'ok', mustChangePassword: true });
    const done = client({
      user: { id: 'u1', user_metadata: { must_change_password: false } },
      profile: { role: 'helper', active: true }
    });
    expect(await checkStaffProfile(done)).toEqual({ status: 'ok', role: 'helper', userId: 'u1' });
  });

  it('reads the profile again without the expiry column on a database that has none, and then behaves as before', async () => {
    const calls: string[] = [];
    const c = {
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
      from: () => ({
        select: (columns: string) => ({
          eq: () => ({
            maybeSingle: async () => {
              calls.push(columns);
              return columns.includes('access_expires_at')
                ? {
                    data: null,
                    error: {
                      code: '42703',
                      message: 'column profiles.access_expires_at does not exist'
                    }
                  }
                : { data: { role: 'owner', active: true }, error: null };
            }
          })
        })
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    expect(await checkStaffProfile(c)).toEqual({ status: 'ok', role: 'owner', userId: 'u1' });
    expect(calls).toEqual(['role, active, access_expires_at', 'role, active']);
  });

  it('a lost signal on the profile read is still "unknown", never "expired"', async () => {
    const c = client({ user: { id: 'u1' }, profileError: { code: '', message: 'timeout' } });
    expect(await checkStaffProfile(c)).toEqual({ status: 'unknown' });
  });
});

describe('signOutAndRedirect', () => {
  const realLocation = window.location;
  const replace = vi.fn();

  beforeEach(() => {
    replace.mockClear();
    document.cookie = 'sb-project-auth-token=chunk0; path=/';
    document.cookie = 'sb-project-auth-token.1=chunk1; path=/';
    document.cookie = 'unrelated-cookie=keep-me; path=/';
    // jsdom's window.location.replace cannot be spied on directly ("Cannot redefine
    // property"); replacing the whole object is the documented workaround.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...realLocation, replace }
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
    document.cookie.split(';').forEach((pair) => {
      const name = pair.split('=')[0]?.trim();
      if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    });
    vi.restoreAllMocks();
  });

  it('signs out with scope local, then does a full navigation to sign-in', async () => {
    const signOut = vi.fn(async () => ({ error: null }));

    await signOutAndRedirect(client({ signOut }), '/orders');

    expect(signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' });
    expect(replace).toHaveBeenCalledExactlyOnceWith('/sign-in?next=%2Forders');
  });

  it('still navigates away when the revoke call itself fails (offline)', async () => {
    const signOut = vi.fn(async () => ({ error: { message: 'network error' } }));

    await signOutAndRedirect(client({ signOut }), '/bazaar');

    expect(replace).toHaveBeenCalledExactlyOnceWith('/sign-in?next=%2Fbazaar');
  });

  it('force-clears session cookies when signOut fails, so no refresh token survives offline', async () => {
    const signOut = vi.fn(async () => ({ error: { message: 'network error' } }));

    await signOutAndRedirect(client({ signOut }), '/bazaar');

    expect(document.cookie).not.toContain('sb-project-auth-token=chunk0');
    expect(document.cookie).not.toContain('sb-project-auth-token.1=chunk1');
    expect(document.cookie).toContain('unrelated-cookie=keep-me');
  });

  it('does not need to touch cookies itself when signOut succeeds', async () => {
    const signOut = vi.fn(async () => ({ error: null }));

    await signOutAndRedirect(client({ signOut }), '/bazaar');

    // supabase-js's own successful _removeSession already cleared them; this only
    // asserts the unrelated cookie was never a target either way.
    expect(document.cookie).toContain('unrelated-cookie=keep-me');
  });

  it('never touches the offline sale queue — a queued sale must survive sign-out', async () => {
    const queue = await import('@/lib/offline/queue');
    const pendingSpy = vi.spyOn(queue, 'pendingSales');

    await signOutAndRedirect(client({}), '/bazaar');

    expect(pendingSpy).not.toHaveBeenCalled();
  });
});
