import { centavosToPesos, pesosToCentavos } from '@/lib/money';
import { peso } from '@/lib/money/format';
import type { BazaarPlan } from '@/lib/data/bazaar-days';
import type { PlanFlavour } from '@/lib/bazaar/live-bazaar-types';

/**
 * The day plan form, as pure functions (S2). The form holds what the owner types, as text. Here it becomes the plan the
 * database is sent, in whole centavos and whole cookies, or the words for what is wrong. The database enforces every bound
 * again; these refuse a sure refusal before it is sent, and say it in words.
 */
const MONEY = /^[0-9]{1,7}(\.[0-9]{1,2})?$/;
const COUNT = /^[0-9]{1,4}$/;
const MAX_PESOS = 1_000_000;
const MAX_FLOAT_PESOS = 1_000_000;

/** Centavos as the text an input shows: `125`, `125.5`. */
export function pesoInput(cents: number): string {
  return String(centavosToPesos(cents));
}

export function cookiesText(n: number): string {
  return n === 1 ? '1 cookie' : n.toLocaleString('en-PH') + ' cookies';
}

/** "Today" while `today` is inside the dates, otherwise "Tomorrow" or "In 9 days". All `YYYY-MM-DD`; the event has not ended. */
export function eventWhen(startsOn: string, endsOn: string, today: string): string {
  if (startsOn <= today && today <= endsOn) return 'Today';
  const day = (ymd: string) => {
    const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d) / 86_400_000;
  };
  const days = day(startsOn) - day(today);
  return days === 1 ? 'Tomorrow' : 'In ' + days + ' days';
}

/** One thing wrong with a form: the id of the input to point at, and the words (what is wrong, how to fix it). */
export interface FieldIssue {
  field: string;
  message: string;
}

/** The input ids of the day plan form: the error summary links to them, and the screen gives them to its controls. */
export const planIds = {
  float: 'plan-float',
  made: (productId: string) => `plan-made-${productId}`,
  carried: (productId: string) => `plan-carried-${productId}`,
  price: (productId: string) => `plan-price-${productId}`
} as const;

export type PlanResult =
  | { ok: true; plan: Omit<BazaarPlan, 'id' | 'scheduledId' | 'day'> }
  | { ok: false; error: string; errors: FieldIssue[] };

/** A blank count is 0; anything but whole digits is refused, with the flavour named. */
function count(text: string, what: string): number | string {
  const t = text.trim();
  if (t === '') return 0;
  if (!COUNT.test(t)) return what + ' must be a whole number from 0 to 9,999.';
  return Number(t);
}

/**
 * The day plan form, checked field by field (U4): every problem with the field to point at, in the form's order. The
 * summary line and the field's message are the same words. A flavour with no cookies is not asked for a price; a
 * flavour with cookies needs one above ₱0 (a free cookie is given away at the till, not priced at nothing).
 */
export function validatePlan(input: {
  floatPesos: string;
  flavours: readonly PlanFlavour[];
}): PlanResult {
  const errors: FieldIssue[] = [];
  const floatText = input.floatPesos.trim();
  let floatPesos = 0;
  if (floatText !== '' && !MONEY.test(floatText))
    errors.push({
      field: planIds.float,
      message: 'The drawer float must be an amount like 500 or 500.50.'
    });
  else {
    floatPesos = floatText === '' ? 0 : Number(floatText);
    if (floatPesos > MAX_FLOAT_PESOS)
      errors.push({ field: planIds.float, message: 'The drawer float is at most ₱1,000,000.' });
  }

  const lines: BazaarPlan['lines'] = [];
  for (const f of input.flavours) {
    const made = count(f.made, f.name + ': cookies made');
    const carried = count(f.carried, f.name + ': cookies carried');
    if (typeof made === 'string') errors.push({ field: planIds.made(f.id), message: made });
    if (typeof carried === 'string')
      errors.push({ field: planIds.carried(f.id), message: carried });
    if (typeof made === 'string' || typeof carried === 'string') continue;
    if (made + carried === 0) continue;
    const price = f.price.trim();
    if (!MONEY.test(price)) {
      errors.push({
        field: planIds.price(f.id),
        message: f.name + ': set a price like 125 or 125.50.'
      });
      continue;
    }
    if (Number(price) > MAX_PESOS) {
      errors.push({ field: planIds.price(f.id), message: f.name + ': the price is too high.' });
      continue;
    }
    if (Number(price) <= 0) {
      errors.push({
        field: planIds.price(f.id),
        message: f.name + ': the price must be more than ₱0. Set a price like 125.'
      });
      continue;
    }
    lines.push({
      productId: f.id,
      made,
      carried,
      priceCents: pesosToCentavos(Number(price))
    });
  }
  const first = input.flavours[0];
  if (errors.length === 0 && lines.length === 0 && first)
    errors.push({
      field: planIds.made(first.id),
      message: 'Put at least one cookie on the table to plan this day.'
    });
  const head = errors[0];
  if (head) return { ok: false, error: head.message, errors };
  return { ok: true, plan: { floatCents: pesosToCentavos(floatPesos), lines } };
}

/** The plan the database is sent, or the first problem in words. The same checks as `validatePlan`. */
export function planFromForm(input: {
  floatPesos: string;
  flavours: readonly PlanFlavour[];
}): PlanResult {
  return validatePlan(input);
}

/** What is on the table in the plan, for the sticky footer: whole cookies, and their worth at full sale in centavos. */
export function planTotals(flavours: readonly PlanFlavour[]): {
  cookies: number;
  fullSaleCents: number;
} {
  let cookies = 0;
  let fullSaleCents = 0;
  for (const f of flavours) {
    const made = COUNT.test(f.made.trim()) ? Number(f.made) : 0;
    const carried = COUNT.test(f.carried.trim()) ? Number(f.carried) : 0;
    const n = made + carried;
    if (n === 0) continue;
    cookies += n;
    const price = f.price.trim();
    if (MONEY.test(price)) fullSaleCents += n * pesosToCentavos(Number(price));
  }
  return { cookies, fullSaleCents };
}

/** The footer's words: "50 cookies · ₱6,050.00 at full sale", or the empty table. */
export function planTotalsText(flavours: readonly PlanFlavour[]): string {
  const { cookies, fullSaleCents } = planTotals(flavours);
  return cookies === 0
    ? 'Nothing on the table yet'
    : `${cookiesText(cookies)} · ${peso(fullSaleCents)} at full sale`;
}

/**
 * Which flavours the plan shows as tiles and which wait under "More flavours" (finding B5): the menu's first, then any
 * flavour that already has cookies in this plan, in the engine's order. Decided once, when the plan opens, so a tile does
 * not jump into the grid while she is counting.
 */
export function menuFirst(flavours: readonly PlanFlavour[]): { main: string[]; more: string[] } {
  const main: string[] = [];
  const more: string[] = [];
  for (const f of flavours) {
    const onTable = (COUNT.test(f.made.trim()) && Number(f.made) > 0) ||
      (COUNT.test(f.carried.trim()) && Number(f.carried) > 0);
    (f.onMenu || onTable ? main : more).push(f.id);
  }
  return { main, more };
}
