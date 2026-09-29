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
    loadShopPayment = vi.fn();
    loadShopOrders = vi.fn();
    loadOrders = vi.fn();
    reloadOrders = vi.fn();
    loadShopStatus = vi.fn();
    reloadShopStatus = vi.fn();
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
  checkStaffProfile: vi.fn(async () => ({ status: 'ok', role })),
  signOutAndRedirect: vi.fn()
}));
vi.mock('@/lib/auth/idle-signout', () => ({
  idleMinutesFor: () => 60,
  startIdleSignOut: () => () => undefined
}));
let role: 'owner' | 'helper' = 'owner';
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
    // MP-09 c2: the payment methods and shop texts load on every live page.
    expect(engine.loadShopPayment).toHaveBeenCalledExactlyOnceWith(client);
    // B2: the pickup rules, checkout, lookup and waiting list load on every live page too.
    expect(engine.loadShopOrders).toHaveBeenCalledExactlyOnceWith(client);
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
    expect(engine.loadShopPayment).toHaveBeenCalledExactlyOnceWith(client);
    expect(engine.loadShopOrders).toHaveBeenCalledExactlyOnceWith(client);
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
    expect(engine.loadShopPayment).toHaveBeenCalledExactlyOnceWith(null);
    // Nothing to order through: the runtime never builds an order flow, and says so on the checkout.
    expect(engine.loadShopOrders).not.toHaveBeenCalled();
  });
});

describe('LiveGate: the owner’s orders (B3)', () => {
  beforeEach(() => {
    engine = new FakeRuntime();
    configured = true;
    role = 'owner';
  });

  const mount = async (screen: ScreenKey) => {
    engine.state.screen = screen;
    render(
      <LiveGate initialScreen={screen}>
        <div />
      </LiveGate>
    );
    await act(settle);
  };

  it('reads the orders once on a staff page, for the owner, after the flavour list', async () => {
    await mount('orders');
    expect(engine.loadFlavours).toHaveBeenCalledExactlyOnceWith(client);
    expect(engine.loadOrders).toHaveBeenCalledExactlyOnceWith(client);
    expect(engine.loadOrders.mock.invocationCallOrder[0]).toBeGreaterThan(
      engine.loadFlavours.mock.invocationCallOrder[0]
    );
    // Mutation: dropping the owner test reads the orders for a helper, who is refused every order RPC.
  });

  it('does not read the orders when the flavour list could not be read (an unknown flavour would crash the screens)', async () => {
    engine.loadFlavours.mockResolvedValue(false);
    await mount('orders');
    expect(engine.loadFlavours).toHaveBeenCalledOnce();
    expect(engine.loadOrders).not.toHaveBeenCalled();
    // Mutation: ignoring the result loads orders whose flavours the screens do not know.
  });

  it('never reads the orders for a helper, or on a customer page', async () => {
    role = 'helper';
    await mount('orders');
    expect(engine.loadOrders).not.toHaveBeenCalled();
    engine = new FakeRuntime();
    role = 'owner';
    await mount('shop');
    expect(engine.loadOrders).not.toHaveBeenCalled();
  });

  it('reads them again when the tab comes back, not when it goes away', async () => {
    await mount('orders');
    engine.reloadOrders.mockClear();
    const visibility = async (value: 'hidden' | 'visible') => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value });
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
        await settle();
      });
    };
    await visibility('hidden');
    expect(engine.reloadOrders).not.toHaveBeenCalled();
    await visibility('visible');
    expect(engine.reloadOrders).toHaveBeenCalledOnce();
  });
});
