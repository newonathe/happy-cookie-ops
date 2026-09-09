'use client';

import { useContext } from 'react';
import { OpsContext, OpsEngineContext } from '@/store/engine/ops-engine';
import type { OpsEngine } from '@/store/engine/ops-engine';
import type { OpsVals } from '@/view-models/vals';

/** The render values for the current state — the contract in src/view-models/vals.ts. */
export function useOpsVals(): OpsVals {
  const v = useContext(OpsContext);
  if (!v) throw new Error('useOpsVals() must be called inside <OpsRuntime>.');
  return v;
}

/** The engine itself, for navigation, role changes and the offline bridge. */
export function useOpsEngine(): OpsEngine {
  const engine = useContext(OpsEngineContext);
  if (!engine) throw new Error('useOpsEngine() must be called inside <OpsRuntime>.');
  return engine;
}
