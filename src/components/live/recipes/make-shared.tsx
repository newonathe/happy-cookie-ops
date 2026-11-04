'use client';

import type { OpsVals } from '@/view-models/vals';
import { Button } from '@/components/ui/button';
import { SubTabs } from '@/components/ui/sub-tabs';

/** Make's one section row: Products and Production. */
export function MakeTabs({ v }: { v: OpsVals }) {
  const tabs = v.liveScreen?.tabs;
  if (!tabs) return null;
  return (
    <div className="mb-4">
      <SubTabs label={tabs.label} tabs={tabs.places} refined />
    </div>
  );
}

/** The title's actions on Products: Start production and the section's Settings. */
export function MakeTitleActions({ v, onSettings }: { v: OpsVals; onSettings: () => void }) {
  const make = v.liveMake;
  return (
    <>
      {make ? (
        <Button variant="primary" data-production-start onClick={make.startProduction}>
          Start production
        </Button>
      ) : null}
      <Button variant="secondary" onClick={onSettings}>
        Settings
      </Button>
    </>
  );
}
