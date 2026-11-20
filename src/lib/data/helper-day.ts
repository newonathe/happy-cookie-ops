import type { BazaarClient, DayRead } from '@/lib/data/bazaar-days';

/**
 * S3: the one bazaar day that is open now, for a helper (`get_open_bazaar_day`, migration 20260101009500). A helper cannot list bookings
 * or start a day; this is how their phone finds the day Cine started. `day: null` means nothing is open right now.
 */
export interface OpenDay {
  dayId: string;
  bookingId: string;
  name: string;
  /** YYYY-MM-DD */
  day: string;
  eventId: string;
}

export type OpenDayOutcome =
  | { ok: true; day: OpenDay | null }
  /** `unavailable`: a database older than migration 95. `refused`: no access (expired, removed, or not a helper). */
  | { ok: false; reason: 'unavailable' | 'refused' | 'offline' | 'unreadable' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const YMD = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

export function parseOpenDay(data: unknown): OpenDay | null | undefined {
  if (data === null) return null;
  if (typeof data !== 'object' || Array.isArray(data)) return undefined;
  const d = data as Record<string, unknown>;
  if (
    typeof d.day_id !== 'string' ||
    !UUID.test(d.day_id) ||
    typeof d.booking_id !== 'string' ||
    !UUID.test(d.booking_id) ||
    typeof d.event_id !== 'string' ||
    !UUID.test(d.event_id) ||
    typeof d.name !== 'string' ||
    typeof d.day !== 'string' ||
    !YMD.test(d.day)
  )
    return undefined;
  return {
    dayId: d.day_id,
    bookingId: d.booking_id,
    name: d.name,
    day: d.day,
    eventId: d.event_id
  };
}

export async function fetchOpenBazaarDay(client: BazaarClient): Promise<OpenDayOutcome> {
  try {
    const { data, error } = await (
      client as unknown as {
        rpc: (name: string) => Promise<{ data: unknown; error: { code?: string } | null }>;
      }
    ).rpc('get_open_bazaar_day');
    if (error) {
      if (error.code === 'PGRST202' || error.code === '42883')
        return { ok: false, reason: 'unavailable' };
      return { ok: false, reason: error.code === '42501' ? 'refused' : 'offline' };
    }
    const day = parseOpenDay(data);
    return day === undefined ? { ok: false, reason: 'unreadable' } : { ok: true, day };
  } catch {
    return { ok: false, reason: 'offline' };
  }
}

/** What `engineStateForDay` takes, from a read of the open day: a helper has no `start_bazaar_day` answer to build it from. */
export function startedFromRead(read: DayRead): {
  eventId: string;
  sellingDevice: string;
  prices: Record<string, number>;
  loaded: Record<string, number>;
  floatCents: number;
} | null {
  if (!read.eventId || read.status !== 'open') return null;
  return {
    eventId: read.eventId,
    sellingDevice: '',
    prices: read.prices,
    loaded: read.loaded,
    floatCents: read.floatCents
  };
}
