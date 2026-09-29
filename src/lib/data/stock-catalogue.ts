import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/types/database';
import { classifySaveError, type SaveOutcome } from '@/lib/data/payments';
import { centavosToPesos } from '@/lib/money';

/**
 * The owner's stock catalogue (A3; `get_stock_catalogue` / `save_supplier` / `save_stock_item` /
 * `save_supplier_price`, migration 20260101004300): her ingredients and packaging, her suppliers, and what each
 * supplier charges for each item. Money is centavos here, as the database holds it. The database enforces every
 * bound; the `…Error` functions mirror them so a sure refusal is never sent. The quantity on hand is read only:
 * stock movements (receive, count, waste) belong to the stock ledger (slice C1).
 */
export type StockClient = Pick<SupabaseClient<Database>, 'rpc'>;

export type StockCategory = 'Ingredients' | 'Packaging';

export interface StockSupplier {
  id: string;
  name: string;
  phone: string;
  notes: string;
  place: string;
  active: boolean;
  updatedAt: string;
}

export interface StockItem {
  id: string;
  name: string;
  category: StockCategory;
  unit: string;
  onHand: number;
  parLevel: number;
  packSize: number | null;
  packLabel: string;
  supplierId: string | null;
  useByDays: number | null;
  lastCounted: string | null;
  active: boolean;
  updatedAt: string;
}

export interface StockPrice {
  id: string;
  supplierId: string;
  itemName: string;
  packLabel: string;
  priceCents: number;
  previousCents: number[];
  lastBought: string;
  preferred: boolean;
  active: boolean;
  updatedAt: string;
}

export interface StockCatalogue {
  suppliers: StockSupplier[];
  items: StockItem[];
  prices: StockPrice[];
}

export type SupplierFields = Pick<
  StockSupplier,
  'id' | 'name' | 'phone' | 'notes' | 'place' | 'active'
>;
export type ItemFields = Pick<
  StockItem,
  | 'id'
  | 'name'
  | 'category'
  | 'unit'
  | 'parLevel'
  | 'packSize'
  | 'packLabel'
  | 'supplierId'
  | 'useByDays'
  | 'active'
>;
export type PriceFields = Pick<
  StockPrice,
  | 'id'
  | 'supplierId'
  | 'itemName'
  | 'packLabel'
  | 'priceCents'
  | 'lastBought'
  | 'preferred'
  | 'active'
>;

const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === 'string';
const whole = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const decimal3 = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' &&
  Number.isFinite(v) &&
  v >= min &&
  v <= max &&
  Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6;

/** Strict: anything unexpected is no catalogue at all, so a screen never shows a half-read list. */
export function parseStockCatalogue(json: Json | null | undefined): StockCatalogue | null {
  if (
    !isObj(json) ||
    !Array.isArray(json.suppliers) ||
    !Array.isArray(json.items) ||
    !Array.isArray(json.prices)
  )
    return null;
  const suppliers: StockSupplier[] = [];
  for (const r of json.suppliers) {
    if (
      !isObj(r) ||
      !str(r.id) ||
      !str(r.name) ||
      !str(r.phone) ||
      !str(r.notes) ||
      !str(r.place) ||
      typeof r.active !== 'boolean' ||
      !str(r.updated_at)
    )
      return null;
    suppliers.push({
      id: r.id,
      name: r.name,
      phone: r.phone,
      notes: r.notes,
      place: r.place,
      active: r.active,
      updatedAt: r.updated_at
    });
  }
  const items: StockItem[] = [];
  for (const r of json.items) {
    if (
      !isObj(r) ||
      !str(r.id) ||
      !str(r.name) ||
      (r.category !== 'Ingredients' && r.category !== 'Packaging') ||
      !str(r.unit) ||
      typeof r.on_hand !== 'number' ||
      !Number.isFinite(r.on_hand) ||
      typeof r.par_level !== 'number' ||
      !Number.isFinite(r.par_level) ||
      (r.pack_size !== null &&
        (typeof r.pack_size !== 'number' || !Number.isFinite(r.pack_size))) ||
      !str(r.pack_label) ||
      (r.supplier_id !== null && !str(r.supplier_id)) ||
      (r.use_by_days !== null && !whole(r.use_by_days, 1, 3650)) ||
      (r.last_counted !== null && !str(r.last_counted)) ||
      typeof r.active !== 'boolean' ||
      !str(r.updated_at)
    )
      return null;
    items.push({
      id: r.id,
      name: r.name,
      category: r.category,
      unit: r.unit,
      onHand: r.on_hand,
      parLevel: r.par_level,
      packSize: r.pack_size as number | null,
      packLabel: r.pack_label,
      supplierId: r.supplier_id as string | null,
      useByDays: r.use_by_days as number | null,
      lastCounted: r.last_counted as string | null,
      active: r.active,
      updatedAt: r.updated_at
    });
  }
  const prices: StockPrice[] = [];
  for (const r of json.prices) {
    if (
      !isObj(r) ||
      !str(r.id) ||
      !UUID.test(r.id) ||
      !str(r.supplier_id) ||
      !str(r.item_name) ||
      !str(r.pack_label) ||
      !whole(r.price_cents, 0, 100_000_000) ||
      !Array.isArray(r.previous_cents) ||
      !r.previous_cents.every((c) => whole(c, 0, 100_000_000)) ||
      !str(r.last_bought) ||
      typeof r.preferred !== 'boolean' ||
      typeof r.active !== 'boolean' ||
      !str(r.updated_at)
    )
      return null;
    prices.push({
      id: r.id,
      supplierId: r.supplier_id,
      itemName: r.item_name,
      packLabel: r.pack_label,
      priceCents: r.price_cents,
      previousCents: r.previous_cents as number[],
      lastBought: r.last_bought,
      preferred: r.preferred,
      active: r.active,
      updatedAt: r.updated_at
    });
  }
  return { suppliers, items, prices };
}

/** The same bounds `save_supplier` enforces. Null means the supplier is acceptable. */
export function supplierError(f: SupplierFields): string | null {
  const name = f.name.trim();
  if (!SLUG.test(f.id)) return 'This supplier has no id yet. Reload and try again.';
  if (name.length < 1 || name.length > 80 || CONTROL.test(name + f.phone + f.place))
    return 'A supplier needs a name of 1 to 80 characters.';
  if (f.phone.trim().length > 40) return 'The phone number is at most 40 characters.';
  if (f.place.trim().length > 80) return 'The place is at most 80 characters.';
  if (f.notes.trim().length > 300 || CONTROL.test(f.notes.replace(/\n/g, '')))
    return 'The notes are at most 300 characters.';
  return null;
}

/** The same bounds `save_stock_item` enforces. */
export function itemError(f: ItemFields): string | null {
  const name = f.name.trim();
  const unit = f.unit.trim();
  if (!SLUG.test(f.id)) return 'This item has no id yet. Reload and try again.';
  if (name.length < 1 || name.length > 80 || CONTROL.test(name + unit + f.packLabel))
    return 'An item needs a name of 1 to 80 characters.';
  if (unit.length < 1 || unit.length > 12)
    return 'The unit is 1 to 12 characters, like g, ml or pcs.';
  if (f.packLabel.trim().length > 40) return 'The pack label is at most 40 characters.';
  if (f.category !== 'Ingredients' && f.category !== 'Packaging')
    return 'Pick Ingredients or Packaging.';
  if (!decimal3(f.parLevel, 0, 999_999_999)) return 'The low-stock level is a number from 0 up.';
  if (f.packSize !== null && !decimal3(f.packSize, 0.001, 999_999_999))
    return 'The pack size is a number above 0, or blank.';
  if (f.useByDays !== null && !whole(f.useByDays, 1, 3650))
    return 'Use-by days are a whole number from 1 to 3650, or blank.';
  return null;
}

/** The same bounds `save_supplier_price` enforces. */
export function priceError(f: PriceFields): string | null {
  const label = f.packLabel.trim();
  if (!UUID.test(f.id)) return 'This price has no id yet. Reload and try again.';
  if (f.supplierId === '' || f.itemName.trim() === '') return 'Pick the item this price is for.';
  if (label.length < 1 || label.length > 40 || CONTROL.test(label + f.lastBought))
    return 'A pack label is 1 to 40 characters, like 1 kg bag.';
  if (f.lastBought.trim().length > 20) return 'The last-bought text is at most 20 characters.';
  if (!whole(f.priceCents, 0, 100_000_000)) return 'A price is from ₱0 to ₱1,000,000.';
  return null;
}

export async function fetchStockCatalogue(client: StockClient): Promise<StockCatalogue> {
  const { data, error } = await client.rpc('get_stock_catalogue');
  if (error) throw new Error('stock catalogue load failed: ' + (error.code || error.message));
  const parsed = parseStockCatalogue(data);
  if (!parsed) throw new Error('stock catalogue answer was not understood');
  return parsed;
}

export async function saveSupplier(
  client: StockClient,
  f: SupplierFields,
  expectedUpdatedAt: string | null
): Promise<SaveOutcome> {
  try {
    const { error } = await client.rpc('save_supplier', {
      p_supplier: {
        id: f.id,
        name: f.name.trim(),
        phone: f.phone.trim(),
        notes: f.notes.trim(),
        place: f.place.trim(),
        active: f.active
      },
      p_expected_updated_at: expectedUpdatedAt as string
    });
    return classifySaveError(error);
  } catch {
    return 'offline';
  }
}

export async function saveStockItem(
  client: StockClient,
  f: ItemFields,
  expectedUpdatedAt: string | null
): Promise<SaveOutcome> {
  try {
    const { error } = await client.rpc('save_stock_item', {
      p_item: {
        id: f.id,
        name: f.name.trim(),
        category: f.category,
        unit: f.unit.trim(),
        par_level: f.parLevel,
        pack_size: f.packSize,
        pack_label: f.packLabel.trim(),
        supplier_id: f.supplierId,
        use_by_days: f.useByDays,
        active: f.active
      },
      p_expected_updated_at: expectedUpdatedAt as string
    });
    return classifySaveError(error);
  } catch {
    return 'offline';
  }
}

export async function saveSupplierPrice(
  client: StockClient,
  f: PriceFields,
  expectedUpdatedAt: string | null
): Promise<SaveOutcome> {
  try {
    const { error } = await client.rpc('save_supplier_price', {
      p_price: {
        id: f.id,
        supplier_id: f.supplierId,
        item_name: f.itemName.trim(),
        pack_label: f.packLabel.trim(),
        price_cents: f.priceCents,
        last_bought: f.lastBought.trim(),
        preferred: f.preferred,
        active: f.active
      },
      p_expected_updated_at: expectedUpdatedAt as string
    });
    return classifySaveError(error);
  } catch {
    return 'offline';
  }
}

// ------------------------------------------------------------------ the ported screens' shapes

/** One inventory row as the engine's `state.inv` holds it. */
export interface EngineInvRow {
  cat: StockCategory;
  name: string;
  qty: number;
  unit: string;
  level: number;
  supplier: string;
  updatedAt: number;
  useBy: number | null;
}

export interface EngineSupplier {
  name: string;
  place: string;
  items: Array<{
    item: string;
    pack: string;
    price: number;
    prev: number[];
    last: string;
    preferred: boolean;
  }>;
}

/** Active items as inventory rows. The name of the item's supplier stands in for the ported "supplier" text. */
export function engineInventory(c: StockCatalogue): EngineInvRow[] {
  const supplierName = new Map(c.suppliers.map((s) => [s.id, s.name]));
  return c.items
    .filter((i) => i.active)
    .map((i) => ({
      cat: i.category,
      name: i.name,
      qty: i.onHand,
      unit: i.unit,
      level: i.parLevel,
      supplier: (i.supplierId && supplierName.get(i.supplierId)) || '—',
      updatedAt: Date.parse(i.lastCounted ?? i.updatedAt),
      useBy: null
    }));
}

/** Active suppliers with their active prices for active items, in pesos. */
export function engineSuppliers(c: StockCatalogue): EngineSupplier[] {
  const active = new Set(c.items.filter((i) => i.active).map((i) => i.name));
  return c.suppliers
    .filter((s) => s.active)
    .map((s) => ({
      name: s.name,
      place: s.place,
      items: c.prices
        .filter((p) => p.supplierId === s.id && p.active && active.has(p.itemName))
        .map((p) => ({
          item: p.itemName,
          pack: p.packLabel,
          price: centavosToPesos(p.priceCents),
          prev: p.previousCents.map((x) => centavosToPesos(x)),
          last: p.lastBought,
          preferred: p.preferred
        }))
    }));
}

/** Pack sizes in the item's own unit, by item name (the grocery list works out how many packs to buy). */
export function enginePackSizes(c: StockCatalogue): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of c.items) if (i.active && i.packSize !== null) out[i.name] = i.packSize;
  return out;
}

/** The cheapest active price for each item, as the engine's best-buy table holds it. */
export function engineBestBuy(
  suppliers: readonly EngineSupplier[]
): Record<string, { price: number; pack: string; supplier: string }> {
  const out: Record<string, { price: number; pack: string; supplier: string }> = {};
  for (const s of suppliers)
    for (const i of s.items)
      if (!out[i.item] || i.price < out[i.item]!.price)
        out[i.item] = { price: i.price, pack: i.pack, supplier: s.name };
  return out;
}
