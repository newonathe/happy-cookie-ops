import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CFG } from '@/store/engine/ops-engine';
import type { Role } from '@/store/engine/ops-engine';
import { dbValueFor, type SettingsClient, type SettingsRow } from '@/lib/data/settings';
import {
  SAVE_DEBOUNCE_MS,
  SETTINGS_TOASTS,
  SettingsSync,
  type SettingsHost
} from '@/lib/data/settings-sync';

/**
 * MP-09 b2: settings load into `cfg` on sign-in and save through `save_setting`, debounced
 * per key, with conflict reload and offline revert. The client is faked at the `rpc` level,
 * so these exercise the real adapter (`src/lib/data/settings.ts`) and the real error codes
 * the migration raises (`P0002` stale, `22023` validation).
 */
const COST_KEYS = [
  'taxRate',
  'drawerFloat',
  'groceryBudget',
  'packagingFee',
  'flatBoxPrice',
  'cogsMultiple'
];

function row(key: string, values: Partial<SettingsRow>): SettingsRow {
  return {
    key,
    int_value: null as unknown as number,
    text_value: null as unknown as string,
    cents_value: null as unknown as number,
    is_default: false,
    updated_at: '2026-09-27T01:00:00.000Z',
    ...values
  };
}

type RpcResult = { data: unknown; error: { code: string; message: string } | null };

function fakeClient(
  handlers: Record<string, (args?: Record<string, unknown>) => RpcResult | Promise<RpcResult>>
) {
  const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
    const handler = handlers[name];
    if (!handler) throw new Error('unexpected rpc ' + name);
    return handler(args);
  });
  return { client: { rpc } as unknown as SettingsClient, rpc };
}

function fakeHost(role: Role, start: Record<string, unknown> = { ...DEFAULT_CFG }) {
  const host = {
    cfgState: { ...start } as Record<string, unknown>,
    isOnline: true,
    toasts: [] as string[],
    role: () => role,
    cfg: () => host.cfgState,
    applyCfg: (patch: Record<string, unknown>) => {
      host.cfgState = { ...host.cfgState, ...patch };
    },
    online: () => host.isOnline,
    toast: (message: string) => {
      host.toasts.push(message);
    }
  };
  return host satisfies SettingsHost;
}

const OWNER_ROWS = [
  row('capacity', { int_value: 320 }),
  row('taxRate', { int_value: 5 }),
  // bigint columns can arrive as strings through the client; centavosFromDb handles both.
  row('packagingFee', { cents_value: '4250' as unknown as number }),
  row('drawerFloat', { cents_value: 150000 }),
  row('priceMode', { text_value: 'Flat price per box' }),
  row('retention', { text_value: '2 years' }),
  row('idleMinutesHelper', { int_value: 180 })
];

describe('SettingsSync.load', () => {
  it('loads the owner’s real database values into cfg, converting centavos to pesos', async () => {
    const { client, rpc } = fakeClient({ get_settings: () => ({ data: OWNER_ROWS, error: null }) });
    const host = fakeHost('owner');
    await expect(new SettingsSync(client, host).load(DEFAULT_CFG)).resolves.toBe(true);

    expect(rpc).toHaveBeenCalledWith('get_settings');
    expect(host.cfgState).toMatchObject({
      capacity: 320,
      taxRate: 5,
      packagingFee: 42.5,
      drawerFloat: 1500,
      priceMode: 'Flat price per box',
      retention: '2 years',
      idleMinutesHelper: 180
    });
  });

  it('loads the staff projection for a helper and never shows a cost key from the device', async () => {
    const { client, rpc } = fakeClient({
      get_operating_settings: () => ({
        data: [row('capacity', { int_value: 320 }), row('maxPerOrder', { int_value: 12 })],
        error: null
      })
    });
    // A stale value left in memory (a cost key the helper must not see) is replaced by the default.
    const host = fakeHost('helper', { ...DEFAULT_CFG, packagingFee: 99, taxRate: 9 });
    await new SettingsSync(client, host).load(DEFAULT_CFG);

    expect(rpc).toHaveBeenCalledWith('get_operating_settings');
    expect(rpc).not.toHaveBeenCalledWith('get_settings');
    expect(host.cfgState).toMatchObject({ capacity: 320, maxPerOrder: 12 });
    for (const key of COST_KEYS) expect(host.cfgState[key]).toBe(DEFAULT_CFG[key]);
  });

  it('keeps the defaults when the read fails', async () => {
    const { client } = fakeClient({
      get_operating_settings: () => ({
        data: null,
        error: { code: '', message: 'Failed to fetch' }
      })
    });
    const host = fakeHost('support');
    await expect(new SettingsSync(client, host).load(DEFAULT_CFG)).resolves.toBe(false);
    expect(host.cfgState).toEqual({ ...DEFAULT_CFG });
  });
});

describe('SettingsSync saves', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function loadedOwner(handlers: Parameters<typeof fakeClient>[0]) {
    const faked = fakeClient({
      get_settings: () => ({ data: OWNER_ROWS, error: null }),
      ...handlers
    });
    const host = fakeHost('owner');
    const sync = new SettingsSync(faked.client, host);
    await sync.load(DEFAULT_CFG);
    faked.rpc.mockClear();
    return { ...faked, host, sync };
  }

  const saves = (rpc: ReturnType<typeof vi.fn>) =>
    rpc.mock.calls.filter(([name]) => name === 'save_setting');

  it('coalesces a fast run of edits into one save with the value and updated_at it last read', async () => {
    const { rpc, host, sync } = await loadedOwner({
      save_setting: () => ({
        data: [{ key: 'capacity', updated_at: '2026-09-27T02:00:00.000Z' }],
        error: null
      })
    });
    for (const capacity of [330, 340, 350, 360]) {
      host.applyCfg({ capacity });
      sync.queue('capacity');
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS - 100);
    }
    expect(saves(rpc)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(100);

    expect(saves(rpc)).toEqual([
      [
        'save_setting',
        { p_key: 'capacity', p_value: 360, p_expected_updated_at: '2026-09-27T01:00:00.000Z' }
      ]
    ]);
    expect(host.toasts).toEqual([]);
  });

  it('sends money back as centavos, and a key still at its default with a null updated_at', async () => {
    const { rpc, host, sync } = await loadedOwner({
      save_setting: () => ({
        data: [{ key: 'groceryBudget', updated_at: '2026-09-27T02:00:00.000Z' }],
        error: null
      })
    });
    host.applyCfg({ groceryBudget: 6500 });
    sync.queue('groceryBudget');
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(saves(rpc)[0]?.[1]).toEqual({
      p_key: 'groceryBudget',
      p_value: 650000,
      p_expected_updated_at: null
    });
  });

  it('on a conflict reloads and toasts, keeping an unrelated edit that is still waiting to save', async () => {
    let reloads = 0;
    const { rpc, host, sync } = await loadedOwner({
      save_setting: ({ p_key } = {}) =>
        p_key === 'capacity'
          ? { data: null, error: { code: 'P0002', message: 'settings save conflict: capacity' } }
          : { data: [{ key: String(p_key), updated_at: '2026-09-27T03:00:00.000Z' }], error: null }
    });
    rpc.mockImplementation(async (name: string, args?: Record<string, unknown>) => {
      if (name === 'get_settings') {
        reloads += 1;
        return {
          data: [
            row('capacity', { int_value: 400, updated_at: '2026-09-27T02:30:00.000Z' }),
            row('maxPerOrder', { int_value: 30, updated_at: '2026-09-27T02:30:00.000Z' })
          ],
          error: null
        };
      }
      return args?.p_key === 'capacity'
        ? { data: null, error: { code: 'P0002', message: 'conflict' } }
        : {
            data: [{ key: String(args?.p_key), updated_at: '2026-09-27T03:00:00.000Z' }],
            error: null
          };
    });

    host.applyCfg({ capacity: 330 });
    sync.queue('capacity');
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS - 200);
    host.applyCfg({ maxPerOrder: 18 });
    sync.queue('maxPerOrder');
    await vi.advanceTimersByTimeAsync(200);

    expect(reloads).toBe(1);
    expect(host.toasts).toEqual([SETTINGS_TOASTS.conflict]);
    expect(host.cfgState.capacity).toBe(400);
    expect(host.cfgState.maxPerOrder).toBe(18);

    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    // The waiting edit is sent against the updated_at it was made on (the default: null),
    // not the reloaded one, so it cannot silently overwrite the other person's change.
    expect(saves(rpc).at(-1)?.[1]).toEqual({
      p_key: 'maxPerOrder',
      p_value: 18,
      p_expected_updated_at: null
    });
  });

  it('offline: reverts the optimistic change and toasts, without calling the database', async () => {
    const { rpc, host, sync } = await loadedOwner({});
    host.isOnline = false;
    host.applyCfg({ capacity: 500 });
    sync.queue('capacity');
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);

    expect(rpc).not.toHaveBeenCalled();
    expect(host.cfgState.capacity).toBe(320);
    expect(host.toasts).toEqual([SETTINGS_TOASTS.offline]);
  });

  it('a request that never reaches the database is treated as offline and reverted', async () => {
    const { host, sync } = await loadedOwner({
      save_setting: () => {
        throw new TypeError('Failed to fetch');
      }
    });
    host.applyCfg({ retention: '6 months' });
    sync.queue('retention');
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(host.cfgState.retention).toBe('2 years');
    expect(host.toasts).toEqual([SETTINGS_TOASTS.offline]);
  });

  it('a value the database refuses is reverted with its own toast', async () => {
    const { host, sync } = await loadedOwner({
      save_setting: () => ({
        data: null,
        error: { code: '22023', message: 'settings value out of range' }
      })
    });
    host.applyCfg({ capacity: 590 });
    sync.queue('capacity');
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(host.cfgState.capacity).toBe(320);
    expect(host.toasts).toEqual([SETTINGS_TOASTS.rejected]);
  });

  it('a half step on a whole-number key is reverted on the device, never sent', async () => {
    const { rpc, host, sync } = await loadedOwner({});
    host.applyCfg({ taxRate: 5.5 });
    sync.queue('taxRate');
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(rpc).not.toHaveBeenCalled();
    expect(host.cfgState.taxRate).toBe(5);
    expect(host.toasts).toEqual([SETTINGS_TOASTS.fraction]);
  });

  it('does nothing when the value is back to what was saved', async () => {
    const { rpc, host, sync } = await loadedOwner({});
    host.applyCfg({ capacity: 330 });
    sync.queue('capacity');
    host.applyCfg({ capacity: 320 });
    sync.queue('capacity');
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('dbValueFor', () => {
  it('rounds pesos to whole centavos for money keys (38.44 is not 3843)', () => {
    expect(dbValueFor('packagingFee', 38.44)).toEqual({ ok: true, value: 3844 });
  });

  it('keeps discounts in whole pesos, as migration 00700 stores them', () => {
    expect(dbValueFor('discountA', 25)).toEqual({ ok: true, value: 25 });
  });

  it('refuses unknown keys, fractions and wrong types before any request', () => {
    expect(dbValueFor('channels', {})).toEqual({ ok: false, reason: 'unknown' });
    expect(dbValueFor('cogsMultiple', 4.5)).toEqual({ ok: false, reason: 'fraction' });
    expect(dbValueFor('retention', 365)).toEqual({ ok: false, reason: 'type' });
  });
});
