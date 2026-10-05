import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import {
  OFFLINE_OPEN_HOURS_DEFAULT,
  checkStillFresh,
  holdsOpenEvent,
  offlineBazaarRole,
  offlineOpenHoursFor,
  readRememberedCheck,
  rememberCheck
} from '@/lib/auth/offline-trust';
import { readStallCopy, saveStallCopy } from '@/lib/offline/stall-copy';
import { requestPersistentStorage } from '@/lib/offline/persist';
import { hasStoredSession, signOutLocal } from '@/lib/auth/live-gate';

/** Slice A2: the rules an offline open of Bazaar Mode is bounded by, one at a time. */
const EVENT = 'd1e0c105-0000-4000-8000-0000000000e1';
const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 9, 24, 2, 0, 0);
const event = (patch: Record<string, unknown> = {}) =>
  localStorage.setItem(
    'hc-live-bazaar',
    JSON.stringify({ event: { id: EVENT, name: 'Fair', stage: 'selling', ...patch }, sales: [] })
  );
const flavour = {
  id: 'dcf',
  name: 'Dark Chocolate',
  short_name: 'Dark Choc',
  kind: 'classic',
  tag: '',
  description: '',
  image_path: '/assets/dcf.png',
  allergens: 'milk',
  price_cents: 12500,
  sort_order: 1,
  active: true
};

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('offlineOpenHoursFor', () => {
  it('has a labelled default of 48 hours and clamps to 1 to 72', () => {
    expect(OFFLINE_OPEN_HOURS_DEFAULT).toBe(48);
    expect(offlineOpenHoursFor(undefined)).toBe(48);
    expect(offlineOpenHoursFor({ offlineOpenHours: '12' })).toBe(48);
    expect(offlineOpenHoursFor({ offlineOpenHours: 12 })).toBe(12);
    expect(offlineOpenHoursFor({ offlineOpenHours: 0 })).toBe(1);
    expect(offlineOpenHoursFor({ offlineOpenHours: 10_000 })).toBe(72);
  });
});

describe('the remembered check', () => {
  it('holds a role and a time and nothing else', () => {
    rememberCheck('owner', NOW);
    expect(JSON.parse(localStorage.getItem('hc-live-check')!)).toEqual({ role: 'owner', at: NOW });
    expect(readRememberedCheck()).toEqual({ role: 'owner', at: NOW });
  });

  it('is refused when its role is unknown or its time is not a time', () => {
    for (const bad of [
      { role: 'admin', at: NOW },
      { role: 'toString', at: NOW },
      { role: 'owner', at: 'yesterday' },
      { role: 'owner', at: -1 },
      { role: 'owner' },
      'owner',
      null
    ]) {
      localStorage.setItem('hc-live-check', JSON.stringify(bad));
      expect(readRememberedCheck()).toBeNull();
    }
    localStorage.setItem('hc-live-check', '{not json');
    expect(readRememberedCheck()).toBeNull();
  });
});

describe('offlineBazaarRole', () => {
  it('allows Bazaar Mode within the hours, with an open event the server opened', () => {
    event();
    rememberCheck('helper', NOW - 47 * HOUR);
    expect(offlineBazaarRole(NOW)).toBe('helper');
  });

  it('refuses without an event, with a closed one, or with one the server did not open', () => {
    rememberCheck('owner', NOW - HOUR);
    expect(holdsOpenEvent()).toBe(false);
    expect(offlineBazaarRole(NOW)).toBeNull();
    event({ stage: 'closed' });
    expect(offlineBazaarRole(NOW)).toBeNull();
    event({ id: 'local-1' });
    expect(offlineBazaarRole(NOW)).toBeNull();
    event({ stage: 'stock' });
    expect(offlineBazaarRole(NOW)).toBe('owner');
  });

  it('refuses past the hours, and a check dated after now (a clock set back)', () => {
    event();
    rememberCheck('owner', NOW - 48 * HOUR - 1);
    expect(offlineBazaarRole(NOW)).toBeNull();
    rememberCheck('owner', NOW + 6 * 60_000);
    expect(offlineBazaarRole(NOW)).toBeNull();
    rememberCheck('owner', NOW + 60_000); // within the slack of a clock a little behind
    expect(offlineBazaarRole(NOW)).toBe('owner');
  });

  it("uses the owner's hours from the copy on the phone", () => {
    event();
    saveStallCopy({ offlineOpenHours: 2 }, []);
    rememberCheck('owner', NOW - 3 * HOUR);
    expect(checkStillFresh(NOW)).toBe(false);
    rememberCheck('owner', NOW - HOUR);
    expect(checkStillFresh(NOW)).toBe(true);
  });
});

describe('the stall copy', () => {
  it('keeps five settings and the menu fields, and nothing else it is handed', () => {
    saveStallCopy(
      {
        discountA: 30,
        discountB: 60,
        drawerFloat: 500,
        helperSeesSales: 1,
        cogsMultiple: 4,
        groceryBudget: 6000
      },
      [{ ...flavour, capacity_weight: 1, published: true, updated_at: 'x', cost_cents: 999 }]
    );
    const copy = readStallCopy()!;
    expect(copy.cfg).toEqual({
      discountA: 30,
      discountB: 60,
      drawerFloat: 500,
      helperSeesSales: 1
    });
    expect(copy.flavours).toEqual([flavour]);
  });

  it('an empty flavour list keeps the list already on the phone; a damaged one is dropped', () => {
    saveStallCopy({}, [flavour]);
    saveStallCopy({ discountA: 10 }, []);
    expect(readStallCopy()!.flavours).toEqual([flavour]);
    localStorage.setItem('hc-live-stall', JSON.stringify({ cfg: {}, flavours: [{ id: 'x' }] }));
    expect(readStallCopy()!.flavours).toEqual([]);
  });
});

describe('requestPersistentStorage', () => {
  it('asks once, and not again when storage is already persistent', async () => {
    const persist = vi.fn(async () => true);
    vi.stubGlobal('navigator', { storage: { persist, persisted: async () => false } });
    expect(await requestPersistentStorage()).toBe(true);
    expect(persist).toHaveBeenCalledOnce();
    vi.stubGlobal('navigator', { storage: { persist, persisted: async () => true } });
    expect(await requestPersistentStorage()).toBe(true);
    expect(persist).toHaveBeenCalledOnce();
  });

  it('never throws: no storage manager, or a browser that refuses', async () => {
    vi.stubGlobal('navigator', {});
    expect(await requestPersistentStorage()).toBe(false);
    vi.stubGlobal('navigator', {
      storage: {
        persist: async () => {
          throw new Error('denied');
        }
      }
    });
    expect(await requestPersistentStorage()).toBe(false);
  });
});

describe('signOutLocal', () => {
  it('forgets the check and the stall copy, keeps the running event, even when sign-out throws', async () => {
    event();
    rememberCheck('owner', NOW);
    saveStallCopy({ discountA: 30 }, [flavour]);
    const supabase = {
      auth: {
        signOut: vi.fn(async () => {
          throw new TypeError('Failed to fetch');
        })
      }
    } as unknown as SupabaseClient<Database>;
    await signOutLocal(supabase);
    expect(localStorage.getItem('hc-live-check')).toBeNull();
    expect(localStorage.getItem('hc-live-stall')).toBeNull();
    expect(JSON.parse(localStorage.getItem('hc-live-bazaar')!).event.id).toBe(EVENT);
  });
});

describe('the stall copy is a file on the phone', () => {
  it('clamps each setting to the bounds the server holds it to, in and out', () => {
    saveStallCopy({ discountA: 9999, discountB: -5, drawerFloat: 1e9, helperSeesSales: 7 }, []);
    expect(readStallCopy()!.cfg).toEqual({
      discountA: 500,
      discountB: 0,
      drawerFloat: 10_000,
      helperSeesSales: 1
    });
    localStorage.setItem(
      'hc-live-stall',
      JSON.stringify({ cfg: { offlineOpenHours: 100_000, discountA: 9999 }, flavours: [] })
    );
    expect(readStallCopy()!.cfg).toEqual({ offlineOpenHours: 72, discountA: 500 });
  });
});

describe('hasStoredSession', () => {
  const cookie = (name: string, on: boolean) => {
    document.cookie = on
      ? name + '=x; path=/'
      : name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  };

  it('is true only while a Supabase session cookie is on the device', () => {
    expect(hasStoredSession()).toBe(false);
    cookie('other', true);
    expect(hasStoredSession()).toBe(false);
    cookie('sb-abc-auth-token.0', true);
    expect(hasStoredSession()).toBe(true);
    cookie('sb-abc-auth-token.0', false);
    cookie('other', false);
    expect(hasStoredSession()).toBe(false);
  });
});
