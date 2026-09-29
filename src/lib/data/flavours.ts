import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/types/database';
import type { EngineFlavour } from '@/store/engine/ops-engine';
import { resolveImagePath } from '@/lib/media/resolve-image';
import { centavosFromDb, centavosToPesos, pesosToCentavos, type Pesos } from '@/lib/money';

/**
 * Flavour rows ↔ the engine's `PRODUCTS`/`ALLERGENS` (MP-09 c1, migration 20260101003000).
 *
 * Staff read `get_flavours()`; the owner writes one whole flavour at a time through
 * `save_flavour()`, which checks every field, and publishes the menu through
 * `publish_flavours()` (MP-09 c1b, migration 20260101003100). The public shop reads only
 * the `shop_products` view (published and on the menu, no cost, no weight).
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
const enginePath = (path: string) => resolveImagePath(path);

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

/**
 * The customer shop's list in live mode (MP-09 c1b): the published rows in menu order, then
 * every flavour the engine already had that the shop did not return. Those are kept only
 * because render paths every screen computes name ported ids (`wcb`, `rvc`, `pbm`); they
 * are off the order form, so the shop never shows them. An empty read therefore shows no
 * flavours, never the ported demo menu and prices.
 */
export function shopCatalogue(
  rows: ReadonlyArray<ShopFlavourRow>,
  known: ReadonlyArray<EngineFlavour>,
  knownAllergens: Readonly<Record<string, string>>
): { list: EngineFlavour[]; allergens: Record<string, string>; onMenu: Record<string, boolean> } {
  const published = rows
    .flatMap((row) =>
      row.id && row.name && row.short_name && row.kind && row.price_cents != null
        ? [
            {
              id: row.id,
              name: row.name,
              short_name: row.short_name,
              price_cents: row.price_cents,
              kind: row.kind,
              tag: row.tag ?? '',
              description: row.description ?? '',
              image_path: row.image_path ?? '',
              allergens: row.allergens ?? '',
              sort_order: row.sort_order ?? 0
            }
          ]
        : []
    )
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  const list = published.map(engineFlavour);
  const allergens: Record<string, string> = {};
  const onMenu: Record<string, boolean> = {};
  for (const row of published) {
    allergens[row.id] = row.allergens;
    onMenu[row.id] = true;
  }
  for (const flavour of known) {
    if (flavour.id in onMenu) continue;
    list.push({ ...flavour });
    allergens[flavour.id] = knownAllergens[flavour.id] ?? '';
    onMenu[flavour.id] = false;
  }
  return { list, allergens, onMenu };
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

export type PublishResult =
  | { status: 'published'; rows: Array<{ id: string; published: boolean; updated_at: string }> }
  | { status: 'rejected' }
  | { status: 'offline' };

/** One `publish_flavours` call: exactly `ids` end up published, every other flavour not. */
export async function publishFlavours(
  client: FlavoursClient,
  ids: string[]
): Promise<PublishResult> {
  try {
    const { data, error } = await client.rpc('publish_flavours', { p_ids: ids });
    if (error) return error.code ? { status: 'rejected' } : { status: 'offline' };
    return { status: 'published', rows: data ?? [] };
  } catch {
    return { status: 'offline' };
  }
}

/** `save_flavour`'s price bound (₱10,000), checked here so a sure refusal is not sent. */
export const MAX_PRICE_CENTS = 1_000_000;

/** The engine price as centavos, or null when `save_flavour` would refuse it. */
export function priceCents(price: Pesos): number | null {
  if (!Number.isFinite(price) || price < 0) return null;
  const cents = pesosToCentavos(price);
  return cents <= MAX_PRICE_CENTS ? cents : null;
}

export const FLAVOUR_TOASTS = {
  conflict: 'Someone else changed this flavour just now. Showing their version.',
  offline: 'Offline. That change did not save, so it is back to what it was.',
  rejected: 'That change could not be saved, so it is back to what it was.'
} as const;

/** Every key the flavour editor may set, exactly what `save_flavour` accepts. */
export type FlavourFields = Omit<FlavourRow, 'id' | 'published' | 'updated_at'>;

/**
 * The same bounds `save_flavour` enforces (migration 20260101003000), checked here so a
 * sure refusal from the editor is never sent — the same reasoning as `priceCents`. Returns
 * the first problem found, or null if the RPC would accept `fields`.
 */
export function flavourFieldError(fields: FlavourFields): string | null {
  const name = fields.name.trim();
  const shortName = fields.short_name.trim();
  const allergens = fields.allergens.trim();
  if (name.length < 1 || name.length > 60) return 'Name must be 1-60 characters.';
  if (shortName.length < 1 || shortName.length > 40) return 'Short name must be 1-40 characters.';
  if (fields.tag.length > 30) return 'Badge must be 30 characters or fewer.';
  if (fields.description.length > 300) return 'Description must be 300 characters or fewer.';
  if (allergens.length < 1 || allergens.length > 200) return 'Allergens must be 1-200 characters.';
  if (fields.image_path.length > 200 || !/^[A-Za-z0-9/_.-]*$/.test(fields.image_path)) {
    return 'Photo path may only use letters, numbers, /, _, . and -.';
  }
  if (fields.kind !== 'Permanent' && fields.kind !== 'Rotating')
    return 'Pick Permanent or Rotating.';
  if (fields.item_type !== 'cookie' && fields.item_type !== 'set') return 'Pick cookie or set.';
  if (
    !Number.isInteger(fields.capacity_weight) ||
    fields.capacity_weight < 1 ||
    fields.capacity_weight > 48
  ) {
    return 'Capacity weight must be a whole number from 1 to 48.';
  }
  if (!Number.isInteger(fields.sort_order) || fields.sort_order < 0 || fields.sort_order > 999) {
    return 'Sort order must be a whole number from 0 to 999.';
  }
  if (
    !Number.isInteger(fields.price_cents) ||
    fields.price_cents < 0 ||
    fields.price_cents > MAX_PRICE_CENTS
  ) {
    return 'Price is out of range.';
  }
  return null;
}

/** A `save_flavour`-legal id derived from a name, unique against every id already loaded. */
export function slugifyFlavourId(name: string, existing: ReadonlySet<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'flavour';
  const legal = /^[a-z0-9][a-z0-9-]{0,31}$/;
  let id = base;
  let n = 2;
  while (existing.has(id) || !legal.test(id)) {
    const suffix = '-' + n;
    id = base.slice(0, 32 - suffix.length) + suffix;
    n += 1;
  }
  return id;
}

/** What the engine's own actions change on a flavour: the on-menu switch and the price. */
export type FlavourEdit = { onMenu: boolean; price: Pesos };

const editOf = (row: FlavourRow): FlavourEdit => ({
  onMenu: row.active,
  price: centavosToPesos(centavosFromDb(row.price_cents))
});

/** What the sync needs from the engine; `OpsRuntime` implements it, tests fake it. */
export interface FlavourHost {
  /** Swap the engine's flavour list and the per-flavour state for these rows. */
  apply(rows: FlavourRow[]): void;
  /** The flavour's on-menu switch (`dropActive`) and price (`prices`) as the engine has them now. */
  edit(id: string): FlavourEdit;
  /** Put one flavour's on-menu switch and price back. */
  restore(id: string, edit: FlavourEdit): void;
  online(): boolean;
  toast(message: string, tone?: 'ok' | 'warn'): void;
}

/**
 * Keeps the engine's flavours and `products` in step. Loads on sign-in; after the
 * engine's own on-menu toggle or price edit, sends the whole flavour with the `updated_at`
 * it last read. One request per flavour at a time: a change made while one is on its way
 * is sent after it, from whatever the engine shows by then (switch and price together).
 */
export class FlavourSync {
  private readonly rows = new Map<string, FlavourRow>();
  private readonly inFlight = new Set<string>();
  private readonly again = new Set<string>();
  /** True only once `load()` has actually populated `rows` from the server. */
  private loaded = false;

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
    this.loaded = true;
    this.host.apply(rows);
    return true;
  }

  /**
   * Called by the engine's `toggleDropProduct`/`setPrice` wrappers with the flavour as it
   * was before the action (`before`) and what the action set (`change`): the engine's own
   * `setState` has not landed yet, so the host cannot be read for either.
   */
  async save(id: string, change: Partial<FlavourEdit>, before: FlavourEdit): Promise<void> {
    const last = this.rows.get(id);
    if (!last) {
      // No row read for it (the list failed to load): nothing to save against, so the
      // flavour goes back rather than showing a change that was never sent.
      this.host.restore(id, before);
      this.host.toast(FLAVOUR_TOASTS.offline, 'warn');
      return;
    }
    if (this.inFlight.has(id)) {
      this.again.add(id);
      return;
    }
    const next = { ...before, ...change };
    // Infinity, a negative or anything over the bound: refused here, not sent.
    const cents = priceCents(next.price);
    if (cents === null) return this.fail(id, 'rejected');
    const stored = centavosToPesos(cents);
    if (next.onMenu === last.active && cents === centavosFromDb(last.price_cents)) {
      if (next.price !== stored) this.host.restore(id, editOf(last));
      return;
    }
    if (!this.host.online()) return this.fail(id, 'offline');

    this.inFlight.add(id);
    const row = { ...last, active: next.onMenu, price_cents: cents };
    const result = await saveFlavour(this.client, row, last.updated_at);
    this.inFlight.delete(id);

    if (result.status === 'saved') {
      this.rows.set(id, { ...row, updated_at: result.updatedAt });
      // ₱12.345 is stored as 1235 centavos: show what was stored, unless a newer change waits.
      if (next.price !== stored && !this.again.has(id)) this.host.restore(id, editOf(row));
    } else if (result.status === 'conflict') {
      this.again.delete(id);
      if (await this.load()) this.host.toast(FLAVOUR_TOASTS.conflict, 'warn');
      else this.fail(id, 'offline');
      return;
    } else {
      return this.fail(id, result.status);
    }
    if (this.again.delete(id)) {
      const now = this.host.edit(id);
      await this.save(id, now, now);
    }
  }

  /**
   * The flavour editor's save (MP-09 c1c): every field at once, through the same
   * `save_flavour` refusal/conflict/offline classification `save` uses. `expectedUpdatedAt`
   * null creates a new flavour, a draft (`published` stays false) until the next publish.
   *
   * Refuses (silently; the caller already validated) rather than races a quick edit for the
   * same id that is still in flight. On success, every loaded flavour is re-applied to the
   * engine from this cache — so a flavour whose optimistic toggle/price edit is still in
   * flight is snapshotted first and restored after, rather than visibly reverting it.
   *
   * Refuses to create a new flavour (`expectedUpdatedAt` null) unless `load()` has actually
   * populated the cache: the success path re-applies every row `current()` holds, and a new
   * flavour saved onto an empty (never-loaded) cache would shrink the engine's whole list to
   * that one row.
   */
  async saveWhole(
    id: string,
    fields: FlavourFields,
    expectedUpdatedAt: string | null
  ): Promise<FlavourSaveResult['status']> {
    if (flavourFieldError(fields) || this.inFlight.has(id)) return 'rejected';
    if (expectedUpdatedAt === null && !this.loaded) return 'rejected';
    if (!this.host.online()) {
      this.host.toast(FLAVOUR_TOASTS.offline, 'warn');
      return 'offline';
    }
    this.inFlight.add(id);
    const prior = this.rows.get(id);
    const row: FlavourRow = {
      id,
      ...fields,
      name: fields.name.trim(),
      short_name: fields.short_name.trim(),
      allergens: fields.allergens.trim(),
      published: prior?.published ?? false,
      updated_at: expectedUpdatedAt ?? ''
    };
    const result = await saveFlavour(this.client, row, expectedUpdatedAt);
    this.inFlight.delete(id);

    if (result.status === 'saved') {
      const pending = new Map([...this.inFlight].map((pid) => [pid, this.host.edit(pid)]));
      this.rows.set(id, { ...row, updated_at: result.updatedAt });
      this.host.apply(this.current());
      for (const [pid, edit] of pending) this.host.restore(pid, edit);
      return 'saved';
    }
    if (result.status === 'conflict') {
      if (await this.load()) this.host.toast(FLAVOUR_TOASTS.conflict, 'warn');
      else this.host.toast(FLAVOUR_TOASTS.offline, 'warn');
      return 'conflict';
    }
    this.host.toast(FLAVOUR_TOASTS[result.status], 'warn');
    return result.status;
  }

  /**
   * Publishes exactly `ids` (default: every loaded flavour), then takes the new `published`
   * flag and `updated_at` of each row the database changed, so the next save is not refused
   * as stale. The app's "Publish menu" button arrives with the flavour editor (MP-09 c1c).
   *
   * With no explicit `ids`, refuses to publish an empty default from a cache that was never
   * successfully loaded — `publish_flavours([])` unpublishes every flavour, which would
   * empty the live shop rather than leave it as it was. One reload is tried first, since the
   * owner may have opened the editor before the initial load finished or after it failed.
   */
  async publish(ids?: string[]): Promise<PublishResult['status']> {
    if (!ids && !this.loaded && !(await this.load())) return 'offline';
    if (!this.host.online()) return 'offline';
    const result = await publishFlavours(this.client, ids ?? [...this.rows.keys()]);
    if (result.status !== 'published') return result.status;
    for (const changed of result.rows) {
      const last = this.rows.get(changed.id);
      if (last)
        this.rows.set(changed.id, {
          ...last,
          published: changed.published,
          updated_at: changed.updated_at
        });
    }
    return 'published';
  }

  private fail(id: string, why: 'offline' | 'rejected'): void {
    this.again.delete(id);
    const last = this.rows.get(id);
    if (last) this.host.restore(id, editOf(last));
    this.host.toast(FLAVOUR_TOASTS[why], 'warn');
  }
}

type Recipe = { yield: number; ing: unknown[] };

/** The engine state that follows the staff flavour list (see `catalogueStatePatch`). */
export function flavourStatePatch(
  rows: ReadonlyArray<FlavourRow>,
  state: Record<string, unknown>
): Record<string, unknown> {
  const onMenu: Record<string, boolean> = {};
  for (const row of rows) onMenu[row.id] = row.active;
  return catalogueStatePatch(engineCatalogue(rows).list, onMenu, state);
}

/**
 * The engine state that follows a flavour list: prices and the on-menu switch come from
 * the list (`priceOf` reads `state.prices` before the flavour's own price). A flavour the
 * engine has no recipe for gets an empty one until MP-09 d loads real recipes, because
 * the bake and recipe screens read `recipes[id].yield` for every flavour.
 */
export function catalogueStatePatch(
  list: ReadonlyArray<EngineFlavour>,
  onMenu: Readonly<Record<string, boolean>>,
  state: Record<string, unknown>
): Record<string, unknown> {
  const recipes = { ...(state.recipes as Record<string, Recipe>) };
  const recipeBase = { ...(state.recipeBase as Record<string, Recipe>) };
  const recipeVer = { ...(state.recipeVer as Record<string, number>) };
  const prices: Record<string, number> = {};
  const dropActive: Record<string, boolean> = {};
  for (const { id, price } of list) {
    prices[id] = price;
    dropActive[id] = onMenu[id] !== false;
    if (!recipes[id]) recipes[id] = { yield: 1, ing: [] };
    if (!recipeBase[id]) recipeBase[id] = { yield: 1, ing: [] };
    if (!recipeVer[id]) recipeVer[id] = 1;
  }
  const open = list.some((f) => f.id === state.recipeOpen) ? state.recipeOpen : list[0]?.id;
  return { prices, dropActive, recipes, recipeBase, recipeVer, recipeOpen: open };
}
