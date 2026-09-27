import { afterEach, describe, expect, it } from 'vitest';
import { BASE_STATE, EPHEMERAL, STORE_KEY } from '@/store/engine/ops-engine';
import {
  EMPTIED_KEYS,
  KEPT_KEYS,
  classifyStateKey,
  clearStoredBooks,
  liveBaseState
} from '@/lib/data/live-state';

/**
 * docs/state/G2-plan.md "Slice audit" (MP-09 a): every non-ephemeral BASE_STATE() key must
 * be classified emptied or kept, or live mode could silently keep showing a demo book that
 * nobody noticed. This proves the classification is exhaustive and non-overlapping, not
 * just that today's known keys happen to be covered.
 */
describe('live-state classification', () => {
  const baseKeys = Object.keys(BASE_STATE());
  const ephemeralSet = new Set(EPHEMERAL);

  it('classifies every BASE_STATE key as ephemeral, emptied or kept', () => {
    const unclassified = baseKeys.filter((key) => classifyStateKey(key) === 'unclassified');
    expect(unclassified).toEqual([]);
  });

  it('never classifies the same key as both emptied and kept', () => {
    const overlap = EMPTIED_KEYS.filter((key) => key in KEPT_KEYS);
    expect(overlap).toEqual([]);
  });

  it('never classifies an ephemeral key as emptied or kept', () => {
    const overlap = [...EMPTIED_KEYS, ...Object.keys(KEPT_KEYS)].filter((key) =>
      ephemeralSet.has(key)
    );
    expect(overlap).toEqual([]);
  });

  it('has no emptied or kept entry for a key BASE_STATE no longer has', () => {
    const known = new Set(baseKeys);
    const stale = [...EMPTIED_KEYS, ...Object.keys(KEPT_KEYS)].filter((key) => !known.has(key));
    expect(stale).toEqual([]);
  });

  it('names an owning slice for every kept key', () => {
    for (const slice of Object.values(KEPT_KEYS)) {
      expect(typeof slice).toBe('string');
      expect(slice.length).toBeGreaterThan(0);
    }
  });
});

describe('liveBaseState', () => {
  it('empties every classified key by its own type, and leaves kept/ephemeral keys as BASE_STATE seeds them', () => {
    const base = BASE_STATE() as Record<string, unknown>;
    const live = liveBaseState() as unknown as Record<string, unknown>;

    for (const key of EMPTIED_KEYS) {
      const seeded = base[key];
      const emptied = live[key];
      if (Array.isArray(seeded)) expect(emptied).toEqual([]);
      else if (seeded && typeof seeded === 'object') expect(emptied).toEqual({});
      else expect(emptied).toBeNull();
    }
    for (const key of Object.keys(KEPT_KEYS)) {
      expect(live[key]).toEqual(base[key]);
    }
  });

  it('never reuses the same emptied array or object across two calls', () => {
    const first = liveBaseState() as unknown as Record<string, unknown>;
    const second = liveBaseState() as unknown as Record<string, unknown>;
    for (const key of EMPTIED_KEYS) {
      const a = first[key];
      const b = second[key];
      if ((Array.isArray(a) && a.length === 0) || (a && typeof a === 'object')) {
        expect(a).not.toBe(b);
      }
    }
  });

  it('drops the seeded customer names that make a book look real', () => {
    const live = liveBaseState() as unknown as {
      queue: unknown[];
      waitlist: unknown[];
      orders: unknown[];
    };
    expect(live.queue).toEqual([]);
    expect(live.waitlist).toEqual([]);
    expect(live.orders).toEqual([]);
  });
});

describe('clearStoredBooks', () => {
  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('removes only the ops state key, from both storages, and keeps everything else', () => {
    window.localStorage.setItem(STORE_KEY, 'stale');
    window.sessionStorage.setItem(STORE_KEY, 'stale');
    window.localStorage.setItem('hc-device-id', 'device-abc');

    clearStoredBooks();

    expect(window.localStorage.getItem(STORE_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(STORE_KEY)).toBeNull();
    expect(window.localStorage.getItem('hc-device-id')).toBe('device-abc');
  });

  it('never throws when merely reading a storage getter throws (blocked site data, a sandboxed iframe)', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get(): Storage {
        throw new DOMException('blocked', 'SecurityError');
      }
    });

    try {
      expect(() => clearStoredBooks()).not.toThrow();
    } finally {
      if (original) Object.defineProperty(window, 'sessionStorage', original);
    }
  });
});
