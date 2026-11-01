import { createElement } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { liveScreenFor } from '@/components/live/live-screens';
import { NextEventCard, SellingCard, TillBanner } from '@/components/live/bazaar/home-card';
import { SectionNavigation } from './section-navigation';

/**
 * The live-only screen host (B1, docs/state/protected-exception.md): what the frame's one
 * guarded slot renders. `v.liveScreen` is set only by `OpsRuntime.renderVals()` after its
 * live-mode check. It carries one section navigation and contextual tools, and names a
 * screen only when one is registered and the role may see it.
 */
export function LiveScreenHost({ v }: { v: OpsVals }) {
  const key = v.liveScreen?.screen;
  // A registered component, looked up by key: the same one on every render, never made here.
  const registered = key ? liveScreenFor(key) : undefined;
  const till = v.liveScreen?.till;
  const next = v.liveScreen?.next;
  return (
    <>
      {till ? v.screens.today ? <SellingCard till={till} /> : <TillBanner till={till} /> : null}
      {next ? <NextEventCard next={next} /> : null}
      {!registered?.ownsSectionNavigation ? <SectionNavigation v={v} /> : null}
      {registered ? createElement(registered, { v }) : null}
    </>
  );
}
