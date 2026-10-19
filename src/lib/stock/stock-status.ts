import type { StockStatus } from '@/lib/stock/live-stock-types';
import { formatManila } from '@/lib/time/business-clock';
import { COST_COPY, STOCK_COPY } from '@/lib/orders/staff-copy';

/**
 * The status and the words of the live owner's New Stock screens (B5-1; Ethan, 13 October). Pure: no React, no state. Every function
 * answers in words for the screen. An unknown cost is "Cost pending", never 0, never "₱0.00", and never the part of a total that
 * happens to be known passed off as the whole.
 */

const MINUS = '−';

/**
 * Out at 0 on hand (or less, or unreadable). Low when on hand is below the item's level. Good otherwise. An item with no level
 * (null, undefined, 0 or not a number) is Good unless it is at 0.
 */
export function stockStatus(onHand: number, level: number | null | undefined): StockStatus {
  if (!Number.isFinite(onHand) || onHand <= 0) return 'Out';
  if (level == null || !Number.isFinite(level) || level <= 0) return 'Good';
  return onHand < level ? 'Low' : 'Good';
}

/** A number with thousands separators and up to three decimals; a true minus; never negative zero. */
function plain(n: number, maxDecimals: number): string {
  const text = Math.abs(n).toLocaleString('en-PH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals
  });
  const isZero = Number(text.replace(/,/g, '')) === 0;
  return n < 0 && !isZero ? MINUS + text : text;
}

/** "1,250 g". */
export function formatQuantity(qty: number, unit: string): string {
  return plain(qty, 3) + ' ' + unit;
}

/** "Low below 500 g", or "No level set". */
export function levelText(level: number | null | undefined, unit: string): string {
  if (level == null || !Number.isFinite(level) || level <= 0) return STOCK_COPY.noLevel;
  return STOCK_COPY.lowBelow + ' ' + formatQuantity(level, unit);
}

/** "+500 g", "−120 g", "0 g": the change in on-hand, signed, with the unit. */
export function changeText(delta: number, unit: string): string {
  const text = formatQuantity(delta, unit);
  return delta > 0 && Number(plain(delta, 3).replace(/,/g, '')) !== 0 ? '+' + text : text;
}

/** "3 Oct": the shop's day, day then month whatever the device's locale says about the order of the two. */
function dayAndMonth(at: Date): string {
  const day = formatManila(at, { day: 'numeric' }, 'en-US');
  const month = formatManila(at, { month: 'short' }, 'en-US');
  return day + ' ' + month;
}

/** "Counted 3 Oct" (the shop's day), or "Opening count pending" when it was never counted. */
export function lastCountedText(lastCounted: string | null | undefined): string {
  if (!lastCounted) return STOCK_COPY.openingPending;
  const at = new Date(lastCounted);
  if (Number.isNaN(at.getTime())) return STOCK_COPY.openingPending;
  return STOCK_COPY.countedOn + ' ' + dayAndMonth(at);
}

/** "Last paid ₱88.25 · 3 Oct": what the last delivery cost in all, and the day. Null when nothing was paid. */
export function lastPaidText(
  paidPesos: number | null | undefined,
  at: number | null | undefined
): string | null {
  if (paidPesos == null || !Number.isFinite(paidPesos) || paidPesos <= 0) return null;
  const when = at == null || !Number.isFinite(at) ? null : new Date(at);
  return (
    STOCK_COPY.lastPaid +
    ' ' +
    formatPesos(paidPesos) +
    (when && !Number.isNaN(when.getTime()) ? ' · ' + dayAndMonth(when) : '')
  );
}

/** "₱1,234.50"; "−₱120.00" below zero. Two decimals, as the engine's own PESO2. */
export function formatPesos(pesos: number): string {
  const text = Math.abs(pesos).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return (pesos < 0 && Number(text.replace(/,/g, '')) !== 0 ? MINUS : '') + '₱' + text;
}

/** "₱6,000" for a whole number of pesos (a budget she typed), "₱6,000.50" otherwise. */
export function formatPesosShort(pesos: number): string {
  return Number.isInteger(pesos) && pesos >= 0
    ? '₱' + pesos.toLocaleString('en-PH')
    : formatPesos(pesos);
}

/**
 * A cost per unit in pesos: two decimals, or up to four when a fraction of a centavo matters ("₱0.0042"), so a gram of flour is
 * never "₱0.00".
 */
function formatRate(pesos: number): string {
  const text = Math.abs(pesos).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4
  });
  return '₱' + text;
}

const SOURCE_WORDS: Readonly<Record<string, string>> = {
  average: STOCK_COPY.sourceAverage,
  usual: STOCK_COPY.sourceUsual,
  supplier: STOCK_COPY.sourceSupplier
};

/** "₱0.09 per g · average", or "Cost pending" for a cost that is not known. */
export function unitCostText(
  perUnit: number | null | undefined,
  unit: string,
  source: string | null | undefined
): string {
  if (perUnit == null || !Number.isFinite(perUnit)) return COST_COPY.pending;
  const word = source ? SOURCE_WORDS[source] : undefined;
  return formatRate(perUnit) + ' per ' + unit + (word ? ' · ' + word : '');
}

/** A cost per unit alone ("₱0.09 per g"), or "Cost pending". */
export function ratePerUnitText(perUnit: number | null | undefined, unit: string): string {
  return unitCostText(perUnit, unit, null);
}

/** Quantity times cost per unit, to the centavo; null when either is not known (never 0). */
export function lineCost(qty: number, perUnit: number | null | undefined): number | null {
  if (!Number.isFinite(qty) || perUnit == null || !Number.isFinite(perUnit)) return null;
  return Math.round(qty * perUnit * 100) / 100;
}

/**
 * The sum of line costs in whole centavos (no float drift) and how many lines had no cost. A list of nothing is a known 0; a list of
 * only unknowns has no known part.
 */
export function sumKnown(lines: ReadonlyArray<number | null>): {
  centavos: number;
  known: number;
  pending: number;
} {
  let centavos = 0;
  let known = 0;
  let pending = 0;
  for (const line of lines) {
    if (line == null || !Number.isFinite(line)) pending += 1;
    else {
      centavos += Math.round(line * 100);
      known += 1;
    }
  }
  return { centavos, known, pending };
}

/** "₱1,234.50"; "₱100.00 · some cost pending" when part has no price; "Cost pending" when none has. */
export function totalText(lines: ReadonlyArray<number | null>): string {
  const sum = sumKnown(lines);
  if (sum.pending === 0) return formatPesos(sum.centavos / 100);
  if (sum.known === 0) return COST_COPY.pending;
  return formatPesos(sum.centavos / 100) + ' · ' + STOCK_COPY.somePending;
}
