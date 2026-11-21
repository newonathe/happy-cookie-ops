/**
 * S4 (20 November 2026): the open bazaar day, live on every device of the account.
 *
 * A till listens to the changes of the one day it sells (a sale or a void on its event, a stock add or a loss on its day) and, when
 * anything changes, asks for the day to be read again. The change itself is never used: the till is rebuilt from `get_bazaar_day`
 * and this phone's unsent queue is laid on top, exactly as when the day was opened (`refreshHeldDay`). So this module never touches
 * the offline queue, never carries money, and a lost or repeated change event costs nothing but one more read.
 *
 * The database decides who hears what: a change reaches a subscriber only if their own role could select that row (migration
 * 20260101009800: the owner, and an active helper for the open day). The filters here only narrow the traffic to one day.
 */

/** The slice of a Supabase Realtime channel this module uses (the real one, or a test double). */
export interface LiveDayChannel {
  on(
    type: 'postgres_changes',
    filter: { event: '*'; schema: 'public'; table: string; filter: string },
    callback: () => void
  ): LiveDayChannel;
  subscribe(callback?: (status: string) => void): LiveDayChannel;
}
export interface LiveDayClient {
  channel(name: string): LiveDayChannel;
  removeChannel(channel: LiveDayChannel): unknown;
}

/** True for a client that can subscribe (a signed-in browser client). A bare data double, or no client at all, cannot. */
export function canWatchDay(client: unknown): client is LiveDayClient {
  const c = client as Partial<LiveDayClient> | null;
  return !!c && typeof c.channel === 'function' && typeof c.removeChannel === 'function';
}

export interface LiveDayOptions {
  client: unknown;
  eventId: string;
  dayId: string;
  /** Read the day again and merge it. Called at most once per burst; never with the change itself. */
  onChange: () => void;
  /** A burst of changes (one sale touches the sale, then its stock) waits this long for its last change. */
  debounceMs?: number;
  /** A steady stream still reads at least this often. */
  maxWaitMs?: number;
  /** Test seams: the page (visibility) and the window (network). Default to the browser's own. */
  doc?: Document | null;
  win?: Window | null;
}

export interface LiveDay {
  /** False when nothing is listened to (no capable client) or after `close()`. */
  readonly active: boolean;
  close(): void;
}

const DEBOUNCE_MS = 300;
const MAX_WAIT_MS = 2_000;
const CONFIRM_DAY_MS = 15_000;
let nextSubscription = 0;

export function watchDay(options: LiveDayOptions): LiveDay {
  const { client, eventId, dayId, onChange } = options;
  if (!canWatchDay(client)) return { active: false, close() {} };
  const debounceMs = options.debounceMs ?? DEBOUNCE_MS;
  const maxWaitMs = options.maxWaitMs ?? MAX_WAIT_MS;
  const doc =
    options.doc === undefined ? (typeof document === 'undefined' ? null : document) : options.doc;
  const win =
    options.win === undefined ? (typeof window === 'undefined' ? null : window) : options.win;

  let closed = false;
  let joined = false;
  let channel: LiveDayChannel | null = null;
  let waiting: ReturnType<typeof setTimeout> | null = null;
  let firstChangeAt = 0;

  const fire = (): void => {
    waiting = null;
    firstChangeAt = 0;
    if (!closed) onChange();
  };
  /** Ask for a read after the burst settles, but never later than `maxWaitMs` after its first change. `soon`: no wait. */
  const request = (soon = false): void => {
    if (closed) return;
    const now = Date.now();
    if (waiting) clearTimeout(waiting);
    if (!firstChangeAt) firstChangeAt = now;
    const wait = soon ? 0 : Math.max(0, Math.min(debounceMs, firstChangeAt + maxWaitMs - now));
    waiting = setTimeout(fire, wait);
  };

  const join = (): void => {
    // Removal is asynchronous. A distinct topic keeps the client from returning the channel being removed.
    const mine = client.channel(`bazaar-day-${dayId}-${++nextSubscription}`);
    channel = mine;
    joined = false;
    const heard = (): void => {
      if (channel === mine) request();
    };
    mine
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'event_sales', filter: `event_id=eq.${eventId}` },
        heard
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bazaar_stock_adds', filter: `day_id=eq.${dayId}` },
        heard
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bazaar_losses', filter: `day_id=eq.${dayId}` },
        heard
      )
      .subscribe((status) => {
        if (closed || channel !== mine) return;
        if (status === 'SUBSCRIBED') {
          joined = true;
          // Joined (first time, or again after a drop): whatever changed before the join, or while it was down, is read now.
          request(true);
        } else {
          joined = false;
        }
      });
  };
  const leave = (): void => {
    const old = channel;
    channel = null;
    joined = false;
    if (old) void Promise.resolve(client.removeChannel(old)).catch(() => undefined);
  };
  /** Back to the front, or the network is back: read the day, and replace a channel that is not joined. */
  const wake = (): void => {
    if (closed) return;
    if (!joined) {
      leave();
      join();
    }
    request(true);
  };

  const onVisible = (): void => {
    if (doc?.visibilityState === 'visible') wake();
  };
  const onOnline = (): void => wake();
  doc?.addEventListener('visibilitychange', onVisible);
  win?.addEventListener('online', onOnline);
  join();
  // Closing a day does not touch the published tables. Check it while visible even if Realtime is quiet.
  const confirmation = setInterval(() => {
    if (doc?.visibilityState !== 'hidden') wake();
  }, CONFIRM_DAY_MS);

  return {
    get active() {
      return !closed;
    },
    close() {
      if (closed) return;
      closed = true;
      clearInterval(confirmation);
      if (waiting) clearTimeout(waiting);
      waiting = null;
      doc?.removeEventListener('visibilitychange', onVisible);
      win?.removeEventListener('online', onOnline);
      leave();
    }
  };
}
