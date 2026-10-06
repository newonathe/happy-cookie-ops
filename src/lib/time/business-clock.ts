/**
 * The business clock (final-plan.md, C10): the one place that knows which time zone the shop
 * keeps. "Today", "this week" and "this month" are the shop's, never the device's: a phone set
 * to another zone must show the same day the database does. The database's side is
 * `public.business_clock()`; tests/fixtures/clock-cases.json holds both to the same answers.
 *
 * Nothing else in `src/` may name the zone or add a fixed offset
 * (tests/unit/business-clock.test.ts checks). The ported engine still reads the device clock;
 * what that leaves open is recorded in docs/state/system-audit.md, C10.
 */
export const BUSINESS_TIME_ZONE = 'Asia/Manila';

export type Instant = Date | number;

const PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

type Part = 'year' | 'month' | 'day' | 'hour' | 'minute';

function parts(now: Instant): Record<Part, string> {
  const out: Record<string, string> = {};
  for (const part of PARTS.formatToParts(now)) out[part.type] = part.value;
  return out as Record<Part, string>;
}

/** Today's date on the business clock, as YYYY-MM-DD. */
export function manilaToday(now: Instant = Date.now()): string {
  const p = parts(now);
  return `${p.year}-${p.month}-${p.day}`;
}

/** The hour of the day on the business clock, 0 to 23. */
export function manilaHour(now: Instant = Date.now()): number {
  return Number(parts(now).hour);
}

/** Minutes since midnight on the business clock. */
export function manilaMinutes(now: Instant = Date.now()): number {
  const p = parts(now);
  return Number(p.hour) * 60 + Number(p.minute);
}

/** An instant as `YYYY-MM-DD HH:MM` on the business clock (the books CSV). */
export function manilaStamp(at: Instant): string {
  const p = parts(at);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** The Monday of the week a date falls in, as YYYY-MM-DD (plain-date arithmetic). */
export function weekStart(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() || 7) - 1));
  return d.toISOString().slice(0, 10);
}

/** The first day of the month a date falls in, as YYYY-MM-DD. */
export function monthStart(ymd: string): string {
  return ymd.slice(0, 8) + '01';
}

/** The instant a date begins on the business clock, in milliseconds. */
export function manilaMidnight(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d);
  const p = parts(guess);
  const wall = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute)
  );
  return guess - (wall - guess);
}

/** An instant worded on the business clock, whatever zone the device is set to. */
export function formatManila(
  at: Instant,
  options: Intl.DateTimeFormatOptions,
  locale: string = 'en-US'
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: BUSINESS_TIME_ZONE }).format(at);
}
