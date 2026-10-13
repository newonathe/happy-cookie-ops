import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/types/database';
import { classifySaveError, type SaveOutcome } from '@/lib/data/payments';

/**
 * Bazaar days (S2; `get_bazaar` / `save_bazaar_day` / `start_bazaar_day`, migration 20260101006700). A booking is the
 * event; each day of it is planned (flavours, how many, prices, the drawer float) and then started as one event the
 * till sells on. Money stays in centavos here, as the database holds it: a caller converts to pesos through
 * `src/lib/money.ts`, in one place. The database enforces every bound; the parsers are strict, so a screen never shows
 * half of what the database holds.
 */
export type BazaarClient = Pick<SupabaseClient<Database>, 'rpc'>;

export type DayState = 'planned' | 'open' | 'closed';

export interface DayLine {
  productId: string;
  name: string;
  made: number;
  carried: number;
  priceCents: number;
}

export interface BazaarDay {
  id: string;
  /** YYYY-MM-DD */
  day: string;
  /** The event the day became when it started; null while it is only a plan. */
  eventId: string | null;
  floatCents: number;
  state: DayState;
  /** The day's hash from the summary, which closing a day is given back (S3). */
  hash: string;
  /** The stamp `save_bazaar_day` is given to change the plan. */
  updatedAt: string;
  lines: DayLine[];
}

export interface Bazaar {
  booking: {
    id: string;
    name: string;
    place: string;
    startsOn: string;
    endsOn: string;
    rentCents: number;
    active: boolean;
  };
  days: BazaarDay[];
  targetCents: number | null;
  finalised: boolean;
  /** Fees including the stall rent. */
  feesCents: number;
  /** `cents` is null, with its why, while a flavour that has cookies has no cost per cookie: never 0. */
  profit: { cents: number | null; why: string | null };
  /** The whole summary's hash. */
  hash: string;
}

export interface BazaarPlan {
  id: string;
  scheduledId: string;
  day: string;
  floatCents: number;
  lines: { productId: string; made: number; carried: number; priceCents: number }[];
}

export interface StartedDay {
  eventId: string;
  sellingDevice: string;
  /** Centavos, by flavour: this day's prices. */
  prices: Record<string, number>;
  /** What was put on the table, by flavour. */
  loaded: Record<string, number>;
  floatCents: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const YMD = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const HASH = /^[0-9a-f]{64}$/;
const DEVICE = /^[A-Za-z0-9_-]{1,64}$/;
const PRODUCT = /^[a-z0-9][a-z0-9-]{0,31}$/;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const whole = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;

function realDate(ymd: string): boolean {
  if (!YMD.test(ymd)) return false;
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const back = new Date(Date.UTC(y, m - 1, d));
  return back.getUTCFullYear() === y && back.getUTCMonth() === m - 1 && back.getUTCDate() === d;
}

/** Strict: anything unexpected is no answer at all. */
export function parseBazaar(json: Json | null | undefined): Bazaar | null {
  if (!isObj(json) || !isObj(json.summary)) return null;
  const sum = json.summary;
  const b = sum.booking;
  if (
    !isObj(b) ||
    typeof b.id !== 'string' ||
    !UUID.test(b.id) ||
    !str(b.name, 80) ||
    !str(b.place, 80) ||
    typeof b.starts_on !== 'string' ||
    !realDate(b.starts_on) ||
    typeof b.ends_on !== 'string' ||
    !realDate(b.ends_on) ||
    !whole(b.rent_cents, 0, 100_000_000) ||
    typeof b.active !== 'boolean'
  )
    return null;
  if (typeof sum.hash !== 'string' || !HASH.test(sum.hash)) return null;
  if (!Array.isArray(sum.days) || !Array.isArray(json.stamps)) return null;
  if (!isObj(sum.fees) || !whole(sum.fees.total_cents, 0, 1_000_000_000_000)) return null;
  const profit = sum.profit;
  if (
    !isObj(profit) ||
    !(
      profit.cents === null ||
      (typeof profit.cents === 'number' && Number.isInteger(profit.cents))
    ) ||
    !(profit.why === null || typeof profit.why === 'string')
  )
    return null;
  const target = json.target_profit_cents;
  if (target !== null && !whole(target, 0, 10_000_000_000)) return null;
  if (json.finalised_at !== null && typeof json.finalised_at !== 'string') return null;

  const stamps = new Map<string, string>();
  for (const s of json.stamps) {
    if (!isObj(s) || typeof s.id !== 'string' || typeof s.updated_at !== 'string') return null;
    stamps.set(s.id, s.updated_at);
  }
  const days: BazaarDay[] = [];
  for (const d of sum.days) {
    if (
      !isObj(d) ||
      typeof d.id !== 'string' ||
      !UUID.test(d.id) ||
      typeof d.day !== 'string' ||
      !realDate(d.day) ||
      !(d.event_id === null || (typeof d.event_id === 'string' && UUID.test(d.event_id))) ||
      !whole(d.float_cents, 0, 100_000_000) ||
      (d.state !== 'planned' && d.state !== 'open' && d.state !== 'closed') ||
      typeof d.hash !== 'string' ||
      !HASH.test(d.hash) ||
      !Array.isArray(d.lines)
    )
      return null;
    const updatedAt = stamps.get(d.id);
    if (updatedAt === undefined) return null;
    const lines: DayLine[] = [];
    for (const l of d.lines) {
      if (
        !isObj(l) ||
        typeof l.product_id !== 'string' ||
        !PRODUCT.test(l.product_id) ||
        !str(l.name, 120) ||
        !whole(l.made, 0, 9999) ||
        !whole(l.carried, 0, 9999) ||
        !whole(l.price_cents, 0, 100_000_000)
      )
        return null;
      lines.push({
        productId: l.product_id,
        name: l.name,
        made: l.made,
        carried: l.carried,
        priceCents: l.price_cents
      });
    }
    days.push({
      id: d.id,
      day: d.day,
      eventId: d.event_id as string | null,
      floatCents: d.float_cents,
      state: d.state,
      hash: d.hash,
      updatedAt,
      lines
    });
  }
  return {
    booking: {
      id: b.id,
      name: b.name,
      place: b.place,
      startsOn: b.starts_on,
      endsOn: b.ends_on,
      rentCents: b.rent_cents,
      active: b.active
    },
    days,
    targetCents: target as number | null,
    finalised: json.finalised_at !== null,
    feesCents: sum.fees.total_cents,
    profit: { cents: profit.cents as number | null, why: profit.why as string | null },
    hash: sum.hash
  };
}

/** What `start_bazaar_day` returns: one row, the event with this day's prices and stock. */
export function parseStartedDay(data: Json | null | undefined): StartedDay | null {
  const row = Array.isArray(data) ? data[0] : null;
  if (
    !isObj(row) ||
    typeof row.event_id !== 'string' ||
    !UUID.test(row.event_id) ||
    typeof row.selling_device !== 'string' ||
    !DEVICE.test(row.selling_device) ||
    !whole(row.float_cents, 0, 100_000_000) ||
    !isObj(row.prices) ||
    !isObj(row.loaded)
  )
    return null;
  const prices: Record<string, number> = {};
  for (const [id, cents] of Object.entries(row.prices)) {
    // The database sends a number, or a numeric as text: whole centavos either way.
    const n = typeof cents === 'string' && /^[0-9]{1,9}$/.test(cents) ? Number(cents) : cents;
    if (!PRODUCT.test(id) || !whole(n, 0, 100_000_000)) return null;
    prices[id] = n;
  }
  const loaded: Record<string, number> = {};
  for (const [id, qty] of Object.entries(row.loaded)) {
    if (!PRODUCT.test(id) || !whole(qty, 0, 19_998)) return null;
    loaded[id] = qty;
  }
  return {
    eventId: row.event_id,
    sellingDevice: row.selling_device,
    prices,
    loaded,
    floatCents: row.float_cents
  };
}

/**
 * The event id a day always starts as: the same lowercase uuid for the same day on any phone and from any storage state,
 * so a retry after a lost reply, a cleared tab or a second phone is answered with the one event, never a second.
 */
export async function dayEventId(dayId: string): Promise<string> {
  const bytes = new TextEncoder().encode('bazaar-day:' + dayId);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const hex = Array.from(digest.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32)
  ].join('-');
}

export async function fetchBazaar(client: BazaarClient, bookingId: string): Promise<Bazaar> {
  const { data, error } = await client.rpc('get_bazaar', { p_booking: bookingId });
  if (error) throw new Error('bazaar load failed: ' + (error.code || error.message));
  const parsed = parseBazaar(data);
  if (!parsed) throw new Error('bazaar answer was not understood');
  return parsed;
}

/** Creates (no stamp) or changes (the stamp the read returned) one day's plan. */
export async function saveBazaarDay(
  client: BazaarClient,
  plan: BazaarPlan,
  expectedUpdatedAt: string | null
): Promise<{ result: SaveOutcome; updatedAt: string | null }> {
  try {
    const { data, error } = await client.rpc('save_bazaar_day', {
      p_day: {
        id: plan.id,
        scheduled_id: plan.scheduledId,
        day: plan.day,
        float_cents: plan.floatCents,
        lines: plan.lines.map((l) => ({
          product_id: l.productId,
          made_qty: l.made,
          carried_qty: l.carried,
          price_cents: l.priceCents
        }))
      },
      p_expected_updated_at: expectedUpdatedAt as string
    });
    const result = classifySaveError(error);
    const row = Array.isArray(data) ? data[0] : null;
    const updatedAt =
      result === 'saved' && isObj(row) && typeof row.updated_at === 'string'
        ? row.updated_at
        : null;
    return { result: result === 'saved' && !updatedAt ? 'offline' : result, updatedAt };
  } catch {
    return { result: 'offline', updatedAt: null };
  }
}

export type StartOutcome =
  | { ok: true; started: StartedDay }
  | { ok: false; error: 'refused' | 'offline' | 'not acknowledged' };

/** Online only: the server opens the day as one event with the day's own prices and names this phone the selling device. */
export async function startBazaarDay(
  client: BazaarClient,
  dayId: string,
  deviceId: string,
  eventId: string
): Promise<StartOutcome> {
  try {
    const { data, error } = await client.rpc('start_bazaar_day', {
      p_day: dayId,
      p_device: deviceId,
      p_event_id: eventId
    });
    if (error)
      return { ok: false, error: classifySaveError(error) === 'offline' ? 'offline' : 'refused' };
    const started = parseStartedDay(data);
    // Acknowledged only when the reply names the event that was asked for.
    if (!started || started.eventId !== eventId) return { ok: false, error: 'not acknowledged' };
    return { ok: true, started };
  } catch {
    return { ok: false, error: 'offline' };
  }
}
