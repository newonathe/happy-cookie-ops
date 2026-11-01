import { createElement } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { liveScreenFor } from '@/components/live/live-screens';
import { SubTabs } from '@/components/ui/sub-tabs';
import { NextEventCard, SellingCard, TillBanner } from '@/components/live/bazaar/home-card';
import { SectionTools } from './section-tools';

/**
 * The live-only screen host (B1, docs/state/protected-exception.md): what the frame's one
 * guarded slot renders. `v.liveScreen` is set only by `OpsRuntime.renderVals()` after its
 * live-mode check. It carries one section navigation and contextual tools, and names a
 * screen only when one is registered and the role may see it.
 */
export function LiveScreenHost({ v }: { v: OpsVals }) {
  const tabs = v.liveScreen?.tabs;
  const key = v.liveScreen?.screen;
  // A registered component, looked up by key: the same one on every render, never made here.
  const registered = key ? liveScreenFor(key) : undefined;
  const till = v.liveScreen?.till;
  const next = v.liveScreen?.next;
  return (
    <>
      {till ? v.screens.today ? <SellingCard till={till} /> : <TillBanner till={till} /> : null}
      {next ? <NextEventCard next={next} /> : null}
      {tabs ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <SubTabs label={tabs.label} tabs={tabs.places} />
          <SectionTools
            key={`${tabs.placeLabel}:${tabs.places.find((item) => item.active)?.id}`}
            label={`${tabs.placeLabel} settings & tools`}
            items={tabs.entries.filter((item) => !item.primary && item.id !== 'Stock items')}
          />
        </div>
      ) : null}
      {registered ? createElement(registered, { v }) : null}
    </>
  );
}
