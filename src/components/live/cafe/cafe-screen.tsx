'use client';

import { OpsRuntime } from '@/store/ops-runtime';
import { useOpsEngine } from '@/store/use-ops';
import type { OpsVals } from '@/view-models/vals';
import { CafePage } from './cafe-page';

/** The live Café screen: the page, with no ported screen behind it (there is none in the demo). */
export function CafeScreen({ v }: { v: OpsVals }) {
  void v;
  const engine = useOpsEngine();
  const getWriteScope = () => (engine instanceof OpsRuntime ? engine.getCafeWriteScope() : null);
  const scope = getWriteScope();
  return (
    <CafePage
      key={JSON.stringify([scope?.business, scope?.userId])}
      getWriteScope={getWriteScope}
    />
  );
}
