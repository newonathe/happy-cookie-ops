import { describe, expect, it } from 'vitest';
import { parseBazaar } from '@/lib/data/bazaar-days';
import { kitchenTransferStock } from '@/lib/bazaar/kitchen-transfer-stock';
import example from '../fixtures/bazaar-example.json';

describe('fresh kitchen transfer readback in a held till', () => {
  it('preserves unsent sales and applies cumulative incoming once across retries', () => {
    const day = parseBazaar(example)!.days[0],
      pid = day.lines[0].productId;
    day.lines = day.lines.slice(0, 1);
    day.lines[0].made = 4;
    day.lines[0].carried = 0;
    const first = kitchenTransferStock(day, { [pid]: 0 }, { [pid]: 0 })!;
    expect(first.eventStock[pid]).toBe(4);
    const afterLocalSales = { ...first.eventStock, [pid]: 1 };
    const replay = kitchenTransferStock(day, first.eventLoaded, afterLocalSales)!;
    expect(replay.eventStock[pid]).toBe(1);
    day.lines[0].made = 6;
    const fresh = kitchenTransferStock(day, replay.eventLoaded, replay.eventStock)!;
    expect(fresh.eventStock[pid]).toBe(3);
    expect(afterLocalSales[pid]).toBe(1);
  });
  it('refuses missing or regressed baselines instead of inventing available cookies', () => {
    const day = parseBazaar(example)!.days[0],
      pid = day.lines[0].productId;
    day.lines = day.lines.slice(0, 1);
    day.lines[0].made = 4;
    day.lines[0].carried = 0;
    expect(kitchenTransferStock(day, {}, {})).toBeNull();
    expect(kitchenTransferStock(day, { [pid]: 5 }, { [pid]: 2 })).toBeNull();
    expect(kitchenTransferStock(day, { [pid]: NaN }, { [pid]: 2 })).toBeNull();
  });
});
