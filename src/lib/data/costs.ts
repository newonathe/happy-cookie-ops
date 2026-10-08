import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { costCentavosToPesos } from '@/lib/money';

/**
 * What things cost, as the database works it out (B3b; migrations 20260101005600 `get_item_costs` and 20260101005900
 * `get_recipe_costs`, owner only). Both answer in centavos with up to six decimals; the only conversion to pesos is
 * `costCentavosToPesos`. An unknown cost is null, never 0.
 *
 * Each read is `ok`, `missing` (the database has no such function yet: PostgREST PGRST202, Postgres 42883 or an HTTP 404, as
 * `fetchShopIdentity`) or `failed` (every other error, a malformed answer, a thrown call). Neither read throws.
 */
export type CostsClient = Pick<SupabaseClient<Database>, 'rpc'>;

/** What each stock item costs per unit, in pesos (null: no cost is known), by id and by name. */
export interface ItemCosts {
  byId: ReadonlyMap<string, number | null>;
  /** Active items only; a name held by two active items is unknown (null). */
  byName: ReadonlyMap<string, number | null>;
}

export interface RecipeCost {
  /** The version of the saved recipe this cost is of. */
  version: number;
  /** Pesos per cookie: the ingredients over the yield plus the packaging. Null when no ingredient has a cost. */
  perCookie: number | null;
  ingredientPerCookie: number | null;
  /** 0 when the recipe has no packaging lines; null when it has some and none has a cost (or the answer has no such key). */
  packagingPerCookie: number | null;
  /** The costed ingredients for one batch, in pesos. */
  batch: number | null;
  /** True when there is at least one ingredient line and none, of either kind, is without a cost. */
  complete: boolean;
  missing: Array<{ name: string; why: string }>;
}

export type ItemCostsRead =
  ({ status: 'ok' } & ItemCosts) | { status: 'missing' } | { status: 'failed' };
export type RecipeCostsRead =
  | { status: 'ok'; byProduct: ReadonlyMap<string, RecipeCost> }
  | { status: 'missing' }
  | { status: 'failed' };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** A number or a numeric text in pesos, null for null; `undefined` is a value that cannot be read at all. */
function readRate(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  const pesos = costCentavosToPesos(value);
  return pesos === null ? undefined : pesos;
}

async function call(
  client: CostsClient,
  name: 'get_item_costs' | 'get_recipe_costs'
): Promise<{ status: 'ok'; data: unknown } | { status: 'missing' } | { status: 'failed' }> {
  try {
    const { data, error, status } = await client.rpc(name);
    if (error) {
      const code = error.code;
      if (code === 'PGRST202' || code === '42883' || status === 404) return { status: 'missing' };
      return { status: 'failed' };
    }
    return { status: 'ok', data };
  } catch {
    return { status: 'failed' };
  }
}

export async function fetchItemCosts(client: CostsClient): Promise<ItemCostsRead> {
  const got = await call(client, 'get_item_costs');
  if (got.status !== 'ok') return got;
  if (!Array.isArray(got.data)) return { status: 'failed' };
  const byId = new Map<string, number | null>();
  const byName = new Map<string, number | null>();
  for (const row of got.data as unknown[]) {
    if (
      !isObj(row) ||
      typeof row.item_id !== 'string' ||
      typeof row.name !== 'string' ||
      typeof row.active !== 'boolean'
    )
      return { status: 'failed' };
    const cost = readRate(row.unit_cost ?? null);
    if (cost === undefined) return { status: 'failed' };
    byId.set(row.item_id, cost);
    if (!row.active) continue;
    byName.set(row.name, byName.has(row.name) ? null : cost);
  }
  return { status: 'ok', byId, byName };
}

export async function fetchRecipeCosts(client: CostsClient): Promise<RecipeCostsRead> {
  const got = await call(client, 'get_recipe_costs');
  if (got.status !== 'ok') return got;
  if (!Array.isArray(got.data)) return { status: 'failed' };
  const byProduct = new Map<string, RecipeCost>();
  for (const row of got.data as unknown[]) {
    if (
      !isObj(row) ||
      typeof row.product_id !== 'string' ||
      typeof row.complete !== 'boolean' ||
      !Number.isInteger(row.version) ||
      !Array.isArray(row.missing)
    )
      return { status: 'failed' };
    // Migrations 56 to 59 (before the packaging rules) answer with no packaging part, and their per-cookie figure is the
    // ingredients only: not a cookie's cost. The engine's own path stands for such a database.
    if (!('packaging_cents_per_cookie' in row)) return { status: 'missing' };
    // `per_cookie_cents` and `batch_cents` are always there (null when unknown).
    const perCookie = readRate(row.per_cookie_cents);
    const batch = readRate(row.batch_cents);
    const ingredient = readRate(row.ingredient_cents_per_cookie ?? null);
    const packaging = readRate(row.packaging_cents_per_cookie ?? null);
    if (
      perCookie === undefined ||
      batch === undefined ||
      ingredient === undefined ||
      packaging === undefined
    )
      return { status: 'failed' };
    const missing: RecipeCost['missing'] = [];
    for (const m of row.missing as unknown[])
      if (isObj(m) && typeof m.name === 'string' && typeof m.why === 'string')
        missing.push({ name: m.name, why: m.why });
    byProduct.set(row.product_id, {
      perCookie,
      ingredientPerCookie: ingredient,
      packagingPerCookie: packaging,
      version: row.version as number,
      batch,
      complete: row.complete,
      missing
    });
  }
  return { status: 'ok', byProduct };
}
