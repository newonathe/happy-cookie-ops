'use client';

import type { OpsVals } from '@/view-models/vals';
import type { TillPanelView } from '@/lib/bazaar/live-bazaar-types';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Sheet } from '@/components/ui/sheet';
import { mutedStyle, textStyle } from '@/components/live/stock/stock-shared';
import { FeesSection } from './event-page';
import { StockForm } from './day-review';

type Till = NonNullable<OpsVals['liveTill']>;

/**
 * The bar above the ported till (U2, docs/design/bazaar-v2.md 5.6): Home, "Show sold out (n)" and Add cookies. The ported
 * screen under it is unchanged; everything the owner needs to leave it or add to it is here. A helper sees the sold-out
 * chip only: Home and Add cookies are the owner's, and are null in `liveTill` for anyone else.
 */
export function TillBar({
  till,
  panel
}: {
  till: Till | null | undefined;
  panel: TillPanelView | null | undefined;
}) {
  if (!till) return null;
  const hasControls = till.home || till.soldOutCount > 0 || till.addCookies || till.classic;
  return (
    <>
      {hasControls ? (
        <div role="toolbar" aria-label="Till tools" className="flex flex-wrap items-center gap-2">
          {till.home ? (
            <Button size="sm" variant="secondary" onClick={till.home}>
              ← Home
            </Button>
          ) : null}
          {till.soldOutCount > 0 ? (
            <Button
              size="sm"
              variant="secondary"
              aria-pressed={till.showSoldOut}
              onClick={till.toggleSoldOut}
            >
              {till.showSoldOut ? 'Hide sold out' : `Show sold out (${till.soldOutCount})`}
            </Button>
          ) : null}
          {till.addCookies ? (
            <Button size="sm" variant="secondary" onClick={till.addCookies} className="ml-auto">
              Add cookies
            </Button>
          ) : null}
          {till.classic ? (
            <Button size="sm" variant="ghost" onClick={() => till.setClassic(false)}>
              Use the new till
            </Button>
          ) : null}
        </div>
      ) : null}
      {till.allGone ? (
        <EmptyState
          title="Everything on the table is sold"
          body={
            till.addCookies
              ? 'Add more cookies to keep selling.'
              : 'Tell the owner to add more cookies.'
          }
          action={till.addCookies ? { label: 'Add cookies', onPress: till.addCookies } : undefined}
        />
      ) : null}
      {panel ? <TillPanel panel={panel} /> : null}
    </>
  );
}

/** The fee form or the add-cookies form, over the till. The day is read when it opens; closing leaves the till as it was. */
export function TillPanel({ panel }: { panel: TillPanelView }) {
  const fees = panel.kind === 'fees';
  return (
    <Sheet
      title={fees ? 'Event fees' : 'Add cookies'}
      onClose={panel.close}
      footer={
        <Button variant="secondary" onClick={panel.close}>
          Done
        </Button>
      }
    >
      {panel.status === 'loading' ? (
        <p aria-live="polite" style={mutedStyle}>
          Reading this day…
        </p>
      ) : panel.status === 'failed' ? (
        <div className="flex flex-col gap-2">
          <p role="alert" style={textStyle}>
            This day could not be read. Check the signal and try again.
          </p>
          <Button variant="secondary" onClick={panel.retry}>
            Try again
          </Button>
        </div>
      ) : fees && panel.event ? (
        <FeesSection event={panel.event} />
      ) : panel.stock ? (
        <StockForm
          flavours={panel.stock.flavours}
          canAddCarried={panel.stock.canAddCarried}
          addStock={panel.stock.addStock}
        />
      ) : null}
    </Sheet>
  );
}
