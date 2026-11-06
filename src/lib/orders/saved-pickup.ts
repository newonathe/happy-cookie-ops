import { STAFF_COPY } from '@/lib/orders/staff-copy';
import { pickupLabel } from '@/lib/orders/status-view';

/**
 * The pickup an order was placed with, worded for the owner's screens.
 *
 * Contract (migration 20260101003500): `orders.pickup_date` is a Postgres `date`, the calendar day
 * on the shop's business clock (`BUSINESS_TIME_ZONE`, the Philippines) that the customer chose.
 * `orders.pickup_window` is that clock's wall-clock time as `HH:MM`, or `campus`. Neither is an instant,
 * so neither is converted through any time zone: the label is built from the stored digits alone
 * (`pickupLabel`, the customer's own status-page wording), and the device's zone cannot move it to
 * another day or hour.
 *
 * The engine's `windowText` is the next default drop window, not this order's appointment, so it
 * must never stand in for a saved pickup. A date that is missing or not a real calendar day is
 * shown as unavailable, never guessed; a missing or malformed time keeps the date and says the time
 * was not saved.
 */
const YMD = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;
const HH_MM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** A real calendar date as written (`2026-02-30` is not one). */
export function isSavedPickupDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = YMD.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const day = new Date(Date.UTC(y, mo - 1, d));
  return day.getUTCFullYear() === y && day.getUTCMonth() === mo - 1 && day.getUTCDate() === d;
}

/** `HH:MM` (24-hour) or `campus`, the only values the column's check constraint allows. */
export function isSavedPickupWindow(value: unknown): value is string {
  return typeof value === 'string' && (value === 'campus' || HH_MM.test(value));
}

/**
 * `short` for the Orders list row, `long` for the order page. Both use the same date and time; the
 * long form only carries the fuller recovery sentence when something is missing.
 */
export function savedPickupText(
  date: unknown,
  window: unknown,
  form: 'short' | 'long' = 'short'
): string {
  if (!isSavedPickupDate(date))
    return form === 'long' ? STAFF_COPY.pickupMissingLong : STAFF_COPY.pickupMissing;
  // From here the text depends only on the validated date and time: both forms read the same, and
  // every missing or invalid time reads "time not saved". Validated values cannot contain '|'.
  const time = isSavedPickupWindow(window) ? window : '';
  const key = date + '|' + time;
  const cached = LABELS.get(key);
  if (cached !== undefined) return cached;
  const text = time
    ? pickupLabel(date, time)
    : pickupLabel(date, null) + ' · ' + STAFF_COPY.pickupNoTime;
  if (LABELS.size >= LABEL_LIMIT) LABELS.delete(LABELS.keys().next().value as string);
  LABELS.set(key, text);
  return text;
}

/**
 * Worded labels by `date|time`. Each `pickupLabel` call builds an Intl formatter (about 45 µs),
 * and the Orders list re-labels every row on every render, so a 500-order list spent about 20 ms
 * per render here. A list holds few distinct pairs. The cache is bounded: above the server's
 * 500-row order read, the oldest entry goes first. The text is independent of the device's time
 * zone (see above), so a cached label is never stale.
 */
const LABELS = new Map<string, string>();
const LABEL_LIMIT = 512;
