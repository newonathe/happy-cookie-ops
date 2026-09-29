import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/types/database';
import { centavosToPesos } from '@/lib/money';

/**
 * The stock ledger (C1; `record_stock_movement` / `get_last_paid`, migration 20260101004600). The quantity on hand of an item
 * is the sum of its movements: an opening quantity, receipts (a cost also writes the books, once), counts (the total counted),
 * waste and adjustments (a reason each). The database enforces every bound and never takes more out than is there;
 * `movementError` mirrors them so a sure refusal is never sent. Quantities are in the item's own unit.
 */
export type LedgerClient = Pick<SupabaseClient<Database>, 'rpc'>;

export type MovementKind = 'opening' | 'receipt' | 'count' | 'waste' | 'adjust';

export interface MovementFields {
  /** A uuid minted once per action: a retry of the same action is answered, never applied twice. */
  id: string;
  itemId: string;
  kind: MovementKind;
  /** A count is the total counted; an adjustment is signed; the rest are above 0. */
  qty: number;
  /** Centavos, for a receipt; null for everything else. */
  costCents: number | null;
  supplier: string;
  reason: string;
  /** Epoch milliseconds. */
  at: number;
}

export interface MovementResult {
  outcome: 'saved' | 'refused' | 'offline';
  onHand: number | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const KINDS: readonly string[] = ['opening', 'receipt', 'count', 'waste', 'adjust'];

const decimal3 = (v: number): boolean =>
  Number.isFinite(v) && Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6;

/** The same bounds `record_stock_movement` enforces. Null means the movement is acceptable. */
export function movementError(f: MovementFields): string | null {
  if (!UUID.test(f.id) || f.itemId === '')
    return 'This change has no id yet. Reload and try again.';
  if (!KINDS.includes(f.kind)) return 'That kind of change is not one the stock ledger knows.';
  if (!decimal3(f.qty) || Math.abs(f.qty) > 999_999_999)
    return 'Enter a quantity with at most 3 decimals.';
  if (f.kind === 'count' && f.qty < 0) return 'A count cannot be below 0.';
  if (f.kind === 'adjust' && f.qty === 0) return 'Type how much to add or subtract.';
  if ((f.kind === 'opening' || f.kind === 'receipt' || f.kind === 'waste') && f.qty <= 0)
    return 'Enter an amount above 0.';
  if (f.costCents !== null) {
    if (f.kind !== 'receipt') return 'Only a delivery has a cost.';
    if (!Number.isInteger(f.costCents) || f.costCents < 0 || f.costCents > 100_000_000)
      return 'A cost is from ₱0 to ₱1,000,000.';
  }
  const supplier = f.supplier.trim();
  const reason = f.reason.trim();
  if (supplier.length > 80 || reason.length > 80 || CONTROL.test(supplier + reason))
    return 'The supplier and the reason are at most 80 characters.';
  if ((f.kind === 'waste' || f.kind === 'adjust') && reason === '') return 'Give a reason.';
  if (!Number.isInteger(f.at) || f.at < 100_000_000_000 || f.at > 99_999_999_999_999)
    return 'The time is not valid.';
  return null;
}

/**
 * Sends one movement. `saved` includes an identical retry (the database answers it without applying it twice). A refusal is
 * a bound broken or an item switched off; anything else (no signal, a timeout) is `offline`, and the caller tells her nothing was kept.
 */
export async function recordStockMovement(
  client: LedgerClient,
  f: MovementFields
): Promise<MovementResult> {
  try {
    const { data, error } = await client.rpc('record_stock_movement', {
      p_movement: {
        id: f.id,
        item_id: f.itemId,
        kind: f.kind,
        qty: f.qty,
        cost_cents: f.costCents,
        supplier: f.supplier.trim(),
        reason: f.reason.trim(),
        at: f.at
      }
    });
    if (error) {
      const code = error.code ?? '';
      return {
        outcome: ['22023', '23505', '42501', 'P0002', '23503'].includes(code)
          ? 'refused'
          : 'offline',
        onHand: null
      };
    }
    const row = Array.isArray(data) ? (data[0] as unknown) : null;
    const onHand =
      typeof row === 'object' &&
      row !== null &&
      typeof (row as { on_hand?: unknown }).on_hand === 'number'
        ? (row as { on_hand: number }).on_hand
        : null;
    return { outcome: 'saved', onHand };
  } catch {
    return { outcome: 'offline', onHand: null };
  }
}

/** What was last paid for an item: the total spent and the quantity it bought (the cost per unit is spend over quantity). */
export interface LastPaid {
  itemName: string;
  costCents: number;
  qty: number;
  supplier: string;
  at: number;
}

export function parseLastPaid(json: Json | null | undefined): LastPaid[] | null {
  if (!Array.isArray(json)) return null;
  const out: LastPaid[] = [];
  for (const r of json) {
    if (
      typeof r !== 'object' ||
      r === null ||
      Array.isArray(r) ||
      typeof r.item_name !== 'string' ||
      typeof r.cost_cents !== 'number' ||
      typeof r.qty !== 'number' ||
      typeof r.supplier !== 'string' ||
      typeof r.at !== 'number'
    )
      return null;
    out.push({
      itemName: r.item_name,
      costCents: r.cost_cents,
      qty: r.qty,
      supplier: r.supplier,
      at: r.at
    });
  }
  return out;
}

export async function fetchLastPaid(client: LedgerClient): Promise<LastPaid[]> {
  const { data, error } = await client.rpc('get_last_paid');
  if (error) throw new Error('last paid load failed: ' + (error.code || error.message));
  const rows = parseLastPaid(data);
  if (!rows) throw new Error('last paid answer was not understood');
  return rows;
}

/** `state.paid` as the engine's cost per unit reads it: `price` is what was spent in total for `qty`, in pesos. */
export function enginePaid(
  rows: readonly LastPaid[]
): Record<string, { price: number; qty: number; supplier: string; at: number }> {
  const out: Record<string, { price: number; qty: number; supplier: string; at: number }> = {};
  for (const r of rows)
    out[r.itemName] = {
      price: centavosToPesos(r.costCents),
      qty: r.qty,
      supplier: r.supplier,
      at: r.at
    };
  return out;
}
