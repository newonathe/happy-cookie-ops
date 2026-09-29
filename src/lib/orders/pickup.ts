/**
 * The pickup rules a customer's date and time pickers are built from (B2). The owner's rules
 * come from `get_shop_order_rules()` (anon may execute it) and are the same rules `place_order`
 * enforces, so a date offered here is a date the server accepts. Nothing is hard-coded: a failed
 * read shows no dates rather than Monday and Thursday.
 *
 * The business clock is Asia/Manila (no daylight saving), never the customer's device clock:
 * `place_order` counts lead days from the Manila date.
 */
export interface ShopOrderRules {
  /** ISO weekdays: Monday = 1 ... Sunday = 7. */
  pickupDays: number[];
  leadMinDays: number;
  leadMaxDays: number;
  pickupFromHour: number;
  /** Exclusive: a pickup time is before this hour. */
  pickupCutoffHour: number;
  campusFrom: string;
  campusTo: string;
  unpaidHoldHours: number;
}

export interface PickupDate {
  /** YYYY-MM-DD, what `place_order` takes. */
  value: string;
  label: string;
  /** Today: the server adds the same-day extra. */
  sameDay?: boolean;
}
export interface PickupTime {
  /** HH:MM, or `campus`. */
  value: string;
  label: string;
}

const HH_MM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

const isInt = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

/** Anything unexpected returns null: the checkout then offers no dates. */
export function parseShopOrderRules(json: unknown): ShopOrderRules | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const r = json as Record<string, unknown>;
  const days = r.pickup_days;
  if (
    !Array.isArray(days) ||
    days.length < 1 ||
    days.length > 7 ||
    !days.every((d) => isInt(d, 1, 7))
  )
    return null;
  if (
    !isInt(r.lead_min_days, 1, 30) ||
    !isInt(r.lead_max_days, 1, 60) ||
    !isInt(r.pickup_from_hour, 0, 23) ||
    !isInt(r.pickup_cutoff_hour, 1, 24) ||
    !isInt(r.unpaid_hold_hours, 1, 168)
  )
    return null;
  if (r.lead_min_days > r.lead_max_days || r.pickup_from_hour >= r.pickup_cutoff_hour) return null;
  if (
    typeof r.campus_from !== 'string' ||
    typeof r.campus_to !== 'string' ||
    !HH_MM.test(r.campus_from) ||
    !HH_MM.test(r.campus_to) ||
    r.campus_from >= r.campus_to
  )
    return null;
  return {
    pickupDays: [...new Set(days as number[])].sort((a, b) => a - b),
    leadMinDays: r.lead_min_days,
    leadMaxDays: r.lead_max_days,
    pickupFromHour: r.pickup_from_hour,
    pickupCutoffHour: r.pickup_cutoff_hour,
    campusFrom: r.campus_from,
    campusTo: r.campus_to,
    unpaidHoldHours: r.unpaid_hold_hours
  };
}

const MANILA_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

/** Today's date on the business clock, as YYYY-MM-DD. */
export function manilaToday(now: Date | number = Date.now()): string {
  return MANILA_DAY.format(now);
}

function addDays(ymd: string, days: number): Date {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days));
}

/**
 * The dates a customer can pick: pickup days within the lead window, both ends inclusive. With
 * `sameDayPercent` (the owner has switched same-day on) today is offered too when it is a pickup day,
 * labelled with its extra; `place_order` derives same-day from the date, so this only offers it.
 */
export function pickupDates(
  rules: ShopOrderRules,
  now: Date | number = Date.now(),
  sameDayPercent: number | null = null
): PickupDate[] {
  const today = manilaToday(now);
  const out: PickupDate[] = [];
  if (sameDayPercent !== null) {
    const day = addDays(today, 0);
    const isoWeekday = day.getUTCDay() === 0 ? 7 : day.getUTCDay();
    if (rules.pickupDays.includes(isoWeekday))
      out.push({
        value: today,
        sameDay: true,
        label:
          'Today, ' +
          day.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }) +
          ' · same-day +' +
          sameDayPercent +
          '%'
      });
  }
  for (let lead = rules.leadMinDays; lead <= rules.leadMaxDays; lead += 1) {
    const day = addDays(today, lead);
    const isoWeekday = day.getUTCDay() === 0 ? 7 : day.getUTCDay();
    if (!rules.pickupDays.includes(isoWeekday)) continue;
    out.push({
      value: day.toISOString().slice(0, 10),
      label: day.toLocaleDateString('en-US', {
        timeZone: 'UTC',
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      })
    });
  }
  return out;
}

/** `13:30` as `1:30 PM`. */
export function clockLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return (h % 12 || 12) + ':' + String(m).padStart(2, '0') + ' ' + (h < 12 ? 'AM' : 'PM');
}

/** Minutes since midnight on the business clock (Asia/Manila). */
export function manilaMinutes(now: Date | number = Date.now()): number {
  const t = new Date((typeof now === 'number' ? now : now.getTime()) + 8 * 3_600_000);
  return t.getUTCHours() * 60 + t.getUTCMinutes();
}

/**
 * Half-hour slots from the start hour up to (not including) the cutoff, then the campus slot. For a
 * same-day pickup pass the current minute (`afterMinute`): `place_order` refuses a slot whose start has
 * passed, so only later ones are offered.
 */
export function pickupTimes(
  rules: ShopOrderRules,
  afterMinute: number | null = null
): PickupTime[] {
  const out: PickupTime[] = [];
  for (let minute = rules.pickupFromHour * 60; minute < rules.pickupCutoffHour * 60; minute += 30) {
    if (afterMinute !== null && minute <= afterMinute) continue;
    const hhmm =
      String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0');
    out.push({ value: hhmm, label: clockLabel(hhmm) });
  }
  const campusStart =
    Number(rules.campusFrom.slice(0, 2)) * 60 + Number(rules.campusFrom.slice(3, 5));
  if (afterMinute === null || campusStart > afterMinute)
    out.push({
      value: 'campus',
      label: 'Campus · ' + clockLabel(rules.campusFrom) + ' – ' + clockLabel(rules.campusTo)
    });
  return out;
}

/** The latest wanted date a waitlist entry accepts is 90 days out; the earliest is today (Manila). */
export function waitlistRange(now: Date | number = Date.now()): { min: string; max: string } {
  const today = manilaToday(now);
  return { min: today, max: addDays(today, 90).toISOString().slice(0, 10) };
}
