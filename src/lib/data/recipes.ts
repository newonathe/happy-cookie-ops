import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/types/database';
import { classifySaveError, type SaveOutcome } from '@/lib/data/payments';

/**
 * The owner's recipes with versions (A4; `get_recipes` / `save_recipe`, migration 20260101004400): per flavour a yield in
 * cookies and lines of ingredient name, exact quantity and unit; every save that changes something is a new version and the
 * old one is kept. The database enforces every bound; `recipeError` mirrors them so a sure refusal is never sent.
 */
export type RecipeClient = Pick<SupabaseClient<Database>, 'rpc'>;

export const RECIPE_UNITS = ['g', 'ml', 'pcs'] as const;

export interface RecipeLine {
  name: string;
  qty: number;
  unit: string;
}

/** One packaging line of a flavour (B3b): a stock item and the quantity one cookie takes of it. Absent from an older database's answer. */
export interface RecipePackagingLine {
  name: string;
  itemId: string;
  qty: number;
  unit: string;
}

export interface RecipeVersion {
  version: number;
  yield: number;
  lines: RecipeLine[];
}

export interface Recipe {
  productId: string;
  yield: number;
  version: number;
  updatedAt: string;
  lines: RecipeLine[];
  /** The packaging one cookie takes (B3b); empty when the database does not send it. */
  packaging: RecipePackagingLine[];
  /** Earlier versions, oldest first. */
  history: RecipeVersion[];
}

export interface RecipeFields {
  productId: string;
  yield: number;
  lines: RecipeLine[];
}

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
export const decimal3 = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' &&
  Number.isFinite(v) &&
  v >= min &&
  v <= max &&
  Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6;

function parseLines(json: unknown): RecipeLine[] | null {
  if (!Array.isArray(json)) return null;
  const out: RecipeLine[] = [];
  for (const l of json) {
    if (
      !isObj(l) ||
      typeof l.name !== 'string' ||
      typeof l.qty !== 'number' ||
      !Number.isFinite(l.qty) ||
      typeof l.unit !== 'string'
    )
      return null;
    out.push({ name: l.name, qty: l.qty, unit: l.unit });
  }
  return out;
}

function parsePackaging(json: unknown): RecipePackagingLine[] | null {
  if (json === undefined || json === null) return [];
  if (!Array.isArray(json)) return null;
  const out: RecipePackagingLine[] = [];
  for (const l of json) {
    if (
      !isObj(l) ||
      typeof l.name !== 'string' ||
      typeof l.item_id !== 'string' ||
      typeof l.qty !== 'number' ||
      !Number.isFinite(l.qty) ||
      typeof l.unit !== 'string'
    )
      return null;
    out.push({ name: l.name, itemId: l.item_id, qty: l.qty, unit: l.unit });
  }
  return out;
}

/** Strict: anything unexpected is no list at all, so the recipes screen never shows a half-read recipe. */
export function parseRecipes(json: Json | null | undefined): Recipe[] | null {
  if (!Array.isArray(json)) return null;
  const out: Recipe[] = [];
  for (const r of json) {
    if (
      !isObj(r) ||
      typeof r.product_id !== 'string' ||
      !Number.isInteger(r.yield) ||
      (r.yield as number) < 1 ||
      !Number.isInteger(r.version) ||
      (r.version as number) < 1 ||
      typeof r.updated_at !== 'string' ||
      !Array.isArray(r.history)
    )
      return null;
    const lines = parseLines(r.lines);
    const packaging = parsePackaging(r.packaging);
    if (!lines || !packaging) return null;
    const history: RecipeVersion[] = [];
    for (const h of r.history) {
      const hl = isObj(h) ? parseLines(h.lines) : null;
      if (!isObj(h) || !Number.isInteger(h.version) || !Number.isInteger(h.yield) || !hl)
        return null;
      history.push({ version: h.version as number, yield: h.yield as number, lines: hl });
    }
    out.push({
      productId: r.product_id,
      yield: r.yield as number,
      version: r.version as number,
      updatedAt: r.updated_at,
      lines,
      packaging,
      history
    });
  }
  return out;
}

/** The same bounds `save_recipe` enforces. Null means the recipe is acceptable. */
export function recipeError(f: RecipeFields): string | null {
  if (!Number.isInteger(f.yield) || f.yield < 1 || f.yield > 10000)
    return 'A recipe makes a whole number of cookies, from 1 to 10000.';
  if (f.lines.length > 80) return 'A recipe has at most 80 ingredients.';
  const seen = new Set<string>();
  for (const l of f.lines) {
    const name = l.name.trim();
    if (name.length < 1 || name.length > 80 || CONTROL.test(name))
      return 'Each ingredient needs a name of 1 to 80 characters.';
    if (!decimal3(l.qty, 0.001, 999_999))
      return name + ' needs an amount above 0, with at most 3 decimals.';
    if (!(RECIPE_UNITS as readonly string[]).includes(l.unit))
      return name + ' is measured in g, ml or pcs.';
    if (seen.has(name)) return name + ' is listed twice.';
    seen.add(name);
  }
  return null;
}

export async function fetchRecipes(client: RecipeClient): Promise<Recipe[]> {
  const { data, error } = await client.rpc('get_recipes');
  if (error) throw new Error('recipes load failed: ' + (error.code || error.message));
  const rows = parseRecipes(data);
  if (!rows) throw new Error('recipes answer was not understood');
  return rows;
}

/** What a save answered: the outcome, and on success the recipe's new version and stamp. */
export interface RecipeSaveResult {
  outcome: SaveOutcome;
  version: number | null;
  updatedAt: string | null;
}

/** Creates (no stamp) or changes (the stamp the read returned) one recipe; a change is a new version. */
export async function saveRecipe(
  client: RecipeClient,
  f: RecipeFields,
  expectedUpdatedAt: string | null
): Promise<RecipeSaveResult> {
  try {
    const { data, error } = await client.rpc('save_recipe', {
      p_recipe: {
        product_id: f.productId,
        yield: f.yield,
        lines: f.lines.map((l) => ({ name: l.name.trim(), qty: l.qty, unit: l.unit }))
      },
      p_expected_updated_at: expectedUpdatedAt as string
    });
    const outcome = classifySaveError(error);
    const row = Array.isArray(data) ? (data[0] as unknown) : null;
    if (
      outcome === 'saved' &&
      isObj(row) &&
      Number.isInteger(row.version) &&
      typeof row.updated_at === 'string'
    )
      return { outcome, version: row.version as number, updatedAt: row.updated_at };
    return { outcome, version: null, updatedAt: null };
  } catch {
    return { outcome: 'offline', version: null, updatedAt: null };
  }
}

// ------------------------------------------------------------------ the ported recipes screen's shapes

type EngineIng = [string, number, string];
export interface EngineRecipe {
  yield: number;
  ing: EngineIng[];
}
export interface EngineRecipeState {
  recipes: Record<string, EngineRecipe>;
  recipeBase: Record<string, EngineRecipe>;
  recipeVer: Record<string, number>;
  recipeHistory: Record<string, Array<{ version: number; snap: EngineRecipe }>>;
}

const engineOf = (yieldCount: number, lines: readonly RecipeLine[]): EngineRecipe => ({
  yield: yieldCount,
  ing: lines.map((l): EngineIng => [l.name, l.qty, l.unit])
});

/**
 * The recipes the screens hold for each flavour on the menu: the saved one, or an empty recipe (never the prototype's)
 * for a flavour with none yet. `base` is the saved version, `history` the versions it replaced, oldest first.
 */
export function engineRecipes(
  rows: readonly Recipe[],
  productIds: readonly string[]
): EngineRecipeState {
  const byId = new Map(rows.map((r) => [r.productId, r]));
  const state: EngineRecipeState = {
    recipes: {},
    recipeBase: {},
    recipeVer: {},
    recipeHistory: {}
  };
  for (const id of productIds) {
    const r = byId.get(id);
    state.recipes[id] = r ? engineOf(r.yield, r.lines) : { yield: 1, ing: [] };
    state.recipeBase[id] = r ? engineOf(r.yield, r.lines) : { yield: 1, ing: [] };
    state.recipeVer[id] = r ? r.version : 1;
    state.recipeHistory[id] = r
      ? r.history.map((h) => ({ version: h.version, snap: engineOf(h.yield, h.lines) }))
      : [];
  }
  return state;
}
