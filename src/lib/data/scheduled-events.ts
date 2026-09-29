import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/types/database';
import { classifySaveError, type SaveOutcome } from '@/lib/data/payments';

/**
 * The owner's upcoming bazaars (D4; `get_scheduled_events` / `save_scheduled_event` /
 * `link_scheduled_event`, migration 20260101004100). Cine enters her real bookings (name, dates, place,
 * rent); the Bazaar screen lists the ones still to come, and starting one links it to the event it becomes.
 * Money is centavos here, as the database holds it. The database enforces every bound;
 * `scheduledEventError` mirrors them so a sure refusal is never sent.
 */
export type ScheduledClient = Pick<SupabaseClient<Database>, 'rpc'>;

export interface ScheduledEvent {
  id: string;
  name: string;
  /** YYYY-MM-DD */
  startsOn: string;
  endsOn: string;
  place: string;
  rentCents: number;
  active: boolean;
  /** Already started as an event: no longer offered. */
  started: boolean;
  updatedAt: string;
}

export interface ScheduledEventFields {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  place: string;
  rentCents: number;
  active: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const YMD = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const whole = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** A real calendar date in YYYY-MM-DD, as days since the epoch (NaN when it is not one). */
function dayNumber(ymd: string): number {
  if (!YMD.test(ymd)) return Number.NaN;
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  return back.getUTCFullYear() === y && back.getUTCMonth() === m - 1 && back.getUTCDate() === d
    ? t / 86_400_000
    : Number.NaN;
}

/** Strict: anything unexpected is no list at all, so the Bazaar screen never shows a half-read booking. */
export function parseScheduledEvents(json: Json | null | undefined): ScheduledEvent[] | null {
  if (!Array.isArray(json)) return null;
  const out: ScheduledEvent[] = [];
  for (const r of json) {
    if (
      !isObj(r) ||
      typeof r.id !== 'string' ||
      !UUID.test(r.id) ||
      typeof r.name !== 'string' ||
      typeof r.place !== 'string' ||
      typeof r.starts_on !== 'string' ||
      typeof r.ends_on !== 'string' ||
      Number.isNaN(dayNumber(r.starts_on)) ||
      Number.isNaN(dayNumber(r.ends_on)) ||
      !whole(r.rent_cents, 0, 100_000_000) ||
      typeof r.active !== 'boolean' ||
      typeof r.started !== 'boolean' ||
      typeof r.updated_at !== 'string'
    )
      return null;
    out.push({
      id: r.id,
      name: r.name,
      startsOn: r.starts_on,
      endsOn: r.ends_on,
      place: r.place,
      rentCents: r.rent_cents,
      active: r.active,
      started: r.started,
      updatedAt: r.updated_at
    });
  }
  return out;
}

/** The same bounds `save_scheduled_event` enforces. Null means the booking is acceptable. */
export function scheduledEventError(f: ScheduledEventFields): string | null {
  const name = f.name.trim();
  const place = f.place.trim();
  if (!UUID.test(f.id)) return 'This booking has no id yet. Reload and try again.';
  if (name.length < 1 || name.length > 80 || CONTROL.test(name + place))
    return 'A booking needs a name of 1 to 80 characters.';
  if (place.length > 80) return 'The place is at most 80 characters.';
  const start = dayNumber(f.startsOn);
  const end = dayNumber(f.endsOn);
  if (Number.isNaN(start) || Number.isNaN(end)) return 'Pick the start and end dates.';
  if (end < start) return 'A booking cannot end before it starts.';
  if (end - start > 14) return 'A booking lasts at most 15 days.';
  if (!whole(f.rentCents, 0, 100_000_000)) return 'Rent is from ₱0 to ₱1,000,000.';
  return null;
}

/** Active bookings that have not started and have not ended (today counts), soonest first. */
export function upcomingEvents(rows: readonly ScheduledEvent[], today: string): ScheduledEvent[] {
  return rows
    .filter((r) => r.active && !r.started && r.endsOn >= today)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.name.localeCompare(b.name));
}

/** `Sat, Oct 24` or `Sat, Oct 24 – Sun, Oct 25`. */
export function dateRange(startsOn: string, endsOn: string): string {
  const fmt = (ymd: string) => {
    const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
      timeZone: 'UTC',
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  };
  return startsOn === endsOn ? fmt(startsOn) : fmt(startsOn) + ' – ' + fmt(endsOn);
}

export async function fetchScheduledEvents(client: ScheduledClient): Promise<ScheduledEvent[]> {
  const { data, error } = await client.rpc('get_scheduled_events');
  if (error) throw new Error('scheduled events load failed: ' + (error.code || error.message));
  const rows = parseScheduledEvents(data);
  if (!rows) throw new Error('scheduled events answer was not understood');
  return rows;
}

/** Creates (no stamp) or changes (the stamp the read returned) one booking. */
export async function saveScheduledEvent(
  client: ScheduledClient,
  f: ScheduledEventFields,
  expectedUpdatedAt: string | null
): Promise<SaveOutcome> {
  try {
    const { error } = await client.rpc('save_scheduled_event', {
      p_event: {
        id: f.id,
        name: f.name.trim(),
        place: f.place.trim(),
        starts_on: f.startsOn,
        ends_on: f.endsOn,
        rent_cents: f.rentCents,
        active: f.active
      },
      p_expected_updated_at: expectedUpdatedAt as string
    });
    return classifySaveError(error);
  } catch {
    return 'offline';
  }
}

/**
 * Records that a booking became an event. `first` is true only the first time (the caller then books the stall
 * rent); a repeat is `again`. Anything else is `failed` and the caller says the rent was not booked.
 */
export async function linkScheduledEvent(
  client: ScheduledClient,
  scheduledId: string,
  eventId: string
): Promise<'first' | 'again' | 'failed'> {
  try {
    const { data, error } = await client.rpc('link_scheduled_event', {
      p_scheduled: scheduledId,
      p_event: eventId
    });
    if (error) return 'failed';
    const row = Array.isArray(data) ? data[0] : null;
    if (!isObj(row) || typeof row.first_link !== 'boolean') return 'failed';
    return row.first_link ? 'first' : 'again';
  } catch {
    return 'failed';
  }
}
