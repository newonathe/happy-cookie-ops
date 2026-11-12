'use client';

import type { OpsVals } from '@/view-models/vals';
import { Button } from '@/components/ui/button';
import { SubTabs } from '@/components/ui/sub-tabs';
import { isLiveMode } from '@/lib/config/app-mode';
import { useCatalogueHeld } from '../bazaar/catalogue-notice';

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
  // As on Production (and as this page's own "not read" state): until her own products have been read, or when
  // that read failed with nothing held, nothing can be started from them.
  const catalogue = useCatalogueHeld(v.catalogueHeld);
  const unread = !catalogue.held && (catalogue.started || (isLiveMode() && !!v.ownerView));
  return (
    <>
      {make ? (
        <Button
          variant="primary"
          data-production-start
          onClick={make.startProduction}
          disabled={unread}
        >
          Start production
        </Button>
      ) : null}
      <Button variant="secondary" onClick={onSettings}>
        Settings
      </Button>
    </>
  );
}
