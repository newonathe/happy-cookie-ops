'use client';

import { useSyncExternalStore } from 'react';
import type { LiveBazaarVals } from '@/lib/bazaar/live-bazaar-types';
import { flavoursRead } from '@/lib/data/flavours-read-state';
import { STAFF_COPY } from '@/lib/orders/staff-copy';
import { Banner } from '@/components/ui/banner';

/**
 * HCB-004: whether her own products and prices are what the Bazaar can plan a day from. `bazaar.catalogue.held` is the
 * runtime's answer (a read answered, or the copy this phone kept for an offline open); it is absent for a screen that
 * was never given one, which counts as held. The read state is subscribed to only for the words and for Try again.
 */
export function useCatalogue(bazaar: LiveBazaarVals | null) {
  const read = useSyncExternalStore(
    flavoursRead.subscribe,
    flavoursRead.get,
    flavoursRead.getServer
  );
  const held = bazaar?.catalogue?.held !== false;
  return { held, failed: read.phase === 'failed', retry: read.retry };
}

/** The reason and the way to try again. It stands in the page's flow, above the days, never over a control. */
export function CatalogueNotice({
  failed,
  retry
}: {
  failed: boolean;
  retry: (() => void) | null;
}) {
  return (
    <Banner
      tone="warn"
      title={failed ? STAFF_COPY.bazaarCatalogueFailed : STAFF_COPY.bazaarCatalogueNotRead}
      action={retry ? { label: 'Try again', onPress: retry } : undefined}
    />
  );
}
