import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/types/database';

/**
 * Production on the database (C2; `record_production` / `record_pack` / `get_production`, migration 20260101004700). A dough
 * mix or a baked batch takes every line of the recipe version it was made on off stock in one transaction (never more than is
 * there; what could not be covered is the shortfall); packing an order takes its packaging, once per order. The database works
 * out every quantity: this file only sends what the owner entered, mirrors the bounds (`productionError`) so a sure refusal is
 * never sent, and turns what the database holds back into the engine's state keys (`engineProduction`).
 */
export type ProductionClient = Pick<SupabaseClient<Database>, 'rpc'>;

export interface ProductionFields {
  /** A uuid minted once per action: a retry of the same action is answered, never applied twice. */
  id: string;
  kind: 'dough' | 'batch';
  productId: string;
  /** Dough: balls mixed (up to one recipe yield). Batch: everything that came out of the oven. */
  qty: number;
  /** Batch: what was planned. Dough: null. */
  target: number | null;
  rejects: number;
  /** Batch: whole +/- steps by ingredient name. Dough: empty. */
  adj: Record<string, number>;
  /** The recipe version the screen showed; the database refuses if the recipe changed since. */
  recipeVersion: number;
  dropNo: number;
  /** Epoch milliseconds. */
  at: number;
}

export interface Shortfall {
  name: string;
  by: number;
  unit: string;
}

export interface ProductionResult {
  outcome: 'saved' | 'refused' | 'stale' | 'offline';
  duplicate: boolean;
  usedDough: number;
  shortfall: Shortfall[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const whole = (v: number, min: number, max: number): boolean =>
  Number.isInteger(v) && v >= min && v <= max;

/** The same bounds `record_production` enforces. Null means the record is acceptable. */
export function productionError(f: ProductionFields): string | null {
  if (!UUID.test(f.id) || f.productId === '')
    return 'This change has no id yet. Reload and try again.';
  if (f.kind !== 'dough' && f.kind !== 'batch') return 'That is not a dough mix or a batch.';
  if (!whole(f.qty, 1, 10000)) return 'Enter a whole number from 1 to 10000.';
  if (!whole(f.rejects, 0, f.qty) || (f.kind === 'dough' && f.rejects !== 0))
    return 'Rejects are whole and not more than were baked.';
  if (f.kind === 'dough' ? f.target !== null : f.target === null || !whole(f.target, 0, 10000))
    return 'A batch has a planned number; dough has none.';
  if (!whole(f.recipeVersion, 1, 1_000_000) || !whole(f.dropNo, 0, 100000))
    return 'The recipe version or the week is not valid.';
  for (const [name, steps] of Object.entries(f.adj))
    if (name === '' || !whole(steps, -50, 50)) return 'An adjustment is a whole number of steps.';
  if (f.kind === 'dough' && Object.keys(f.adj).length > 0) return 'Dough has no adjustments.';
  if (!Number.isInteger(f.at) || f.at < 100_000_000_000 || f.at > 99_999_999_999_999)
    return 'The time is not valid.';
  return null;
}

function parseShortfall(json: unknown): Shortfall[] | null {
  if (!Array.isArray(json)) return null;
  const out: Shortfall[] = [];
  for (const s of json) {
    if (
      typeof s !== 'object' ||
      s === null ||
      typeof (s as { name?: unknown }).name !== 'string' ||
      typeof (s as { by?: unknown }).by !== 'number' ||
      typeof (s as { unit?: unknown }).unit !== 'string'
    )
      return null;
    out.push({
      name: (s as Shortfall).name,
      by: (s as Shortfall).by,
      unit: (s as Shortfall).unit
    });
  }
  return out;
}

function classify(code: string): 'refused' | 'stale' | 'offline' {
  // P0002: the recipe (or the order) is not what the screen showed. The others are a rule broken or no right to do it.
  if (code === 'P0002') return 'stale';
  return ['22023', '23505', '42501', '23503'].includes(code) ? 'refused' : 'offline';
}

const failed = (outcome: 'refused' | 'stale' | 'offline'): ProductionResult => ({
  outcome,
  duplicate: false,
  usedDough: 0,
  shortfall: []
});

function parseResult(data: unknown, shortKey: string, usedKey: string | null): ProductionResult {
  const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
  const shortfall = parseShortfall(row?.[shortKey]);
  if (!row || !shortfall || typeof row.duplicate !== 'boolean') return failed('offline');
  const used = usedKey ? row[usedKey] : 0;
  return {
    outcome: 'saved',
    duplicate: row.duplicate,
    usedDough: typeof used === 'number' ? used : 0,
    shortfall
  };
}

/** Sends one dough mix or batch. `saved` includes an identical retry (answered, never applied twice). */
export async function recordProduction(
  client: ProductionClient,
  f: ProductionFields
): Promise<ProductionResult> {
  try {
    const { data, error } = await client.rpc('record_production', {
      p_rec: {
        id: f.id,
        kind: f.kind,
        product_id: f.productId,
        qty: f.qty,
        target: f.target,
        rejects: f.rejects,
        adj: f.adj,
        recipe_version: f.recipeVersion,
        drop_no: f.dropNo,
        at: f.at
      }
    });
    if (error) return failed(classify(error.code ?? ''));
    return parseResult(data, 'shortfall', 'used_dough');
  } catch {
    return failed('offline');
  }
}

/** Packing an order: its packaging comes off stock, once per order however often it is packed. */
export async function recordPack(
  client: ProductionClient,
  orderId: string,
  dropNo: number
): Promise<ProductionResult> {
  if (orderId === '' || orderId.length > 64 || !whole(dropNo, 0, 100000)) return failed('refused');
  try {
    const { data, error } = await client.rpc('record_pack', { p_order: orderId, p_drop: dropNo });
    if (error) return failed(classify(error.code ?? ''));
    return parseResult(data, 'shortfall', null);
  } catch {
    return failed('offline');
  }
}

export interface DiscardFields {
  /** A uuid minted once per action: a retry of the same action is answered, never applied twice. */
  id: string;
  kind: 'dough' | 'baked';
  productId: string;
  qty: number;
  reason: string;
  dropNo: number;
  /** Epoch milliseconds. */
  at: number;
}

const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

/** The same bounds `record_discard` enforces. Null means the discard is acceptable. */
export function discardError(f: DiscardFields): string | null {
  if (!UUID.test(f.id) || f.productId === '')
    return 'This change has no id yet. Reload and try again.';
  if (f.kind !== 'dough' && f.kind !== 'baked') return 'That is not dough or baked cookies.';
  if (!whole(f.qty, 1, 10000)) return 'Enter a whole number from 1 to 10000.';
  const reason = f.reason.trim();
  if (reason.length < 1 || reason.length > 80 || CONTROL_CHARS.test(reason))
    return 'The reason is 1 to 80 characters.';
  if (!whole(f.dropNo, 0, 100000)) return 'The week is not valid.';
  if (!Number.isInteger(f.at) || f.at < 100_000_000_000 || f.at > 99_999_999_999_999)
    return 'The time is not valid.';
  return null;
}

export interface DiscardResult {
  outcome: 'saved' | 'refused' | 'offline';
  duplicate: boolean;
}

/** Sends one discard. `saved` includes an identical retry (answered, never applied twice). */
export async function recordDiscard(
  client: ProductionClient,
  f: DiscardFields
): Promise<DiscardResult> {
  try {
    const { data, error } = await client.rpc('record_discard', {
      p_rec: {
        id: f.id,
        kind: f.kind,
        product_id: f.productId,
        qty: f.qty,
        reason: f.reason.trim(),
        drop_no: f.dropNo,
        at: f.at
      }
    });
    if (error) {
      const code = error.code ?? '';
      return {
        outcome: ['22023', '23505', '42501', 'P0002', '23503'].includes(code)
          ? 'refused'
          : 'offline',
        duplicate: false
      };
    }
    const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
    if (!row || typeof row.duplicate !== 'boolean') return { outcome: 'offline', duplicate: false };
    return { outcome: 'saved', duplicate: row.duplicate };
  } catch {
    return { outcome: 'offline', duplicate: false };
  }
}

export interface BatchRow {
  productId: string;
  qty: number;
  target: number;
  rejects: number;
  version: number;
  at: number;
}

export interface Production {
  batches: BatchRow[];
  dough: { productId: string; balls: number; at: number | null }[];
  baked: { productId: string; qty: number }[];
  shortfalls: {
    kind: string;
    productId: string | null;
    ref: string;
    short: Shortfall[];
    at: number;
  }[];
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Strict: anything unexpected is no answer at all, so the screens never show half of what the database holds. */
export function parseProduction(json: Json | null | undefined): Production | null {
  if (!isObj(json)) return null;
  const { batches, dough, baked, shortfalls } = json;
  if (
    !Array.isArray(batches) ||
    !Array.isArray(dough) ||
    !Array.isArray(baked) ||
    !Array.isArray(shortfalls)
  )
    return null;
  const out: Production = { batches: [], dough: [], baked: [], shortfalls: [] };
  for (const b of batches) {
    if (
      !isObj(b) ||
      typeof b.product_id !== 'string' ||
      typeof b.qty !== 'number' ||
      typeof b.rejects !== 'number' ||
      typeof b.version !== 'number' ||
      typeof b.at !== 'number' ||
      !(typeof b.target === 'number' || b.target === null)
    )
      return null;
    out.batches.push({
      productId: b.product_id,
      qty: b.qty,
      target: typeof b.target === 'number' ? b.target : b.qty,
      rejects: b.rejects,
      version: b.version,
      at: b.at
    });
  }
  for (const d of dough) {
    if (
      !isObj(d) ||
      typeof d.product_id !== 'string' ||
      typeof d.balls !== 'number' ||
      !(typeof d.at === 'number' || d.at === null)
    )
      return null;
    out.dough.push({ productId: d.product_id, balls: d.balls, at: d.at as number | null });
  }
  for (const k of baked) {
    if (!isObj(k) || typeof k.product_id !== 'string' || typeof k.qty !== 'number') return null;
    out.baked.push({ productId: k.product_id, qty: k.qty });
  }
  for (const s of shortfalls) {
    const short = isObj(s) ? parseShortfall(s.short) : null;
    if (
      !isObj(s) ||
      !short ||
      typeof s.kind !== 'string' ||
      typeof s.ref !== 'string' ||
      typeof s.at !== 'number' ||
      !(typeof s.product_id === 'string' || s.product_id === null)
    )
      return null;
    out.shortfalls.push({
      kind: s.kind,
      productId: s.product_id as string | null,
      ref: s.ref,
      short,
      at: s.at
    });
  }
  return out;
}

export async function fetchProduction(
  client: ProductionClient,
  dropNo: number
): Promise<Production> {
  const { data, error } = await client.rpc('get_production', { p_drop: dropNo });
  if (error) throw new Error('production load failed: ' + (error.code || error.message));
  const rows = parseProduction(data);
  if (!rows) throw new Error('production answer was not understood');
  return rows;
}

/**
 * The engine's state keys as the screens read them: `batches` (the recipes screen's "baked on this version"), `variances` and
 * `shortfalls` (the records screen), `dough` and `doughAt` (the chiller), `baked` (baked and not yet packed this week).
 * `shortName` is the flavour's short name, used in the shortfall's "when".
 */
export function engineProduction(p: Production, shortName: (pid: string) => string) {
  const dough: Record<string, number> = {};
  const doughAt: Record<string, number> = {};
  for (const d of p.dough) {
    dough[d.productId] = d.balls;
    if (d.at !== null) doughAt[d.productId] = d.at;
  }
  const baked: Record<string, number> = {};
  for (const k of p.baked) baked[k.productId] = k.qty;
  const when = (kind: string, pid: string | null, ref: string): string =>
    kind === 'dough'
      ? 'Dough — ' + shortName(pid ?? '')
      : kind === 'batch'
        ? 'Bake — ' + shortName(pid ?? '')
        : kind === 'pack'
          ? 'Packing — order ' + ref
          : 'Bazaar sale';
  return {
    batches: p.batches.map((b) => ({
      pid: b.productId,
      qty: b.qty,
      version: b.version,
      at: b.at,
      rejects: b.rejects
    })),
    variances: p.batches.map((b) => ({
      pid: b.productId,
      target: b.target,
      actual: b.qty,
      rejects: b.rejects,
      at: b.at
    })),
    dough,
    doughAt,
    baked,
    shortfalls: p.shortfalls.flatMap((s) =>
      s.short.map((x) => ({
        name: x.name,
        by: x.by,
        unit: x.unit,
        when: when(s.kind, s.productId, s.ref),
        at: s.at
      }))
    )
  };
}
