import type { ComponentType } from 'react';
import type { OpsVals } from '@/view-models/vals';
import type { ScreenKey } from '@/lib/screens';

/**
 * The live-only screen registry (B1, docs/state/protected-exception.md). A redesigned
 * screen registers here under the key of the ported screen it replaces; the frame's one
 * guarded slot then draws it instead, in live mode only. The ported screen stays as the
 * demo. It ships empty: a slice that redesigns a screen adds its registration.
 */
export type LiveScreen = ComponentType<{ v: OpsVals }> & { ownsSectionNavigation?: boolean };

const registry = new Map<ScreenKey, LiveScreen>();

/** Returns the function that takes the registration back. */
export function registerLiveScreen(key: ScreenKey, screen: LiveScreen): () => void {
  registry.set(key, screen);
  return () => {
    if (registry.get(key) === screen) registry.delete(key);
  };
}

export function liveScreenFor(key: ScreenKey): LiveScreen | undefined {
  return registry.get(key);
}
