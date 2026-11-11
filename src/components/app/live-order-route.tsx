'use client';

import { useEffect } from 'react';
import { OpsRuntime } from '@/store/ops-runtime';
import { useOpsVals, useOpsEngine } from '@/store/use-ops';
import { isLiveMode } from '@/lib/config/app-mode';

/**
 * Keeps the customer's status link (`#t=…`) in the address bar and adopts it on a direct load.
 * Rendered after `RouteSync`, so its effect runs after the route's `pushState` (which drops a
 * fragment). Live mode only; it renders nothing.
 */
export function LiveOrderRoute() {
  useOpsVals();
  const engine = useOpsEngine();
  useEffect(() => {
    if (isLiveMode() && engine instanceof OpsRuntime) engine.syncStatusRoute();
  });
  return null;
}
