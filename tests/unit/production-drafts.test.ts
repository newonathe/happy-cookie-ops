import { describe, expect, it } from 'vitest';
import { ProductionDrafts, type ProductionProjection } from '@/lib/production/drafts';

const state = (): ProductionProjection => ({
  batch: null,
  doughPrep: null,
  dropNo: 5,
  recipeVer: { chocolate: 3, biscoff: 2 },
  recipes: {},
  screen: 'bake',
  sheet: null
});
function harness() {
  let n = 0;
  const ids = new WeakMap<object, string>(),
    locked = new Set<string>(),
    completed = new Set<string>();
  const drafts = new ProductionDrafts(
    {
      identify: (value) => {
        let id = ids.get(value);
        if (!id) {
          id = `work-${++n}`;
          ids.set(value, id);
        }
        return id;
      },
      metadata: (pid, _id, s) => ({
        product: { id: pid, name: pid, photo: '' },
        dropNo: s.dropNo,
        recipe: { version: s.recipeVer[pid], yield: 12, lines: [] }
      }),
      locked: (id) => locked.has(id),
      completed: (id) => completed.has(id)
    },
    () => `work-${++n}`
  );
  return { drafts, locked, completed };
}
describe('runtime draft projections', () => {
  it('retains two flavours, raw entries, exceptions and review when a slot is replaced or cleared', () => {
    const { drafts } = harness();
    let a = {
      ...state(),
      screen: 'batch',
      batch: {
        pid: 'chocolate',
        target: 24,
        actual: 26,
        liveActualText: '26',
        liveRejectsText: '2',
        rejects: 2,
        note: 'Tray two',
        adj: { Butter: -1 },
        step: 2
      }
    };
    a = { ...a, ...drafts.sync(null, a).patch } as typeof a;
    const b = { ...state(), screen: 'batch', batch: { pid: 'biscoff', target: 12, actual: 12 } };
    drafts.sync(a, b);
    drafts.sync(b, state());
    const work = drafts.list();
    expect(work).toHaveLength(2);
    expect(work[0].recipe?.version).toBe(3);
    const restored = drafts.open(work[0].id, work[0].revision)!;
    expect(restored.batch).toMatchObject({
      pid: 'chocolate',
      target: 24,
      liveActualText: '26',
      liveRejectsText: '2',
      note: 'Tray two',
      adj: { Butter: -1 },
      step: 2
    });
    expect(restored.doughPrep).toBeNull();
    expect(drafts.list()[1].product.id).toBe('biscoff');
  });
  it('adopts an existing unanswered ID and never replaces its frozen working fields', () => {
    const { drafts, locked } = harness();
    const a = {
      ...state(),
      batch: { pid: 'chocolate', target: 24, actual: 24, liveWorkId: 'existing-id' }
    };
    drafts.sync(null, a);
    locked.add('existing-id');
    drafts.sync(a, { ...a, batch: { ...a.batch, actual: 99 } });
    expect(drafts.list()).toHaveLength(1);
    expect(drafts.list()[0]).toMatchObject({ id: 'existing-id', draft: { actual: '24' } });
  });
  it('keeps separate dough and identical bake work and does not resurrect completed/discarded items', () => {
    const { drafts, completed } = harness();
    const a = { ...state(), batch: { pid: 'chocolate', target: 12, actual: 12 } };
    drafts.sync(null, a);
    const first = drafts.list()[0];
    const b = { ...a, batch: { ...a.batch } };
    drafts.sync(a, b);
    const dough = { ...state(), doughPrep: { pid: 'chocolate', balls: 6 } };
    drafts.sync(b, dough);
    expect(drafts.list()).toHaveLength(3);
    completed.add(first.id);
    drafts.sync(a, state());
    expect(drafts.list()).toHaveLength(2);
    const d = drafts.list().find((w) => w.draft.kind === 'dough')!;
    expect(drafts.open(d.id, d.revision)?.doughPrep).toMatchObject({ balls: 6, liveWorkId: d.id });
    drafts.retire(d.id);
    drafts.sync(dough, state());
    expect(drafts.list()).toHaveLength(1);
    expect(drafts.open(first.id, first.revision)).toBeNull();
  });
  it('rejects an old row callback after a newer edit and keeps the original recipe/period snapshot', () => {
    const { drafts } = harness();
    const a = { ...state(), batch: { pid: 'chocolate', target: 24, actual: 24, liveWorkId: 'a' } };
    drafts.sync(null, a);
    const b = {
      ...a,
      dropNo: 6,
      recipeVer: { chocolate: 4 },
      batch: { ...a.batch, actual: 25, liveActualText: '25' }
    };
    drafts.sync(a, b);
    expect(drafts.open('a', 0)).toBeNull();
    expect(drafts.list()[0]).toMatchObject({
      dropNo: 5,
      recipe: { version: 3 },
      draft: { actual: '25' }
    });
  });
});
