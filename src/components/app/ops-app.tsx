'use client';

import { useSyncExternalStore } from 'react';
import { OpsRuntime } from '@/store/ops-runtime';
import { AppFrame } from '@/components/shell/app-frame';
import { useOpsVals, useOpsEngine } from '@/store/use-ops';
import { RouteSync } from './route-sync';
import { OfflineBridge } from './offline-bridge';
import { ScreenBoundary } from './screen-boundary';
import type { ScreenKey } from '@/lib/screens';

const noSubscription = () => () => undefined;

function Frame() {
  const v = useOpsVals();
  const screen = useOpsEngine().state.screen;
  // Keyed on the screen so recovering from an error on one screen does not leave the
  // boundary latched when the owner navigates away.
  return (
    <ScreenBoundary key={screen} screen={screen}>
      <AppFrame v={v} />
    </ScreenBoundary>
  );
}

export function OpsApp({ initialScreen }: { initialScreen: ScreenKey }) {
  const mounted = useSyncExternalStore(noSubscription, () => true, () => false);

  // The demo engine seeds visible dates from Date.now() at module evaluation.
  // Its static HTML cannot hydrate after the browser clock has moved on.
  if (!mounted) return null;

  return (
    <OpsRuntime>
      <RouteSync initialScreen={initialScreen} />
      <OfflineBridge />
      <Frame />
    </OpsRuntime>
  );
}
