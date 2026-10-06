import { createElement } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { liveScreenFor } from '@/components/live/live-screens';

/**
 * The live-only screen host (B1, docs/state/protected-exception.md): what the frame's one
 * guarded slot renders. `v.liveScreen` is set only by `OpsRuntime.renderVals()` after its
 * live-mode check, and names a screen only when one is registered and the role may see it.
 */
export function LiveScreenHost({ v }: { v: OpsVals }) {
  const key = v.liveScreen?.screen;
  // A registered component, looked up by key: the same one on every render, never made here.
  const registered = key ? liveScreenFor(key) : undefined;
  return registered ? createElement(registered, { v }) : null;
}
