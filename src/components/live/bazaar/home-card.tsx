'use client';

import type { LiveHomeNext, LiveHomeTill } from '@/view-models/vals';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { StatusPill } from '@/components/ui/status-pill';
import { cookiesText } from '@/lib/bazaar/plan';

const salesText = (n: number) => (n === 1 ? '1 sale' : `${n} sales`);

/**
 * Home's Bazaar card while this phone is selling a day (U2, docs/design/bazaar-v2.md 5.1). It sits above the greeting, in
 * the live screen slot. The takings are left out for a person who may not see them (`revenueText` null).
 */
export function SellingCard({ till }: { till: LiveHomeTill }) {
  return (
    <Card variant="accent" as="section" aria-label="Bazaar" className="flex flex-col gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="text-caption font-semibold text-ink-mute">Bazaar</span>
        <StatusPill status="selling" />
        <span className="min-w-0 truncate text-body font-bold text-ink">{till.name}</span>
      </div>
      {till.revenueText ? (
        <div className="flex flex-col gap-1">
          <span className="text-display text-ink tabular-nums">{till.revenueText}</span>
          <span className="text-caption text-ink-soft">from {salesText(till.sales)}</span>
        </div>
      ) : (
        <span className="text-body text-ink-soft">{salesText(till.sales)} so far</span>
      )}
      <ProgressBar
        value={till.sold}
        max={till.onTable}
        label={`${till.sold} of ${cookiesText(till.onTable)} sold`}
      />
      <Button variant="primary" onClick={till.back}>
        Back to the till →
      </Button>
    </Card>
  );
}

/** Home's Bazaar card when no day is selling here: the event under way, or the next one (owner only). */
export function NextEventCard({ next }: { next: LiveHomeNext }) {
  return (
    <Card as="section" aria-label="Bazaar" className="flex flex-wrap items-center gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-caption font-semibold text-ink-mute">Bazaar</span>
          <StatusPill
            status={next.whenText === 'Today' ? 'today' : 'planned'}
            label={next.whenText}
          />
        </div>
        <span className="truncate text-body font-bold text-ink">{next.name}</span>
        <span className="text-caption text-ink-soft">{next.datesText}</span>
      </div>
      <Button variant="secondary" onClick={next.open}>
        Open
      </Button>
    </Card>
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
