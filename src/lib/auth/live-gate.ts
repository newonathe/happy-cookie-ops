import { isAuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import type { Role } from '@/store/engine/ops-engine';
import { clearStoredBooks } from '@/lib/data/live-state';

const ROLES: readonly Role[] = ['owner', 'helper', 'support'];

function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export type ProfileCheck =
  | { status: 'ok'; role: Role }
  /** A definite, positive denial: no user, an explicit auth error, or an inactive/missing/unrecognised profile row. */
  | { status: 'denied' }
  /** The check could not be completed — offline, a timed-out fetch, a transient server error. Not evidence of anything. */
  | { status: 'unknown' };

/**
 * The live-mode identity check. `getUser()` is used rather than `getSession()` because it
 * round-trips through Supabase Auth and so cannot be satisfied by a stale or revoked token
 * merely sitting in storage; `getSession()` only reads local storage.
 *
 * The "own profile" RLS policy (`supabase/migrations/20260101000000_init.sql`) has no
 * `active` filter, so a deactivated account can still read its own row and see
 * `active: false` — that is exactly the signal `denied` depends on for that case.
 *
 * This deliberately separates a positive denial from an inconclusive one. A network
 * failure (offline, a dropped connection, a server timeout) is not evidence that the
 * account is invalid, and the caller must not treat it as one: on a bazaar phone with no
 * signal, signing the till out because a background re-check timed out would stop it
 * selling for no security reason at all. The caller (`src/components/app/live-gate.tsx`)
 * fails closed on `unknown` only for the *first* check of a session (nothing has been
 * verified yet, so there is nothing to lose by waiting), and holds the current state on
 * `unknown` for every later re-check.
 */
export async function checkStaffProfile(supabase: SupabaseClient<Database>): Promise<ProfileCheck> {
  let userResult;
  try {
    userResult = await supabase.auth.getUser();
  } catch (error) {
    return isAuthRetryableFetchError(error) ? { status: 'unknown' } : { status: 'denied' };
  }
  const { data: userData, error: userError } = userResult;
  if (userError)
    return isAuthRetryableFetchError(userError) ? { status: 'unknown' } : { status: 'denied' };
  if (!userData.user) return { status: 'denied' };

  let profileResult;
  try {
    profileResult = await supabase
      .from('profiles')
      .select('role, active')
      .eq('id', userData.user.id)
      .maybeSingle();
  } catch {
    return { status: 'unknown' };
  }
  const { data, error } = profileResult;
  // A query-level error (timeout, transient server error) is not the same as RLS
  // returning zero rows — the latter is a real, positive "no such active profile".
  if (error) return { status: 'unknown' };
  if (!data || !data.active || !isRole(data.role)) return { status: 'denied' };

  return { status: 'ok', role: data.role };
}

/**
 * Every cookie name Supabase's `@supabase/ssr` browser client can store a session under:
 * `sb-<project-ref>-auth-token`, chunked into `.0`, `.1`, … when the session is too large
 * for one cookie.
 */
const SESSION_COOKIE = /^sb-.*-auth-token(\.\d+)?$/;

/**
 * Removes every Supabase session cookie directly, bypassing supabase-js entirely.
 *
 * This exists because `signOut()` cannot be trusted to have done it: in the installed
 * `@supabase/auth-js` (2.115.0), `_signOut` calls `__loadSession` first, which attempts a
 * token refresh whenever the access token is within its expiry margin or already expired.
 * Offline, that refresh fails with a retryable error and `_signOut` returns *before*
 * calling `_removeSession` — the session, including the refresh token, is left in storage.
 * Verified against the installed package with an unreachable URL: a valid, unexpired
 * access token is cleared correctly, but an expired one is not. An idle sign-out with no
 * signal is exactly the expired-token case, so this cannot be left to `signOut()` alone.
 */
function clearSessionCookies(): void {
  if (typeof document === 'undefined') return;
  for (const pair of document.cookie.split(';')) {
    const name = pair.split('=')[0]?.trim();
    if (name && SESSION_COOKIE.test(name))
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

/**
 * The one lock-out path, shared by an invalid/expired profile check and idle sign-out.
 *
 * `scope: 'local'` only (never the default 'global'): a bazaar phone signing itself out
 * must not also sign the owner out on her own phone. This never touches
 * `src/lib/offline/queue.ts` — a queued offline sale is IndexedDB, not the Supabase auth
 * session, and MASTER-PLAN invariant 2 requires it to survive this call untouched.
 *
 * `signOut()`'s own result is checked, and its storage is force-cleared on any error, per
 * `clearSessionCookies`'s doc comment — otherwise an offline lock-out can leave a live
 * refresh token behind, which a later `getSession()`/auto-refresh would silently revive
 * once connectivity returns, undoing the lock-out with no re-authentication.
 *
 * A full navigation (`location.replace`), not the router: it deliberately drops all
 * in-memory engine state along with the session.
 *
 * `clearStoredBooks()` runs first, and independently of the sign-out call's outcome, so a
 * shared device loses the live `hc-ops-state-v1` residue even if `signOut` hangs or fails.
 */
export async function signOutAndRedirect(
  supabase: SupabaseClient<Database>,
  nextPath: string
): Promise<void> {
  clearStoredBooks();
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) clearSessionCookies();
  window.location.replace('/sign-in?next=' + encodeURIComponent(nextPath));
}
