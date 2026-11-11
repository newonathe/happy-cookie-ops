import { z } from 'zod';
import type { BazaarClient } from '@/lib/data/bazaar-days';

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const whole = z.number().int().nonnegative();
export const kitchenTransferRequestSchema = z
  .object({
    id: uuid,
    day_id: uuid,
    product_id: z.string().min(1).max(128),
    source_drop: whole.max(100000),
    qty: whole.min(1).max(9999),
    at: whole.min(100000000000).max(99999999999999)
  })
  .strict();
const receiptSchema = kitchenTransferRequestSchema.extend({
  duplicate: z.boolean(),
  kitchen_remaining: whole,
  day_total: whole.max(19998),
  source_records: z.array(uuid)
});

export type KitchenTransferRequest = Readonly<z.infer<typeof kitchenTransferRequestSchema>>;
export type KitchenTransferReceipt = Readonly<
  Omit<z.infer<typeof receiptSchema>, 'source_records'> & { source_records: readonly string[] }
>;
export type TransferRefusal =
  | 'shortage'
  | 'source'
  | 'chronology'
  | 'conflict'
  | 'closed'
  | 'forbidden'
  | 'invalid'
  | 'unavailable';
export type KitchenTransferOutcome =
  | { outcome: 'saved'; receipt: KitchenTransferReceipt }
  | { outcome: 'refused'; reason: TransferRefusal }
  | { outcome: 'unknown' };

/** A new work item gets this immutable body once; an uncertain request never rebuilds it. */
export function freezeKitchenTransfer(value: unknown): KitchenTransferRequest | null {
  const parsed = kitchenTransferRequestSchema.safeParse(value);
  return parsed.success ? Object.freeze(parsed.data) : null;
}

const refusal: Readonly<Record<string, TransferRefusal>> = {
  ZB001: 'shortage',
  ZB002: 'source',
  ZB003: 'chronology',
  '23505': 'conflict',
  '55000': 'closed',
  '42501': 'forbidden',
  '22023': 'invalid',
  P0002: 'invalid',
  '42883': 'unavailable',
  PGRST202: 'unavailable'
};

/** Validates the same immutable receipt when it comes from a reply or scoped recovery. */
export function readKitchenTransferReceipt(
  request: KitchenTransferRequest,
  value: unknown
): KitchenTransferReceipt | null {
  const parsed = receiptSchema.safeParse(value);
  if (!parsed.success) return null;
  const receipt = parsed.data;
  if (
    receipt.id !== request.id ||
    receipt.day_id !== request.day_id ||
    receipt.product_id !== request.product_id ||
    receipt.source_drop !== request.source_drop ||
    receipt.qty !== request.qty ||
    receipt.at !== request.at ||
    receipt.day_total < request.qty
  )
    return null;
  return Object.freeze({
    ...receipt,
    source_records: Object.freeze([...receipt.source_records])
  });
}

/** Confirmation is about this exact request, never permission to apply a cached balance. */
export async function sendKitchenTransfer(
  client: BazaarClient,
  body: KitchenTransferRequest
): Promise<KitchenTransferOutcome> {
  const request = freezeKitchenTransfer(body);
  if (!request) return { outcome: 'refused', reason: 'invalid' };
  try {
    const { data, error } = await client.rpc('transfer_bazaar_stock', { p_transfer: request });
    if (error) {
      const reason =
        typeof error.code === 'string' && Object.hasOwn(refusal, error.code)
          ? refusal[error.code]
          : undefined;
      return reason ? { outcome: 'refused', reason } : { outcome: 'unknown' };
    }
    const receipt = readKitchenTransferReceipt(request, data);
    return receipt ? { outcome: 'saved', receipt } : { outcome: 'unknown' };
  } catch {
    return { outcome: 'unknown' };
  }
}
