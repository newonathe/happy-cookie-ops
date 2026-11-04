import { act } from 'react';
import type { OpsRuntime } from '@/store/ops-runtime';
import type { ProductionRecoveryScope } from '@/lib/production/recovery';

/** Synthetic verified identity for runtime tests; real identity is supplied only by LiveGate. */
export async function bindProductionOwner(
  runtime: OpsRuntime,
  input?: ProductionRecoveryScope
): Promise<ProductionRecoveryScope> {
  const scope = input ?? {
    userId: crypto.randomUUID(),
    business: 'https://production-tests.supabase.co'
  };
  await act(async () => {
    await runtime.setProductionIdentity(scope);
  });
  return scope;
}
