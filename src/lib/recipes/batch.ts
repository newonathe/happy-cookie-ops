import { stockConfidence } from '@/lib/stock/stock-status';
/**
 * Working a saved recipe out for a batch size, for the owner to read while baking. It only reads:
 * nothing here records production or takes stock off. A recipe with no yield cannot be scaled.
 */
export interface BatchLine {
  name: string;
  qty: number;
  unit: string;
  kind?: 'ingredient' | 'packaging' | null;
}

export interface StockOnHand {
  name: string;
  unit: string;
  onHand: number;
  counted: boolean;
}

export type BatchStockState = 'enough' | 'short' | 'notCounted' | 'notTracked' | 'unavailable';

export interface BatchStockRow {
  name: string;
  needed: number;
  unit: string;
  state: BatchStockState;
  /** How much is missing when `state` is `short`; 0 otherwise. */
  short: number;
}

/** The quantity for `cookies`, kept to three decimals, as stock quantities are. Null when it cannot be worked out. */
export function scaleQty(qty: number, savedYield: number, cookies: number): number | null {
  if (!(savedYield > 0) || !(cookies > 0) || !Number.isFinite(qty)) return null;
  return Math.round(((qty * cookies) / savedYield) * 1000) / 1000;
}

/** Each line against recorded stock. A count is never assumed: an uncounted item says so, and is not "enough". */
export function batchStock(
  lines: readonly BatchLine[],
  stock: readonly StockOnHand[] | null | undefined,
  savedYield: number,
  cookies: number
): BatchStockRow[] {
  return lines.map((line) => {
    const needed = scaleQty(line.qty, savedYield, cookies) ?? 0;
    if (!stock) return { name: line.name, needed, unit: line.unit, state: 'unavailable', short: 0 };
    const item = stock.find((row) => row.name === line.name);
    if (!item) return { name: line.name, needed, unit: line.unit, state: 'notTracked', short: 0 };
    if (stockConfidence(item.onHand, item.counted) === 'unavailable')
      return { name: line.name, needed, unit: line.unit, state: 'unavailable', short: 0 };
    if (stockConfidence(item.onHand, item.counted) === 'unknown')
      return { name: line.name, needed, unit: line.unit, state: 'notCounted', short: 0 };
    // Units that differ cannot be compared, so nothing is claimed about them.
    if (item.unit !== line.unit)
      return { name: line.name, needed, unit: line.unit, state: 'notTracked', short: 0 };
    const short = Math.round(Math.max(0, needed - item.onHand) * 1000) / 1000;
    return {
      name: line.name,
      needed,
      unit: line.unit,
      state: short > 0 ? 'short' : 'enough',
      short
    };
  });
}
