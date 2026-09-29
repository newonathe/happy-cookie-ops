import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

/**
 * The shop's open state, from and enforced by the server (B3, migration 20260101003800). Before
 * this the owner's "close now" lived only in the browser and an anonymous customer's engine judged
 * open or closed from its built-in default schedule. `get_shop_status()` is a public read of the
 * owner's ordering window and the switch; `set_shop_override()` is the owner's switch.
 */
export type ShopStatusClient = Pick<SupabaseClient<Database>, 'rpc'>;

export type ShopOverride = 'open' | 'soon' | 'closed' | 'soldout';
const OVERRIDES: readonly ShopOverride[] = ['open', 'soon', 'closed', 'soldout'];

export interface ShopWindow {
  openDow: number;
  openH: number;
  openM: number;
  closeDow: number;
  closeH: number;
  closeM: number;
  extendH: number;
}
export interface ShopStatus {
  window: ShopWindow;
  override: ShopOverride | null;
}

const within = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/**
 * Reads the answer strictly. Anything unexpected is null, and the caller keeps what it had: a
 * malformed window must never replace a good one, and an unknown override must never close or
 * open the shop by accident.
 */
export function parseShopStatus(json: unknown): ShopStatus | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const r = json as Record<string, unknown>;
  if (
    !within(r.open_dow, 0, 6) ||
    !within(r.open_h, 0, 24) ||
    !within(r.open_m, 0, 59) ||
    !within(r.close_dow, 0, 6) ||
    !within(r.close_h, 0, 24) ||
    !within(r.close_m, 0, 59) ||
    !within(r.extend_h, 0, 168)
  )
    return null;
  const override = r.override === null || r.override === undefined ? null : r.override;
  if (override !== null && !OVERRIDES.includes(override as ShopOverride)) return null;
  return {
    window: {
      openDow: r.open_dow,
      openH: r.open_h,
      openM: r.open_m,
      closeDow: r.close_dow,
      closeH: r.close_h,
      closeM: r.close_m,
      extendH: r.extend_h
    },
    override: override as ShopOverride | null
  };
}

export async function fetchShopStatus(client: ShopStatusClient): Promise<ShopStatus | null> {
  const { data, error } = await client.rpc('get_shop_status');
  if (error) throw new Error('shop status load failed: ' + (error.code || error.message));
  return parseShopStatus(data);
}

export type OverrideOutcome = 'saved' | 'offline' | 'refused';

/** The owner's switch. A definite refusal is final; anything else is a lost connection. */
export async function saveShopOverride(
  client: ShopStatusClient,
  mode: ShopOverride | null
): Promise<OverrideOutcome> {
  try {
    const { error } = await client.rpc('set_shop_override', { p_mode: mode as string });
    if (!error) return 'saved';
    return ['22023', '42501'].includes(error.code ?? '') ? 'refused' : 'offline';
  } catch {
    return 'offline';
  }
}
