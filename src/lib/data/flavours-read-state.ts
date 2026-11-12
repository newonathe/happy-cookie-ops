/**
 * What the owner's catalogue read (`get_flavours`) has achieved, for the live Products page
 * (HCB-003). Same shape and rules as `src/lib/orders/orders-read-state.ts`: the page subscribes
 * with `useSyncExternalStore`; `FlavourSync` is the only writer and reports from the same
 * `load()` that reads the flavours. The flavours themselves stay in the sync and the engine: this
 * module holds no catalogue data, only whether it was read, whether it was empty, and when.
 *
 * One writer at a time: each new `FlavourSync` claims the store, which resets it, and from then
 * on a replaced reader's late answers are ignored. A retired reader clears its own state.
 *
 * - `idle`: no read is due (demo mode, a customer screen, or before the live gate reaches a staff screen).
 * - `loading`: the first read is out and nothing has been read yet. Also published, with no reader and
 *   nothing to retry, by `expect()` while the live gate is on a staff screen and the read is due but not
 *   yet started, so an owner view never draws the built-in list in that gap (HCB-004 a3).
 * - `read`: the latest settled read succeeded. `empty` means it answered with no flavours.
 * - `failed`: the latest read failed. With `everRead`, the last good list is still shown and
 *   `readAt` is when it was asked for.
 */
export type FlavoursReadPhase = 'idle' | 'loading' | 'read' | 'failed';

export interface FlavoursReadSnapshot {
  readonly phase: FlavoursReadPhase;
  readonly everRead: boolean;
  /** The newest read answered with no flavours: an empty menu, not a failure. */
  readonly empty: boolean;
  /** When the shown list was asked for (ms), or null if nothing was ever read. */
  readonly readAt: number | null;
  /** Reads again through the current reader; null when there is none. */
  readonly retry: (() => void) | null;
}

const IDLE: FlavoursReadSnapshot = Object.freeze({
  phase: 'idle',
  everRead: false,
  empty: false,
  readAt: null,
  retry: null
});

let snapshot: FlavoursReadSnapshot = IDLE;
let owner: object | null = null;
const listeners = new Set<() => void>();

const same = (a: FlavoursReadSnapshot, b: FlavoursReadSnapshot) =>
  a.phase === b.phase &&
  a.everRead === b.everRead &&
  a.empty === b.empty &&
  a.readAt === b.readAt &&
  a.retry === b.retry;

function replace(next: FlavoursReadSnapshot): void {
  if (same(snapshot, next)) return;
  snapshot = next === IDLE ? IDLE : Object.freeze({ ...next });
  for (const listener of [...listeners]) listener();
}

export const flavoursRead = {
  /** The current snapshot: the same object until something changes. */
  get: (): FlavoursReadSnapshot => snapshot,
  /** Server rendering has read nothing. */
  getServer: (): FlavoursReadSnapshot => IDLE,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
  /** A new reader takes over and the state starts again; earlier readers can no longer write. */
  claim(reader: object): void {
    owner = reader;
    replace(IDLE);
  },
  /**
   * The live gate is on a staff screen and a reader is due but not bound yet (identity moved without a
   * check, so nothing has started): `loading`, with nothing to retry. No-op once a reader owns the store
   * or the state is anything but idle. `claim()` replaces it, so a started reader is unaffected.
   */
  expect(): void {
    if (owner !== null || snapshot !== IDLE) return;
    replace({ phase: 'loading', everRead: false, empty: false, readAt: null, retry: null });
  },
  /** The gate no longer waits for a reader: an unowned expectation goes back to idle. */
  unexpect(): void {
    if (owner !== null || snapshot.phase !== 'loading') return;
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
  publish(reader: object, next: FlavoursReadSnapshot): void {
    if (reader !== owner) return;
    replace(next);
  },
  /** Tests only: back to no reader. */
  reset(): void {
    owner = null;
    replace(IDLE);
  }
};
