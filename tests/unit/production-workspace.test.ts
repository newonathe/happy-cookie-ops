import { describe, expect, it } from 'vitest';
import { ProductionWorkspace, type NewProductionWork } from '@/lib/production/workspace';

const source = (id = 'dcf'): NewProductionWork => ({
  product: {
    id,
    name: id === 'dcf' ? 'Double Chocolate Fudge' : 'White Chocolate Biscoff',
    photo: '/cookie.webp'
  },
  recipe: {
    version: 3,
    yield: 12,
    lines: [
      { name: 'Butter', qty: 200, unit: 'g', kind: 'ingredient' },
      { name: 'Pouch', qty: 12, unit: 'pcs', kind: 'packaging' },
      { name: 'Legacy line', qty: 1, unit: 'pcs', kind: null }
    ]
  },
  dropNo: 17,
  draft: { kind: 'batch', target: 24, actual: '', rejects: '0', adj: {}, note: '', step: 1 }
});
const workspace = () => {
  let n = 0;
  return new ProductionWorkspace(() => `work-${++n}`);
};

describe('independent unconfirmed production work', () => {
  it('switches between flavours without losing counts, adjustments, note or review step', () => {
    const w = workspace();
    const a = w.add(source());
    const first = w.get(a)!;
    expect(
      w.update(a, first.revision, {
        ...first.draft,
        kind: 'batch',
        target: 24,
        actual: '26',
        rejects: '2',
        adj: { Butter: -1 },
        note: 'Tray two',
        step: 2
      })
    ).toBe(true);
    const b = w.add(source('wcb'));
    expect(w.selectedId).toBe(b);
    expect(w.select(a)).toBe(true);
    expect(w.get(a)?.draft).toEqual({
      kind: 'batch',
      target: 24,
      actual: '26',
      rejects: '2',
      adj: { Butter: -1 },
      note: 'Tray two',
      step: 2
    });
    expect(w.get(b)?.draft).toMatchObject({ actual: '', rejects: '0', step: 1 });
    w.leave();
    expect(w.selectedId).toBeNull();
    expect(w.list()).toHaveLength(2);
    expect(w.select(b)).toBe(true);
  });

  it('keeps distinct identities for two identical batches and a dough mix of that product', () => {
    const w = workspace();
    const a = w.add(source()),
      b = w.add(source());
    const d = w.add({ ...source(), draft: { kind: 'dough', balls: '', note: 'Rest overnight' } });
    expect(new Set([a, b, d]).size).toBe(3);
    expect(w.list().map((x) => x.draft.kind)).toEqual(['batch', 'batch', 'dough']);
    expect(w.update(d, 0, { kind: 'dough', balls: '12', note: 'Rest overnight' })).toBe(true);
    expect(w.get(a)?.draft).toMatchObject({ actual: '' });
  });

  it('snapshots product, recipe kinds and period independently of changing source objects', () => {
    const w = workspace(),
      input = source();
    const id = w.add(input);
    input.product.name = 'Renamed';
    input.recipe!.lines[0].qty = 999;
    input.recipe!.version = 4;
    input.dropNo = 18;
    const saved = w.get(id)!;
    expect(saved.product.name).toBe('Double Chocolate Fudge');
    expect(saved.recipe).toMatchObject({ version: 3, yield: 12 });
    expect(saved.recipe?.lines.map((x) => x.kind)).toEqual(['ingredient', 'packaging', null]);
    expect(saved.recipe?.lines[0].qty).toBe(200);
    expect(saved.dropNo).toBe(17);
    // A consumer cannot mutate another draft through a returned snapshot either.
    saved.product.name = 'Outside change';
    saved.recipe!.lines[0].qty = 1;
    expect(w.get(id)?.product.name).toBe('Double Chocolate Fudge');
    expect(w.get(id)?.recipe?.lines[0].qty).toBe(200);
    expect(w.add({ ...source(), recipe: null })).toBeTruthy();
    expect(w.list().at(-1)?.recipe).toBeNull();
  });

  it('retains invalid raw entries, and rejects stale edits or changes of work kind', () => {
    const w = workspace(),
      id = w.add(source()),
      other = w.add(source('wcb'));
    expect(
      w.update(id, 0, {
        kind: 'batch',
        target: 24,
        actual: '1.',
        rejects: '-',
        adj: {},
        note: '',
        step: 1
      })
    ).toBe(true);
    expect(w.update(id, 0, source().draft)).toBe(false);
    expect(w.update(id, 1, { kind: 'dough', balls: '12', note: '' })).toBe(false);
    expect(w.selectedId).toBe(other);
    expect(w.get(id)?.draft).toMatchObject({ actual: '1.', rejects: '-' });
    expect(w.discard(id, 0)).toBe(false);
    expect(w.discard(id, 1)).toBe(true);
    expect(w.update(id, 1, source().draft)).toBe(false);
    expect(w.select(id)).toBe(false);
    expect(w.selectedId).toBe(other);
    expect(w.discard(other, 0)).toBe(true);
    expect(w.selectedId).toBeNull();
  });

  it('promotes a legacy instance once without resurrecting discarded work or stealing focus', () => {
    const w = workspace(),
      token = {};
    const a = w.adoptLegacy(token, source())!;
    const b = w.add(source('wcb'));
    expect(w.adoptLegacy(token, source())).toBe(a);
    expect(w.list()).toHaveLength(2);
    expect(w.selectedId).toBe(b);
    expect(w.discard(a, 0)).toBe(true);
    expect(w.adoptLegacy(token, source())).toBeNull();
    expect(w.list()).toHaveLength(1);
  });

  it('refuses an identity collision instead of replacing existing work', () => {
    const w = new ProductionWorkspace(() => 'same');
    w.add(source());
    expect(() => w.add(source('wcb'))).toThrow(/identity/);
    expect(w.list()).toHaveLength(1);
    expect(w.list()[0].product.id).toBe('dcf');
    w.discard('same', 0);
    expect(() => w.add(source('wcb'))).toThrow(/identity/);
    expect(w.list()).toHaveLength(0);
  });
});
