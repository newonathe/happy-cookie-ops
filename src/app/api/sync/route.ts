import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

/**
 * Intake for the offline bazaar queue.
 *
 * Contract: the device posts everything it is holding; the reply names exactly which
 * client ids are now safely stored. The device clears only those. A sale that fails
 * validation is reported per row rather than failing the batch, because one malformed
 * row must not block the rest of the day's takings.
 *
 * Idempotency is the database's job (sync_event_sale, migration 20260101000100).
 */
const Sale = z.object({
  clientId: z.string().min(3).max(120),
  saleId: z.string().min(1),
  eventId: z.string().uuid().nullable().optional(),
  items: z.record(z.string(), z.number().int().min(1).max(999)),
  gross: z.number().min(0).max(1_000_000),
  discount: z.number().min(0).max(1_000_000),
  total: z.number().min(0).max(1_000_000),
  pay: z.string().max(40),
  ref: z.string().max(120).default(''),
  clerk: z.string().max(80).default(''),
  at: z.number().int().positive(),
  tendered: z.number().min(0).default(0),
  change: z.number().min(0).default(0)
});

const Body = z.object({ sales: z.array(Sale).min(1).max(200) });

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  const accepted: string[] = [];
  const rejected: Array<{ clientId: string; error: string }> = [];

  for (const sale of parsed.data.sales) {
    const { error } = await supabase.rpc('sync_event_sale', { p_sale: sale });
    if (error) rejected.push({ clientId: sale.clientId, error: error.message });
    else accepted.push(sale.clientId);
  }

  return NextResponse.json(
    { accepted, rejected },
    { status: rejected.length && !accepted.length ? 502 : 200 }
  );
}
