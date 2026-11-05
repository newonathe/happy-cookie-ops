'use client';

import type { OpsVals } from '@/view-models/vals';
import type { TillPanelView } from '@/lib/bazaar/live-bazaar-types';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageTitle } from '@/components/ui/owner-kit';

export function TillBack({ onBack }: { onBack: () => void }) {
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={onBack}
      aria-label="Back to events"
      title="Back to events"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Back
    </Button>
  );
}
import { Sheet } from '@/components/ui/sheet';
import { mutedStyle, textStyle } from '@/components/live/stock/stock-shared';
import { FeesSection } from './event-page';
import { StockForm } from './day-review';

type Till = NonNullable<OpsVals['liveTill']>;

/**
 * The bar above the ported till (U2, docs/design/bazaar-v2.md 5.6): Home and Add cookies. The ported screen under it is
 * unchanged; everything the owner needs to leave it or add to it is here. Home and Add cookies are the owner's, and are null
 * in `liveTill` for anyone else.
 */
export function TillBar({
  till,
  panel,
  events
}: {
  events?: (() => void) | null;
  till: Till | null | undefined;
  panel: TillPanelView | null | undefined;
}) {
  if (!till) return events ? <TillBack onBack={events} /> : null;
  const hasControls = events || till.home || till.addCookies || till.classic;
  return (
    <>
      {hasControls ? (
        <div role="toolbar" aria-label="Till tools" className="flex flex-wrap items-center gap-2">
          {events ? <TillBack onBack={events} /> : null}
          {!events && till.home ? (
            <Button size="sm" variant="secondary" onClick={till.home}>
              ← Home
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

function TillPanelBody({ panel }: { panel: TillPanelView }) {
  if (panel.status === 'loading')
    return (
      <p aria-live="polite" style={mutedStyle}>
        Reading this day…
      </p>
    );
  if (panel.status === 'failed')
    return (
      <div className="flex flex-col gap-2">
        <p role="alert" style={textStyle}>
          This day could not be read. Check the signal and try again.
        </p>
        <Button variant="secondary" onClick={panel.retry}>
          Try again
        </Button>
      </div>
    );
  if (panel.kind === 'fees' && panel.event) return <FeesSection event={panel.event} />;
  if (panel.stock)
    return (
      <StockForm
        flavours={panel.stock.flavours}
        canAddCarried={panel.stock.canAddCarried}
        addStock={panel.stock.addStock}
      />
    );
  return null;
}

/** The fee form or the add-cookies form, over the classic till. The day is read when it opens; closing leaves the till as it was. */
export function TillPanel({ panel }: { panel: TillPanelView }) {
  return (
    <Sheet
      title={panel.kind === 'fees' ? 'Event fees' : 'Add cookies'}
      onClose={panel.close}
      footer={
        <Button variant="secondary" onClick={panel.close}>
          Done
        </Button>
      }
    >
      <TillPanelBody panel={panel} />
    </Sheet>
  );
}

/** The same forms as a page of the new till. */
export function TillPanelPage({ panel }: { panel: TillPanelView }) {
  const fees = panel.kind === 'fees';
  return (
    <section aria-label={fees ? 'Event fees' : 'Add cookies'} className="flex flex-col gap-3">
      <PageTitle
        title={fees ? 'Event fees' : 'Add cookies'}
        subtitle={
          fees ? 'Stall rent, ice, parking.' : 'Move baked cookies from shop stock to this table.'
        }
      />
      <TillPanelBody panel={panel} />
      <div>
        <Button variant="secondary" onClick={panel.close}>
          Back to selling
        </Button>
      </div>
    </section>
  );
}
