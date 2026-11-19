import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { CafePricesUnavailable, missingFunction } from '@/lib/data/cafe-prices';
import { pesosToCentavos } from '@/lib/money';

/**
 * Café orders, owner only (migration 20260101009400). The owner enters an order for a café at café prices; the database stores the
 * unit prices as sent, computes the total itself, and counts the order toward the weekly limit when her setting says so. The order
 * then lives in Sell > Orders like any other and is marked paid there. A hosted database without the migration answers "no such
 * function": that is `CafePricesUnavailable`, shown as a note, never a crash.
 */
export type CafeOrdersClient = Pick<SupabaseClient<Database>, 'rpc'>;

export type CafeOrderLine = { productId: string; qty: number; unitCents: number };
export type CafeOrderInput = {
  clientId: string;
  name: string;
  /** Manila date, YYYY-MM-DD. */
  pickupDate: string;
  notes: string;
  lines: CafeOrderLine[];
};
export type CafeOrderSaved = {
  orderNo: string;
  totalCents: number;
  pickupDate: string;
  replayed: boolean;
  /** Whether the order takes slots in its pickup week (her setting when it was entered). */
  takesSlots: boolean;
};

/** The words for what stopped a save; `retryable` says whether the same order can be sent again unchanged. */
export class CafeOrderRefused extends Error {
  constructor(
    message: string,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = 'CafeOrderRefused';
  }
}

const bigint = z
  .union([
    z.number(),
    z
      .string()
      .regex(/^[0-9]+$/)
      .transform(Number)
  ])
  .pipe(z.number().int().min(0).max(Number.MAX_SAFE_INTEGER));

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

const savedRows = z
  .array(
    z.object({
      order_no: z.string().min(1),
      total_cents: bigint,
      pickup_date: z.string(),
      replayed: z.boolean(),
      takes_slots: z.boolean()
    })
  )
  .length(1);

/** The exact body the database takes: nothing else is sent, never a total, a role or a state. */
export function cafeOrderBody(input: CafeOrderInput) {
  return {
    clientId: input.clientId,
    name: input.name.trim(),
    pickupDate: input.pickupDate,
    notes: input.notes.trim(),
    lines: input.lines.map((l) => ({
      productId: l.productId,
      qty: l.qty,
      unitCents: l.unitCents
    }))
  };
}

export async function createCafeOrder(
  client: CafeOrdersClient,
  input: CafeOrderInput
): Promise<CafeOrderSaved> {
  const { data, error } = await client.rpc('create_cafe_order', { p_order: cafeOrderBody(input) });
  if (error) {
    if (missingFunction(error)) throw new CafePricesUnavailable();
    if (error.code === 'ZC002') {
      const details = (error as { details?: string | null }).details;
      const left = details ? Number(details) : Number.NaN;
      throw new CafeOrderRefused(
        Number.isFinite(left)
          ? `There is not enough room in that pickup week. ${left} cookie slots are left. Pick another week, or turn off "Café orders count toward the weekly limit" in the order settings.`
          : 'There is not enough room in that pickup week.',
        false
      );
    }
    if (error.code === '22023')
      throw new CafeOrderRefused(
        'The order was not accepted. Check the name, the pickup date, the quantities and the prices.',
        false
      );
    if (error.code === '23505')
      throw new CafeOrderRefused(
        'This order number was already used for a different order. Start the order again.',
        false
      );
    if (error.code === '42501')
      throw new CafeOrderRefused('Only the owner can enter a café order.', false);
    throw new CafeOrderRefused(
      'The order was not saved. Check your connection and try again.',
      true
    );
  }
  const parsed = savedRows.safeParse(data);
  // An answer we cannot read is not a failure to retry blindly: the order may exist. Same id again answers with it.
  if (!parsed.success)
    throw new CafeOrderRefused('The order may have been saved. Try again.', true);
  const row = parsed.data[0]!;
  return {
    orderNo: row.order_no,
    totalCents: row.total_cents,
    pickupDate: row.pickup_date,
    replayed: row.replayed,
    takesSlots: row.takes_slots
  };
}

/** One form line as typed: product, quantity and price text (pesos). */
export type CafeFormLine = { productId: string; name: string; qty: string; price: string };

/** What she typed (pesos) as centavos: whole centavos from ₱0.01 to ₱1,000,000, or the words that say what to fix. */
export function parseCafePrice(text: string): { cents: number } | { error: string } {
  const trimmed = text.trim().replace(/^₱/, '').replace(/,/g, '');
  if (!/^[0-9]+(\.[0-9]{1,2})?$/.test(trimmed)) return { error: 'Use a price like 90 or 90.50.' };
  const cents = pesosToCentavos(Number(trimmed));
  if (cents < 1) return { error: 'The price must be more than ₱0.' };
  if (cents > 100000000) return { error: 'That price is more than ₱1,000,000.' };
  return { cents };
}

export function parseCafeQty(text: string): { qty: number } | { error: string } {
  const trimmed = text.trim();
  if (!/^[0-9]+$/.test(trimmed)) return { error: 'Use a whole number.' };
  const qty = Number(trimmed);
  if (qty < 1 || qty > 500) return { error: 'From 1 to 500.' };
  return { qty };
}

export type CafeFormCheck = {
  /** Words for the first thing to fix in the header fields, if any. */
  name?: string;
  date?: string;
  lines?: string;
  /** Per product id: what is wrong with a line that has a quantity. */
  lineErrors: Record<string, { qty?: string; price?: string }>;
  /** The lines to send (those with a quantity), when everything is valid. */
  send: CafeOrderLine[];
  /** For display only; the database computes the real total. */
  totalCents: number;
  ok: boolean;
};

/** Checks the form as typed. A line with a blank quantity is not on the order. */
export function checkCafeForm(
  form: { name: string; pickupDate: string; lines: CafeFormLine[] },
  today: string
): CafeFormCheck {
  const out: CafeFormCheck = { lineErrors: {}, send: [], totalCents: 0, ok: false };
  const name = form.name.trim();
  if (!name) out.name = 'Type the café’s name.';
  else if (name.length > 80) out.name = 'The name is at most 80 characters.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.pickupDate)) out.date = 'Pick the pickup date.';
  else if (form.pickupDate < today) out.date = 'The pickup date cannot be before today.';
  let bad = false;
  for (const line of form.lines) {
    if (line.qty.trim() === '') continue;
    const qty = parseCafeQty(line.qty);
    const price = parseCafePrice(line.price);
    if ('error' in qty || 'error' in price) {
      bad = true;
      out.lineErrors[line.productId] = {
        ...('error' in qty ? { qty: qty.error } : {}),
        ...('error' in price ? { price: price.error } : {})
      };
      continue;
    }
    out.send.push({ productId: line.productId, qty: qty.qty, unitCents: price.cents });
    out.totalCents += qty.qty * price.cents;
  }
  if (!bad && out.send.length === 0) out.lines = 'Add at least one flavour with a quantity.';
  if (!bad && out.totalCents > 100000000) out.lines = 'The order total is more than ₱1,000,000.';
  out.ok = !out.name && !out.date && !out.lines && !bad;
  return out;
}
