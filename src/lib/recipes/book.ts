import type { RecipeCost } from '@/lib/data/costs';
import { costCentavosToPesos } from '@/lib/money';
import { pesoUnit } from '@/lib/money/format';
import { costFieldError, pesosText } from '@/lib/bazaar/forms';
import { typedCostCents } from '@/lib/bazaar/review';

/**
 * The recipe book's rules (U7), kept apart from the screen so they can be tested with hand-worked numbers. Money is whole
 * centavos, except a cost per cookie, which the database keeps to four decimals of a centavo (`pesoUnit`).
 */

/**
 * The margin floor: the share of the price a cookie must keep after its cost. 65 % is the value Cine gave in July
 * (decision register, Q6); it becomes a setting with slice B7, and this constant is then replaced by that setting.
 */
export const MARGIN_FLOOR_PERCENT = 65;

export type BookFilter = 'menu' | 'all';
export type CostSource = 'typed' | 'recipe' | 'pending';
export type MarginTone = 'ok' | 'warn' | 'none';

/** What the book is given for one flavour. */
export interface BookFlavour {
  id: string;
  name: string;
  /** A stored image path; may be empty. */
  photo: string;
  onMenu: boolean;
  priceCents: number;
  /** The database's cost of the saved recipe; null when the costs were not read or the flavour has none. */
  recipe: RecipeCost | null;
  /** Cookies one batch makes, from the saved recipe; null when the recipes were not read or it has none. */
  batchYield: number | null;
  /** Her cost for the flavour (`flavour_costs`), in centavos; null when she has not typed one. */
  typedCents: number | null;
  /** When she typed it, as milliseconds since the epoch. */
  typedAt: number | null;
}

/** The recipe's cost per cookie in centavos, only when the recipe is complete (a part cost is never a cookie's cost). */
export function recipeCents(recipe: RecipeCost | null): number | null {
  if (!recipe || !recipe.complete || recipe.perCookie === null) return null;
  return toCents(recipe.perCookie);
}

/** Pesos to centavos at the database's precision (four decimals of a centavo), so 0.1 + 0.2 noise never reaches the screen. */
function toCents(pesos: number): number {
  return Math.round(pesos * 100 * 10_000) / 10_000;
}

/** Her cost for the flavour first, else the complete recipe's, else not known. */
export function costOf(f: Pick<BookFlavour, 'typedCents' | 'recipe'>): {
  cents: number | null;
  source: CostSource;
} {
  if (f.typedCents !== null) return { cents: f.typedCents, source: 'typed' };
  const fromRecipe = recipeCents(f.recipe);
  return fromRecipe === null
    ? { cents: null, source: 'pending' }
    : { cents: fromRecipe, source: 'recipe' };
}

/** What a cookie keeps after its cost: whole centavos at the price, and the share of the price. Null while either is unknown. */
export function marginOf(
  priceCents: number,
  costCents: number | null
): { cents: number; percent: number } | null {
  if (costCents === null || !Number.isFinite(priceCents) || priceCents <= 0) return null;
  const kept = priceCents - costCents;
  return { cents: kept, percent: (kept / priceCents) * 100 };
}

/** `ok` at or above the floor, `warn` below it, `none` while the margin is not known. Compared before any rounding. */
export function marginTone(
  margin: { percent: number } | null,
  floor: number = MARGIN_FLOOR_PERCENT
): MarginTone {
  if (margin === null) return 'none';
  return margin.percent >= floor ? 'ok' : 'warn';
}

/** "71%" or "64.6%": one decimal only when it is not whole, so a figure just under the floor never reads as the floor. */
export function marginText(margin: { percent: number } | null): string {
  if (margin === null) return '—';
  const rounded = Math.round(margin.percent * 10) / 10;
  // 64.96 rounds to 65.0 but is below the floor: show it as 64.9 rather than let the word contradict the colour.
  const shown =
    rounded >= MARGIN_FLOOR_PERCENT && margin.percent < MARGIN_FLOOR_PERCENT
      ? Math.floor(margin.percent * 10) / 10
      : rounded;
  return `${Number.isInteger(shown) ? shown : shown.toFixed(1)}%`;
}

export interface BookRow {
  id: string;
  name: string;
  photo: string;
  onMenu: boolean;
  priceCents: number;
  costCents: number | null;
  costSource: CostSource;
  margin: { cents: number; percent: number } | null;
  tone: MarginTone;
}

export function bookRows(
  flavours: readonly BookFlavour[],
  floor = MARGIN_FLOOR_PERCENT
): BookRow[] {
  return flavours.map((f) => {
    const cost = costOf(f);
    const margin = marginOf(f.priceCents, cost.cents);
    return {
      id: f.id,
      name: f.name,
      photo: f.photo,
      onMenu: f.onMenu,
      priceCents: f.priceCents,
      costCents: cost.cents,
      costSource: cost.source,
      margin,
      tone: marginTone(margin, floor)
    };
  });
}

/** The flavours the filter and the search leave, in the order given. The search ignores case and spaces at the ends. */
export function filterBook<T extends { name: string; onMenu: boolean }>(
  rows: readonly T[],
  filter: BookFilter,
  query: string
): T[] {
  const q = query.trim().toLowerCase();
  return rows.filter(
    (r) => (filter === 'all' || r.onMenu) && (q === '' || r.name.toLowerCase().includes(q))
  );
}

export function bookCounts(rows: readonly { onMenu: boolean }[]): { menu: number; all: number } {
  return { menu: rows.filter((r) => r.onMenu).length, all: rows.length };
}

/** A cost per cookie as it is typed into the field: pesos, no trailing zeros ("31.25", "28.7525", "12"). */
export function costFieldText(cents: number | null): string {
  const pesos = costCentavosToPesos(cents);
  return pesos === null ? '' : String(Math.round(pesos * 1_000_000) / 1_000_000);
}

/** What the cost field starts with: her cost if she typed one, else the recipe's, so the recipe's is what she sees. */
export function startingCostText(f: Pick<BookFlavour, 'typedCents' | 'recipe'>): string {
  return costFieldText(f.typedCents ?? recipeCents(f.recipe));
}

/**
 * The cost field as the database takes it: blank is `null` (back to the recipe's), else centavos with at most four decimals.
 * `error` is the words for a value that is not a cost (the same words as the event page's cost field).
 */
export function parseCostField(text: string): { cents: number | null; error: string | null } {
  const error = costFieldError(text);
  if (error) return { cents: null, error };
  const t = text.trim();
  return { cents: t === '' ? null : typedCostCents(pesosText(t)), error: null };
}

/** Whether the field holds something other than what it started with, so a save would change something. */
export function costFieldChanged(text: string, starting: string): boolean {
  const a = parseCostField(text);
  const b = parseCostField(starting);
  if (a.error || b.error) return text.trim() !== starting.trim();
  return a.cents !== b.cents;
}

export interface ReceiptView {
  /** "Ingredients", "Packaging": per cookie, written to four decimals. */
  lines: Array<{ label: string; valueText: string }>;
  /** The recipe's cost per cookie, or null when it is not a whole cost. */
  totalText: string | null;
  /** What is wrong with the recipe's cost: the items with no cost. Empty when the cost is whole. */
  missing: string[];
  /** One batch: "One batch makes 24 cookies; its ingredients cost ₱310.00." Null when either figure is not known. */
  batchText: string | null;
}

/**
 * The cost receipt of a recipe. `get_recipe_costs` answers with aggregates only (ingredients and packaging per cookie, the
 * total, the costed ingredients of one batch), so that is all the receipt shows: no per-line amount is worked out here.
 */
export function receiptOf(
  recipe: RecipeCost | null,
  batchYield: number | null
): ReceiptView | null {
  if (!recipe) return null;
  const lines: ReceiptView['lines'] = [];
  if (recipe.ingredientPerCookie !== null)
    lines.push({ label: 'Ingredients', valueText: pesoUnit(toCents(recipe.ingredientPerCookie)) });
  if (recipe.packagingPerCookie !== null && recipe.packagingPerCookie > 0)
    lines.push({ label: 'Packaging', valueText: pesoUnit(toCents(recipe.packagingPerCookie)) });
  const total = recipeCents(recipe);
  const batchOk = recipe.batch !== null && batchYield !== null && batchYield > 0;
  return {
    lines,
    totalText: total === null ? null : pesoUnit(total),
    missing: recipe.missing.map((m) => m.name),
    batchText: batchOk
      ? `One batch makes ${batchYield} ${batchYield === 1 ? 'cookie' : 'cookies'}; its ingredients cost ${pesoUnit(
          toCents(recipe.batch as number)
        )}.`
      : null
  };
}

/** The line under the cost: where it came from, in the same words as the event page. */
export function costSourceText(source: CostSource, typedOn: string | null): string {
  if (source === 'typed') return typedOn ? `Typed by you on ${typedOn}` : 'Typed by you';
  if (source === 'recipe') return 'From the recipe';
  return 'No cost per cookie yet';
}
