'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { OpsRuntime } from '@/store/ops-runtime';
import { OwnerWorkspace } from '@/components/live/owner-workspace';
import { useOpsVals, useOpsEngine } from '@/store/use-ops';
import { RouteSync } from './route-sync';
import { OfflineBridge } from './offline-bridge';
import { ScreenBoundary } from './screen-boundary';
import { LiveGate } from './live-gate';
import { isLiveMode } from '@/lib/config/app-mode';
import type { ScreenKey } from '@/lib/screens';

const noSubscription = () => () => undefined;

/**
 * Keeps the customer's status link (`#t=…`) in the address bar and adopts it on a direct load.
 * Rendered after `RouteSync`, so its effect runs after the route's `pushState` (which drops a
 * fragment). Live mode only; it renders nothing.
 */
function LiveOrderRoute() {
  useOpsVals();
  const engine = useOpsEngine();
  useEffect(() => {
    if (isLiveMode() && engine instanceof OpsRuntime) engine.syncStatusRoute();
  });
  return null;
}

function Frame() {
  const v = useOpsVals();
  const engine = useOpsEngine();
  const screen = engine.state.screen;
  // Keyed on the screen so recovering from an error on one screen does not leave the
  // boundary latched when the owner navigates away.
  return (
    <ScreenBoundary key={screen} screen={screen}>
      <OwnerWorkspace
        v={v}
        screen={screen}
        role={engine.state.role}
        onAccount={() => engine.go('settings')}
      />
    </ScreenBoundary>
  );
}

export function OpsApp({ initialScreen }: { initialScreen: ScreenKey }) {
  const mounted = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false
  );

  // The demo engine seeds visible dates from Date.now() at module evaluation.
  // Its static HTML cannot hydrate after the browser clock has moved on.
  if (!mounted) return null;

  return (
    <OpsRuntime>
      <LiveGate initialScreen={initialScreen}>
        {/* A2: an offline open lands on Bazaar Mode, and a refused screen replaces only the frame. */}
        {({ landing, hold }) => (
          <>
            <RouteSync initialScreen={landing} />
            <LiveOrderRoute />
            <OfflineBridge />
            {hold ?? <Frame />}
          </>
        )}
      </LiveGate>
    </OpsRuntime>
  );
}
