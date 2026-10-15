import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { isMissingFunction } from '@/lib/data/rpc-missing';

/**
 * What things cost (B3b): the database's one cost function, read by the owner's screens. `get_item_costs()` is each stock
 * item's unit cost; `get_recipe_costs()` is each flavour's cost per cookie and whether every line of it is priced. Amounts are
 * centavos and may be fractional (a unit cost carries six places); a cost the database does not know is `null`, which is a
 * cost to be told ("Cost pending"), never a zero.
 *
 * Tolerant on purpose, because the hosted database and this code are deployed apart: a key the code does not know is ignored,
 * and the keys newer migrations add (`ingredient_per_cookie_cents`, `packaging_per_cookie_cents`, a line's `kind`) are
 * optional. A database without the functions at all (the trial, before the migration) answers `missing`.
 */
/** What every figure built on an unknown cost shows instead of a number. */
export const COST_PENDING = 'Cost pending';

export type CostsClient = Pick<SupabaseClient<Database>, 'rpc'>;

export interface ItemCost {
  itemId: string;
  name: string;
  unit: string;
  active: boolean;
  /** Centavos per unit, or null when nothing prices it yet. */
  unitCostCents: number | null;
  source: string | null;
}

export interface RecipeCostLine {
  kind: string | undefined;
  name: string;
  itemId: string | null;
  qty: number | null;
  unit: string | null;
  unitCostCents: number | null;
  source: string | null;
  cents: number | null;
}

export interface RecipeCostMissing {
  name: string;
  why: string;
  kind: string | undefined;
}

export interface RecipeCost {
  productId: string;
  version: number | null;
  yield: number;
  batchCents: number | null;
  /** Absent on a database from before the packaging split. */
  ingredientPerCookieCents: number | null | undefined;
  packagingPerCookieCents: number | null | undefined;
  /** Null when nothing is costed. */
  perCookieCents: number | null;
  complete: boolean;
  missing: RecipeCostMissing[];
  lines: RecipeCostLine[];
}

export type CostRead<T> =
  { status: 'ok'; data: T[] } | { status: 'missing' } | { status: 'failed' };

const itemSchema = z.object({
  item_id: z.string(),
  name: z.string(),
  unit: z.string(),
  active: z.boolean(),
  unit_cost: z.number().nullish(),
  source: z.string().nullish()
});

const lineSchema = z.object({
  kind: z.string().optional(),
  name: z.string(),
  item_id: z.string().nullish(),
  qty: z.number().nullish(),
  unit: z.string().nullish(),
  unit_cost: z.number().nullish(),
  source: z.string().nullish(),
  cents: z.number().nullish()
});

const missingSchema = z.object({
  name: z.string(),
  why: z.string(),
  kind: z.string().optional()
});

const recipeSchema = z.object({
  product_id: z.string(),
  version: z.number().nullish(),
  yield: z.number(),
  batch_cents: z.number().nullish(),
  ingredient_per_cookie_cents: z.number().nullable().optional(),
  packaging_per_cookie_cents: z.number().nullable().optional(),
  per_cookie_cents: z.number().nullish(),
  complete: z.boolean(),
  missing: z.array(missingSchema).default([]),
  lines: z.array(lineSchema).default([])
});

/** Null when the answer is not understood: the screens then keep what they had rather than show half of it. */
export function parseItemCosts(json: unknown): ItemCost[] | null {
  const parsed = z.array(itemSchema).safeParse(json);
  if (!parsed.success) return null;
  return parsed.data.map((row) => ({
    itemId: row.item_id,
    name: row.name,
    unit: row.unit,
    active: row.active,
    unitCostCents: row.unit_cost ?? null,
    source: row.source ?? null
  }));
}

export function parseRecipeCosts(json: unknown): RecipeCost[] | null {
  const parsed = z.array(recipeSchema).safeParse(json);
  if (!parsed.success) return null;
  return parsed.data.map((row) => ({
    productId: row.product_id,
    version: row.version ?? null,
    yield: row.yield,
    batchCents: row.batch_cents ?? null,
    ingredientPerCookieCents: row.ingredient_per_cookie_cents,
    packagingPerCookieCents: row.packaging_per_cookie_cents,
    perCookieCents: row.per_cookie_cents ?? null,
    complete: row.complete,
    missing: row.missing.map((m) => ({ name: m.name, why: m.why, kind: m.kind })),
    lines: row.lines.map((l) => ({
      kind: l.kind,
      name: l.name,
      itemId: l.item_id ?? null,
      qty: l.qty ?? null,
      unit: l.unit ?? null,
      unitCostCents: l.unit_cost ?? null,
      source: l.source ?? null,
      cents: l.cents ?? null
    }))
  }));
}

async function read<T>(
  call: () => PromiseLike<{ data: unknown; error: { code?: string } | null; status?: number }>,
  parse: (json: unknown) => T[] | null
): Promise<CostRead<T>> {
  try {
    const { data, error } = await call();
    // By its code only: a bare 404 (a wrong address, a proxy) is a failure, never a quiet return to the engine's costs.
    if (error) return { status: isMissingFunction(error) ? 'missing' : 'failed' };
    const rows = parse(data);
    return rows ? { status: 'ok', data: rows } : { status: 'failed' };
  } catch {
    return { status: 'failed' };
  }
}

/** Owner only. Never throws: `missing` is a database without the function, `failed` is every other trouble. */
export function fetchItemCosts(client: CostsClient): Promise<CostRead<ItemCost>> {
  return read(() => client.rpc('get_item_costs'), parseItemCosts);
}

export function fetchRecipeCosts(client: CostsClient): Promise<CostRead<RecipeCost>> {
  return read(() => client.rpc('get_recipe_costs'), parseRecipeCosts);
}
