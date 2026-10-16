const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
] as const;

/**
 * A calendar day as the live screens write it: `Sat, 24 Oct`, with the year only when it is not `now`'s year
 * (`Sat, 12 Dec 2026` is shown for a day next year). Built from parts, not a locale, so the order and the comma never
 * change. The input is a date-only `YYYY-MM-DD` (a bazaar day), read as that calendar day in any timezone; anything
 * else comes back as given.
 */
export function dayText(ymd: string, now: Date = new Date()): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return ymd;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return ymd;
  const text = `${WEEKDAYS[date.getUTCDay()]}, ${day} ${MONTHS[month - 1]}`;
  return year === now.getFullYear() ? text : `${text} ${year}`;
}

/** `Sat, 24 Oct` for one day, `Sat, 24 Oct – Sun, 25 Oct` for a run of days (each end written by `dayText`). */
export function dayRange(startsOn: string, endsOn: string, now: Date = new Date()): string {
  return startsOn === endsOn
    ? dayText(startsOn, now)
    : `${dayText(startsOn, now)} – ${dayText(endsOn, now)}`;
}
