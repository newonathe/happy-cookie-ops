import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import type { ScreenKey } from '@/lib/screens';

/**
 * MP-09 c1b: which flavour list the live gate loads. Customer pages read the published menu
 * (`shop_products`) whether or not someone is signed in; the full staff list loads only on a
 * staff screen, so a signed-in owner on /shop sees what customers see.
 */
const { FakeRuntime } = vi.hoisted(() => ({
  FakeRuntime: class {
    state = { screen: 'shop' as ScreenKey, cfg: {} };
    setRole = vi.fn();
    loadSettings = vi.fn();
    loadFlavours = vi.fn();
    loadShopMenu = vi.fn();
  }
}));
vi.mock('@/store/ops-runtime', () => ({ OpsRuntime: FakeRuntime }));
let engine = new FakeRuntime();
vi.mock('@/store/use-ops', () => ({
  useOpsEngine: () => engine,
  useOpsVals: () => ({})
}));
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => true }));
let configured = true;
vi.mock('@/lib/supabase/config', () => ({ hasSupabaseConfig: () => configured }));
vi.mock('@/lib/auth/live-gate', () => ({
  checkStaffProfile: vi.fn(async () => ({ status: 'ok', role: 'owner' })),
  signOutAndRedirect: vi.fn()
}));
vi.mock('@/lib/auth/idle-signout', () => ({
  idleMinutesFor: () => 60,
  startIdleSignOut: () => () => undefined
}));
let authEvent: (event: string) => void = () => {};
const client = {
  auth: {
    onAuthStateChange: (cb: (event: string) => void) => {
      authEvent = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }
  }
};
vi.mock('@/lib/supabase/client', () => ({ createClient: () => client }));

import { LiveGate } from '@/components/app/live-gate';

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('LiveGate: the flavour list each page loads', () => {
  beforeEach(() => {
    engine = new FakeRuntime();
    configured = true;
  });

  it('reads the published menu on a customer page, and never the staff list', async () => {
    render(
      <LiveGate initialScreen="shop">
        <div />
      </LiveGate>
    );
    await act(settle);
    expect(engine.loadShopMenu).toHaveBeenCalledExactlyOnceWith(client);
    // A signed-in owner on /shop: the token refresh verifies her, but the shop stays public.
    await act(async () => {
      authEvent('TOKEN_REFRESHED');
      await settle();
    });
    expect(engine.setRole).toHaveBeenCalledWith('owner');
    expect(engine.loadFlavours).not.toHaveBeenCalled();
  });

  it('loads the staff list once on a staff page, and no shop menu', async () => {
    engine.state.screen = 'today';
    render(
      <LiveGate initialScreen="today">
        <div />
      </LiveGate>
    );
    await act(settle);
    await act(async () => {
      authEvent('TOKEN_REFRESHED');
      await settle();
    });
    expect(engine.loadFlavours).toHaveBeenCalledExactlyOnceWith(client);
    expect(engine.loadSettings).toHaveBeenCalledTimes(1);
    expect(engine.loadShopMenu).not.toHaveBeenCalled();
  });

  it('with no Supabase configured, a customer page gets an empty menu', async () => {
    configured = false;
    render(
      <LiveGate initialScreen="shop">
        <div />
      </LiveGate>
    );
    await act(settle);
    expect(engine.loadShopMenu).toHaveBeenCalledExactlyOnceWith(null);
  });
});
