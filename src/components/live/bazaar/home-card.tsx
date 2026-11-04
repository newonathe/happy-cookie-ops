'use client';

import type { LiveHomeNext, LiveHomeTill } from '@/view-models/vals';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { PANEL_CLASS } from '@/components/ui/owner-kit';
import { ListRow } from '@/components/ui/owner-patterns';
import { ProgressBar } from '@/components/ui/progress-bar';
import { StatusPill } from '@/components/ui/status-pill';
import { cookiesText } from '@/lib/bazaar/plan';

const salesText = (n: number) => (n === 1 ? '1 sale' : `${n} sales`);

/**
 * Home's Bazaar card while this phone is selling a day (U2, docs/design/bazaar-v2.md 5.1), across the page under the
 * greeting: what is selling, how it is going, the way back. The takings are left out for a person who may not see them
 * (`revenueText` null).
 */
export function SellingCard({ till }: { till: LiveHomeTill }) {
  return (
    <section
      aria-label="Bazaar"
      className={`${PANEL_CLASS} grid grid-cols-1 items-center gap-x-6 gap-y-3 border-l-[3px] border-l-accent p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]`}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <StatusPill status="selling" />
          <span className="min-w-0 truncate text-[15px] font-semibold text-ink">{till.name}</span>
        </div>
        {till.revenueText ? (
          <span className="text-caption text-ink-soft">
            <span className="text-[20px] font-semibold text-ink tabular-nums">
              {till.revenueText}
            </span>{' '}
            from {salesText(till.sales)}
          </span>
        ) : (
          <span className="text-caption text-ink-soft">{salesText(till.sales)} so far</span>
        )}
      </div>
      <ProgressBar
        value={till.sold}
        max={till.onTable}
        label={`${till.sold} of ${cookiesText(till.onTable)} sold`}
      />
      <Button variant="primary" onClick={till.back}>
        Back to the till →
      </Button>
    </section>
  );
}

/** Home's Bazaar card when no day is selling here: the event under way, or the next one (owner only). */
export function NextEventCard({ next }: { next: LiveHomeNext }) {
  return (
    <section aria-label="Bazaar" className={PANEL_CLASS}>
      <ListRow
        title={
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            {next.name}
            <StatusPill
              status={next.whenText === 'Today' ? 'today' : 'planned'}
              label={next.whenText}
            />
          </span>
        }
        detail={<>Bazaar · {next.datesText}</>}
        onOpen={next.open}
      />
    </section>
  );
}

/** On every other screen while a day is selling: the way back to the till. */
export function TillBanner({ till }: { till: LiveHomeTill }) {
  return (
    <Banner
      tone="till"
      title={`${till.name} is selling`}
      action={{ label: 'Back to the till', onPress: till.back }}
    />
  );
}
