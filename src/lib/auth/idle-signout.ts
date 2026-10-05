import type { Role } from '@/store/engine/ops-engine';

/**
 * Client-side idle sign-out minutes, per role — DP-15, decided by Ethan on 2026-09-27
 * (docs/state/decision-register.md): option B with the configurability audit's B10
 * defaults. Owner and support, who see financial and customer data, get 1 h; helpers get
 * 4 h, one bazaar shift, so a busy stall doesn't keep re-typing a password. These are the
 * defaults; the owner can change each within 15 min – 8 h (MP-09 b2, `idleMinutesFor`).
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
  helper: 240
};

export const IDLE_MINUTES_MIN = 15;
export const IDLE_MINUTES_MAX = 480;

export const IDLE_SETTING_KEYS: Record<Role, string> = {
  owner: 'idleMinutesOwner',
  support: 'idleMinutesSupport',
  helper: 'idleMinutesHelper'
};

/**
 * The role's idle minutes from `cfg`, where `get_settings()`/`get_operating_settings()`
 * put them after sign-in, clamped to 15–480 whatever the database says. Absent — not
 * saved yet, the read failed, or offline before the first load — falls back to
 * `IDLE_MINUTES`.
 */
export function idleMinutesFor(role: Role, cfg: Record<string, unknown> | undefined): number {
  const raw = cfg?.[IDLE_SETTING_KEYS[role]];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return IDLE_MINUTES[role];
  return Math.min(IDLE_MINUTES_MAX, Math.max(IDLE_MINUTES_MIN, Math.round(raw)));
}

/** What counts as activity. Exported so the live gate charges idle time by the same events (A2). */
export const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/**
 * Starts a role-scoped idle timer and calls `onIdle` once, after `minutes()` of no user
 * activity (`IDLE_MINUTES[role]` by default). Any of the listed events resets the clock and
 * re-reads `minutes()`, so a changed setting applies from the next tap. Returns a function
 * that stops the timer and removes the listeners; the caller is responsible for actually
 * signing out and navigating away (`signOutAndRedirect`).
 */
export function startIdleSignOut(
  role: Role,
  onIdle: () => void,
  minutes: () => number = () => IDLE_MINUTES[role]
): () => void {
  let timer: ReturnType<typeof setTimeout>;

  function reset() {
    clearTimeout(timer);
    timer = setTimeout(onIdle, minutes() * 60_000);
  }

  ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, reset, { passive: true }));
  reset();

  return () => {
    clearTimeout(timer);
    ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, reset));
  };
}
