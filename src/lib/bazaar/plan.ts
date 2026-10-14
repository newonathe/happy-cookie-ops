import { centavosToPesos, pesosToCentavos } from '@/lib/money';
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

export type PlanResult =
  { ok: true; plan: Omit<BazaarPlan, 'id' | 'scheduledId' | 'day'> } | { ok: false; error: string };

/** A blank count is 0; anything but whole digits is refused, with the flavour named. */
function count(text: string, what: string): number | string {
  const t = text.trim();
  if (t === '') return 0;
  if (!COUNT.test(t)) return what + ' must be a whole number from 0 to 9,999.';
  return Number(t);
}

export function planFromForm(input: {
  floatPesos: string;
  flavours: readonly PlanFlavour[];
}): PlanResult {
  const floatText = input.floatPesos.trim();
  if (floatText !== '' && !MONEY.test(floatText))
    return { ok: false, error: 'The drawer float must be an amount like 500 or 500.50.' };
  const floatPesos = floatText === '' ? 0 : Number(floatText);
  if (floatPesos > MAX_FLOAT_PESOS)
    return { ok: false, error: 'The drawer float is at most ₱1,000,000.' };

  const lines: BazaarPlan['lines'] = [];
  for (const f of input.flavours) {
    const made = count(f.made, f.name + ': cookies made');
    if (typeof made === 'string') return { ok: false, error: made };
    const carried = count(f.carried, f.name + ': cookies carried');
    if (typeof carried === 'string') return { ok: false, error: carried };
    if (made + carried === 0) continue;
    const price = f.price.trim();
    if (!MONEY.test(price))
      return { ok: false, error: f.name + ': set a price like 125 or 125.50.' };
    if (Number(price) > MAX_PESOS) return { ok: false, error: f.name + ': the price is too high.' };
    lines.push({
      productId: f.id,
      made,
      carried,
      priceCents: pesosToCentavos(Number(price))
    });
  }
  if (lines.length === 0)
    return { ok: false, error: 'Put at least one cookie on the table to plan this day.' };
  return { ok: true, plan: { floatCents: pesosToCentavos(floatPesos), lines } };
}
