import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, render } from '@testing-library/react';

let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));

import { OpsRuntime } from '@/store/ops-runtime';
import type { Role } from '@/store/engine/ops-engine';
import { SAVE_DEBOUNCE_MS } from '@/lib/data/settings-sync';
import type { SettingsClient } from '@/lib/data/settings';

/**
 * MP-09 b2 through the real engine: a verified sign-in loads settings into `cfg`, the
 * engine's own settings actions queue `save_setting`, and the live owner's rules sheet
 * gains the DP-15 idle-minutes rows.
 */
function settingsRow(
  key: string,
  int_value: number | null,
  cents_value: number | null = null,
  json_value: unknown = null
) {
  return {
    key,
    int_value,
    cents_value,
    json_value,
    text_value: null,
    is_default: false,
    updated_at: '2026-09-27T01:00:00.000Z'
  };
}

function fakeClient() {
  const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
    if (name === 'get_settings' || name === 'get_operating_settings') {
      return {
        data: [
          settingsRow('capacity', 320),
          settingsRow('extendH', 24),
          settingsRow('idleMinutesOwner', 90),
          settingsRow('categories', null, null, ['Ingredients', 'Packaging', 'Delivery']),
          settingsRow('inactiveCats', null, null, ['Delivery']),
          ...(name === 'get_settings'
            ? [settingsRow('packagingFee', null, 4250), settingsRow('taxRate', null, null, 3)]
            : [])
        ],
        error: null
      };
    }
    return { data: [{ key: args?.p_key, updated_at: '2026-09-27T02:00:00.000Z' }], error: null };
  });
  return { client: { rpc } as unknown as SettingsClient, rpc };
}

async function mountedRuntime(role: Role) {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
  const runtime = ref.current!;
  act(() => runtime.setRole(role));
  const { client, rpc } = fakeClient();
  await act(async () => {
    await runtime.loadSettings(client, role);
  });
  rpc.mockClear();
  return { runtime, rpc };
}

const saveCalls = (rpc: ReturnType<typeof vi.fn>) =>
  rpc.mock.calls.filter(([name]) => name === 'save_setting').map(([, args]) => args);

describe('OpsRuntime settings (MP-09 b2, live mode)', () => {
  beforeEach(() => {
    live = true;
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('a verified owner sign-in loads database values into cfg, money in pesos', async () => {
    const { runtime } = await mountedRuntime('owner');
    expect(runtime.state.cfg).toMatchObject({
      capacity: 320,
      extendH: 24,
      packagingFee: 42.5,
      idleMinutesOwner: 90
    });
  });

  it('a helper sign-in keeps the default for every cost key', async () => {
    const { runtime } = await mountedRuntime('helper');
    expect(runtime.state.cfg).toMatchObject({ capacity: 320, packagingFee: 38.44 });
  });

  it('the category lists load at the top of state, where the engine reads them (MP-09 b3)', async () => {
    const { runtime } = await mountedRuntime('helper');
    expect(runtime.state.categories).toEqual(['Ingredients', 'Packaging', 'Delivery']);
    expect(runtime.state.inactiveCats).toEqual(['Delivery']);
    expect((runtime.state.cfg as Record<string, unknown>).categories).toBeUndefined();
    // Not returned by this fake projection, so it stays at the engine's own default.
    expect(Object.keys(runtime.state.channels as object)).toHaveLength(8);
  });

  it('adding, renaming and switching off a category, and an alert toggle, each save their list', async () => {
    const { runtime, rpc } = await mountedRuntime('owner');
    act(() => {
      runtime.addCategory('Stickers');
      runtime.renameCategory('Packaging', 'Boxes and bags');
      runtime.toggleCategory('Ingredients');
      runtime.toggleChannel('Low stock');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    });
    const byKey = Object.fromEntries(
      saveCalls(rpc).map((args) => [(args as { p_key: string }).p_key, args])
    );
    expect(Object.keys(byKey).sort()).toEqual(['categories', 'channels', 'inactiveCats']);
    expect(byKey.categories).toMatchObject({
      p_value: ['Ingredients', 'Boxes and bags', 'Delivery', 'Stickers'],
      p_expected_updated_at: '2026-09-27T01:00:00.000Z'
    });
    expect(byKey.inactiveCats).toMatchObject({ p_value: ['Delivery', 'Ingredients'] });
    expect(byKey.channels).toMatchObject({ p_expected_updated_at: null });
    expect((byKey.channels as { p_value: Record<string, boolean> }).p_value['Low stock']).toBe(
      false
    );
  });

  it('the engine’s own ± action queues one save for the key', async () => {
    const { runtime, rpc } = await mountedRuntime('owner');
    act(() => {
      runtime.bumpCfg('capacity', 10, 50, 600);
      runtime.bumpCfg('capacity', 10, 50, 600);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    });
    expect(saveCalls(rpc)).toEqual([
      { p_key: 'capacity', p_value: 340, p_expected_updated_at: '2026-09-27T01:00:00.000Z' }
    ]);
  });

  it('closing a drop saves the extendH reset, so later drops do not close late', async () => {
    const { runtime, rpc } = await mountedRuntime('owner');
    act(() => runtime.closeDrop());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    });
    expect(saveCalls(rpc)).toEqual([
      { p_key: 'extendH', p_value: 0, p_expected_updated_at: '2026-09-27T01:00:00.000Z' }
    ]);
  });

  it('the owner’s rules sheet steps tax by 0.5 again (MP-09 b3) and adds idle minutes', async () => {
    const { runtime } = await mountedRuntime('owner');
    const rules = runtime.renderVals().rules as Array<{
      k?: string;
      label: unknown;
      value: unknown;
      up: () => void;
    }>;
    const tax = rules.find((r) => r.k === 'taxRate')!;
    act(() => tax.up());
    expect(runtime.state.cfg).toMatchObject({ taxRate: 3.5 });

    const idle = rules.filter((r) => String(r.k).startsWith('idleMinutes'));
    expect(idle.map((r) => [r.k, r.value])).toEqual([
      ['idleMinutesOwner', 90],
      ['idleMinutesSupport', 60],
      ['idleMinutesHelper', 240]
    ]);
    act(() => idle[2]!.up());
    expect(runtime.state.cfg).toMatchObject({ idleMinutesHelper: 255 });
  });

  it('helper and support rules carry no idle rows', async () => {
    const { runtime } = await mountedRuntime('helper');
    const rules = runtime.renderVals().rules as Array<{ k?: string }>;
    expect(rules.some((r) => String(r.k).startsWith('idleMinutes'))).toBe(false);
  });

  it('demo mode never loads or saves settings', async () => {
    live = false;
    const ref: { current: OpsRuntime | null } = { current: null };
    render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
    const { client, rpc } = fakeClient();
    await expect(ref.current!.loadSettings(client, 'owner')).resolves.toBe(false);
    act(() => ref.current!.bumpCfg('capacity', 10, 50, 600));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
