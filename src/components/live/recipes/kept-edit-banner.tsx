'use client';

import type { KeptRecipeEditView } from '@/lib/recipes/live-recipes-types';
import { Banner } from '@/components/ui/banner';

/** HCB-038 (placeholder copy, OD-12): what is said about an unsaved edit that was kept across a reload. */
export const KEPT_EDIT_COPY = {
  offer: 'You have unsaved changes to this recipe from before the page reloaded.',
  restore: 'Restore changes',
  discard: 'Discard',
  newer: 'The recipe was saved elsewhere after your unsaved changes; they were not kept.'
} as const;

/** Offers a kept edit back (never applying it itself), or says once that a newer saved recipe replaced it. */
export function KeptEditBanner({ kept }: { kept: KeptRecipeEditView | null | undefined }) {
  if (!kept) return null;
  return kept.kind === 'offer' ? (
    <Banner
      tone="info"
      title={KEPT_EDIT_COPY.offer}
      action={{ label: KEPT_EDIT_COPY.restore, onPress: kept.restore }}
      secondaryAction={{ label: KEPT_EDIT_COPY.discard, onPress: kept.discard }}
    />
  ) : (
    <Banner tone="warn" title={KEPT_EDIT_COPY.newer} onDismiss={kept.dismiss} />
  );
}
