import type { Role } from '@/store/engine/ops-engine';

/**
 * Client-side idle sign-out minutes, per role — pending DP-15
 * (docs/state/decision-register.md). Not yet Ethan's decision: shaped like DP-15's
 * option B so a bazaar shift doesn't force a helper to keep re-typing a password, while
 * owner and support — who see financial and customer data — get the shorter timeout.
 *
 * There is no absolute session lifetime underneath this to fall back on: that was a
 * property of the archived BFF (docs/state/decision-register.md), not of architecture A.
 * The local Supabase Auth container has no session time-boxing configured, and Supabase's
 * own session time-boxing is a Pro-plan feature. `docs/RUNBOOK-accounts.md`'s 1800 s value
 * is the *access token* expiry only — a refresh token, left unrevoked, is otherwise good
 * indefinitely. This idle timer is therefore the only bound on how long a signed-in device
 * stays signed in; there is no second layer catching a case where it fails.
 */
export const IDLE_MINUTES: Record<Role, number> = {
  owner: 60,
  support: 60,
  helper: 180
};

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/**
 * Starts a role-scoped idle timer and calls `onIdle` once, after `IDLE_MINUTES[role]` of no
 * user activity. Any of the listed events resets the clock. Returns a function that stops
 * the timer and removes the listeners; the caller is responsible for actually signing out
 * and navigating away (`signOutAndRedirect`).
 */
export function startIdleSignOut(role: Role, onIdle: () => void): () => void {
  const limitMs = IDLE_MINUTES[role] * 60_000;
  let timer: ReturnType<typeof setTimeout>;

  function reset() {
    clearTimeout(timer);
    timer = setTimeout(onIdle, limitMs);
  }

  ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, reset, { passive: true }));
  reset();

  return () => {
    clearTimeout(timer);
    ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, reset));
  };
}
