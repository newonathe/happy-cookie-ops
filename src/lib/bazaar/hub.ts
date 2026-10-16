import type { Bazaar } from '@/lib/data/bazaar-days';
import type { ScheduledEvent } from '@/lib/data/scheduled-events';

/**
 * The events hub (U3, docs/design/bazaar-v2.md 5.2) as pure functions: which group a booking is in and what its pill
 * says. The bookings list holds only `active` and `started`, and `started` belongs to the old one-tap start: a booking
 * whose days were started and closed (the Ateneo test) still says `started: false`, with its dates perhaps still ahead.
 * So "selling" and "closed" are known only from a read of the event (`get_bazaar`), and every switched-on booking that
 * is not over is read when the hub opens. Nothing here guesses: a booking whose read has not come, or failed, is placed
 * by its dates alone and is never given "Selling", "Closed" or "Cost pending".
 */
export type HubGroup = 'active' | 'upcoming' | 'past';
export type HubStatus = 'today' | 'selling' | 'planned' | 'closed' | 'past' | 'costPending';

/** What one read of a started event says about it. */
export interface HubFacts {
  finalised: boolean;
  /** A day of it is open (selling) now, on any phone. */
  sellingNow: boolean;
  /** A day of it has been started (it is open or closed): the event is under way, between days or not. */
  dayStarted: boolean;
  /** The event's profit is not known: a flavour has no cost per cookie. */
  costPending: boolean;
  /** Today's day, if the event has one: its takings and cookies sold. Null otherwise. */
  today: { revenueCents: number; sold: number } | null;
}

/** `undefined`: not asked yet. `reading`: asked, no answer. `failed`: could not be read (or no signal). */
export type HubRead = HubFacts | 'reading' | 'failed' | undefined;

export interface HubPlace {
  group: HubGroup;
  status: HubStatus;
  /** True while its read is out: placed by its dates, and drawn without a status it may not have. */
  reading: boolean;
}

export function hubFactsOf(data: Bazaar, today: string): HubFacts {
  const day = data.days.find((d) => d.day === today);
  const booked = data.finalSummary ?? data;
  return {
    finalised: data.finalised,
    sellingNow: data.days.some((d) => d.state === 'open'),
    dayStarted: data.days.some((d) => d.state !== 'planned'),
    costPending: booked.profit.cents === null,
    today: day
      ? { revenueCents: day.revenueCents, sold: day.lines.reduce((n, l) => n + l.sold, 0) }
      : null
  };
}

/** Whether the hub must read this booking before it can place it: switched on and not yet over. */
export function hubNeedsRead(b: ScheduledEvent, today: string): boolean {
  return b.active && b.endsOn >= today;
}

/** The group and pill of one booking, or null for one that is switched off (it is not listed). */
export function hubPlace(b: ScheduledEvent, today: string, read: HubRead): HubPlace | null {
  if (!b.active) return null;
  const inDates = b.startsOn <= today && today <= b.endsOn;
  const live: HubStatus = inDates ? 'today' : 'planned';
  const byDates = (): Omit<HubPlace, 'reading'> =>
    inDates
      ? { group: 'active', status: 'today' }
      : b.endsOn < today
        ? { group: 'past', status: 'past' }
        : { group: 'upcoming', status: 'planned' };
  if (!hubNeedsRead(b, today)) return { ...byDates(), reading: false };
  if (read === undefined || read === 'reading') return { ...byDates(), reading: true };
  if (read === 'failed') return { ...byDates(), reading: false };
  if (read.finalised)
    return { group: 'past', status: read.costPending ? 'costPending' : 'closed', reading: false };
  if (read.sellingNow) return { group: 'active', status: 'selling', reading: false };
  // Days started and none open: under way, between days, wherever its dates fall.
  if (read.dayStarted) return { group: 'active', status: live, reading: false };
  return { ...byDates(), reading: false };
}

/** Active and upcoming run soonest first; past runs the most recent first. */
export function hubOrder(group: HubGroup, a: ScheduledEvent, b: ScheduledEvent): number {
  const by =
    group === 'past'
      ? b.endsOn.localeCompare(a.endsOn) || b.startsOn.localeCompare(a.startsOn)
      : a.startsOn.localeCompare(b.startsOn);
  return by || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}
