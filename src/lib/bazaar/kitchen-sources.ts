import { z } from 'zod';
import type { BazaarClient } from '@/lib/data/bazaar-days';
import { kitchenTransferRequestSchema } from './kitchen-transfer';

const sourcesSchema = z
  .array(kitchenTransferRequestSchema.pick({ product_id: true, source_drop: true }))
  .refine((rows) => new Set(rows.map((row) => row.product_id)).size === rows.length);
export type KitchenSource = z.infer<typeof sourcesSchema>[number];
export type KitchenSourceRead =
  { outcome: 'read'; sources: KitchenSource[] } | { outcome: 'failed' };

/** A failed/malformed source read is never an empty (legacy/unmarked) result. */
export async function readKitchenSources(
  client: BazaarClient,
  booking: string
): Promise<KitchenSourceRead> {
  if (!kitchenTransferRequestSchema.shape.day_id.safeParse(booking).success)
    return { outcome: 'failed' };
  try {
    const { data, error } = await client.rpc('get_bazaar_kitchen_sources', { p_booking: booking });
    if (error) return { outcome: 'failed' };
    const parsed = sourcesSchema.safeParse(data);
    return parsed.success ? { outcome: 'read', sources: parsed.data } : { outcome: 'failed' };
  } catch {
    return { outcome: 'failed' };
  }
}
