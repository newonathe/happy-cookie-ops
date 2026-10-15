import type { BazaarDay, CostLine, FinalSplit, StrandedCookies } from '@/lib/data/bazaar-days';
import type {
  BazaarEventView,
  DayOutcome,
  FinaliseInput,
  StartPrompt,
  StrandedRow
} from '@/lib/bazaar/live-bazaar-types';
import { costFieldError, formIds, pesosText } from '@/lib/bazaar/forms';
import type { FieldIssue } from '@/lib/bazaar/plan';
import { cookiesText } from '@/lib/bazaar/plan';
import { typedCostCents } from '@/lib/bazaar/review';
import { dayText } from '@/lib/date/day-text';
import { peso } from '@/lib/money/format';

/**
 * The event page's rules (U4) as pure functions: what a closed day came to (B4), when starting a day asks first (A2), what
 * closing the event must still ask (A1 the stranded cookies, A5 the missing costs), and which single action the page
 * puts first. Nothing here is worked out again from sales: the figures are the database's summary, written as words.
 */

/** B4: a closed day's outcome from the summary's own figures for it; null for a day that is not closed. */
export function dayOutcomeOf(day: BazaarDay): DayOutcome | null {
  if (day.state !== 'closed') return null;
  const sold = day.lines.reduce((n, l) => n + l.sold, 0);
  const count = day.count ?? [];
  const left = count.reduce((n, c) => n + c.left, 0);
  const carried = count.reduce((n, c) => n + c.carryNext, 0);
  let drawerText: string | null = null;
  if (day.countedCents !== null) {
    if (day.overCents) drawerText = `${peso(day.overCents)} over`;
    else if (day.shortCents) drawerText = `${peso(day.shortCents)} short`;
    else drawerText = 'Matches';
  }
  return {
    soldText: `${sold.toLocaleString('en-PH')} sold`,
    revenueText: peso(day.revenueCents),
    leftText: `${left.toLocaleString('en-PH')} left`,
    carriedText: carried > 0 ? `${carried.toLocaleString('en-PH')} carried over` : null,
    drawerText
  };
}

/**
 * A2: starting a day whose date is not today asks first. Its sales are dated today, whatever the day says, and the
 * stall rent (booked with the first day started) lands on the day's own date. Null for today's day. `firstStart`: no day
 * of the event has been started, so the rent is booked now.
 */
export function startPromptOf(input: {
  dayYmd: string;
  today: string;
  now: Date;
  firstStart: boolean;
}): StartPrompt | null {
  if (input.dayYmd === input.today) return null;
  const day = dayText(input.dayYmd, input.now);
  const today = dayText(input.today, input.now);
  return {
    title: 'Start a day that is not today?',
    body:
      `This day is ${day}. Today is ${today}. Sales will be dated today` +
      (input.firstStart ? `, and the stall rent will be booked on ${day}.` : '.')
  };
}

/** The date after `ymd`, as `YYYY-MM-DD`. */
export function nextDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** A1: the stranded cookies with where each is suggested to go: the shop with a recipe, written off without one. */
export function strandedRowsOf(
  stranded: readonly StrandedCookies[],
  hasRecipe: (productId: string) => boolean | null,
  nameOf: (productId: string, fallback: string) => string
): StrandedRow[] {
  return stranded.map((s) => {
    const recipe = hasRecipe(s.productId);
    return {
      productId: s.productId,
      name: nameOf(s.productId, s.name),
      qty: s.qty,
      hasRecipe: recipe,
      suggestedToShop: recipe === null ? null : recipe ? s.qty : 0
    };
  });
}

/** A5: the flavours that have cookies and no cost per cookie, so the event has no profit yet. */
export function costPendingOf(
  lines: readonly CostLine[],
  nameOf: (productId: string, fallback: string) => string
): Array<{ productId: string; name: string; sold: number }> {
  return lines
    .filter((l) => l.unitCents === null && (l.uncosted || l.made > 0))
    .map((l) => ({ productId: l.productId, name: nameOf(l.productId, l.name), sold: l.sold }));
}

/** "18 cookies sold": what the confirmation says about a flavour without a cost. */
export const soldText = (n: number): string => `It sold ${cookiesText(n)} here.`;

export type FinaliseResult =
  | {
      ok: true;
      /** Null when nothing was stranded. */
      split: FinalSplit | null;
      /** The flavour costs to save before closing: pesos as typed became centavos with at most four decimals. */
      costs: Array<{ productId: string; cents: number }>;
    }
  | { ok: false; errors: FieldIssue[] };

/**
 * What "Close the event" is given, checked against what is stranded and what has no cost. The split of a flavour always
 * adds up (what does not go to the shop is written off), so the checks are: a choice was made, it is not more than was
 * stranded, and no cookie of a flavour without a recipe goes to the shop (the database refuses that). A missing cost is
 * asked for unless she chose to close without it.
 */
export function validateFinalise(input: {
  stranded: readonly StrandedRow[];
  costPending: ReadonlyArray<{ productId: string; name: string }>;
  value: FinaliseInput;
}): FinaliseResult {
  const errors: FieldIssue[] = [];
  const split: FinalSplit = {};
  for (const s of input.stranded) {
    const chosen = input.value.toShop[s.productId] ?? s.suggestedToShop;
    const field = formIds.finalShop(s.productId);
    if (chosen === null || chosen === undefined) {
      errors.push({
        field,
        message: `${s.name}: choose where the ${cookiesText(s.qty)} go, to the shop or written off.`
      });
      continue;
    }
    if (!Number.isInteger(chosen) || chosen < 0 || chosen > s.qty) {
      errors.push({
        field,
        message: `${s.name}: the cookies sent to the shop must be from 0 to ${s.qty}.`
      });
      continue;
    }
    if (s.hasRecipe === false && chosen > 0) {
      errors.push({
        field,
        message: `${s.name} has no recipe, so it cannot go to the shop. Write it off.`
      });
      continue;
    }
    split[s.productId] = { toShop: chosen, writtenOff: s.qty - chosen };
  }
  const costs: Array<{ productId: string; cents: number }> = [];
  if (!input.value.withoutCost) {
    for (const p of input.costPending) {
      const text = (input.value.costs[p.productId] ?? '').trim();
      const field = formIds.finalCost(p.productId);
      if (text === '') {
        errors.push({
          field,
          message: `${p.name} has no cost yet. Enter its cost per cookie, or choose Close without cost.`
        });
        continue;
      }
      const problem = costFieldError(text);
      const cents = typedCostCents(pesosText(text));
      if (problem || cents === null) {
        errors.push({ field, message: `${p.name}: ${problem ?? 'enter a cost per cookie.'}` });
        continue;
      }
      costs.push({ productId: p.productId, cents });
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, split: input.stranded.length > 0 ? split : null, costs };
}

export type PrimaryAction =
  | { kind: 'review'; dayId: string }
  | { kind: 'start'; dayId: string }
  | { kind: 'plan'; ymd: string }
  | { kind: 'close' };

/**
 * The one forward action of the event page: review a day that is selling, else start the first planned day, else plan the
 * first date that has no plan, else close the event. Null when there is nothing to do (the event is closed).
 */
export function primaryActionOf(
  event: Pick<BazaarEventView, 'days' | 'unplanned' | 'finalise'>
): PrimaryAction | null {
  const selling = event.days.find((d) => d.word === 'Selling' && d.action === 'review');
  if (selling) return { kind: 'review', dayId: selling.id };
  const planned = event.days.find((d) => d.word === 'Planned' && d.action === 'start');
  if (planned) return { kind: 'start', dayId: planned.id };
  const next = event.unplanned[0];
  if (next) return { kind: 'plan', ymd: next.ymd };
  if (event.finalise) return { kind: 'close' };
  return null;
}
