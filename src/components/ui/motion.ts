'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

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
 * exit), then unmounts; under reduced motion it unmounts at once. Draw the node while `mounted` and put
 * `data-leaving={leaving}` on an element with the `motion-leave` class.
 */
export function usePresence(
  present: boolean,
  exitMs = 150
): { mounted: boolean; leaving: boolean } {
  const [mounted, setMounted] = useState(present);
  // Shown again: mounted again in this render, not after an effect (React's "adjust state while rendering").
  if (present && !mounted) setMounted(true);
  useEffect(() => {
    if (present || !mounted) return;
    const timer = window.setTimeout(() => setMounted(false), reducedMotionNow() ? 0 : exitMs);
    return () => window.clearTimeout(timer);
  }, [present, mounted, exitMs]);
  // Under reduced motion there is no exit to play: the node is gone in the render that hides it.
  const instant = !present && reducedMotionNow();
  return { mounted: present || (mounted && !instant), leaving: !present && mounted && !instant };
}

type Transitioning = Document & { startViewTransition?: (update: () => void) => unknown };

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
