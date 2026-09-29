import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/types/database';
import { classifySaveError, type SaveOutcome } from '@/lib/data/payments';

/**
 * The owner's boxes, add-ons, sampler limit and same-day surcharge (B4a; `get_order_extras` /
 * `save_order_extras`, migration 20260101004000). Money is centavos here, exactly as the database
 * holds it; the form converts to and from pesos in one place (`src/lib/money.ts`). The database
 * enforces every bound; `orderExtrasError` mirrors them so a sure refusal is never sent.
 */
export type OrderExtrasClient = Pick<SupabaseClient<Database>, 'rpc'>;

export interface BoxSize {
  size: number;
  charge_cents: number;
  active: boolean;
}

export interface AddOn {
  id: string;
  name: string;
  price_cents: number;
  active: boolean;
  /** Choices such as the sticker designs; empty means the add-on has none. */
  variants: string[];
  /** The label of the customer's text box (a note-card message); null means no text box. */
  text_label: string | null;
  text_max: number;
  max_qty: number;
}

export interface OrderExtrasFields {
  same_day_enabled: boolean;
  same_day_percent: number;
  same_day_on_extras: boolean;
  /** A flavour of kind `set`, or null. */
  sampler_product_id: string | null;
  sampler_max_qty: number;
  box_sizes: BoxSize[];
  add_ons: AddOn[];
}

export interface OrderExtras extends OrderExtrasFields {
  updated_at: string;
}

const ADD_ON_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

const whole = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** The database's answer as one typed value; anything unexpected is null (the form then does not open). */
export function parseOrderExtras(json: Json | null | undefined): OrderExtras | null {
  if (!isObject(json)) return null;
  const r = json;
  if (
    typeof r.same_day_enabled !== 'boolean' ||
    typeof r.same_day_on_extras !== 'boolean' ||
    !whole(r.same_day_percent, 0, 100) ||
    !whole(r.sampler_max_qty, 1, 20) ||
    (r.sampler_product_id !== null && typeof r.sampler_product_id !== 'string') ||
    typeof r.updated_at !== 'string' ||
    !Array.isArray(r.box_sizes) ||
    !Array.isArray(r.add_ons)
  )
    return null;
  const boxes: BoxSize[] = [];
  for (const b of r.box_sizes) {
    if (!isObject(b) || !whole(b.size, 2, 48) || !whole(b.charge_cents, 0, 100000)) return null;
    if (typeof b.active !== 'boolean') return null;
    boxes.push({ size: b.size, charge_cents: b.charge_cents, active: b.active });
  }
  const addOns: AddOn[] = [];
  for (const a of r.add_ons) {
    if (
      !isObject(a) ||
      typeof a.id !== 'string' ||
      typeof a.name !== 'string' ||
      typeof a.active !== 'boolean' ||
      !whole(a.price_cents, 0, 1_000_000) ||
      !whole(a.text_max, 1, 300) ||
      !whole(a.max_qty, 1, 50) ||
      (a.text_label !== null && typeof a.text_label !== 'string') ||
      !Array.isArray(a.variants) ||
      !a.variants.every((v) => typeof v === 'string')
    )
      return null;
    addOns.push({
      id: a.id,
      name: a.name,
      price_cents: a.price_cents,
      active: a.active,
      variants: a.variants as string[],
      text_label: a.text_label as string | null,
      text_max: a.text_max,
      max_qty: a.max_qty
    });
  }
  return {
    same_day_enabled: r.same_day_enabled,
    same_day_percent: r.same_day_percent,
    same_day_on_extras: r.same_day_on_extras,
    sampler_product_id: r.sampler_product_id as string | null,
    sampler_max_qty: r.sampler_max_qty,
    box_sizes: boxes,
    add_ons: addOns,
    updated_at: r.updated_at
  };
}

/** The same bounds `save_order_extras` enforces. Null means the configuration is acceptable. */
export function orderExtrasError(f: OrderExtrasFields): string | null {
  if (!whole(f.same_day_percent, 0, 100))
    return 'The same-day extra is a whole number from 0 to 100.';
  if (!whole(f.sampler_max_qty, 1, 20)) return 'The sampler limit is a whole number from 1 to 20.';
  if (f.box_sizes.length > 12) return 'At most 12 box sizes.';
  const sizes = new Set<number>();
  for (const b of f.box_sizes) {
    if (!whole(b.size, 2, 48)) return 'A box holds 2 to 48 cookies.';
    if (!whole(b.charge_cents, 0, 100000)) return 'A box charge is from ₱0 to ₱1,000.';
    if (sizes.has(b.size)) return 'Each box size can be listed once.';
    sizes.add(b.size);
  }
  if (f.add_ons.length > 20) return 'At most 20 add-ons.';
  const ids = new Set<string>();
  for (const a of f.add_ons) {
    if (!ADD_ON_ID.test(a.id)) return 'An add-on needs a name with letters or numbers in it.';
    if (ids.has(a.id)) return 'Two add-ons share a name. Rename one.';
    ids.add(a.id);
    const name = a.name.trim();
    if (name.length < 1 || name.length > 40 || CONTROL.test(name))
      return 'An add-on name is 1 to 40 characters.';
    if (!whole(a.price_cents, 0, 1_000_000)) return 'An add-on price is from ₱0 to ₱10,000.';
    if (!whole(a.max_qty, 1, 50)) return 'The most of one add-on is 1 to 50.';
    if (!whole(a.text_max, 1, 300)) return 'A message is 1 to 300 characters long.';
    if (a.text_label !== null) {
      const label = a.text_label.trim();
      if (label.length < 1 || label.length > 30 || CONTROL.test(label))
        return 'A message label is 1 to 30 characters.';
    }
    if (a.variants.length > 12) return 'An add-on has at most 12 choices.';
    const seen = new Set<string>();
    for (const v of a.variants.map((x) => x.trim())) {
      if (v.length < 1 || v.length > 20 || CONTROL.test(v))
        return 'A choice such as a sticker number is 1 to 20 characters.';
      if (seen.has(v)) return 'A choice is listed twice.';
      seen.add(v);
    }
  }
  return null;
}

/** An add-on id from a name: lowercase letters, digits and dashes, at most 32 characters. */
export function addOnId(name: string, taken: ReadonlySet<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32)
      .replace(/-+$/g, '') || 'add-on';
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n += 1) {
    const suffix = '-' + n;
    const candidate = base.slice(0, 32 - suffix.length).replace(/-+$/g, '') + suffix;
    if (!taken.has(candidate)) return candidate;
  }
  return base;
}

export async function fetchOrderExtras(client: OrderExtrasClient): Promise<OrderExtras | null> {
  const { data, error } = await client.rpc('get_order_extras');
  if (error) throw new Error('order extras load failed: ' + (error.code || error.message));
  return parseOrderExtras(data);
}

export async function saveOrderExtras(
  client: OrderExtrasClient,
  fields: OrderExtrasFields,
  expectedUpdatedAt: string
): Promise<SaveOutcome> {
  try {
    const { error } = await client.rpc('save_order_extras', {
      p_extras: {
        same_day_enabled: fields.same_day_enabled,
        same_day_percent: fields.same_day_percent,
        same_day_on_extras: fields.same_day_on_extras,
        sampler_product_id: fields.sampler_product_id,
        sampler_max_qty: fields.sampler_max_qty,
        box_sizes: fields.box_sizes.map((b) => ({
          size: b.size,
          charge_cents: b.charge_cents,
          active: b.active
        })),
        add_ons: fields.add_ons.map((a) => ({
          id: a.id,
          name: a.name.trim(),
          price_cents: a.price_cents,
          active: a.active,
          variants: a.variants.map((v) => v.trim()),
          text_label: a.text_label === null ? null : a.text_label.trim(),
          text_max: a.text_max,
          max_qty: a.max_qty
        }))
      },
      p_expected_updated_at: expectedUpdatedAt
    });
    return classifySaveError(error);
  } catch {
    return 'offline';
  }
}
