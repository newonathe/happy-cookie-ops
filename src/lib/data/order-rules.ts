import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { classifySaveError, type SaveOutcome } from '@/lib/data/payments';

/**
 * The owner's order rules (B3; `get_order_rules` / `save_order_rules`, migration 20260101003500):
 * how long an unpaid order holds its slots, how many unpaid orders one number may have, the
 * pickup days, the lead window, the pickup hours and the campus slot. The database enforces every
 * bound; `orderRulesError` mirrors them so a sure refusal is never sent.
 */
export type OrderRulesClient = Pick<SupabaseClient<Database>, 'rpc'>;
export type OrderRulesRow = Database['public']['Functions']['get_order_rules']['Returns'][number];
export type OrderRulesFields = Omit<OrderRulesRow, 'updated_at'>;

const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const whole = (v: unknown, min: number, max: number): boolean =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** The same bounds `save_order_rules` enforces. Null means the rules are acceptable. */
export function orderRulesError(f: OrderRulesFields): string | null {
  if (!whole(f.unpaid_hold_hours, 1, 168))
    return 'Unpaid orders hold their slots for 1 to 168 hours.';
  if (!whole(f.max_unpaid_per_phone, 1, 20)) return 'Unpaid orders per number: 1 to 20.';
  if (
    !Array.isArray(f.pickup_days) ||
    f.pickup_days.length < 1 ||
    !f.pickup_days.every((d) => whole(d, 1, 7))
  )
    return 'Pick at least one pickup day.';
  if (!whole(f.lead_min_days, 1, 30)) return 'The earliest pickup is 1 to 30 days ahead.';
  if (!whole(f.lead_max_days, 1, 60)) return 'The latest pickup is 1 to 60 days ahead.';
  if (f.lead_min_days > f.lead_max_days) return 'The earliest pickup cannot be after the latest.';
  if (!whole(f.pickup_from_hour, 0, 23)) return 'Pickup starts at an hour from 0 to 23.';
  if (!whole(f.pickup_cutoff_hour, 1, 24)) return 'Pickup ends at an hour from 1 to 24.';
  if (f.pickup_from_hour >= f.pickup_cutoff_hour) return 'Pickup must start before it ends.';
  if (!HHMM.test(f.campus_from) || !HHMM.test(f.campus_to)) return 'Campus times look like 14:00.';
  if (f.campus_from >= f.campus_to) return 'The campus slot must start before it ends.';
  return null;
}

export async function fetchOrderRules(client: OrderRulesClient): Promise<OrderRulesRow | null> {
  const { data, error } = await client.rpc('get_order_rules');
  if (error) throw new Error('order rules load failed: ' + (error.code || error.message));
  return Array.isArray(data) && data[0] ? (data[0] as OrderRulesRow) : null;
}

export async function saveOrderRules(
  client: OrderRulesClient,
  fields: OrderRulesFields,
  expectedUpdatedAt: string
): Promise<SaveOutcome> {
  try {
    const { error } = await client.rpc('save_order_rules', {
      p_rules: {
        unpaid_hold_hours: fields.unpaid_hold_hours,
        max_unpaid_per_phone: fields.max_unpaid_per_phone,
        pickup_days: [...fields.pickup_days],
        lead_min_days: fields.lead_min_days,
        lead_max_days: fields.lead_max_days,
        pickup_from_hour: fields.pickup_from_hour,
        pickup_cutoff_hour: fields.pickup_cutoff_hour,
        campus_from: fields.campus_from,
        campus_to: fields.campus_to
      },
      p_expected_updated_at: expectedUpdatedAt
    });
    return classifySaveError(error);
  } catch {
    return 'offline';
  }
}
