import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { centavosToPesos, pesosToCentavos } from '@/lib/money';

/**
 * Café (wholesale) prices, owner only (migration 20260101009100).
 *
 * The database holds her café price per product and decides the DEFAULT one (`default_cafe_price_cents`: the retail price times
 * 0.7, rounded down to a multiple of ₱5). This module only reads what it answers, so the rule exists in one place. A hosted
 * database that does not have the migration yet answers "no such function"; that is `CafePricesUnavailable`, shown as a note,
 * never a crash. Nothing here touches the retail price or the order form.
 */
export type CafePricesClient = Pick<SupabaseClient<Database>, 'rpc'>;

export type CafePrice = {
  productId: string;
  name: string;
  /** What the order form charges, centavos. */
  retailCents: number;
  /** What the café price is when she has not set one, centavos. */
  defaultCents: number;
  /** Her own café price, centavos; null while the default applies. */
  ownCents: number | null;
  /** The café price in effect: hers, else the default, centavos. */
  effectiveCents: number;
};

/** The migration is not on this database yet (or the call is otherwise not offered): the café price is hidden, with a note. */
export class CafePricesUnavailable extends Error {
  constructor() {
    super('café prices are not available yet');
    this.name = 'CafePricesUnavailable';
  }
}

/** A bigint column can arrive as a number or a digit string through the client. */
const centavos = z
  .union([
    z.number(),
    z
      .string()
      .regex(/^[0-9]+$/)
      .transform(Number)
  ])
  .pipe(z.number().int().min(1).max(100000000));

const row = z.object({
  product_id: z.string().min(1),
  name: z.string(),
  price_cents: z
    .union([
      z.number(),
      z
        .string()
        .regex(/^[0-9]+$/)
        .transform(Number)
    ])
    .pipe(z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)),
  default_cents: centavos,
  cafe_price_cents: centavos.nullable(),
  effective_cents: centavos,
  updated_at: z.string().nullable()
});

const rows = z.array(row);

function toPrice(parsed: z.infer<typeof row>): CafePrice {
  return {
    productId: parsed.product_id,
    name: parsed.name,
    retailCents: parsed.price_cents,
    defaultCents: parsed.default_cents,
    ownCents: parsed.cafe_price_cents,
    effectiveCents: parsed.effective_cents
  };
}

/** PostgREST answers PGRST202 and Postgres 42883 when the function is not there yet. */
export function missingFunction(error: { code?: string; message?: string }): boolean {
  return (
    error.code === 'PGRST202' ||
    error.code === '42883' ||
    /could not find the function/i.test(error.message ?? '')
  );
}

export async function fetchCafePrices(client: CafePricesClient): Promise<CafePrice[]> {
  const { data, error } = await client.rpc('get_cafe_prices');
  if (error) {
    if (missingFunction(error)) throw new CafePricesUnavailable();
    throw new Error('café price load failed: ' + (error.code || error.message));
  }
  const parsed = rows.safeParse(data ?? []);
  if (!parsed.success) throw new Error('café price load failed: malformed answer');
  return parsed.data.map(toPrice);
}

/** Sets her café price for one product (centavos), or clears it with `null` so the default applies again. */
export async function saveCafePrice(
  client: CafePricesClient,
  productId: string,
  priceCents: number | null
): Promise<CafePrice> {
  if (priceCents !== null && (!Number.isSafeInteger(priceCents) || priceCents < 1)) {
    throw new Error('café price save failed: not a price');
  }
  const { data, error } = await client.rpc('set_cafe_price', {
    p_product_id: productId,
    // The generated argument type has no null; the function reads null as "use the default".
    p_price_cents: priceCents as number
  });
  if (error) {
    if (missingFunction(error)) throw new CafePricesUnavailable();
    throw new Error('café price save failed: ' + (error.code || error.message));
  }
  const parsed = rows.safeParse(data);
  if (!parsed.success || parsed.data.length !== 1) {
    throw new Error('café price save failed: malformed answer');
  }
  return toPrice(parsed.data[0]!);
}

/** What she typed (pesos) as centavos, or the words that say what to fix. Whole centavos from ₱0.01 to ₱1,000,000. */
export function parseCafePesos(text: string): { cents: number } | { error: string } {
  const trimmed = text.trim().replace(/^₱/, '').replace(/,/g, '');
  if (trimmed === '') return { error: 'Type the café price, or use the default.' };
  if (!/^[0-9]+(\.[0-9]{1,2})?$/.test(trimmed)) {
    return { error: 'Use a number like 90 or 90.50.' };
  }
  const cents = pesosToCentavos(Number(trimmed));
  if (cents < 1) return { error: 'The café price must be more than ₱0.' };
  if (cents > 100000000) return { error: 'That is more than ₱1,000,000.' };
  return { cents };
}

/** Centavos as the text of a peso field: 9000 -> "90", 9050 -> "90.50". */
export function cafePesosText(cents: number): string {
  const pesos = centavosToPesos(cents);
  return Number.isInteger(pesos) ? String(pesos) : pesos.toFixed(2);
}
