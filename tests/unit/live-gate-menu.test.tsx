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
    state = { screen: 'shop' as ScreenKey, role: 'owner' as 'owner' | 'helper', cfg: {} };
    setRole = vi.fn((role: 'owner' | 'helper') => {
      this.state.role = role;
    });
    loadSettings = vi.fn();
    saveStallCopy = vi.fn();
    loadFlavours = vi.fn();
    loadShopMenu = vi.fn();
    loadShopPayment = vi.fn();
    loadShopIdentity = vi.fn();
    loadStaffName = vi.fn();
    loadShopOrders = vi.fn();
    loadOrders = vi.fn();
    reloadOrders = vi.fn();
    loadScheduledEvents = vi.fn();
    loadStockCatalogue = vi.fn();
    loadProduction = vi.fn();
    loadBooks = vi.fn();
    loadOperationsHealth = vi.fn();
    loadRecipes = vi.fn();
    loadShopStatus = vi.fn();
    reloadShopStatus = vi.fn();
    setGateAccess = vi.fn();
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
  ACTIVITY_EVENTS: [],
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
import { checkStaffProfile } from '@/lib/auth/live-gate';

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
    expect(engine.loadOperationsHealth).toHaveBeenCalledWith(client);
    expect(engine.loadShopMenu).not.toHaveBeenCalled();
    expect(engine.loadShopPayment).toHaveBeenCalledExactlyOnceWith(client);
    expect(engine.loadShopOrders).toHaveBeenCalledExactlyOnceWith(client);
  });

  it('keeps an active count through a same-role token refresh, but applies a changed role', async () => {
    engine.state.screen = 'inventory';
    render(
      <LiveGate initialScreen="inventory">
        <div />
      </LiveGate>
    );
    await act(settle);
    expect(engine.setRole).toHaveBeenCalledTimes(1);
    await act(async () => {
      authEvent('TOKEN_REFRESHED');
      await settle();
    });
    expect(engine.setRole).toHaveBeenCalledTimes(1);
    role = 'helper';
    await act(async () => {
      authEvent('TOKEN_REFRESHED');
      await settle();
    });
    expect(engine.setRole).toHaveBeenCalledTimes(2);
    expect(engine.state.role).toBe('helper');
    role = 'owner';
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
    // The owner's recipes too, for the same reason: a recipe for a flavour the screens do not know is ignored.
    expect(engine.loadRecipes).toHaveBeenCalledExactlyOnceWith(client);
    expect(engine.loadRecipes.mock.invocationCallOrder[0]).toBeGreaterThan(
      engine.loadFlavours.mock.invocationCallOrder[0]
    );
    // Mutation: dropping the owner test reads the orders for a helper, who is refused every order RPC.
  });

  it('does not read the orders when the flavour list could not be read (an unknown flavour would crash the screens)', async () => {
    engine.loadFlavours.mockResolvedValue(false);
    await mount('orders');
    expect(engine.loadFlavours).toHaveBeenCalledOnce();
    expect(engine.loadOrders).not.toHaveBeenCalled();
    expect(engine.loadRecipes).not.toHaveBeenCalled();
    // Mutation: ignoring the result loads orders whose flavours the screens do not know.
  });

  it('reads the owner’s upcoming bazaars and stock catalogue once she is verified, and for nobody else', async () => {
    role = 'owner';
    await mount('bazaar');
    expect(engine.loadScheduledEvents).toHaveBeenCalledExactlyOnceWith(client);
    expect(engine.loadStockCatalogue).toHaveBeenCalledExactlyOnceWith(client);
    expect(engine.loadProduction).toHaveBeenCalledExactlyOnceWith(client); // C2
    engine = new FakeRuntime();
    role = 'helper';
    await mount('bazaar');
    expect(engine.loadScheduledEvents).not.toHaveBeenCalled();
    expect(engine.loadStockCatalogue).not.toHaveBeenCalled();
    expect(engine.loadProduction).not.toHaveBeenCalled();
    engine = new FakeRuntime();
    role = 'owner';
    await mount('shop'); // a customer page: nothing is verified there
    expect(engine.loadScheduledEvents).not.toHaveBeenCalled();
    expect(engine.loadStockCatalogue).not.toHaveBeenCalled();
    expect(engine.loadProduction).not.toHaveBeenCalled();
    // Mutation: dropping the owner test asks a helper for a list the database refuses, and the customer page for one it cannot see.
  });

  it('never reads the orders or the recipes for a helper, or on a customer page', async () => {
    role = 'helper';
    await mount('orders');
    expect(engine.loadOperationsHealth).not.toHaveBeenCalled();
    expect(engine.loadOrders).not.toHaveBeenCalled();
    expect(engine.loadRecipes).not.toHaveBeenCalled();
    engine = new FakeRuntime();
    role = 'owner';
    await mount('shop');
    expect(engine.loadOperationsHealth).not.toHaveBeenCalled();
    expect(engine.loadOrders).not.toHaveBeenCalled();
    expect(engine.loadRecipes).not.toHaveBeenCalled();
  });

  it('a signed-in owner who passes through a customer page is still re-checked when the tab comes back', async () => {
    await mount('orders'); // verified as the owner
    engine.state.screen = 'shop' as ScreenKey; // the shop preview: a customer screen
    vi.mocked(checkStaffProfile).mockClear();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await settle();
    });
    expect(checkStaffProfile).toHaveBeenCalledOnce();
    // Mutation: skipping every customer screen lets an owner whose access was revoked keep the orders she already loaded.
  });

  it('reads them again when the tab comes back, not when it goes away', async () => {
    await mount('orders');
    engine.reloadOrders.mockClear();
    engine.loadOperationsHealth.mockClear();
    const visibility = async (value: 'hidden' | 'visible') => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value });
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
        await settle();
      });
    };
    await visibility('hidden');
    expect(engine.reloadOrders).not.toHaveBeenCalled();
    expect(engine.loadOperationsHealth).not.toHaveBeenCalled();
    await visibility('visible');
    expect(engine.reloadOrders).toHaveBeenCalledOnce();
    expect(engine.loadOperationsHealth).toHaveBeenCalledWith(null);
  });
});
