import { BASE_STATE, EPHEMERAL, STORE_KEY } from '@/store/engine/ops-engine';
import type { OpsEngineState } from '@/store/engine/ops-engine';

/**
 * Classification of every non-ephemeral BASE_STATE() key, from docs/state/G2-plan.md
 * "Slice audit" (MP-09 a). tests/unit/live-state.test.ts fails on any BASE_STATE() key
 * that is neither ephemeral, emptied nor kept here.
 */

/** Demo books and drafts: private data, wiped so live mode never shows or stores them. */
export const EMPTIED_KEYS = [
  'orders',
  'ledger',
  'inv',
  'batches',
  'sales',
  'paid',
  'partial',
  'subs',
  'matched',
  'queue',
  'queueArchive',
  'waitlist',
  'variances',
  'spoilage',
  'countLog',
  'bought',
  'received',
  'plannedBuy',
  'shortfalls',
  'dough',
  'baked',
  'doughAt',
  'doughPrep',
  'moved',
  'drawer',
  'event',
  'eventStock',
  'eventLoaded',
  'eventPrices',
  'eventExpenses',
  'recipeHistory',
  'notifRead',
  'stocktake',
  'batch'
] as const;

/** Kept keys, grouped by the slice that puts them on the database. */
const KEPT_BY_SLICE: Record<string, readonly string[]> = {
  'MP-09 b': ['cfg'],
  'MP-09 c/d': [
    'prices',
    'recipes',
    'recipeBase',
    'recipeVer',
    'recipeDirty',
    'soldOut',
    'dropActive',
    'shopOverride'
  ],
  'MP-10': ['dropNo', 'orderSeq', 'invoiceSeq'],
  'G4 backups (DP-10)': ['backup', 'backupAt'],
  'MP-09 b2': ['channels', 'categories', 'inactiveCats'],
  // Transient UI state the engine seeds with a sensible default — not customer data.
  'UI state': [
    'online',
    'unsynced',
    'syncState',
    'supplierOpen',
    'recipeOpen',
    'saleRef',
    'tendered',
    'cartDiscount',
    'cust',
    'bakeDay',
    'invTab',
    'supplierPick',
    'cart',
    'receiptShot',
    'syncTried'
  ]
};

export const KEPT_KEYS: Record<string, string> = Object.fromEntries(
  Object.entries(KEPT_BY_SLICE).flatMap(([slice, keys]) => keys.map((key) => [key, slice]))
);

const EMPTIED_SET = new Set<string>(EMPTIED_KEYS);
const EPHEMERAL_SET = new Set<string>(EPHEMERAL);

export type StateKeyClass = 'emptied' | 'kept' | 'ephemeral' | 'unclassified';

export function classifyStateKey(key: string): StateKeyClass {
  if (EMPTIED_SET.has(key)) return 'emptied';
  if (key in KEPT_KEYS) return 'kept';
  if (EPHEMERAL_SET.has(key)) return 'ephemeral';
  return 'unclassified';
}

function emptyValueFor(value: unknown): unknown {
  if (Array.isArray(value)) return [];
  if (value && typeof value === 'object') return {};
  return null;
}

/** BASE_STATE() with every emptied key wiped. Live mode starts here, never from the sample books. */
export function liveBaseState(): OpsEngineState {
  const base = BASE_STATE();
  const next = { ...base } as Record<string, unknown>;
  for (const key of EMPTIED_KEYS) next[key] = emptyValueFor((base as Record<string, unknown>)[key]);
  return next as OpsEngineState;
}

/**
 * Removes the saved books from both storages. Never `.clear()` — that would also wipe
 * `hc-device-id`. Shared by live mount, the live Settings reset and sign-out.
 *
 * Each storage is accessed inside its own try: in some browsers (site data blocked, a
 * sandboxed iframe) merely reading `window.localStorage`/`window.sessionStorage` throws a
 * SecurityError, the same failure mode the protected engine's own `STORES` guards against
 * (ops-engine.js) — this must not throw and skip the caller's own work (a live mount, or
 * the redirect in signOutAndRedirect).
 */
export function clearStoredBooks(): void {
  if (typeof window === 'undefined') return;
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    try {
      window[name].removeItem(STORE_KEY);
    } catch {
      // storage may be unavailable: private mode, quota, or a denied permission
    }
  }
}
