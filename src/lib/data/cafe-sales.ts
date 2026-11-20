import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { CafePricesUnavailable, missingFunction } from '@/lib/data/cafe-prices';
import { pesosToCentavos } from '@/lib/money';

/**
 * The café sale log, owner only (migration 20260101009600). A café sale is a sale Cine has already made in bulk to a café and logs
 * afterwards: the database stores it paid in full and handed over on the sale date, adds up the total itself and keeps it off every
 * customer page. It never goes through the Orders list. A hosted database without the migration answers "no such function": that is
 * `CafePricesUnavailable`, shown as a note, never a crash.
 */
export type CafeSalesClient = Pick<SupabaseClient<Database>, 'rpc'>;

/** The oldest sale date the database takes, in days before today. */
export const CAFE_SALE_DAYS_BACK = 90;

export type CafeSaleLine = { productId: string; qty: number; unitCents: number };
export type CafeSaleInput = {
  clientId: string;
  name: string;
  /** Manila date, YYYY-MM-DD: today or up to 90 days back. */
  saleDate: string;
  /** "Cash" or the label of an active payment method. */
  payMethod: string;
  notes: string;
  /** Take the cookies and the packaging off stock, as when she packs an order. */
  takeStock: boolean;
  lines: CafeSaleLine[];
};
export type CafeSaleSaved = {
  orderNo: string;
  totalCents: number;
  saleDate: string;
  replayed: boolean;
  /** Whether the sale takes slots in its week (her setting when it was logged). */
  takesSlots: boolean;
  /** What stock could not cover, in words ("Loose cookies (no packaging rule)"); empty when nothing was short. */
  short: string[];
};
export type CafeSaleRow = {
  orderNo: string;
  name: string;
  saleDate: string;
  totalCents: number;
  payMethod: string;
  /** False only for a café order entered before the log existed that was never paid. */
  paid: boolean;
  cookies: number;
  notes: string;
};

/** The words for what stopped a save; `retryable` says whether the same sale can be sent again unchanged. */
export class CafeSaleRefused extends Error {
  constructor(
    message: string,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = 'CafeSaleRefused';
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

const shortItem = z.object({
  name: z.string(),
  why: z.string().optional()
});
const savedRows = z
  .array(
    z.object({
      order_no: z.string().min(1),
      total_cents: bigint,
      sale_date: z.string(),
      replayed: z.boolean(),
      takes_slots: z.boolean(),
      short: z.array(shortItem)
    })
  )
  .length(1);

const saleRows = z.array(
  z.object({
    order_no: z.string().min(1),
    name: z.string(),
    sale_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    total_cents: bigint,
    pay_method: z.string(),
    pay_state: z.string(),
    cookies: bigint,
    notes: z.string()
  })
);

/** The exact body the database takes: nothing else is sent, never a total, a role, a state or a time. */
export function cafeSaleBody(input: CafeSaleInput) {
  return {
    clientId: input.clientId,
    name: input.name.trim(),
    saleDate: input.saleDate,
    payMethod: input.payMethod.trim(),
    notes: input.notes.trim(),
    takeStock: input.takeStock,
    lines: input.lines.map((l) => ({
      productId: l.productId,
      qty: l.qty,
      unitCents: l.unitCents
    }))
  };
}

export async function recordCafeSale(
  client: CafeSalesClient,
  input: CafeSaleInput
): Promise<CafeSaleSaved> {
  const { data, error } = await client.rpc('record_cafe_sale', { p_sale: cafeSaleBody(input) });
  if (error) {
    if (missingFunction(error)) throw new CafePricesUnavailable();
    if (error.code === 'ZC002') {
      const details = (error as { details?: string | null }).details;
      const left = details ? Number(details) : Number.NaN;
      throw new CafeSaleRefused(
        Number.isFinite(left)
          ? `There is not enough room in that week. ${left} cookie slots are left. Pick another date, or turn off "Café orders count toward the weekly limit" in the order settings.`
          : 'There is not enough room in that week.',
        false
      );
    }
    if (error.code === 'ZB001')
      throw new CafeSaleRefused(
        'Those cookies have already left the kitchen for a Bazaar. Untick taking them off stock, or log a smaller sale.',
        false
      );
    if (error.code === '22023')
      throw new CafeSaleRefused(
        'The sale was not accepted. Check the name, the date, how it was paid, the quantities and the prices.',
        false
      );
    if (error.code === '23505')
      throw new CafeSaleRefused(
        'This sale number was already used for a different sale. Start the sale again.',
        false
      );
    if (error.code === '42501')
      throw new CafeSaleRefused('Only the owner can log a café sale.', false);
    throw new CafeSaleRefused('The sale was not saved. Check your connection and try again.', true);
  }
  const parsed = savedRows.safeParse(data);
  // An answer we cannot read is not a failure to retry blindly: the sale may exist. Same id again answers with it.
  if (!parsed.success) throw new CafeSaleRefused('The sale may have been saved. Try again.', true);
  const row = parsed.data[0]!;
  return {
    orderNo: row.order_no,
    totalCents: row.total_cents,
    saleDate: row.sale_date,
    replayed: row.replayed,
    takesSlots: row.takes_slots,
    short: row.short.map((s) => (s.why ? `${s.name} (${s.why})` : s.name))
  };
}

/** The logged sales, newest first (the database's order). */
export async function fetchCafeSales(client: CafeSalesClient): Promise<CafeSaleRow[]> {
  const { data, error } = await client.rpc('get_cafe_sales');
  if (error) {
    if (missingFunction(error)) throw new CafePricesUnavailable();
    throw new Error('café sales load failed: ' + (error.code || error.message));
  }
  const parsed = saleRows.safeParse(data);
  if (!parsed.success) throw new Error('café sales load failed: malformed answer');
  return parsed.data.map((r) => ({
    orderNo: r.order_no,
    name: r.name,
    saleDate: r.sale_date,
    totalCents: r.total_cents,
    payMethod: r.pay_method,
    paid: r.pay_state === 'confirmed',
    cookies: r.cookies,
    notes: r.notes
  }));
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

/** A Manila date (YYYY-MM-DD) some days earlier or later, on the calendar: no time zone is involved. */
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export type CafeFormCheck = {
  /** Words for the first thing to fix in each header field, if any. */
  name?: string;
  date?: string;
  method?: string;
  lines?: string;
  /** Per product id: what is wrong with a line that has a quantity. */
  lineErrors: Record<string, { qty?: string; price?: string }>;
  /** The lines to send (those with a quantity), when everything is valid. */
  send: CafeSaleLine[];
  /** For display only; the database computes the real total. */
  totalCents: number;
  ok: boolean;
};

/** Checks the form as typed. A line with a blank quantity is not on the sale. */
export function checkCafeForm(
  form: { name: string; saleDate: string; payMethod: string; lines: CafeFormLine[] },
  today: string
): CafeFormCheck {
  const out: CafeFormCheck = { lineErrors: {}, send: [], totalCents: 0, ok: false };
  const name = form.name.trim();
  if (!name) out.name = 'Type the café’s name.';
  else if (name.length > 80) out.name = 'The name is at most 80 characters.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.saleDate)) out.date = 'Pick the date of the sale.';
  else if (form.saleDate > today) out.date = 'The sale date cannot be after today.';
  else if (form.saleDate < addDays(today, -CAFE_SALE_DAYS_BACK))
    out.date = `The sale date is at most ${CAFE_SALE_DAYS_BACK} days ago.`;
  if (!form.payMethod.trim()) out.method = 'Choose the payment method.';
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
  if (!bad && out.totalCents > 100000000) out.lines = 'The sale total is more than ₱1,000,000.';
  out.ok = !out.name && !out.date && !out.method && !out.lines && !bad;
  return out;
}
