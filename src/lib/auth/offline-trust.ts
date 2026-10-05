import type { Role } from '@/store/engine/ops-engine';
import { readBazaar } from '@/lib/offline/bazaar-state';
import { isEventUuid } from '@/lib/data/event-sales';
import { readStallCopy } from '@/lib/offline/stall-copy';

/**
 * Slice A2 (Ethan, 2026-10-05, decision register answer 2): the bazaar phone may open Bazaar
 * Mode with no signal, inside these bounds and no wider.
 *
 *   - only Bazaar Mode (`src/components/app/live-gate.tsx` keeps every other screen closed);
 *   - only while this phone holds an event the server opened and that is not closed;
 *   - only within the owner's hours of the last identity check the server passed here.
 *
 * What is remembered is a role and a time. Never a token, a password or a session: the
 * Supabase session stays where supabase-js keeps it, and the full check runs again the moment
 * the server answers. Anything on the phone can be rewritten by whoever holds it unlocked, so
 * this record opens a screen and nothing else: every read and write of the books is still
 * decided by the database's own rules.
 */
const KEY = 'hc-live-check';

export const OFFLINE_OPEN_SETTING_KEY = 'offlineOpenHours';
/** Labelled default: a two-day bazaar with no signal after the first morning's start. */
export const OFFLINE_OPEN_HOURS_DEFAULT = 48;
export const OFFLINE_OPEN_HOURS_MIN = 1;
export const OFFLINE_OPEN_HOURS_MAX = 72;

/** A phone clock a few minutes behind the moment of the check is not a clock set back. */
const CLOCK_SLACK_MS = 5 * 60_000;
const HOUR_MS = 3_600_000;

const ROLES: Record<Role, true> = { owner: true, helper: true, support: true };

export interface RememberedCheck {
  role: Role;
  at: number;
}

/** The owner's hours from `cfg` (or the copy on the phone), clamped whatever the source says. */
export function offlineOpenHoursFor(cfg: Record<string, unknown> | undefined): number {
  const raw = cfg?.[OFFLINE_OPEN_SETTING_KEY];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return OFFLINE_OPEN_HOURS_DEFAULT;
  return Math.min(OFFLINE_OPEN_HOURS_MAX, Math.max(OFFLINE_OPEN_HOURS_MIN, Math.round(raw)));
}

export function rememberCheck(role: Role, at: number = Date.now()): void {
  const record: RememberedCheck = { role, at };
  try {
    localStorage.setItem(KEY, JSON.stringify(record));
  } catch {
    /* private mode or full: an offline reload then stays closed */
  }
}

export function readRememberedCheck(): RememberedCheck | null {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!saved || typeof saved !== 'object') return null;
    const { role, at } = saved as Record<string, unknown>;
    if (typeof role !== 'string' || !Object.hasOwn(ROLES, role)) return null;
    if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0) return null;
    return { role: role as Role, at };
  } catch {
    return null;
  }
}

export function clearRememberedCheck(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}

const IDLE_SPENT_KEY = 'hc-live-idle-spent';

/**
 * The idle time ran out while the phone could not reach the server, so the sign-out was put
 * off. Kept on the phone, not in memory: a tap or a reload must not bring the session back.
 * The first check the server answers signs out; only that sign-out clears the mark.
 */
export function markIdleSpent(): void {
  try {
    localStorage.setItem(IDLE_SPENT_KEY, '1');
  } catch {
    /* private mode or full: the in-memory idle clock still applies on this page load */
  }
}

export function idleWasSpent(): boolean {
  try {
    return localStorage.getItem(IDLE_SPENT_KEY) !== null;
  } catch {
    return false;
  }
}

export function clearIdleSpent(): void {
  try {
    localStorage.removeItem(IDLE_SPENT_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** True while the phone holds an event the server opened (its id is the server's) and it is not closed. */
export function holdsOpenEvent(): boolean {
  const event = readBazaar()?.event as { id?: string; stage?: unknown } | undefined;
  return !!event && isEventUuid(event.id) && event.stage !== 'closed';
}

/**
 * Whether the last passed check is recent enough. A check dated after "now" means the clock
 * was moved back, which would otherwise stretch the hours without limit: it is refused.
 */
export function checkStillFresh(
  now: number = Date.now(),
  check: RememberedCheck | null = readRememberedCheck(),
  hours: number = offlineOpenHoursFor(readStallCopy()?.cfg)
): boolean {
  if (!check) return false;
  if (check.at > now + CLOCK_SLACK_MS) return false;
  return now - check.at <= hours * HOUR_MS;
}

/** The role to open Bazaar Mode as when the server cannot be reached, or null to stay closed. */
export function offlineBazaarRole(now: number = Date.now()): Role | null {
  const check = readRememberedCheck();
  if (!check || !checkStillFresh(now, check) || !holdsOpenEvent()) return null;
  return check.role;
}
