'use client';

import { useEffect, useRef, useState } from 'react';
import type { BazaarListRow, LiveBazaarVals } from '@/lib/bazaar/live-bazaar-types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterChips } from '@/components/ui/filter-chips';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { cx } from '@/components/ui/cx';
import { usePrefersReducedMotion } from '@/components/ui/motion';
import { mutedStyle } from '@/components/live/stock/stock-shared';
import { EventForm } from './event-form';

type Chip = 'upcoming' | 'past';

/**
 * The events hub (U3, docs/design/bazaar-v2.md 5.2): Add an event at the top right, what is on now pinned as Active, and
 * Upcoming and Past behind the filter chips. Every row says where it stands with a pill; the colour is never the only signal.
 */
export function EventList({ bazaar }: { bazaar: LiveBazaarVals }) {
  const [chip, setChip] = useState<Chip>('upcoming');
  // The sheet stays mounted after it closes so its exit can play; a fresh key per opening gives it a fresh event id.
  const [sheet, setSheet] = useState<{ n: number; open: boolean } | null>(null);

  // `bazaar` is rebuilt on every render, so the read is called through a ref, once the bookings are in.
  const latest = useRef(bazaar.readHub);
  useEffect(() => {
    latest.current = bazaar.readHub;
  });
  const { eventsRead } = bazaar;
  useEffect(() => {
    if (eventsRead) latest.current();
  }, [eventsRead]);

  const active = bazaar.list.filter((r) => r.group === 'active');
  const upcoming = bazaar.list.filter((r) => r.group === 'upcoming');
  const past = bazaar.list.filter((r) => r.group === 'past');
  const shown = chip === 'upcoming' ? upcoming : past;
  const openSheet = () => setSheet((s) => ({ n: (s?.n ?? 0) + 1, open: true }));
  const closeSheet = () => setSheet((s) => (s ? { ...s, open: false } : s));

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <h1 className="m-0 text-title text-ink">Bazaar</h1>
        <Button
          variant="dark"
          onClick={openSheet}
          disabled={!bazaar.online || !eventsRead}
          reason={
            bazaar.online
              ? 'You can add one once your events are read.'
              : 'Adding an event needs signal.'
          }
        >
          Add an event
        </Button>
      </div>

      {!eventsRead ? (
        bazaar.online ? (
          <div aria-live="polite">
            <p style={mutedStyle}>Reading your events…</p>
            <Skeleton lines={3} />
          </div>
        ) : (
          <p aria-live="polite" style={mutedStyle}>
            Your events are not loaded yet. They need signal to load.
          </p>
        )
      ) : bazaar.list.length === 0 ? (
        <EmptyState title="No events yet" body="Add one to plan its days." />
      ) : (
        <>
          {active.length > 0 ? (
            <section aria-label="Active" className="flex flex-col gap-3">
              <SectionHeader title="Active" count={active.length} />
              {active.map((row) => (
                <ActiveCard key={row.id} row={row} ringed={row.id === bazaar.justAdded} />
              ))}
            </section>
          ) : null}

          <section aria-label="All events" className="flex flex-col gap-3">
            <FilterChips
              label="Events"
              value={chip}
              onChange={(id) => setChip(id as Chip)}
              options={[
                { id: 'upcoming', label: 'Upcoming', count: upcoming.length },
                { id: 'past', label: 'Past', count: past.length }
              ]}
            />
            {shown.length === 0 ? (
              <EmptyState
                title={chip === 'upcoming' ? 'No upcoming events' : 'No past events yet'}
                body={
                  chip === 'upcoming'
                    ? 'Add the next one to plan its days.'
                    : 'Events that are over, and ones you have closed, appear here.'
                }
              />
            ) : (
              <ul
                aria-label={chip === 'upcoming' ? 'Upcoming events' : 'Past events'}
                className="m-0 grid list-none grid-cols-1 gap-2 p-0 md:grid-cols-2"
              >
                {shown.map((row) => (
                  <li key={row.id} className="min-w-0">
                    <EventRow row={row} ringed={row.id === bazaar.justAdded} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <p style={mutedStyle}>
        {bazaar.online
          ? 'Starting a day needs signal. Selling does not.'
          : 'Starting a day needs signal: it is read from the server.'}
      </p>
      {eventsRead && bazaar.list.length > 0 ? (
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={bazaar.add}
            disabled={!bazaar.online}
            reason="Changing an event needs signal."
          >
            Edit or switch off events
          </Button>
        </div>
      ) : null}

      {sheet ? (
        <EventForm
          key={sheet.n}
          bazaar={bazaar}
          open={sheet.open}
          onClose={closeSheet}
          onSaved={() => {
            closeSheet();
            setChip('upcoming');
          }}
        />
      ) : null}
    </>
  );
}

/**
 * The welcome of a row that was just added (D0 motion table): a warm ring that fades over 600 ms. Under reduced motion the
 * ring does not fade (the global rule would cut it to nothing): it is shown still for 1 s, then dropped.
 */
function useRing(ringed: boolean): string | false {
  const reduced = usePrefersReducedMotion();
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!ringed || !reduced) return;
    const timer = window.setTimeout(() => setDone(true), 1000);
    return () => window.clearTimeout(timer);
  }, [ringed, reduced]);
  if (!ringed) return false;
  return reduced ? !done && 'ring-[3px] ring-warm-accent' : 'motion-ring';
}

/** The pill, or while the event's read is out a placeholder: nothing is claimed that may be wrong. */
function Pill({ row }: { row: BazaarListRow }) {
  if (row.reading)
    return (
      <span role="status" className="inline-flex">
        <span className="sr-only">Checking</span>
        <span aria-hidden="true" className="motion-shimmer h-6 w-16 rounded-full" />
      </span>
    );
  return <StatusPill status={row.status} />;
}

/** "In 9 days" says more than the pill; "Today" under a Today pill says nothing new. */
const whenOf = (row: BazaarListRow): string | null =>
  row.status === 'today' ? null : row.whenText;

/** An event that is on now, or whose days are under way: the large accent card (spec 5.2). */
function ActiveCard({ row, ringed }: { row: BazaarListRow; ringed: boolean }) {
  const ring = useRing(ringed);
  if (row.reading)
    return (
      <Card variant="accent" aria-busy="true">
        <p className="m-0 mb-2 truncate text-body font-bold text-ink">{row.name}</p>
        <Skeleton lines={2} />
      </Card>
    );
  return (
    <Card
      variant="accent"
      as="article"
      aria-label={row.name}
      className={cx('motion-enter flex flex-col gap-3', ring)}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Pill row={row} />
        {whenOf(row) ? (
          <span className="text-caption font-semibold text-ink-mute">{whenOf(row)}</span>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="m-0 truncate text-title text-ink">{row.name}</h3>
        <span className="text-body text-ink-soft">{row.datesText}</span>
        <span className="truncate text-caption text-ink-mute">{row.placeText}</span>
      </div>
      {row.figures ? (
        <div className="flex flex-col gap-1">
          <span className="text-display text-ink tabular-nums">{row.figures.revenueText}</span>
          <span className="text-caption text-ink-soft">today · {row.figures.soldText}</span>
        </div>
      ) : null}
      {row.note ? <p className="m-0 text-caption text-warn">{row.note}</p> : null}
      <Button variant="primary" onClick={row.open}>
        Open the event →<span className="sr-only"> {row.name}</span>
      </Button>
    </Card>
  );
}

/** A compact row for the Upcoming and Past lists: the name on one line, the dates, the place, and the pill. */
function EventRow({ row, ringed }: { row: BazaarListRow; ringed: boolean }) {
  const ring = useRing(ringed);
  return (
    <button
      type="button"
      onClick={row.open}
      className={cx(
        'motion-enter motion-press flex min-h-11 w-full min-w-0 flex-col gap-1 rounded-card border border-line bg-surface p-3 text-left text-ink hover:bg-inset',
        ring
      )}
    >
      <span className="flex min-w-0 items-center justify-between gap-2">
        <span className="min-w-0 truncate text-body font-bold">{row.name}</span>
        <Pill row={row} />
      </span>
      <span className="text-caption text-ink-soft">{row.datesText}</span>
      <span className="truncate text-caption text-ink-mute">
        {row.placeText}
        {whenOf(row) ? ' · ' + whenOf(row) : ''}
      </span>
    </button>
  );
}
