import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/types/database';
import type { EngineFlavour } from '@/store/engine/ops-engine';
import { centavosFromDb, centavosToPesos } from '@/lib/money';

/**
 * Flavour rows ↔ the engine's `PRODUCTS`/`ALLERGENS` (MP-09 c1, migration 20260101003000).
 *
 * Staff read `get_flavours()`; the owner writes one whole flavour at a time through
 * `save_flavour()`, which checks every field. The public shop reads only the
 * `shop_products` view (published and on the menu, no cost, no weight).
 */
export type FlavourRow = Database['public']['Functions']['get_flavours']['Returns'][number];
export type ShopFlavourRow = Database['public']['Views']['shop_products']['Row'];
export type FlavoursClient = Pick<SupabaseClient<Database>, 'rpc'>;
export type ShopClient = Pick<SupabaseClient<Database>, 'from'>;

/** The columns the shop may read, named, so a new column is never exposed by accident. */
export const SHOP_COLUMNS =
  'id, name, short_name, price_cents, kind, tag, description, image_path, sort_order, allergens';

/**
 * The engine's asset paths are relative (`assets/…`); the seed stores them rooted
 * (`/assets/…`). One leading slash is dropped so a seeded flavour renders exactly as the
 * ported constant did.
 */
const enginePath = (path: string) => path.replace(/^\//, '');

type Catalogue = Pick<
  FlavourRow,
  'id' | 'name' | 'short_name' | 'price_cents' | 'kind' | 'tag' | 'description' | 'image_path'
>;

export function engineFlavour(row: Catalogue): EngineFlavour {
  return {
    id: row.id,
    name: row.name,
    short: row.short_name,
    price: centavosToPesos(centavosFromDb(row.price_cents)),
    img: enginePath(row.image_path),
    kind: row.kind,
    tag: row.tag,
    desc: row.description
  };
}

/** Flavours in menu order, plus the allergen map, as `replaceFlavours` takes them. */
export function engineCatalogue(
  rows: ReadonlyArray<Catalogue & Pick<FlavourRow, 'allergens' | 'sort_order'>>
): {
  list: EngineFlavour[];
  allergens: Record<string, string>;
} {
  const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  const allergens: Record<string, string> = {};
  for (const row of sorted) allergens[row.id] = row.allergens;
  return { list: sorted.map(engineFlavour), allergens };
}

export async function fetchFlavours(client: FlavoursClient): Promise<FlavourRow[]> {
  const { data, error } = await client.rpc('get_flavours');
  if (error) throw new Error('flavour load failed: ' + (error.code || error.message));
  return data ?? [];
}

/** The public projection, for the customer shop. Never the raw `products` table. */
export async function fetchShopFlavours(client: ShopClient): Promise<ShopFlavourRow[]> {
  const { data, error } = await client.from('shop_products').select(SHOP_COLUMNS);
  if (error) throw new Error('shop menu load failed: ' + (error.code || error.message));
  return (data ?? []) as ShopFlavourRow[];
}

/** Every key `save_flavour` requires, and nothing else. */
export function flavourPayload(row: FlavourRow): Json {
  return {
    name: row.name,
    short_name: row.short_name,
    price_cents: row.price_cents,
    kind: row.kind,
    item_type: row.item_type,
    capacity_weight: row.capacity_weight,
    tag: row.tag,
    description: row.description,
    image_path: row.image_path,
    allergens: row.allergens,
    active: row.active,
    sort_order: row.sort_order
  };
}

export type FlavourSaveResult =
  | { status: 'saved'; updatedAt: string }
  | { status: 'conflict' }
  | { status: 'rejected' }
  | { status: 'offline' };

/** One `save_flavour` call, classified exactly like `saveSetting` (P0002 = stale). */
export async function saveFlavour(
  client: FlavoursClient,
  row: FlavourRow,
  expectedUpdatedAt: string | null
): Promise<FlavourSaveResult> {
  try {
    const { data, error } = await client.rpc('save_flavour', {
      p_id: row.id,
      p_flavour: flavourPayload(row),
      // null creates a new flavour; the generated type omits the nullability.
      p_expected_updated_at: expectedUpdatedAt as string
    });
    if (error) {
      if (error.code === 'P0002') return { status: 'conflict' };
      return error.code ? { status: 'rejected' } : { status: 'offline' };
    }
    const saved = data?.[0];
    return saved ? { status: 'saved', updatedAt: saved.updated_at } : { status: 'rejected' };
  } catch {
    return { status: 'offline' };
  }
}

export const FLAVOUR_TOASTS = {
  conflict: 'Someone else changed this flavour just now. Showing their version.',
  offline: 'Offline. That change did not save, so it is back to what it was.',
  rejected: 'That change could not be saved, so it is back to what it was.'
} as const;

/** What the sync needs from the engine; `OpsRuntime` implements it, tests fake it. */
export interface FlavourHost {
  /** Swap the engine's flavour list and the per-flavour state for these rows. */
  apply(rows: FlavourRow[]): void;
  /** Whether the flavour is on the order form right now (the engine's `dropActive`). */
  onMenu(id: string): boolean;
  /** Put one flavour's on-menu switch back. */
  setOnMenu(id: string, on: boolean): void;
  online(): boolean;
  toast(message: string, tone?: 'ok' | 'warn'): void;
}

/**
 * Keeps the engine's flavours and `products` in step. Loads on sign-in; after the
 * engine's own on-menu toggle, sends the whole flavour with the `updated_at` it last read.
 * One request per flavour at a time: a tap made while one is on its way is sent after it.
 */
export class FlavourSync {
  private readonly rows = new Map<string, FlavourRow>();
  private readonly inFlight = new Set<string>();
  private readonly again = new Set<string>();

  constructor(
    private readonly client: FlavoursClient,
    private readonly host: FlavourHost
  ) {}

  /** The rows last read or saved, in no particular order. */
  current(): FlavourRow[] {
    return [...this.rows.values()];
  }

  /** False if the read failed or returned nothing; the engine keeps its list. */
  async load(): Promise<boolean> {
    let rows: FlavourRow[];
    try {
      rows = await fetchFlavours(this.client);
    } catch {
      return false;
    }
    if (!rows.length) return false;
    this.rows.clear();
    for (const row of rows) this.rows.set(row.id, row);
    this.host.apply(rows);
    return true;
  }

  /**
   * Called by the engine's `toggleDropProduct(id)` with the value it is setting: the
   * engine's own `setState` has not landed yet, so the host cannot be read here.
   */
  async saveOnMenu(id: string, on: boolean): Promise<void> {
    const last = this.rows.get(id);
    if (!last) {
      // No row read for it (the list failed to load): nothing to save against, so the
      // switch goes back rather than showing a change that was never sent.
      this.host.setOnMenu(id, !on);
      this.host.toast(FLAVOUR_TOASTS.offline, 'warn');
      return;
    }
    if (this.inFlight.has(id)) {
      this.again.add(id);
      return;
    }
    if (on === last.active) return;
    if (!this.host.online()) return this.fail(id, 'offline');

    this.inFlight.add(id);
    const next = { ...last, active: on };
    const result = await saveFlavour(this.client, next, last.updated_at);
    this.inFlight.delete(id);

    if (result.status === 'saved') {
      this.rows.set(id, { ...next, updated_at: result.updatedAt });
    } else if (result.status === 'conflict') {
      if (await this.load()) this.host.toast(FLAVOUR_TOASTS.conflict, 'warn');
      else this.fail(id, 'offline');
      return;
    } else {
      return this.fail(id, result.status);
    }
    if (this.again.delete(id)) await this.saveOnMenu(id, this.host.onMenu(id));
  }

  private fail(id: string, why: 'offline' | 'rejected'): void {
    this.again.delete(id);
    const last = this.rows.get(id);
    if (last) this.host.setOnMenu(id, last.active);
    this.host.toast(FLAVOUR_TOASTS[why], 'warn');
  }
}

type Recipe = { yield: number; ing: unknown[] };

/**
 * The engine state that follows the flavour list: prices and the on-menu switch come from
 * the rows (`priceOf` reads `state.prices` before the flavour's own price). A flavour the
 * engine has no recipe for gets an empty one until MP-09 d loads real recipes, because
 * the bake and recipe screens read `recipes[id].yield` for every flavour.
 */
export function flavourStatePatch(
  rows: ReadonlyArray<FlavourRow>,
  state: Record<string, unknown>
): Record<string, unknown> {
  const { list } = engineCatalogue(rows);
  const recipes = { ...(state.recipes as Record<string, Recipe>) };
  const recipeBase = { ...(state.recipeBase as Record<string, Recipe>) };
  const recipeVer = { ...(state.recipeVer as Record<string, number>) };
  const prices: Record<string, number> = {};
  const dropActive: Record<string, boolean> = {};
  for (const flavour of list) prices[flavour.id] = flavour.price;
  for (const row of rows) {
    dropActive[row.id] = row.active;
    if (!recipes[row.id]) recipes[row.id] = { yield: 1, ing: [] };
    if (!recipeBase[row.id]) recipeBase[row.id] = { yield: 1, ing: [] };
    if (!recipeVer[row.id]) recipeVer[row.id] = 1;
  }
  const open = list.some((f) => f.id === state.recipeOpen) ? state.recipeOpen : list[0]?.id;
  return { prices, dropActive, recipes, recipeBase, recipeVer, recipeOpen: open };
}
