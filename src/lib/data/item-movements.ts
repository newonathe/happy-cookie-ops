import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { centavosToPesos, costCentavosToPesos } from '@/lib/money';

/**
 * One stock item's history, for the owner's item page (B5-1; migration 20260101006600 `get_item_movements`, owner only). The database
 * answers newest first (by the order the movements were applied) and never says who wrote one; this keeps that order and keeps no
 * person. Money is converted to pesos in `toPesos` below and nowhere else; an unknown cost is null, never 0.
 *
 * `missing`: the database has no `get_item_movements` yet (PostgREST PGRST202, Postgres 42883 or an HTTP 404), as `fetchShopIdentity`.
 * Every other error, a malformed answer (one malformed row fails the read) and a thrown call are `failed`. Never throws.
 */
export type MovementsClient = Pick<SupabaseClient<Database>, 'rpc'>;

export const MOVEMENT_KINDS = ['opening', 'receipt', 'count', 'waste', 'adjust', 'use'] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

export const COST_SOURCES = ['average', 'usual', 'supplier', 'legacy'] as const;
export type CostSource = (typeof COST_SOURCES)[number];

export interface ItemMovement {
  id: string;
  kind: MovementKind;
  /** The change in the stock on hand, signed, in the item's unit. */
  qtyDelta: number;
  /** Pesos per unit stamped when it was written; null when no cost was known. */
  unitCost: number | null;
  costSource: CostSource | null;
  /** Pesos a receipt paid in all; null when it paid nothing or is not a receipt. */
  paid: number | null;
  supplier: string;
  reason: string;
  /** Epoch milliseconds. */
  at: number;
}

export type MovementsRead =
  { status: 'ok'; rows: ItemMovement[] } | { status: 'missing' } | { status: 'failed' };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** A number, or a numeric text; anything else is not a number. */
function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * The one conversion to pesos. `unit_cost` is centavos per unit with up to six decimals; `paid_cents` is whole centavos. `undefined`:
 * the value cannot be read at all (the row is malformed); null: there is none.
 */
function toPesos(value: unknown, kind: 'unit' | 'paid'): number | null | undefined {
  if (value === null || value === undefined) return value === null ? null : undefined;
  const n = num(value);
  if (n === null) return undefined;
  if (kind === 'unit') return n > 0 ? costCentavosToPesos(n) : undefined;
  return Number.isSafeInteger(n) && n >= 0 ? centavosToPesos(n) : undefined;
}

function parseRow(raw: unknown): ItemMovement | null {
  if (!isObj(raw)) return null;
  if (typeof raw.id !== 'string' || raw.id === '') return null;
  if (!MOVEMENT_KINDS.includes(raw.kind as MovementKind)) return null;
  const qtyDelta = num(raw.qty_delta);
  if (qtyDelta === null) return null;
  const unitCost = toPesos(raw.unit_cost, 'unit');
  const paid = toPesos(raw.paid_cents, 'paid');
  if (unitCost === undefined || paid === undefined) return null;
  const source = raw.cost_source;
  if (source !== null && !COST_SOURCES.includes(source as CostSource)) return null;
  // The database stamps a cost and where it came from together, or neither.
  if ((unitCost === null) !== (source === null)) return null;
  if (typeof raw.supplier !== 'string' || typeof raw.reason !== 'string') return null;
  if (typeof raw.at !== 'number' || !Number.isSafeInteger(raw.at)) return null;
  return {
    id: raw.id,
    kind: raw.kind as MovementKind,
    qtyDelta,
    unitCost,
    costSource: source as CostSource | null,
    paid,
    supplier: raw.supplier,
    reason: raw.reason,
    at: raw.at
  };
}

export async function fetchItemMovements(
  client: MovementsClient,
  itemId: string,
  limit: number
): Promise<MovementsRead> {
  try {
    const { data, error, status } = await client.rpc('get_item_movements', {
      p_item: itemId,
      p_limit: limit
    });
    if (error) {
      const code = error.code;
      if (code === 'PGRST202' || code === '42883' || status === 404) return { status: 'missing' };
      return { status: 'failed' };
    }
    if (!Array.isArray(data)) return { status: 'failed' };
    const rows: ItemMovement[] = [];
    for (const raw of data as unknown[]) {
      const row = parseRow(raw);
      if (!row) return { status: 'failed' };
      rows.push(row);
    }
    return { status: 'ok', rows };
  } catch {
    return { status: 'failed' };
  }
}
