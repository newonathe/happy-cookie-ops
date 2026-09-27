import type { Role } from '@/store/engine/ops-engine';
import {
  SETTING_COLUMNS,
  cfgValueFromRow,
  dbValueFor,
  fetchSettings,
  saveSetting,
  type SettingsClient,
  type SettingsRow
} from '@/lib/data/settings';

/**
 * What the sync needs from the engine. `OpsRuntime` implements it; tests fake it. `read`
 * and `apply` take setting keys: the host knows which live in `cfg` and which at the top of
 * the engine's state (`STATE_LEVEL_KEYS`).
 */
export interface SettingsHost {
  role(): Role;
  read(key: string): unknown;
  apply(patch: Record<string, unknown>): void;
  online(): boolean;
  toast(message: string, tone?: 'ok' | 'warn'): void;
}

/** A fast run of ± taps settles into one request per key, sent this long after the last. */
export const SAVE_DEBOUNCE_MS = 600;

export const SETTINGS_TOASTS = {
  conflict: 'Someone else changed this setting just now. Showing their version.',
  offline: 'Offline. That change did not save, so it is back to what it was.',
  rejected: 'That change could not be saved, so it is back to what it was.',
  fraction: 'Use a whole number here. The change did not save.'
} as const;

type Saved = { value: unknown; updatedAt: string | null };

/** Same value by content: a toggled-back channel or list is a new object with old contents. */
function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Keeps `cfg` and the `settings` table in step (MP-09 b2). The engine's own settings
 * actions still change `cfg` optimistically; `OpsRuntime` then calls `queue(key)`, and
 * this sends one `save_setting` per key once the edits stop, with the `updated_at` it
 * last read. The database decides: a stale write comes back as a conflict and this
 * reloads; a refusal or no network puts the key back to its last saved value.
 */
export class SettingsSync {
  private readonly saved = new Map<string, Saved>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly inFlight = new Set<string>();
  private defaults: Record<string, unknown> = {};

  constructor(
    private readonly client: SettingsClient,
    private readonly host: SettingsHost
  ) {}

  /**
   * First load after a verified sign-in. `defaults` holds the engine's own defaults for every
   * setting key (`DEFAULT_CFG` plus `BASE_STATE()`'s lists): every key
   * the role's projection does not return (a helper never gets a cost key) stays at its
   * default, never at whatever the device showed before. False if the read failed; `cfg`
   * then stays at its defaults.
   */
  async load(defaults: Record<string, unknown>): Promise<boolean> {
    this.defaults = { ...defaults };
    let rows: SettingsRow[];
    try {
      rows = await fetchSettings(this.client, this.host.role());
    } catch {
      return false;
    }
    const values: Record<string, unknown> = { ...defaults };
    for (const row of rows) {
      const value = cfgValueFromRow(row);
      if (value === undefined) continue;
      values[row.key] = value;
      this.saved.set(row.key, { value, updatedAt: row.updated_at ?? null });
    }
    this.host.apply(values);
    return true;
  }

  /**
   * Re-read after a conflict or a reset. A key with an edit still waiting or on its way
   * keeps both its local value and the `updated_at` it was edited against, so that edit
   * is neither lost nor allowed to overwrite someone else's change unchecked.
   */
  async reload(): Promise<boolean> {
    let rows: SettingsRow[];
    try {
      rows = await fetchSettings(this.client, this.host.role());
    } catch {
      return false;
    }
    const patch: Record<string, unknown> = {};
    for (const row of rows) {
      const value = cfgValueFromRow(row);
      if (value === undefined || this.busy(row.key)) continue;
      patch[row.key] = value;
      this.saved.set(row.key, { value, updatedAt: row.updated_at ?? null });
    }
    this.host.apply(patch);
    return true;
  }

  /** Called after any engine action that may have changed the setting `key`. */
  queue(key: string): void {
    if (!(key in SETTING_COLUMNS)) return;
    clearTimeout(this.timers.get(key));
    this.timers.set(
      key,
      setTimeout(() => void this.flush(key), SAVE_DEBOUNCE_MS)
    );
  }

  dispose(): void {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
  }

  private busy(key: string): boolean {
    return this.timers.has(key) || this.inFlight.has(key);
  }

  private async flush(key: string): Promise<void> {
    this.timers.delete(key);
    if (this.inFlight.has(key)) {
      this.queue(key);
      return;
    }
    const value = this.host.read(key);
    const last = this.saved.get(key);
    if (same(last ? last.value : this.defaults[key], value)) return;

    const db = dbValueFor(key, value);
    if (!db.ok) return this.fail(key, db.reason === 'fraction' ? 'fraction' : 'rejected');
    if (!this.host.online()) return this.fail(key, 'offline');

    this.inFlight.add(key);
    const result = await saveSetting(this.client, key, db.value, last?.updatedAt ?? null);
    this.inFlight.delete(key);

    if (result.status === 'saved') {
      this.saved.set(key, { value, updatedAt: result.updatedAt });
    } else if (result.status === 'conflict') {
      if (await this.reload()) this.host.toast(SETTINGS_TOASTS.conflict, 'warn');
      else this.fail(key, 'offline');
    } else {
      this.fail(key, result.status);
    }
  }

  /** Back to the last saved value, unless a newer edit is already waiting to be sent. */
  private fail(key: string, why: 'offline' | 'rejected' | 'fraction'): void {
    if (!this.timers.has(key)) {
      const last = this.saved.get(key);
      this.host.apply({ [key]: last ? last.value : this.defaults[key] });
    }
    this.host.toast(SETTINGS_TOASTS[why], 'warn');
  }
}
