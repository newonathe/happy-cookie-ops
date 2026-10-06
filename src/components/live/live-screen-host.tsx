import { createElement } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { liveScreenFor } from '@/components/live/live-screens';
import { SubTabs } from '@/components/ui/sub-tabs';

/**
 * The live-only screen host (B1, docs/state/protected-exception.md): what the frame's one
 * guarded slot renders. `v.liveScreen` is set only by `OpsRuntime.renderVals()` after its
 * live-mode check. It carries the owner's sub-tab strip, drawn above whichever screen is
 * open, and names a screen only when one is registered and the role may see it.
 */
export function LiveScreenHost({ v }: { v: OpsVals }) {
  const tabs = v.liveScreen?.tabs;
  const key = v.liveScreen?.screen;
  // A registered component, looked up by key: the same one on every render, never made here.
  const registered = key ? liveScreenFor(key) : undefined;
  return (
    <>
      {tabs ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <SubTabs label={tabs.label} tabs={tabs.places} />
          <SubTabs label={tabs.placeLabel} tabs={tabs.entries} quiet />
        </div>
      ) : null}
      {registered ? createElement(registered, { v }) : null}
    </>
  );
}
