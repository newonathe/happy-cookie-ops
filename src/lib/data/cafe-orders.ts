import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { CafePricesUnavailable, missingFunction } from '@/lib/data/cafe-prices';

/**
 * The café order setting, owner only (migration 20260101009400): "Café orders count toward the weekly limit". The café sales themselves
 * are in cafe-sales.ts. A hosted database without the migration answers "no such function": that is `CafePricesUnavailable`, shown as a
 * note, never a crash.
 */
export type CafeOrdersClient = Pick<SupabaseClient<Database>, 'rpc'>;

const settingsRows = z
  .array(z.object({ count_toward_limit: z.boolean(), updated_at: z.string() }))
  .length(1);

export async function fetchCafeOrderSettings(
  client: CafeOrdersClient
): Promise<{ countTowardLimit: boolean }> {
  const { data, error } = await client.rpc('get_cafe_order_settings');
  if (error) {
    if (missingFunction(error)) throw new CafePricesUnavailable();
    throw new Error('café order setting load failed: ' + (error.code || error.message));
  }
  const parsed = settingsRows.safeParse(data);
  if (!parsed.success) throw new Error('café order setting load failed: malformed answer');
  return { countTowardLimit: parsed.data[0]!.count_toward_limit };
}

export async function saveCafeOrderSettings(
  client: CafeOrdersClient,
  countTowardLimit: boolean
): Promise<{ countTowardLimit: boolean }> {
  const { data, error } = await client.rpc('save_cafe_order_settings', {
    p_count_toward_limit: countTowardLimit
  });
  if (error) {
    if (missingFunction(error)) throw new CafePricesUnavailable();
    throw new Error('café order setting save failed: ' + (error.code || error.message));
  }
  const parsed = settingsRows.safeParse(data);
  if (!parsed.success) throw new Error('café order setting save failed: malformed answer');
  return { countTowardLimit: parsed.data[0]!.count_toward_limit };
}
