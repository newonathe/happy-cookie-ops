import { describe, expect, it } from 'vitest';
import { batchStock, scaleQty } from '@/lib/recipes/batch';

describe('working a recipe out for a batch', () => {
  it('scales by the saved yield', () => {
    expect(scaleQty(250, 12, 24)).toBe(500);
    expect(scaleQty(100, 12, 6)).toBe(50);
    expect(scaleQty(1, 3, 1)).toBe(0.333);
  });

  it.each([
    [0, 12],
    [12, 0],
    [-1, 12],
    [12, -1]
  ])('cannot scale a yield of %s for %s cookies', (savedYield, cookies) => {
    expect(scaleQty(100, savedYield, cookies)).toBeNull();
  });

  const lines = [
    { name: 'Flour', qty: 100, unit: 'g' },
    { name: 'Sugar', qty: 100, unit: 'g' },
    { name: 'Butter', qty: 100, unit: 'g' },
    { name: 'Salt', qty: 1, unit: 'g' },
    { name: 'Milk', qty: 100, unit: 'ml' }
  ];
  const stock = [
    { name: 'Flour', unit: 'g', onHand: 500, counted: true },
    { name: 'Sugar', unit: 'g', onHand: 150, counted: true },
    { name: 'Butter', unit: 'g', onHand: 900, counted: false },
    { name: 'Milk', unit: 'L', onHand: 5, counted: true }
  ];

  it('says what is enough and short, and how much', () => {
    const rows = batchStock(lines, stock, 12, 24);
    expect(rows[0]).toMatchObject({ name: 'Flour', state: 'enough', needed: 200, short: 0 });
    expect(rows[1]).toMatchObject({ name: 'Sugar', state: 'short', needed: 200, short: 50 });
  });

  it('preserves a meaningful recorded balance even without a physical count date', () => {
    expect(batchStock(lines, stock, 12, 12)[2]?.state).toBe('enough');
    expect(
      batchStock(
        lines,
        stock.map((row) => ({ ...row, onHand: 0, counted: false })),
        12,
        12
      )[2]?.state
    ).toBe('notCounted');
  });

  it('keeps unread and malformed stock unavailable instead of substituting zero', () => {
    expect(batchStock(lines, null, 12, 12).every((row) => row.state === 'unavailable')).toBe(true);
    expect(
      batchStock(
        lines,
        stock.map((row) => ({ ...row, onHand: Number.NaN })),
        12,
        12
      )[0]?.state
    ).toBe('unavailable');
  });

  it('claims nothing about an item it does not hold, or one in another unit', () => {
    const rows = batchStock(lines, stock, 12, 12);
    expect(rows[3]?.state).toBe('notTracked');
    expect(rows[4]?.state).toBe('notTracked');
  });
});
