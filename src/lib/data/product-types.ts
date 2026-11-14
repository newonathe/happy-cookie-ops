import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

/**
 * Her own product types (migration 20260101008400; Cine, 14 November 2026). A type has her name for it and one of three behaviours:
 * `cookie` (counted as a cookie: orders, sampler, kitchen), `set` (a box of cookies) or `item` (sold by the unit, never a cookie).
 * Cookie and Set are built in. `get_product_types` also says which type each product has.
 */
export type ProductTypesClient = Pick<SupabaseClient<Database>, 'rpc'>;
export type Behaviour = 'cookie' | 'set' | 'item';

export interface ProductType {
  id: string;
  label: string;
  behavesAs: Behaviour;
  sortOrder: number;
  active: boolean;
  builtIn: boolean;
  updatedAt: string;
}

export interface ProductTypes {
  types: ProductType[];
  /** Each product's type id, by product id. */
  products: Record<string, string>;
}

const answer = z.object({
  types: z.array(
    z.object({
      id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/),
      label: z.string().min(1).max(30),
      behaves_as: z.enum(['cookie', 'set', 'item']),
      sort_order: z.number().int(),
      active: z.boolean(),
      built_in: z.boolean(),
      updated_at: z.string()
    })
  ),
  products: z.record(z.string(), z.string())
});

/** The types and each product's type; null when the answer is not understood. Throws when the read fails. */
export async function fetchProductTypes(client: ProductTypesClient): Promise<ProductTypes | null> {
  const { data, error } = await client.rpc('get_product_types');
  if (error) throw new Error('get_product_types failed: ' + (error.code ?? 'unknown'));
  const parsed = answer.safeParse(data);
  if (!parsed.success) return null;
  return {
    types: parsed.data.types.map((t) => ({
      id: t.id,
      label: t.label,
      behavesAs: t.behaves_as,
      sortOrder: t.sort_order,
      active: t.active,
      builtIn: t.built_in,
      updatedAt: t.updated_at
    })),
    products: parsed.data.products
  };
}

/** A slug for a new type from her name for it, unique against the ids already used. */
export function typeIdFor(label: string, taken: ReadonlySet<string>): string {
  const base =
    label
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 28) || 'type';
  let id = /^[a-z0-9]/.test(base) ? base : 't-' + base;
  for (let n = 2; taken.has(id); n += 1) id = `${base.slice(0, 28)}-${n}`;
  return id;
}

/** Her name for a type: 1 to 30 characters once trimmed; the words for what is wrong, or null. */
export function typeLabelError(label: string, others: readonly ProductType[]): string | null {
  const name = label.trim();
  if (name.length < 1 || name.length > 30) return 'A type name is 1 to 30 characters.';
  if (others.some((t) => t.label.trim().toLowerCase() === name.toLowerCase()))
    return 'Another type already has that name.';
  return null;
}

export type TypeSaveOutcome = 'saved' | 'stale' | 'locked' | 'refused' | 'offline';

/** One `save_product_type`: a new type (no stamp) or a change to one (its stamp). */
export async function saveProductType(
  client: ProductTypesClient,
  type: Pick<ProductType, 'id' | 'label' | 'behavesAs' | 'sortOrder' | 'active'>,
  expectedUpdatedAt: string | null
): Promise<TypeSaveOutcome> {
  try {
    const { error } = await client.rpc('save_product_type', {
      p_type: {
        id: type.id,
        label: type.label.trim(),
        behaves_as: type.behavesAs,
        sort_order: type.sortOrder,
        active: type.active
      },
      p_expected_updated_at: expectedUpdatedAt as string
    });
    if (!error) return 'saved';
    if (error.code === 'P0002') return 'stale';
    if (error.code === '55000') return 'locked';
    if (['22023', '42501'].includes(error.code ?? '')) return 'refused';
    return 'offline';
  } catch {
    return 'offline';
  }
}
