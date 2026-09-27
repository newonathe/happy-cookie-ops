import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import type { Role } from '@/store/engine/ops-engine';
import { centavosFromDb, centavosToPesos, pesosToCentavos } from '@/lib/money';

/**
 * Settings rows ↔ the engine's `cfg`, for MP-09 b2 (docs/state/G2-plan.md "Slice audit").
 *
 * The database stores each key in one typed column (migration 20260101002800,
 * `save_setting`); the engine keeps one flat `cfg` object in pesos. This is the one place
 * that knows which key lives in which column. Only the four `cents` keys are money in
 * centavos — `discountA`/`discountB` are whole pesos in `int_value`, inherited from
 * migration 00700. `tests/unit/settings-parity.test.ts` checks this map against
 * `tests/fixtures/settings-cases.json`, so the column rule lives in one place.
 */
export type SettingColumn = 'int' | 'cents' | 'text';

export const SETTING_COLUMNS: Readonly<Record<string, SettingColumn>> = {
  capacity: 'int',
  taxRate: 'int',
  drawerFloat: 'cents',
  discountA: 'int',
  discountB: 'int',
  restHours: 'int',
  doughWarnDays: 'int',
  groceryBudget: 'cents',
  packagingFee: 'cents',
  flatBoxPrice: 'cents',
  cogsMultiple: 'int',
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
  idleMinutesHelper: 'int'
};

export type SettingsRow = Database['public']['Functions']['get_settings']['Returns'][number];
export type SettingsClient = Pick<SupabaseClient<Database>, 'rpc'>;
export type CfgValue = number | string | null;

/** A key's value as the engine holds it, from its row. Unknown keys are skipped. */
export function cfgValueFromRow(row: SettingsRow): CfgValue | undefined {
  const column = SETTING_COLUMNS[row.key];
  if (column === 'cents') {
    return row.cents_value == null ? null : centavosToPesos(centavosFromDb(row.cents_value));
  }
  if (column === 'int') return row.int_value == null ? null : Number(row.int_value);
  if (column === 'text') return row.text_value ?? null;
  return undefined;
}

export type DbValue =
  { ok: true; value: number | string } | { ok: false; reason: 'unknown' | 'fraction' | 'type' };

/**
 * The engine's value as `save_setting` expects it. Rejects on the client what the server
 * would reject anyway: a fraction for a whole-number column (the engine's typed inputs
 * accept decimals), or the wrong type.
 */
export function dbValueFor(key: string, value: unknown): DbValue {
  const column = SETTING_COLUMNS[key];
  if (!column) return { ok: false, reason: 'unknown' };
  if (column === 'text') {
    return typeof value === 'string' ? { ok: true, value } : { ok: false, reason: 'type' };
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return { ok: false, reason: 'type' };
  if (column === 'cents') return { ok: true, value: pesosToCentavos(value) };
  return Number.isInteger(value) ? { ok: true, value } : { ok: false, reason: 'fraction' };
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
  value: number | string,
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
