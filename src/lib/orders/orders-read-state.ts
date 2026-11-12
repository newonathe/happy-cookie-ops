/**
 * What the owner's order read has achieved, for the live Orders page (HCB-002a). The page
 * subscribes with `useSyncExternalStore`; `StaffOrderSync` is the only writer, and it reports
 * from the same `load()` that reads the orders. The orders themselves stay in the sync and the
 * engine: this module holds no order data, only whether it was read and when.
 *
 * One writer at a time: each new `StaffOrderSync` (a new owner session, a remounted runtime, a
 * reloaded module) claims the store, which resets it, and from then on a replaced reader's late
 * answers are ignored. Retiring the current reader also clears its snapshot and Retry.
 *
 * - `idle`: no read was started (demo mode, helpers, or before the owner's read begins).
 * - `loading`: the first read is out and nothing has been read yet.
 * - `read`: the latest settled read succeeded.
 * - `failed`: the latest read failed. With `everRead`, the last good list is still shown and
 *   `readAt` is when it was asked for.
 *
 * `dropped` counts rows of the last good read that the screens could not use.
 *
 * `savedNotRefreshed` (HCB-006) is the id of an order whose change the database acknowledged but
 * whose list refresh failed: the page says so until the next successful read (or retire) clears it.
 */
export type OrdersReadPhase = 'idle' | 'loading' | 'read' | 'failed';

export interface OrdersReadSnapshot {
  readonly phase: OrdersReadPhase;
  readonly everRead: boolean;
  /** When the shown list was asked for (ms), or null if nothing was ever read. */
  readonly readAt: number | null;
  readonly dropped: number;
  readonly savedNotRefreshed: string | null;
  /** Reads again through the current reader; null when there is none. */
  readonly retry: (() => void) | null;
}

const IDLE: OrdersReadSnapshot = Object.freeze({
  phase: 'idle',
  everRead: false,
  readAt: null,
  dropped: 0,
  savedNotRefreshed: null,
  retry: null
});

let snapshot: OrdersReadSnapshot = IDLE;
let owner: object | null = null;
const listeners = new Set<() => void>();

const same = (a: OrdersReadSnapshot, b: OrdersReadSnapshot) =>
  a.phase === b.phase &&
  a.everRead === b.everRead &&
  a.readAt === b.readAt &&
  a.dropped === b.dropped &&
  a.savedNotRefreshed === b.savedNotRefreshed &&
  a.retry === b.retry;

function replace(next: OrdersReadSnapshot): void {
  if (same(snapshot, next)) return;
  snapshot = next === IDLE ? IDLE : Object.freeze({ ...next });
  for (const listener of [...listeners]) listener();
}

export const ordersRead = {
  /** The current snapshot: the same object until something changes. */
  get: (): OrdersReadSnapshot => snapshot,
  /** Server rendering has read nothing. */
  getServer: (): OrdersReadSnapshot => IDLE,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
  /** A new reader takes over and the state starts again; earlier readers can no longer write. */
  claim(reader: object): void {
    owner = reader;
    replace(IDLE);
  },
  /** Whether `reader` is the current reader: a replaced one must not apply late answers either. */
  owns: (reader: object): boolean => reader === owner,
  /** A retired reader may clear its own state, never a newer reader's state. */
  release(reader: object): void {
    if (reader !== owner) return;
    owner = null;
    replace(IDLE);
  },
  /** Written only by the current reader; anything else is a stale callback and is ignored. */
  publish(reader: object, next: OrdersReadSnapshot): void {
    if (reader !== owner) return;
    replace(next);
  },
  /** Tests only: back to no reader. */
  reset(): void {
    owner = null;
    replace(IDLE);
  }
};
