import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/types/database';
import { classifySaveError } from '@/lib/data/payments';
import { decimal3 } from '@/lib/data/recipes';
import { isMissingFunction } from '@/lib/data/rpc-missing';

/**
 * The owner's packaging records (B3b; `get_packaging_rules`, `save_packaging_rules`, `save_recipe_packaging`, migration
 * 20260101005900): for a container (a box of a size, loose cookies, a whole order, a bazaar sale) the stock items it takes, a
 * quantity and whether that is per container or per cookie; and, for each flavour, the packaging one cookie takes. Both are
 * the owner's records: nothing here names an item, a size or a quantity. The database enforces every bound;
 * `packagingRulesError` mirrors them so a sure refusal is never sent.
 *
 * A database without the functions (the trial, before the migration) answers `missing`, never `failed`. A bare 404 is not
 * "missing": `isMissingFunction` is called without the status.
 */
export type PackagingClient = Pick<SupabaseClient<Database>, 'rpc'>;

export const PACKAGING_CONTAINERS = ['box', 'loose', 'order', 'bazaar_sale'] as const;
export type PackagingContainer = (typeof PACKAGING_CONTAINERS)[number];
export const PACKAGING_PER = ['container', 'cookie'] as const;
export type PackagingPer = (typeof PACKAGING_PER)[number];

/** One stored rule, with the item's name and unit as the database read them. */
export interface PackagingRule {
  id: string;
  container: PackagingContainer;
  boxSize: number | null;
  itemId: string;
  itemName: string;
  unit: string;
  qty: number;
  per: PackagingPer;
  position: number;
}

export interface PackagingRules {
  /** Null until the first save: the first save expects no stamp. */
  updatedAt: string | null;
  rules: PackagingRule[];
}

/** What a save sends for one rule; its place in the array is its position within its container (and box size). */
export interface PackagingRuleFields {
  container: PackagingContainer;
  boxSize: number | null;
  itemId: string;
  qty: number;
  per: PackagingPer;
}

export interface PackagingLineFields {
  itemId: string;
  qty: number;
}

export type PackagingRead =
  { status: 'ok'; data: PackagingRules } | { status: 'missing' } | { status: 'failed' };

/** What a save answered. `refused` carries the database's own words. */
export type PackagingSave =
  | { outcome: 'saved'; updatedAt: string | null }
  | { outcome: 'conflict' | 'offline' | 'missing' }
  | { outcome: 'refused'; message: string };

export type PackagingLinesSave =
  | { outcome: 'saved'; version: number | null; updatedAt: string | null }
  | { outcome: 'conflict' | 'offline' | 'missing' }
  | { outcome: 'refused'; message: string };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v);

/** Strict: anything unexpected is no answer at all, so the form never shows half a rule set. */
export function parsePackagingRules(json: Json | null | undefined): PackagingRules | null {
  if (!isObj(json) || !Array.isArray(json.rules)) return null;
  const stamp = json.updated_at;
  if (stamp !== null && typeof stamp !== 'string') return null;
  const rules: PackagingRule[] = [];
  for (const r of json.rules) {
    if (
      !isObj(r) ||
      typeof r.id !== 'string' ||
      !oneOf(PACKAGING_CONTAINERS, r.container) ||
      !oneOf(PACKAGING_PER, r.per) ||
      typeof r.item_id !== 'string' ||
      typeof r.item_name !== 'string' ||
      typeof r.unit !== 'string' ||
      typeof r.qty !== 'number' ||
      !Number.isFinite(r.qty) ||
      !Number.isInteger(r.position) ||
      (r.box_size !== null && !Number.isInteger(r.box_size))
    )
      return null;
    rules.push({
      id: r.id,
      container: r.container,
      boxSize: r.box_size as number | null,
      itemId: r.item_id,
      itemName: r.item_name,
      unit: r.unit,
      qty: r.qty,
      per: r.per,
      position: r.position as number
    });
  }
  return { updatedAt: stamp, rules };
}

export async function fetchPackagingRules(client: PackagingClient): Promise<PackagingRead> {
  try {
    const { data, error } = await client.rpc('get_packaging_rules');
    if (error) return { status: isMissingFunction(error) ? 'missing' : 'failed' };
    const rules = parsePackagingRules(data);
    return rules ? { status: 'ok', data: rules } : { status: 'failed' };
  } catch {
    return { status: 'failed' };
  }
}

const refusal = (error: { message?: string } | null): string => error?.message ?? '';

/** The same bounds `save_packaging_rules` enforces. Null means the set is acceptable. */
export function packagingRulesError(rules: readonly PackagingRuleFields[]): string | null {
  if (rules.length > 80) return 'There are at most 80 packaging rules.';
  const seen = new Set<string>();
  for (const r of rules) {
    if (r.itemId === '') return 'Every rule needs a stock item.';
    if (r.container === 'box') {
      if (r.boxSize === null || !Number.isInteger(r.boxSize) || r.boxSize < 2 || r.boxSize > 48)
        return 'A box size is a whole number of cookies from 2 to 48.';
    } else if (r.boxSize !== null) return 'Only a box rule has a box size.';
    if (!decimal3(r.qty, 0.001, 999_999)) return 'A quantity is above 0, with at most 3 decimals.';
    const key = r.container + ':' + (r.boxSize ?? 0) + ':' + r.itemId;
    if (seen.has(key)) return 'An item is listed twice for the same container.';
    seen.add(key);
  }
  return null;
}

/** The same bounds `save_recipe_packaging` enforces. Null means the lines are acceptable. */
export function packagingLinesError(lines: readonly PackagingLineFields[]): string | null {
  if (lines.length > 80) return 'A flavour has at most 80 packaging lines.';
  const seen = new Set<string>();
  for (const l of lines) {
    if (l.itemId === '') return 'Every line needs a stock item.';
    if (!decimal3(l.qty, 0.001, 999_999)) return 'A quantity is above 0, with at most 3 decimals.';
    if (seen.has(l.itemId)) return 'An item is listed twice.';
    seen.add(l.itemId);
  }
  return null;
}

/** Replaces the whole rule set. The first save passes a null stamp; a later one the stamp the read returned. */
export async function savePackagingRules(
  client: PackagingClient,
  rules: readonly PackagingRuleFields[],
  expectedUpdatedAt: string | null
): Promise<PackagingSave> {
  try {
    const { data, error } = await client.rpc('save_packaging_rules', {
      p_rules: rules.map((r) => ({
        box_size: r.container === 'box' ? r.boxSize : null,
        container: r.container,
        item_id: r.itemId,
        per: r.per,
        qty: r.qty
      })),
      // The first save carries no stamp: the database column is a nullable stamp, the generated type is not.
      p_expected_updated_at: expectedUpdatedAt as string
    });
    if (error && isMissingFunction(error)) return { outcome: 'missing' };
    const outcome = classifySaveError(error);
    if (outcome === 'saved') {
      const row = Array.isArray(data) ? (data[0] as unknown) : null;
      return {
        outcome,
        updatedAt: isObj(row) && typeof row.updated_at === 'string' ? row.updated_at : null
      };
    }
    if (outcome === 'refused') return { outcome, message: refusal(error) };
    return { outcome };
  } catch {
    return { outcome: 'offline' };
  }
}

/** Replaces one recipe's packaging lines and nothing else; a change is a new recipe version. */
export async function savePackagingLines(
  client: PackagingClient,
  productId: string,
  lines: readonly PackagingLineFields[],
  expectedUpdatedAt: string
): Promise<PackagingLinesSave> {
  try {
    const { data, error } = await client.rpc('save_recipe_packaging', {
      p_recipe: {
        product_id: productId,
        lines: lines.map((l) => ({ item_id: l.itemId, qty: l.qty }))
      },
      p_expected_updated_at: expectedUpdatedAt
    });
    if (error && isMissingFunction(error)) return { outcome: 'missing' };
    const outcome = classifySaveError(error);
    if (outcome === 'saved') {
      const row = Array.isArray(data) ? (data[0] as unknown) : null;
      return {
        outcome,
        version: isObj(row) && Number.isInteger(row.version) ? (row.version as number) : null,
        updatedAt: isObj(row) && typeof row.updated_at === 'string' ? row.updated_at : null
      };
    }
    if (outcome === 'refused') return { outcome, message: refusal(error) };
    return { outcome };
  } catch {
    return { outcome: 'offline' };
  }
}
