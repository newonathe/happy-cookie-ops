import { dayText } from '@/lib/date/day-text';
import { formatManila, manilaToday } from '@/lib/time/business-clock';

/**
 * HCB-018: the one way the live owner pages write a date. Three kinds, on the shop's clock (never the device's):
 *   dayLabel      `Thu, 19 Nov`            (the year only when it is not this year: `Tue, 5 Jan 2027`)
 *   dayTimeLabel  `Thu, 19 Nov · 10:15 AM`
 *   timeLabel     `10:15 AM`
 * Input is an instant (ms, Date or ISO string) or a date-only `YYYY-MM-DD` (a bazaar day, read as that calendar day).
 * Malformed input gives '' so a caller can fall back; it never prints "Invalid Date".
 */
export type DateInput = number | Date | string | null | undefined;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function instantOf(input: DateInput): number | null {
  if (input === null || input === undefined || input === '') return null;
  // A date-only string has no time of day, so it is not an instant here.
  if (typeof input === 'string' && YMD.test(input)) return null;
  const ms = input instanceof Date ? input.getTime() : new Date(input).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** `Thu, 19 Nov` for an instant or a `YYYY-MM-DD`. */
export function dayLabel(input: DateInput, now: Date = new Date()): string {
  if (typeof input === 'string' && YMD.test(input)) {
    const text = dayText(input, now);
    return text === input ? '' : text;
  }
  const ms = instantOf(input);
  if (ms === null) return '';
  return dayText(manilaToday(ms), now);
}

/** `10:15 AM`, with a plain space (Intl may use a narrow no-break space). */
export function timeLabel(input: DateInput): string {
  const ms = instantOf(input);
  if (ms === null) return '';
  return formatManila(ms, { hour: 'numeric', minute: '2-digit', hour12: true }).replace(
    /[  ]/g,
    ' '
  );
}

/** `Thu, 19 Nov · 10:15 AM`. */
export function dayTimeLabel(input: DateInput, now: Date = new Date()): string {
  const day = dayLabel(input, now);
  const time = timeLabel(input);
  return day && time ? `${day} · ${time}` : '';
}
