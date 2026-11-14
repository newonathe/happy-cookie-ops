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
  return useCatalogueHeld(bazaar?.catalogue?.held);
}

/** The same answer for any owner screen: `held` is `OpsVals.catalogueHeld`, absent when the screen was never given one. */
export function useCatalogueHeld(heldByRuntime: boolean | undefined) {
  const read = useSyncExternalStore(
    flavoursRead.subscribe,
    flavoursRead.get,
    flavoursRead.getServer
  );
  // The read state is reported after the engine's list is replaced, so a successful Try again clears the notice here, on its
  // own render, without waiting for the next engine render to refresh `bazaar.catalogue`.
  const held = heldByRuntime !== false || read.everRead;
  // `started` is false only while no read has begun at all (a screen mounted with no reader): then there is nothing to wait for.
  return {
    held,
    started: read.phase !== 'idle',
    failed: read.phase === 'failed',
    retry: read.retry
  };
}

/** HCB-004 a2: the words for a page that lists products (the recipe book, production, the made-stock lists). */
export const PRODUCTS_NOTICE_COPY = {
  notRead: STAFF_COPY.productsNotRead,
  failed: STAFF_COPY.productsReadFailed
};

/** The reason and the way to try again. It stands in the page's flow, above the days, never over a control. */
export function CatalogueNotice({
  failed,
  retry,
  copy = { notRead: STAFF_COPY.bazaarCatalogueNotRead, failed: STAFF_COPY.bazaarCatalogueFailed }
}: {
  failed: boolean;
  retry: (() => void) | null;
  /** The words for a screen other than the Bazaar. */
  copy?: { notRead: string; failed: string };
}) {
  return (
    <Banner
      tone="warn"
      title={failed ? copy.failed : copy.notRead}
      action={retry ? { label: 'Try again', onPress: retry } : undefined}
    />
  );
}
