'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BazaarListRow, LiveBazaarVals } from '@/lib/bazaar/live-bazaar-types';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterChips } from '@/components/ui/filter-chips';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { cx } from '@/components/ui/cx';
import { usePrefersReducedMotion } from '@/components/ui/motion';
import { mutedStyle } from '@/components/live/stock/stock-shared';
import { PageTitle, Panel } from '@/components/ui/owner-kit';
import { EventForm } from './event-form';

type Chip = 'upcoming' | 'past';

/**
 * The events hub (U3, docs/design/bazaar-v2.md 5.2): Add an event at the top right, what is on now pinned as Active, and
 * Upcoming and Past behind the filter chips. Every row says where it stands with a pill; the colour is never the only signal.
 */
export function EventList({ bazaar }: { bazaar: LiveBazaarVals }) {
  const [localChip, setLocalChip] = useState<Chip>('upcoming');
  const root = useRef<HTMLDivElement>(null);
  const addButton = useRef<HTMLDivElement>(null);
  const restored = useRef(false);
  useLayoutEffect(() => {
    const position = bazaar.listPosition;
    if (restored.current || !position || !bazaar.eventsRead || !root.current) return;
    const target = [...root.current.querySelectorAll<HTMLElement>('[data-event-id]')].find(
      (element) => element.dataset.eventId === position.id
    );
    // Active rows may still be placeholders. Wait, but never interrupt a new action.
    if (!target && bazaar.list.some((item) => item.reading)) return;
    restored.current = true;
    const focus = target ?? root.current.querySelector<HTMLElement>('h1');
    if (focus) {
      if (!target) focus.tabIndex = -1;
      focus.focus({ preventScroll: true });
    }
    window.scrollTo({ top: target ? position.top : 0, behavior: 'instant' });
  });
  const openRow = (row: BazaarListRow) => {
    bazaar.rememberListPosition?.(row.id, window.scrollY);
    row.open();
  };
  const chip = bazaar.listFilter ?? localChip;
  const setChip = bazaar.setListFilter ?? setLocalChip;
  // The sheet stays mounted after it closes so its exit can play; a fresh key per opening gives it a fresh event id.
  const [sheet, setSheet] = useState<{ n: number; open: boolean } | null>(null);
  const sheetGeneration = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

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
  const openSheet = () => {
    if (mounted.current) setSheet({ n: ++sheetGeneration.current, open: true });
  };
  const closeSheet = (opening: number): boolean => {
    if (!mounted.current || sheetGeneration.current !== opening) return false;
    const closed = ++sheetGeneration.current;
    setSheet((s) => (s?.n === opening ? { ...s, open: false } : s));
    requestAnimationFrame(() => {
      if (mounted.current && sheetGeneration.current === closed)
        addButton.current?.querySelector('button')?.focus();
    });
    return true;
  };

  return (
    <div
      ref={root}
      className="contents"
      onPointerDownCapture={() => {
        restored.current = true;
      }}
      onKeyDownCapture={() => {
        restored.current = true;
      }}
    >
      <div hidden={!!sheet?.open} className="flex flex-col gap-3">
        <PageTitle
          title="Bazaar events"
          subtitle="Choose the event you want to work on."
          actions={
            <>
              <div ref={addButton} className="contents">
                <Button
                  variant="primary"
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
              {eventsRead && bazaar.list.length > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={bazaar.add}
                  disabled={!bazaar.online}
                  reason="Changing an event needs signal."
                >
                  Edit or switch off events
                </Button>
              ) : null}
            </>
          }
        />

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
                <Panel className="mb-0">
                  {active.map((row) => (
                    <ActiveCard
                      key={row.id}
                      row={row}
                      open={() => openRow(row)}
                      ringed={row.id === bazaar.justAdded}
                    />
                  ))}
                </Panel>
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
                <Panel className="mb-0">
                  <ul
                    aria-label={chip === 'upcoming' ? 'Upcoming events' : 'Past events'}
                    className="m-0 list-none p-0"
                  >
                    {shown.map((row) => (
                      <li key={row.id} className="min-w-0">
                        <EventRow
                          row={row}
                          open={() => openRow(row)}
                          ringed={row.id === bazaar.justAdded}
                        />
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}
            </section>
          </>
        )}
      </div>

      {sheet ? (
        <EventForm
          key={sheet.n}
          bazaar={bazaar}
          open={sheet.open}
          onClose={() => closeSheet(sheet.n)}
          onSaved={() => {
            if (closeSheet(sheet.n)) setChip('upcoming');
          }}
        />
      ) : null}
    </div>
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

/** Pinned active work uses the same compact directory pattern, retaining its known selling facts. */
function ActiveCard({
  row,
  ringed,
  open
}: {
  row: BazaarListRow;
  ringed: boolean;
  open: () => void;
}) {
  const ring = useRing(ringed);
  if (row.reading)
    return (
      <div aria-busy="true" className="py-3">
        <p className="m-0 mb-2 truncate text-body font-bold text-ink">{row.name}</p>
        <Skeleton lines={2} />
      </div>
    );
  return (
    <article
      aria-label={row.name}
      className={cx(
        'motion-enter flex flex-wrap items-center justify-between gap-3 border-b border-line py-3 last:border-b-0',
        ring
      )}
    >
      <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
        <h3 className="m-0 line-clamp-2 text-[15px] font-semibold break-words text-ink">
          {row.name}
        </h3>
        <span className="text-caption text-ink-mute">
          {row.datesText} · {row.placeText}
        </span>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Pill row={row} />
          {whenOf(row) ? (
            <span className="text-caption font-semibold text-ink-mute">{whenOf(row)}</span>
          ) : null}
        </div>
        {row.figures ? (
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-body font-semibold text-ink tabular-nums">
              {row.figures.revenueText}
            </span>
            <span className="text-caption text-ink-soft">today · {row.figures.soldText}</span>
          </div>
        ) : null}
        {row.note ? <p className="m-0 text-caption text-warn">{row.note}</p> : null}
      </div>
      <Button variant="secondary" data-event-id={row.id} onClick={open}>
        Open event<span className="sr-only"> {row.name}</span>
      </Button>
    </article>
  );
}

/** A compact row for the Upcoming and Past lists: the name on one line, the dates, the place, and the pill. */
function EventRow({
  row,
  ringed,
  open
}: {
  row: BazaarListRow;
  ringed: boolean;
  open: () => void;
}) {
  const ring = useRing(ringed);
  return (
    <button
      type="button"
      data-event-id={row.id}
      onClick={open}
      className={cx(
        'motion-enter motion-press flex min-h-14 w-full min-w-0 flex-wrap items-center justify-between gap-3 border-b border-line py-3 text-left text-ink hover:bg-raise',
        ring
      )}
    >
      <span className="flex min-w-0 flex-1 basis-44 flex-col gap-1">
        <span className="line-clamp-2 min-w-0 text-body font-bold break-words">{row.name}</span>
        <span className="text-caption text-ink-mute">
          {row.datesText} · {row.placeText}
          {whenOf(row) ? ' · ' + whenOf(row) : ''}
        </span>
        <span>
          <Pill row={row} />
        </span>
      </span>
      <span className="shrink-0 rounded-control border border-line px-4 py-3 text-caption font-semibold">
        Open event
      </span>
    </button>
  );
}
