import { RECIPE_UNITS } from '@/lib/data/recipes';
import type { ProductionFields } from '@/lib/data/production';
import type { DoughProjection } from './drafts';
import type { ProductionRecipeSnapshot } from './workspace';
import { formatQuantity } from '@/lib/stock/stock-status';

export function doughStock(
  line: ProductionRecipeSnapshot['lines'][number],
  items:
    | readonly {
        id: string;
        unit: string;
        onHand: number;
        active: boolean;
        lastCounted: string | null;
      }[]
    | null
): { balanceText: string; short: boolean } {
  const unavailable = (balanceText: string) => ({ balanceText, short: false });
  if (!line.itemId)
    return unavailable(
      line.itemId === null ? 'No matching inventory item' : 'Inventory item link unavailable'
    );
  if (!items) return unavailable('Recorded balance unavailable');
  const item = items.find((row) => row.id === line.itemId);
  if (!item) return unavailable('Linked inventory item unavailable');
  if (!item.active) return unavailable('Inventory item is switched off');
  if (item.unit !== line.unit)
    return unavailable(`Inventory uses ${item.unit}; recipe uses ${line.unit}`);
  if (!Number.isFinite(item.onHand)) return unavailable('Recorded balance unavailable');
  return {
    balanceText: `${formatQuantity(item.onHand, item.unit)} recorded${item.lastCounted === null ? ' · not counted' : ''}`,
    short: (item.lastCounted !== null || item.onHand > 0) && item.onHand < line.qty
  };
}

/** Measured output never participates in ingredient scaling. The display mirrors SQL71 rounding. */
export function doughFacts(
  draft: DoughProjection,
  recipe: ProductionRecipeSnapshot | null,
  pending?: ProductionFields
) {
  const full = recipe?.yield ?? 0;
  const amount =
    pending?.recipeAmount ??
    draft.recipeAmount ??
    (full > 0 && draft.balls === full
      ? 1
      : full > 0 && draft.balls === Math.ceil(full / 2)
        ? 0.5
        : null);
  const actual = pending ? String(pending.qty) : (draft.actualBallsText ?? '');
  const validActual = /^\d+$/.test(actual) && Number(actual) >= 1 && Number(actual) <= 10000;
  const sourceReady =
    !!recipe &&
    Number.isInteger(recipe.yield) &&
    recipe.yield > 0 &&
    recipe.lines.some((line) => line.kind === 'ingredient') &&
    recipe.lines.every(
      (line) =>
        line.kind !== null &&
        Number.isFinite(line.qty) &&
        line.qty > 0 &&
        Math.abs(line.qty * 1000 - Math.round(line.qty * 1000)) < 1e-6 &&
        (RECIPE_UNITS as readonly string[]).includes(line.unit)
    );
  const lines =
    sourceReady && (amount === 1 || amount === 0.5)
      ? recipe.lines
          .filter((line) => line.kind === 'ingredient')
          .map((line) => {
            const parts = Math.round(line.qty * 1000) * (amount === 1 ? 2 : 1);
            const qty =
              line.unit === 'pcs'
                ? Math.floor((parts + 1999) / 2000)
                : Math.floor((parts + 100) / 200) / 10;
            return { ...line, qty };
          })
      : [];
  return {
    amount,
    actual,
    validActual,
    sourceReady,
    lines,
    valid: sourceReady && (amount === 1 || amount === 0.5) && validActual
  };
}

/** Completion compares submitted measured facts, including old pending requests without an amount. */
export function sameDoughSubmission(draft: DoughProjection, fields: ProductionFields): boolean {
  return fields.recipeAmount === undefined
    ? draft.balls === fields.qty
    : draft.recipeAmount === fields.recipeAmount && Number(draft.actualBallsText) === fields.qty;
}
