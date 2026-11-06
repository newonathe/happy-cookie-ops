import { expect, it, vi } from 'vitest';
import { productionHandoff } from '@/lib/production/handoff';
import { productionPlanner } from '@/lib/production/planner';
import type { ProductionRecoveryEntry } from '@/lib/production/recovery';
const products = ['a', 'b'].map((id) => ({
  id,
  name: 'Cookie ' + id,
  photo: '',
  yield: 12,
  version: 3,
  needed: null
}));
const proposal = (quantity = '48', version = 3) => ({
  source: 'recipe' as const,
  rows: [{ productId: 'a', quantity, version }]
});
const existing = (): ProductionRecoveryEntry => ({
  dropNo: 5,
  productId: '',
  quantity: '',
  version: 0,
  choices: [{ productId: 'b', quantity: '24', version: 3, kind: 'batch' }],
  reviewing: true
});
it.each(['6', '12', '48'])(
  'carries %s cookies and requires an explicit production type',
  (quantity) => {
    const result = productionHandoff(existing(), proposal(quantity), products, 5);
    expect(result.error).toBeNull();
    expect(result.entry?.choices).toMatchObject([
      { productId: 'b', quantity: '24', kind: 'batch' },
      { productId: 'a', quantity, version: 3, kind: 'choose' }
    ]);
    expect(result.entry?.reviewing).toBe(false);
  }
);
it('retains a conflicting setup and offers deliberate keep or replacement', () => {
  const entry = existing();
  entry.choices!.push({ productId: 'a', quantity: '8', version: 3, kind: 'batch' });
  const before = structuredClone(entry);
  const pending = productionHandoff(entry, proposal(), products, 5).entry!;
  expect(pending.choices).toEqual(before.choices);
  expect(pending.handoff).toEqual(proposal());
  const begin = vi.fn(() => true);
  const planner = productionPlanner(pending, {
    get: () => ({ entry: pending, products }),
    set: () => {},
    begin
  });
  expect(planner.review()).toBe(false);
  expect(planner.begin()).toBe(false);
  expect(begin).not.toHaveBeenCalled();
  const replaced = productionHandoff(pending, pending.handoff!, products, 5, true).entry!;
  expect(replaced.choices).toMatchObject([
    { productId: 'b', quantity: '24' },
    { productId: 'a', quantity: '48', kind: 'choose' }
  ]);
  expect(replaced.handoff).toBeUndefined();
  expect(entry).toEqual(before);
});

it.each(['8', '99'])(
  'retains an unresolved incoming proposal when another %s-cookie proposal arrives',
  (quantity) => {
    const entry = existing();
    entry.choices!.push({ productId: 'a', quantity: '8', version: 3, kind: 'batch' });
    const pending = productionHandoff(entry, proposal(), products, 5).entry!;
    const before = structuredClone(pending);
    const next = productionHandoff(pending, proposal(quantity), products, 5);
    expect(next.entry).toBe(pending);
    expect(next.error).toContain('Resolve the incoming plan');
    expect(pending).toEqual(before);
  }
);
it.each(['', '0', '1.5', '10001'])(
  'refuses invalid quantity %j without replacing the existing setup',
  (quantity) => {
    const entry = existing(),
      result = productionHandoff(entry, proposal(quantity), products, 5);
    expect(result.entry).toBe(entry);
    expect(result.error).toBeTruthy();
  }
);
it('refuses stale or unavailable sources and another period', () => {
  const entry = existing();
  expect(productionHandoff(entry, proposal('48', 2), products, 5).error).toBeTruthy();
  expect(productionHandoff(entry, proposal(), [], 5).entry).toBe(entry);
  expect(productionHandoff(entry, proposal(), products, 6).entry).toBe(entry);
});
it('keeps an explicit existing type when incoming quantities and version already agree', () => {
  const entry = existing();
  entry.choices!.push({ productId: 'a', quantity: '12', version: 3, kind: 'dough' });
  expect(
    productionHandoff(entry, proposal('12'), products, 5).entry?.choices?.find(
      (row) => row.productId === 'a'
    )?.kind
  ).toBe('dough');
});
it('retains transferred cookie quantity while the owner deliberately chooses dough then bake', () => {
  let entry = productionHandoff(null, proposal(), products, 5).entry!;
  const begin = vi.fn(() => true);
  const planner = () =>
    productionPlanner(entry, {
      get: () => ({ entry, products }),
      set: (value) => {
        entry = value;
      },
      begin
    });
  expect(planner().review()).toBe(false);
  planner().setQuantity('a', '52');
  planner().setKind('a', 'dough');
  expect(entry.choices?.[0]).toMatchObject({ kind: 'dough', quantity: '12', batchQuantity: '52' });
  planner().setKind('a', 'batch');
  expect(entry.choices?.[0]).toMatchObject({ kind: 'batch', quantity: '52' });
  expect(planner().review()).toBe(true);
  expect(planner().begin()).toBe(true);
});
