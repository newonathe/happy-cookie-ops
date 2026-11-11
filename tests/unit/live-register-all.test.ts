import { describe, expect, it } from 'vitest';
import { liveScreenFor } from '@/components/live/live-screens';
import { registerAllLiveScreens } from '@/components/live/register-all';
import { registerAllLiveScreens as registerNone } from '@/components/live/register-none';
import type { ScreenKey } from '@/lib/screens';

// Every key the eight live register files claim, in `components/live/*/register.ts`.
const LIVE_KEYS: ScreenKey[] = [
  'inventory',
  'grocery',
  'suppliers',
  'bazaar',
  'recipes',
  'products',
  'bake',
  'batch',
  'pnl',
  'sales',
  'today',
  'orders',
  'order',
  'reconcile',
  'drops',
  'settings',
  'health',
  'notifications',
  'status',
  'shop',
  'checkout'
];

describe('registerAllLiveScreens', () => {
  it('registers nothing in the demo stand-in, then every live key from the real one', () => {
    expect(liveScreenFor('bazaar')).toBeUndefined();
    registerNone();
    for (const key of LIVE_KEYS) expect(liveScreenFor(key), key).toBeUndefined();

    registerAllLiveScreens();
    for (const key of LIVE_KEYS) expect(liveScreenFor(key), key).toBeDefined();
    expect(liveScreenFor('stocktake')).toBeUndefined();
  });
});
