import { scheduledEventError, type ScheduledEventFields } from '@/lib/data/scheduled-events';
import { dayRange } from '@/lib/date/day-text';

/**
 * The add-event sheet (U3) as a pure function: what she typed becomes the booking the database is sent, or the words for
 * each field that is wrong (spec rule 7: say what is wrong and how to fix it). The bounds are `scheduledEventError`'s,
 * which mirrors the database: it runs last as the guard, so a field message here can never accept what it refuses.
 */
export type EventFormField = 'name' | 'place' | 'startsOn' | 'endsOn' | 'rent';

export interface EventFormInput {
  id: string;
  name: string;
  place: string;
  startsOn: string;
  endsOn: string;
  /** Pesos as typed: "2500", "2,500.00", or blank for none. */
  rent: string;
}

export interface EventFormError {
  field: EventFormField;
  message: string;
}

export type EventFormResult =
  { ok: true; fields: ScheduledEventFields } | { ok: false; errors: EventFormError[] };

const RENT = /^[0-9]{1,7}(\.[0-9]{1,2})?$/;
const MAX_RENT_CENTS = 100_000_000;
const YMD = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

const real = (ymd: string): boolean => {
  if (!YMD.test(ymd)) return false;
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};
const days = (ymd: string): number => {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

/** Rent as whole centavos from what was typed ("2,500.50"), or null when it is not an amount. Blank is 0. */
export function rentCentsOf(text: string): number | null {
  const t = text.trim().replace(/^₱\s*/, '').replace(/,/g, '');
  if (t === '') return 0;
  if (!RENT.test(t)) return null;
  const [whole, frac = ''] = t.split('.') as [string, string?];
  return Number(whole) * 100 + Number((frac + '00').slice(0, 2));
}

/** One field's problem, for validating on blur. The end is judged against the start. */
export function eventFieldError(
  field: EventFormField,
  input: Pick<EventFormInput, 'name' | 'place' | 'startsOn' | 'endsOn' | 'rent'>,
  now: Date = new Date()
): string | null {
  switch (field) {
    case 'name': {
      const name = input.name.trim();
      if (name.length < 1) return 'Enter the name of the event, like "Katipunan market".';
      if (name.length > 80) return 'The name is at most 80 characters. Shorten it.';
      if (CONTROL.test(name)) return 'The name has a character that cannot be saved. Retype it.';
      return null;
    }
    case 'place': {
      const place = input.place.trim();
      if (place.length > 80) return 'The place is at most 80 characters. Shorten it.';
      if (CONTROL.test(place)) return 'The place has a character that cannot be saved. Retype it.';
      return null;
    }
    case 'startsOn':
      return real(input.startsOn) ? null : 'Pick the first day of the event.';
    case 'endsOn': {
      if (!real(input.endsOn)) return 'Pick the last day of the event.';
      if (!real(input.startsOn)) return null;
      if (input.endsOn < input.startsOn)
        return `The end date must be on or after ${dayRange(input.startsOn, input.startsOn, now)}.`;
      if (days(input.endsOn) - days(input.startsOn) > 14)
        return 'An event lasts at most 15 days. Move the end date closer to the start.';
      return null;
    }
    case 'rent': {
      const cents = rentCentsOf(input.rent);
      if (cents === null) return 'Enter the stall rent in pesos, like 2,500.00, or leave it blank.';
      if (cents > MAX_RENT_CENTS) return 'The stall rent is at most ₱1,000,000.00.';
      return null;
    }
  }
}

const ORDER: EventFormField[] = ['name', 'place', 'startsOn', 'endsOn', 'rent'];

export function validateEventForm(input: EventFormInput, now: Date = new Date()): EventFormResult {
  const errors: EventFormError[] = [];
  for (const field of ORDER) {
    const message = eventFieldError(field, input, now);
    if (message) errors.push({ field, message });
  }
  if (errors.length > 0) return { ok: false, errors };
  const fields: ScheduledEventFields = {
    id: input.id,
    name: input.name.trim(),
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    place: input.place.trim(),
    rentCents: rentCentsOf(input.rent) ?? 0,
    active: true
  };
  // The database's own bounds, last: a rule changed there but not here is caught here as a plain message.
  const guard = scheduledEventError(fields);
  return guard ? { ok: false, errors: [{ field: 'name', message: guard }] } : { ok: true, fields };
}
