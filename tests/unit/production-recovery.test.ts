import { describe, expect, it } from 'vitest';
import {
  emptyProductionRecovery,
  readProductionRecovery,
  sameProductionRequest,
  setAsideProductionRecovery,
  writeProductionRecovery
} from '@/lib/production/recovery';
import type { ProductionRecovery, ProductionRecoveryScope } from '@/lib/production/recovery';

const scope: ProductionRecoveryScope = {
  userId: '11111111-1111-4111-8111-111111111111',
  business: 'https://cookie.supabase.co'
};
const workId = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const memory = () => {
  const rows = new Map<string, string>();
  return {
    rows,
    getItem: (key: string) => rows.get(key) ?? null,
    setItem: (key: string, value: string) => {
      rows.set(key, value);
    }
  };
};
const snapshot = (): ProductionRecovery => ({
  ...emptyProductionRecovery(scope),
  sequence: 4,
  selectedId: workId,
  works: [
    {
      id: workId,
      number: 4,
      revision: 2,
      product: { id: 'dcf', name: 'Chocolate', photo: '' },
      dropNo: 5,
      recipe: {
        version: 3,
        yield: 12,
        lines: [{ name: 'Flour', qty: 300, unit: 'g', kind: 'ingredient', itemId: 'flour' }]
      },
      draft: {
        kind: 'batch',
        target: 8,
        actual: '8',
        rejects: '1',
        adj: {},
        note: 'Keep tray',
        step: 2
      }
    }
  ],
  requests: [
    {
      workId,
      fields: {
        id: requestId,
        kind: 'batch',
        productId: 'dcf',
        qty: 8,
        target: 8,
        rejects: 1,
        adj: {},
        recipeVersion: 3,
        dropNo: 5,
        at: Date.parse('2026-11-04T00:00:00Z')
      }
    }
  ]
});

describe('scoped production recovery', () => {
  it('retains unresolved handoff conflicts and an explicitly unchosen production type', () => {
    const value = snapshot(),
      storage = memory();
    value.entry = {
      dropNo: 5,
      productId: '',
      quantity: '',
      version: 0,
      choices: [{ productId: 'dcf', quantity: '12', version: 3, kind: 'choose' }],
      handoff: { source: 'recipe', rows: [{ productId: 'dcf', quantity: '48', version: 3 }] }
    };
    expect(writeProductionRecovery(scope, value, { storage })).toBe(true);
    expect(readProductionRecovery(scope, storage).value).toEqual(value);
  });
  it('restores the bake protocol exactly and refuses to change a pending request route', () => {
    const value = snapshot(),
      storage = memory();
    value.requests[0]!.fields.doughOnly = true;
    value.requests[0]!.fields.recipeVersion = 2147483647;
    value.works[0]!.recipe!.version = 2147483647;
    expect(writeProductionRecovery(scope, value, { storage })).toBe(true);
    expect(readProductionRecovery(scope, storage).value).toEqual(value);
    const changed = structuredClone(value);
    delete changed.requests[0]!.fields.doughOnly;
    expect(sameProductionRequest(value.requests[0]!.fields, changed.requests[0]!.fields)).toBe(
      false
    );
    expect(writeProductionRecovery(scope, changed, { storage })).toBe(false);
  });
  it('restores legacy unanswered dough unchanged, without inferring a recipe amount', () => {
    const value = snapshot(),
      storage = memory();
    value.works[0]!.draft = { kind: 'dough', balls: '6', note: '' };
    value.requests[0]!.fields = {
      ...value.requests[0]!.fields,
      kind: 'dough',
      qty: 6,
      target: null,
      rejects: 0
    };
    expect(writeProductionRecovery(scope, value, { storage })).toBe(true);
    expect(readProductionRecovery(scope, storage).value).toEqual(value);
    expect(readProductionRecovery(scope, storage).value?.requests[0]?.fields).not.toHaveProperty(
      'recipeAmount'
    );
  });
  it.each(['', '-'])('keeps an unsubmitted actual dough count of %j', (actualBalls) => {
    const value = snapshot(),
      storage = memory();
    value.requests = [];
    value.works[0]!.draft = { kind: 'dough', balls: '12', actualBalls, recipeAmount: 1, note: '' };
    expect(writeProductionRecovery(scope, value, { storage })).toBe(true);
    expect(readProductionRecovery(scope, storage).value).toEqual(value);
  });
  it('retains recipe amount separately from actual dough count and fences changed retry facts', () => {
    const value = snapshot(),
      storage = memory();
    value.works[0]!.draft = {
      kind: 'dough',
      balls: '12',
      actualBalls: '13',
      recipeAmount: 1,
      note: '',
      step: 2
    };
    value.requests[0]!.fields = {
      ...value.requests[0]!.fields,
      kind: 'dough',
      qty: 13,
      recipeAmount: 1,
      target: null,
      rejects: 0
    };
    expect(writeProductionRecovery(scope, value, { storage })).toBe(true);
    expect(readProductionRecovery(scope, storage).value).toEqual(value);
    const changed = structuredClone(value);
    changed.requests[0]!.fields.recipeAmount = 0.5;
    expect(sameProductionRequest(value.requests[0]!.fields, changed.requests[0]!.fields)).toBe(
      false
    );
    expect(writeProductionRecovery(scope, changed, { storage })).toBe(false);
    changed.requests[0]!.fields = { ...value.requests[0]!.fields, qty: 12 };
    expect(writeProductionRecovery(scope, changed, { storage })).toBe(false);
  });
  it('round-trips original source, revision, note and exact request without sending anything', () => {
    const storage = memory(),
      value = snapshot();
    expect(writeProductionRecovery(scope, value, { storage })).toBe(true);
    expect(readProductionRecovery(scope, storage)).toEqual({ status: 'stored', value });
    expect(
      readProductionRecovery({ ...scope, userId: '44444444-4444-4444-8444-444444444444' }, storage)
        .status
    ).toBe('empty');
    expect(
      readProductionRecovery({ ...scope, business: 'https://other.supabase.co' }, storage).status
    ).toBe('empty');
  });
  it('keeps raw invalid or blank counts in unsubmitted work', () => {
    const value = snapshot(),
      storage = memory();
    value.requests = [];
    const draft = value.works[0]!.draft;
    if (draft.kind !== 'batch') throw Error('fixture');
    draft.actual = '';
    draft.rejects = '-';
    expect(writeProductionRecovery(scope, value, { storage })).toBe(true);
    expect(readProductionRecovery(scope, storage).value?.works[0]?.draft).toMatchObject({
      actual: '',
      rejects: '-'
    });
  });
  it('cannot silently delete, replace or rebase an unanswered request', () => {
    const storage = memory(),
      original = snapshot();
    expect(writeProductionRecovery(scope, original, { storage })).toBe(true);
    const next = structuredClone(original);
    next.requests = [];
    expect(writeProductionRecovery(scope, next, { storage })).toBe(false);
    next.requests = structuredClone(original.requests);
    next.requests[0]!.fields.qty = 9;
    expect(writeProductionRecovery(scope, next, { storage })).toBe(false);
    expect(readProductionRecovery(scope, storage).value).toEqual(original);
  });
  it('retires a request only with its matching saved acknowledgement or explicit terminal refusal', () => {
    const storage = memory(),
      original = snapshot();
    writeProductionRecovery(scope, original, { storage });
    const done = structuredClone(original);
    done.works = [];
    done.selectedId = null;
    done.requests = [];
    done.saved = [
      {
        workId,
        name: 'Chocolate',
        fields: original.requests[0]!.fields,
        result: {
          outcome: 'saved',
          duplicate: true,
          usedDough: 2,
          shortfall: [{ name: 'Flour', by: 10, unit: 'g', why: 'unit differs' }]
        }
      }
    ];
    expect(writeProductionRecovery(scope, done, { storage })).toBe(true);
    expect(readProductionRecovery(scope, storage).value?.saved).toEqual(done.saved);
    const refusedStore = memory();
    writeProductionRecovery(scope, original, { storage: refusedStore });
    const refused = structuredClone(original);
    refused.requests = [];
    expect(
      writeProductionRecovery(scope, refused, {
        storage: refusedStore,
        resolvedRequests: [requestId]
      })
    ).toBe(true);
  });
  it('rejects mismatched identity, unknown versions, malformed requests and identity collisions without clearing bytes', () => {
    for (const change of [
      (v: ProductionRecovery) => {
        v.scope = { ...scope, userId: '44444444-4444-4444-8444-444444444444' };
      },
      (v: ProductionRecovery) => {
        v.version = 2 as 1;
      },
      (v: ProductionRecovery) => {
        v.requests[0]!.fields.rejects = 9;
      },
      (v: ProductionRecovery) => {
        v.requests.push(structuredClone(v.requests[0]!));
      },
      (v: ProductionRecovery) => {
        v.works.push(structuredClone(v.works[0]!));
      }
    ]) {
      const storage = memory(),
        value = snapshot();
      change(value);
      const raw = JSON.stringify(value);
      storage.rows.set(
        'hc-production-recovery-v1:' + encodeURIComponent(scope.business) + ':' + scope.userId,
        raw
      );
      expect(readProductionRecovery(scope, storage).status).toBe('invalid');
      expect(writeProductionRecovery(scope, snapshot(), { storage })).toBe(false);
      expect([...storage.rows.values()]).toEqual([raw]);
    }
  });
  it('treats denied storage and failed read-back as unavailable, not confirmed persistence', () => {
    const storage = memory();
    expect(
      writeProductionRecovery(scope, snapshot(), {
        storage: {
          ...storage,
          setItem: () => {
            throw Error('quota');
          }
        }
      })
    ).toBe(false);
    expect(
      readProductionRecovery(scope, {
        ...storage,
        getItem: () => {
          throw Error('denied');
        }
      }).status
    ).toBe('unavailable');
    expect(
      writeProductionRecovery(scope, snapshot(), {
        storage: { getItem: () => null, setItem: () => {} }
      })
    ).toBe(false);
  });
});

describe('setting an unreadable device copy aside', () => {
  const storage = () => {
    const rows = new Map<string, string>();
    return {
      rows,
      getItem: (name: string) => rows.get(name) ?? null,
      setItem: (name: string, value: string) => void rows.set(name, value),
      removeItem: (name: string) => void rows.delete(name)
    };
  };
  const keyOf =
    'hc-production-recovery-v1:' + encodeURIComponent(scope.business) + ':' + scope.userId;

  it('moves the bytes to one side, so the device starts empty and nothing is deleted', () => {
    const use = storage();
    use.setItem(keyOf, '{"not":"a recovery copy"}');
    expect(readProductionRecovery(scope, use).status).toBe('invalid');
    expect(setAsideProductionRecovery(scope, use)).toBe(true);
    expect(readProductionRecovery(scope, use).status).toBe('empty');
    expect(use.getItem(keyOf + ':set-aside')).toBe('{"not":"a recovery copy"}');
  });

  it("refuses to move a readable copy or another account's copy", () => {
    const use = storage();
    expect(writeProductionRecovery(scope, emptyProductionRecovery(scope), { storage: use })).toBe(
      true
    );
    const before = use.getItem(keyOf);
    expect(setAsideProductionRecovery(scope, use)).toBe(false);
    expect(use.getItem(keyOf)).toBe(before);
    const other = storage();
    other.setItem(keyOf, 'broken but not this scope');
    expect(
      setAsideProductionRecovery(
        { ...scope, userId: '44444444-4444-4444-8444-444444444444' },
        other
      )
    ).toBe(false);
    expect(other.getItem(keyOf)).toBe('broken but not this scope');
    // Mutation: moving a readable copy would hide unanswered requests behind one tap.
  });
});
