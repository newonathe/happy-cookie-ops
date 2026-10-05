import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/types/database';
import type { Role } from '@/store/engine/ops-engine';
import { centavosFromDb, centavosToPesos, pesosToCentavos } from '@/lib/money';

/**
 * Settings rows ↔ the engine's state, for MP-09 b2/b3 (docs/state/G2-plan.md "Slice audit").
 *
 * The database stores each key in one column (`save_setting`, newest in migration
 * 20260101002900); the engine keeps most of them in one flat `cfg` object in pesos. This is
 * the one place that knows which key lives in which column. Only the four `cents` keys are
 * money in centavos — `discountA`/`discountB` are whole pesos in `int_value`, inherited from
 * migration 00700. The b3 kinds live in `json_value`: `half` (a number on a 0.5 step),
 * `channels` (alert name → on/off) and `list` (text items). `tests/unit/settings-parity.test.ts`
 * checks this map against `tests/fixtures/settings-cases.json`, so the rule lives in one place.
 */
export type SettingColumn = 'int' | 'cents' | 'text' | 'half' | 'channels' | 'list';

export const SETTING_COLUMNS: Readonly<Record<string, SettingColumn>> = {
  capacity: 'int',
  taxRate: 'half',
  drawerFloat: 'cents',
  discountA: 'int',
  discountB: 'int',
  restHours: 'int',
  doughWarnDays: 'int',
  groceryBudget: 'cents',
  packagingFee: 'cents',
  flatBoxPrice: 'cents',
  cogsMultiple: 'half',
  priceMode: 'text',
  openDow: 'int',
  openH: 'int',
  openM: 'int',
  closeDow: 'int',
  closeH: 'int',
  closeM: 'int',
  extendH: 'int',
  retention: 'text',
  maxPerOrder: 'int',
  idleMinutesOwner: 'int',
  idleMinutesSupport: 'int',
  idleMinutesHelper: 'int',
  channels: 'channels',
  categories: 'list',
  inactiveCats: 'list',
  helperSeesSales: 'int',
  offlineOpenHours: 'int'
};

/** Keys the engine keeps at the top of its state, not inside `cfg`. */
export const STATE_LEVEL_KEYS: ReadonlySet<string> = new Set([
  'channels',
  'categories',
  'inactiveCats'
]);

export type SettingsRow = Database['public']['Functions']['get_settings']['Returns'][number];
export type SettingsClient = Pick<SupabaseClient<Database>, 'rpc'>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isTextList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');
const isChannels = (value: unknown): value is Record<string, boolean> =>
  isRecord(value) && Object.values(value).every((on) => typeof on === 'boolean');

/**
 * A key's value as the engine holds it, from its row. `undefined` (skip the key, keep the
 * engine's default) for an unknown key or a stored value of the wrong shape.
 */
export function cfgValueFromRow(row: SettingsRow): unknown {
  const column = SETTING_COLUMNS[row.key];
  if (column === 'cents') {
    return row.cents_value == null ? null : centavosToPesos(centavosFromDb(row.cents_value));
  }
  if (column === 'int') return row.int_value == null ? null : Number(row.int_value);
  if (column === 'text') return row.text_value ?? null;
  const json: unknown = row.json_value;
  if (column === 'half') return typeof json === 'number' ? json : undefined;
  if (column === 'channels') return isChannels(json) ? json : undefined;
  if (column === 'list') return isTextList(json) ? json : undefined;
  return undefined;
}

export type DbValue =
  { ok: true; value: Json } | { ok: false; reason: 'unknown' | 'fraction' | 'type' };

/**
 * The engine's value as `save_setting` expects it. Rejects on the client what the server
 * would reject anyway: a fraction off the key's step (the engine's typed inputs accept any
 * decimal), or the wrong shape. The server still checks everything, including list bounds.
 */
export function dbValueFor(key: string, value: unknown): DbValue {
  const column = SETTING_COLUMNS[key];
  if (!column) return { ok: false, reason: 'unknown' };
  if (column === 'text') {
    return typeof value === 'string' ? { ok: true, value } : { ok: false, reason: 'type' };
  }
  if (column === 'channels') {
    return isChannels(value) ? { ok: true, value } : { ok: false, reason: 'type' };
  }
  if (column === 'list') {
    return isTextList(value) ? { ok: true, value } : { ok: false, reason: 'type' };
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return { ok: false, reason: 'type' };
  if (column === 'cents') return { ok: true, value: pesosToCentavos(value) };
  const step = column === 'half' ? value * 2 : value;
  return Number.isInteger(step) ? { ok: true, value } : { ok: false, reason: 'fraction' };
}

/** The owner reads every key; helper and support read the staff-safe projection only. */
export async function fetchSettings(client: SettingsClient, role: Role): Promise<SettingsRow[]> {
  const { data, error } =
    role === 'owner'
      ? await client.rpc('get_settings')
      : await client.rpc('get_operating_settings');
  if (error) throw new Error('settings load failed: ' + (error.code || error.message));
  return data ?? [];
}

export type SaveResult =
  | { status: 'saved'; updatedAt: string }
  | { status: 'conflict' }
  | { status: 'rejected' }
  | { status: 'offline' };

/**
 * One `save_setting` call, classified. `P0002` is the RPC's stale-`updated_at` signal;
 * any other SQLSTATE or PostgREST code is a refusal (validation `22023`, the owner gate
 * `42501`); no code at all means the request never reached the database.
 */
export async function saveSetting(
  client: SettingsClient,
  key: string,
  value: Json,
  expectedUpdatedAt: string | null
): Promise<SaveResult> {
  try {
    const { data, error } = await client.rpc('save_setting', {
      p_key: key,
      p_value: value,
      // null for a key still at its default; the generated type omits the nullability.
      p_expected_updated_at: expectedUpdatedAt as string
    });
    if (error) {
      if (error.code === 'P0002') return { status: 'conflict' };
      return error.code ? { status: 'rejected' } : { status: 'offline' };
    }
    const row = data?.[0];
    return row ? { status: 'saved', updatedAt: row.updated_at } : { status: 'rejected' };
  } catch {
    return { status: 'offline' };
  }
}
