import { expect, it } from 'vitest';
import { doughFacts, doughStock, sameDoughSubmission } from '@/lib/production/dough';
import type { ProductionRecipeSnapshot } from '@/lib/production/workspace';
import type { ProductionFields } from '@/lib/data/production';
const recipe: ProductionRecipeSnapshot = {
  version: 3,
  yield: 12,
  lines: [
    { name: 'Flour', qty: 300, unit: 'g', kind: 'ingredient' },
    { name: 'Egg', qty: 1, unit: 'pcs', kind: 'ingredient' },
    { name: 'Box', qty: 12, unit: 'pcs', kind: 'packaging' }
  ]
};
it('uses only an active ID-linked item in the recipe unit, never another item with the same name', () => {
  const line = { ...recipe.lines[0]!, itemId: 'linked' };
  const item = { id: 'linked', unit: 'g', onHand: 400, active: true, lastCounted: null };
  expect(doughStock(line, [{ ...item, id: 'other' }])).toEqual({
    balanceText: 'Linked inventory item unavailable',
    short: false
  });
  expect(doughStock(line, [{ ...item, unit: 'ml' }])).toEqual({
    balanceText: 'Inventory uses ml; recipe uses g',
    short: false
  });
  expect(doughStock(line, [{ ...item, active: false }])).toEqual({
    balanceText: 'Inventory item is switched off',
    short: false
  });
  expect(doughStock({ ...line, itemId: null }, [item]).balanceText).toBe(
    'No matching inventory item'
  );
  expect(doughStock(line, [{ ...item, onHand: 0 }])).toMatchObject({ short: false });
  expect(doughStock(line, [{ ...item, onHand: 0, lastCounted: '2026-11-05' }])).toMatchObject({
    short: true
  });
  expect(doughStock(line, [item])).toMatchObject({
    balanceText: '400 g recorded · not counted',
    short: false
  });
});
it.each(['11', '12', '13'])(
  'shows the same full ingredient use for %s actual balls',
  (actualBallsText) => {
    const facts = doughFacts({ pid: 'a', balls: 12, recipeAmount: 1, actualBallsText }, recipe);
    expect(facts.valid).toBe(true);
    expect(facts.lines.map((line) => [line.name, line.qty])).toEqual([
      ['Flour', 300],
      ['Egg', 1]
    ]);
  }
);
it('uses exactly half the recipe even when the predicted yield is odd', () => {
  const facts = doughFacts(
    { pid: 'a', balls: 5, recipeAmount: 0.5, actualBallsText: '6' },
    { ...recipe, yield: 9 }
  );
  expect(facts.lines.map((line) => line.qty)).toEqual([150, 1]);
  expect(facts.valid).toBe(true);
});
it.each(['', '-', '0', '1.5', '10001'])(
  'keeps %j as text without allowing review',
  (actualBallsText) => {
    const facts = doughFacts({ pid: 'a', balls: 12, actualBallsText }, recipe);
    expect(facts.actual).toBe(actualBallsText);
    expect(facts.valid).toBe(false);
  }
);
it('refuses an unavailable or untyped recipe without inventing ingredient use', () => {
  expect(doughFacts({ pid: 'a', balls: 12, actualBallsText: '13' }, null).valid).toBe(false);
  expect(
    doughFacts(
      { pid: 'a', balls: 12, actualBallsText: '13' },
      { ...recipe, lines: [{ ...recipe.lines[0]!, kind: null }] }
    ).lines
  ).toEqual([]);
});
it('compares actual output and amount for new acknowledgements, preserving legacy equality', () => {
  const fields = { kind: 'dough', qty: 13, recipeAmount: 1 } as ProductionFields;
  expect(
    sameDoughSubmission({ pid: 'a', balls: 12, actualBallsText: '13', recipeAmount: 1 }, fields)
  ).toBe(true);
  expect(
    sameDoughSubmission({ pid: 'a', balls: 12, actualBallsText: '13', recipeAmount: 0.5 }, fields)
  ).toBe(false);
  expect(sameDoughSubmission({ pid: 'a', balls: 13 }, { ...fields, recipeAmount: undefined })).toBe(
    true
  );
});
