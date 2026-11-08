import type { BazaarClient } from '@/lib/data/bazaar-days';
import { fetchProduction } from '@/lib/data/production';
import { kitchenTransferRequestSchema } from './kitchen-transfer';

export type KitchenAvailability =
  { outcome: 'read'; balances: ReadonlyMap<string, number> } | { outcome: 'failed' };

/** A complete recorded pool read can establish an absent flavour as zero;
 * a failed or malformed read never can. Caller captures verified authority. */
export async function readKitchenAvailability(
  client: BazaarClient,
  drop: number,
  current: () => boolean
): Promise<KitchenAvailability> {
  if (!current() || !kitchenTransferRequestSchema.shape.source_drop.safeParse(drop).success)
    return { outcome: 'failed' };
  try {
    const rows = await fetchProduction(client, drop);
    if (!current()) return { outcome: 'failed' };
    const balances = new Map<string, number>();
    for (const row of rows.baked) {
      if (
        !row.productId ||
        !Number.isSafeInteger(row.qty) ||
        row.qty < 0 ||
        balances.has(row.productId)
      )
        return { outcome: 'failed' };
      balances.set(row.productId, row.qty);
    }
    return { outcome: 'read', balances };
  } catch {
    return { outcome: 'failed' };
  }
}
