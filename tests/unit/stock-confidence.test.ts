import { expect, it } from 'vitest';
import { stockConfidence } from '@/lib/stock/stock-status';
it.each([
  [0, false, 'unknown'],
  [0, true, 'counted'],
  [500, false, 'recorded'],
  [500, true, 'counted'],
  [Number.NaN, false, 'unavailable'],
  [Infinity, true, 'unavailable']
] as const)('classifies %s with physical-count flag %s as %s', (quantity, counted, status) => {
  expect(stockConfidence(quantity, counted)).toBe(status);
});
