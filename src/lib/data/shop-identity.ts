import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/types/database';
import type { SaveResult } from '@/lib/data/settings';
import { isMissingFunction } from '@/lib/data/rpc-missing';

/**
 * The shop's own identity: name, owner, one contact line and a tagline (B2, migration
 * 20260101005400). Anyone reads `get_shop_identity()`; the owner saves with
 * `save_shop_identity()`. There is no default text: an empty identity prints nothing.
 */
export type IdentityClient = Pick<SupabaseClient<Database>, 'rpc'>;

export interface ShopIdentity {
  shopName: string;
  ownerName: string;
  contactLine: string;
  tagline: string;
  updatedAt: string | null;
}
export type IdentityFields = Omit<ShopIdentity, 'updatedAt'>;

export const EMPTY_IDENTITY: ShopIdentity = {
  shopName: '',
  ownerName: '',
  contactLine: '',
  tagline: '',
  updatedAt: null
};

/** The same bounds `shop_identity` and `save_shop_identity` enforce, in characters. */
export const IDENTITY_BOUNDS = { shopName: 60, ownerName: 40, contactLine: 160, tagline: 120 };

const FIELDS: ReadonlyArray<{ field: keyof IdentityFields; key: string; label: string }> = [
  { field: 'shopName', key: 'shop_name', label: 'Shop name' },
  { field: 'ownerName', key: 'owner_name', label: 'Owner name' },
  { field: 'contactLine', key: 'contact_line', label: 'Contact line' },
  { field: 'tagline', key: 'tagline', label: 'Tagline' }
];

/** ASCII and C1 control characters, which the database refuses in every identity text. */
function hasControl(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

/** Postgres `btrim` removes spaces only, so a trailing tab stays and is then refused. */
const trimSpaces = (value: string) => value.replace(/^ +| +$/g, '');
/** Postgres counts characters, not UTF-16 units. */
const characters = (value: string) => Array.from(value).length;

/**
 * Reads the RPC's JSON strictly. Anything unexpected (not an object, a missing or non-text
 * field, an over-long text, a control character, a stamp that is neither text nor null) gives
 * null, so the caller shows nothing rather than something it cannot vouch for.
 */
export function parseShopIdentity(json: unknown): ShopIdentity | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const root = json as Record<string, unknown>;
  const identity: ShopIdentity = { ...EMPTY_IDENTITY };
  for (const { field, key } of FIELDS) {
    const value = root[key];
    if (typeof value !== 'string') return null;
    if (characters(value) > IDENTITY_BOUNDS[field] || hasControl(value)) return null;
    identity[field] = value as never;
  }
  const stamp = root.updated_at;
  if (stamp !== null && typeof stamp !== 'string') return null;
  identity.updatedAt = stamp;
  return identity;
}

export type IdentityRead =
  { status: 'ok'; identity: ShopIdentity } | { status: 'missing' } | { status: 'failed' };

/**
 * `missing`: the database has no `get_shop_identity` yet (PostgREST PGRST202, Postgres 42883
 * or an HTTP 404). The hosted trial runs this code before the migration is applied, and the
 * app then behaves as "nothing set". Every other error, a malformed answer and a thrown fetch
 * are `failed`. Never throws.
 */
export async function fetchShopIdentity(client: IdentityClient): Promise<IdentityRead> {
  try {
    const { data, error, status } = await client.rpc('get_shop_identity');
    if (error) {
      return { status: isMissingFunction(error, status) ? 'missing' : 'failed' };
    }
    const identity = parseShopIdentity(data);
    return identity ? { status: 'ok', identity } : { status: 'failed' };
  } catch {
    return { status: 'failed' };
  }
}

/** The same bounds the server enforces, so a sure refusal is never sent. */
export function identityFieldError(fields: IdentityFields): string | null {
  for (const { field, label } of FIELDS) {
    const value = trimSpaces(fields[field]);
    if (characters(value) > IDENTITY_BOUNDS[field])
      return label + ' must be ' + IDENTITY_BOUNDS[field] + ' characters or fewer.';
    if (hasControl(value)) return label + ' cannot contain tabs, line breaks or other controls.';
  }
  return null;
}

/**
 * One `save_shop_identity` call, classified like `saveSetting`: `P0002` is a stale stamp, any
 * other code is a refusal, and no code at all (or a thrown call) means it never arrived.
 * `expectedUpdatedAt` is null while nothing has been saved yet.
 */
export async function saveShopIdentity(
  client: IdentityClient,
  fields: IdentityFields,
  expectedUpdatedAt: string | null
): Promise<SaveResult> {
  const payload: Json = {
    shop_name: fields.shopName,
    owner_name: fields.ownerName,
    contact_line: fields.contactLine,
    tagline: fields.tagline
  };
  try {
    const { data, error } = await client.rpc('save_shop_identity', {
      p_identity: payload,
      // null while the row does not exist yet; the generated type omits the nullability.
      p_expected_updated_at: expectedUpdatedAt as string
    });
    if (error) {
      if (error.code === 'P0002') return { status: 'conflict' };
      return error.code ? { status: 'rejected' } : { status: 'offline' };
    }
    const row = data?.[0];
    return row ? { status: 'saved', updatedAt: row.updated_at } : { status: 'rejected' };
  } catch {
    return { status: 'offline' };
  }
}
