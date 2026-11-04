import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  emptyEventEntry,
  readEventEntry,
  writeEventEntry,
  holdEventEntryLock,
  keepInvalidEventEntry,
  freezeEventEntry,
  type EventEntryRecord
} from '@/lib/bazaar/event-entry-recovery';

const scope = { userId: '11111111-1111-4111-8111-111111111111', business: 'https://one.example' };
const input = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Weekend market',
  place: 'Hall',
  startsOn: '2026-12-12',
  endsOn: '2026-12-13',
  rent: '2,500.50'
};
function store() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    }
  };
}
const record = (submitted = false): EventEntryRecord => ({
  ...emptyEventEntry(scope),
  draft: { ...input },
  submitted: submitted ? freezeEventEntry(input) : null
});
afterEach(() => vi.unstubAllGlobals());

describe('an owner-scoped event draft', () => {
  it('restores raw drafts including blanks and invalid input, without treating them as submitted', () => {
    const storage = store(),
      draft = { ...record(), draft: { ...input, name: '', rent: 'not an amount', startsOn: '' } };
    expect(writeEventEntry(scope, draft, { storage })).toBe(true);
    expect(readEventEntry(scope, storage)).toEqual({ status: 'stored', value: draft });
    expect(
      readEventEntry({ ...scope, userId: '33333333-3333-4333-8333-333333333333' }, storage).status
    ).toBe('empty');
    expect(readEventEntry({ ...scope, business: 'https://two.example' }, storage).status).toBe(
      'empty'
    );
  });
  it('keeps a submitted body and identity byte-for-byte across another instance/read', () => {
    const storage = store(),
      value = record(true);
    expect(writeEventEntry(scope, value, { storage })).toBe(true);
    expect(readEventEntry(scope, storage).value?.submitted).toEqual(freezeEventEntry(input));
    expect(writeEventEntry(scope, { ...value, submitted: null }, { storage })).toBe(false);
    expect(writeEventEntry(scope, emptyEventEntry(scope), { storage })).toBe(false);
    expect(
      writeEventEntry(
        scope,
        {
          ...value,
          draft: { ...input, rent: '100' },
          submitted: freezeEventEntry({ ...input, rent: '100' })
        },
        { storage }
      )
    ).toBe(false);
    expect(readEventEntry(scope, storage).value).toEqual(value);
  });
  it('retires only the explicitly resolved request and refuses the wrong identity', () => {
    const storage = store();
    writeEventEntry(scope, record(true), { storage });
    expect(writeEventEntry(scope, emptyEventEntry(scope), { storage, resolvedId: 'wrong' })).toBe(
      false
    );
    expect(writeEventEntry(scope, emptyEventEntry(scope), { storage, resolvedId: input.id })).toBe(
      true
    );
  });
  it('rejects a cross-owner envelope even under the right storage key', () => {
    const storage = store();
    writeEventEntry(scope, record(), { storage });
    const key = [...storage.values.keys()][0]!;
    storage.values.set(
      key,
      JSON.stringify({ ...record(), scope: { ...scope, business: 'https://two.example' } })
    );
    expect(readEventEntry(scope, storage).status).toBe('invalid');
    expect(writeEventEntry(scope, emptyEventEntry(scope), { storage })).toBe(false);
  });
  it.each(['{', JSON.stringify({ version: 2 }), 'x'.repeat(32769)])(
    'preserves malformed or newer data without replacing it',
    (raw) => {
      const storage = store();
      writeEventEntry(scope, record(), { storage });
      const key = [...storage.values.keys()][0]!;
      storage.values.set(key, raw);
      expect(readEventEntry(scope, storage).status).toBe('invalid');
      expect(writeEventEntry(scope, record(), { storage })).toBe(false);
      expect(storage.values.get(key)).toBe(raw);
    }
  );
  it('requires a valid frozen request, matching draft and verified-looking scope shape', () => {
    const storage = store();
    expect(
      writeEventEntry(
        scope,
        {
          ...record(true),
          submitted: {
            p_event: { ...freezeEventEntry(input)!.p_event, rent_cents: -1 },
            p_expected_updated_at: null
          }
        },
        { storage }
      )
    ).toBe(false);
    expect(
      writeEventEntry(
        scope,
        { ...record(true), draft: { ...input, name: 'Different' } },
        { storage }
      )
    ).toBe(false);
    expect(writeEventEntry({ ...scope, userId: 'owner' }, record(), { storage })).toBe(false);
    expect(
      writeEventEntry({ ...scope, business: 'https://one.example/path' }, record(), { storage })
    ).toBe(false);
    expect(storage.values.size).toBe(0);
  });
  it('reports storage exceptions and silent dropped writes instead of claiming a durable copy', () => {
    const broken = {
      getItem: () => {
        throw Error('blocked');
      },
      setItem: () => {
        throw Error('blocked');
      }
    };
    expect(readEventEntry(scope, broken).status).toBe('unavailable');
    expect(writeEventEntry(scope, record(), { storage: broken })).toBe(false);
    expect(
      writeEventEntry(scope, record(), {
        storage: { getItem: () => null, setItem: () => undefined }
      })
    ).toBe(false);
  });
  it('restores normalized wire values across reload without reinterpreting rent or whitespace', () => {
    const storage = store(),
      draft = { ...input, name: ' Weekend market ', place: ' Hall ' };
    const submitted = freezeEventEntry(draft);
    expect(submitted?.p_event).toMatchObject({
      name: 'Weekend market',
      place: 'Hall',
      rent_cents: 250050
    });
    expect(writeEventEntry(scope, { ...record(), draft, submitted }, { storage })).toBe(true);
    expect(readEventEntry(scope, storage).value?.submitted).toEqual(submitted);
    expect(readEventEntry(scope, storage).value?.submitted?.p_expected_updated_at).toBeNull();
  });
  it('keeps an unreadable copy before starting empty, and never uses that action to drop a readable pending request', () => {
    const storage = store();
    writeEventEntry(scope, record(true), { storage });
    expect(keepInvalidEventEntry(scope, storage)).toBe(false);
    const key = [...storage.values.keys()][0]!;
    storage.values.set(key, '{unreadable');
    expect(keepInvalidEventEntry(scope, storage)).toBe(true);
    expect([...storage.values.values()]).toContain('{unreadable');
    expect(readEventEntry(scope, storage).value).toEqual(emptyEventEntry(scope));
  });
  it('does not replace unreadable data if the retained copy fails', () => {
    const storage = store();
    writeEventEntry(scope, record(), { storage });
    const key = [...storage.values.keys()][0]!;
    storage.values.set(key, '{bad');
    expect(
      keepInvalidEventEntry(scope, {
        ...storage,
        setItem: () => {
          throw Error('full');
        }
      })
    ).toBe(false);
    expect(storage.values.get(key)).toBe('{bad');
  });
  it('uses separate lock names across owners/backends and refuses unavailable locking', async () => {
    vi.stubGlobal('navigator', {});
    expect(await holdEventEntryLock(scope)).toBeNull();
    const names: string[] = [];
    vi.stubGlobal('navigator', {
      locks: {
        request: async (name: string, _options: unknown, fn: (lock: null) => Promise<void>) => {
          names.push(name);
          await fn(null);
        }
      }
    });
    expect(await holdEventEntryLock(scope)).toBeNull();
    await holdEventEntryLock({ ...scope, business: 'https://two.example' });
    await holdEventEntryLock({ ...scope, userId: input.id });
    expect(new Set(names).size).toBe(3);
  });
});
