'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

/**
 * Motion helpers for the live screens (docs/design/bazaar-v2.md, section 4). The CSS classes sit in globals.css; these
 * are the parts CSS cannot do alone. Each one checks `prefers-reduced-motion` itself, because the global CSS rule only
 * shortens durations: it cannot stop a script.
 */
const QUERY = '(prefers-reduced-motion: reduce)';

function reducedMotionNow(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(QUERY).matches
    : false;
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return () => undefined;
  const list = window.matchMedia(QUERY);
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
}

/** True when the person asked for less motion. False on the server and where `matchMedia` does not exist. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, reducedMotionNow, () => false);
}

/**
 * Keeps a node mounted while it plays its exit. `present` going false sets `leaving` for `exitMs` (the `--dur-fast`
 * exit), then unmounts and calls `onExited` (where a list drops the row from its data); under reduced motion it
 * unmounts at once. Draw the node while `mounted` and put
 * `data-leaving={leaving}` on an element with the `motion-leave` class.
 */
export function usePresence(
  present: boolean,
  exitMs = 150,
  onExited?: () => void
): { mounted: boolean; leaving: boolean } {
  const [mounted, setMounted] = useState(present);
  // Shown again: mounted again in this render, not after an effect (React's "adjust state while rendering").
  if (present && !mounted) setMounted(true);
  // The latest callback, so an inline arrow does not restart the exit timer on every render.
  const exited = useRef(onExited);
  useEffect(() => {
    exited.current = onExited;
  });
  useEffect(() => {
    if (present || !mounted) return;
    const timer = window.setTimeout(
      () => {
        setMounted(false);
        exited.current?.();
      },
      reducedMotionNow() ? 0 : exitMs
    );
    return () => window.clearTimeout(timer);
  }, [present, mounted, exitMs]);
  // Under reduced motion there is no exit to play: the node is gone in the render that hides it.
  const instant = !present && reducedMotionNow();
  return { mounted: present || (mounted && !instant), leaving: !present && mounted && !instant };
}

export interface LeavingRow<T> {
  item: T;
  key: string;
  /** True for a row that was removed and is playing its exit; draw it inert (no controls, aria-hidden). */
  leaving: boolean;
}

/**
 * A list that plays the exit of a removed row (opacity and scale .98 over `exitMs`, the `motion-leave` class with
 * `data-leaving`). The rows are the current items plus, for `exitMs` after a removal, the removed row at its old place.
 * Under reduced motion a removed row is gone at once. `keyOf` must give each row a stable, unique key.
 */
export function useLeavingRows<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  exitMs = 150
): LeavingRow<T>[] {
  const rows = items.map((item) => ({ item, key: keyOf(item) }));
  const signature = JSON.stringify(rows.map((r) => r.key));
  const [seen, setSeen] = useState({ signature, rows });
  const [ghosts, setGhosts] = useState<{ item: T; key: string; index: number }[]>([]);
  // Adjusting state while rendering: rows that were there last render and are not now start their exit.
  if (seen.signature !== signature) {
    const now = new Set(rows.map((r) => r.key));
    const gone = seen.rows.map((r, index) => ({ ...r, index })).filter((r) => !now.has(r.key));
    setSeen({ signature, rows });
    setGhosts(reducedMotionNow() ? [] : [...ghosts.filter((g) => !now.has(g.key)), ...gone]);
  }
  useEffect(() => {
    if (ghosts.length === 0) return;
    const timer = window.setTimeout(() => setGhosts([]), exitMs);
    return () => window.clearTimeout(timer);
  }, [ghosts, exitMs]);
  const out: LeavingRow<T>[] = rows.map((r) => ({ ...r, leaving: false }));
  const live = new Set(rows.map((r) => r.key));
  for (const g of ghosts) {
    if (live.has(g.key)) continue;
    out.splice(Math.min(g.index, out.length), 0, { item: g.item, key: g.key, leaving: true });
  }
  return out;
}

type Transitioning = Document & { startViewTransition?: (update: () => void) => unknown };

/** True where the browser can run a view transition (and the person has not asked for less motion). */
export function supportsViewTransition(): boolean {
  const doc = typeof document === 'undefined' ? null : (document as Transitioning);
  return !!doc && typeof doc.startViewTransition === 'function' && !reducedMotionNow();
}

/**
 * `run(update)` calls `update` inside `document.startViewTransition` where the browser has it, and plain otherwise:
 * in older Safari, in jsdom, and always under reduced motion. `update` must change the DOM synchronously (for example
 * through `flushSync`) or the browser snapshots nothing.
 */
export function useViewTransition(): (update: () => void) => void {
  return useCallback((update: () => void) => {
    const doc = typeof document === 'undefined' ? null : (document as Transitioning);
    if (!doc || typeof doc.startViewTransition !== 'function' || reducedMotionNow()) {
      update();
      return;
    }
    doc.startViewTransition(update);
  }, []);
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * A number that counts from 0 to `target` the first time it shows (400 ms), then follows `target` without counting
 * again. Returns the final value at once under reduced motion or with `enabled` false.
 */
export function useCountUp(
  target: number,
  options: { enabled?: boolean; durationMs?: number } = {}
): number {
  const { enabled = true, durationMs = 400 } = options;
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState<number | null>(null);
  const [played, setPlayed] = useState(false);
  const animate = enabled && !reduced && !played && typeof requestAnimationFrame === 'function';
  useEffect(() => {
    if (!animate) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setShown(target * easeOut(t));
      if (t < 1) frame = requestAnimationFrame(tick);
      else setPlayed(true);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animate, target, durationMs]);
  if (!animate) return target;
  return shown === null ? 0 : Math.round(shown);
}
