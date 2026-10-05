import type { FlavourRow } from '@/lib/data/flavours';

/**
 * What the stall needs to carry on selling after a reload with no signal (slice A2), kept on
 * the phone because live mode restores neither `cfg` nor the flavour list without the server:
 * the owner's flavours (the engine otherwise falls back to the six ported ones, and a sale of
 * any other flavour cannot be drawn), her two quick discounts, the cash float the close-out is
 * checked against, the helper-totals switch and the hours an offline open is allowed for.
 *
 * Menu names and prices only. No cost, no customer, no sign-in.
 */
const KEY = 'hc-live-stall';

/**
 * The kept settings and the bounds `save_setting()` holds each to (pesos for the float). The
 * copy is clamped to them on the way in and on the way out: it is a file on the phone, so it
 * can be rewritten by whoever holds the phone, and must not carry a value the server would refuse.
 */
const STALL_CFG_RANGE = {
  offlineOpenHours: [1, 72],
  discountA: [0, 500],
  discountB: [0, 500],
  drawerFloat: [0, 10_000],
  helperSeesSales: [0, 1]
} as const;

export const STALL_CFG_KEYS = Object.keys(STALL_CFG_RANGE) as Array<keyof typeof STALL_CFG_RANGE>;

const FLAVOUR_TEXT = [
  'id',
  'name',
  'short_name',
  'kind',
  'tag',
  'description',
  'image_path',
  'allergens'
] as const;

export type StallFlavour = Pick<
  FlavourRow,
  (typeof FLAVOUR_TEXT)[number] | 'price_cents' | 'sort_order' | 'active'
>;

export interface StallCopy {
  cfg: Record<string, number>;
  flavours: StallFlavour[];
}

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function stallFlavour(row: unknown): StallFlavour | null {
  if (!row || typeof row !== 'object') return null;
  const source = row as Record<string, unknown>;
  const flavour: Record<string, unknown> = {};
  for (const key of FLAVOUR_TEXT) {
    if (typeof source[key] !== 'string') return null;
    flavour[key] = source[key];
  }
  if (!isNumber(source.price_cents) || !isNumber(source.sort_order)) return null;
  if (typeof source.active !== 'boolean' || !source.id) return null;
  flavour.price_cents = source.price_cents;
  flavour.sort_order = source.sort_order;
  flavour.active = source.active;
  return flavour as StallFlavour;
}

function stallCfg(cfg: unknown): Record<string, number> {
  const source = (cfg && typeof cfg === 'object' ? cfg : {}) as Record<string, unknown>;
  const kept: Record<string, number> = {};
  for (const key of STALL_CFG_KEYS) {
    const value = source[key];
    const [min, max] = STALL_CFG_RANGE[key];
    if (isNumber(value)) kept[key] = Math.min(max, Math.max(min, value));
  }
  return kept;
}

export function readStallCopy(): StallCopy | null {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!saved || typeof saved !== 'object') return null;
    const record = saved as Record<string, unknown>;
    const rows = Array.isArray(record.flavours) ? record.flavours : [];
    const flavours = rows.map(stallFlavour);
    return {
      cfg: stallCfg(record.cfg),
      flavours: flavours.every((f) => f !== null) ? (flavours as StallFlavour[]) : []
    };
  } catch {
    return null;
  }
}

/** An empty flavour list (not read yet on this page load) keeps the list already on the phone. */
export function saveStallCopy(cfg: unknown, flavours: ReadonlyArray<unknown>): void {
  const rows = flavours.map(stallFlavour);
  const complete = rows.length > 0 && rows.every((f) => f !== null);
  const copy: StallCopy = {
    cfg: stallCfg(cfg),
    flavours: complete ? (rows as StallFlavour[]) : (readStallCopy()?.flavours ?? [])
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(copy));
  } catch {
    /* private mode or full: an offline reload then uses the defaults */
  }
}

export function clearStallCopy(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
