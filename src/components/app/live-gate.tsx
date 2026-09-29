'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { hasSupabaseConfig } from '@/lib/supabase/config';
import { isLiveMode } from '@/lib/config/app-mode';
import { useOpsEngine, useOpsVals } from '@/store/use-ops';
import { CUSTOMER_SCREENS, type ScreenKey } from '@/lib/screens';
import { checkStaffProfile, signOutAndRedirect } from '@/lib/auth/live-gate';
import { idleMinutesFor, startIdleSignOut } from '@/lib/auth/idle-signout';
import { OpsRuntime } from '@/store/ops-runtime';

/**
 * The live-mode session gate.
 *
 * In demo mode (every environment except the static export — local dev, Vercel, Docker,
 * CI) `isLiveMode()` is false and this renders `children` immediately: nothing here
 * changes for the existing E2E/visual/unit fixtures.
 *
 * The static export ships with no `src/middleware.ts` (`scripts/build-pages-spike.mjs`
 * excludes it — there is no server to run it on), so this client-side check is the only
 * gate a Workers static-asset deploy has.
 *
 * `needsGate` follows the CURRENT screen, not just the `initialScreen` prop the page
 * loaded on. That is deliberate, not incidental: the ported `shop`/`order-status` screens
 * have a "Back to ops" control (`goBackOwner: () => this.go('today')`, protected
 * `src/store/engine/ops-engine.js`) that moves the engine to a staff screen with no page
 * load and no auth check of its own. Gating on the initial screen alone let an anonymous
 * customer, or a signed-in helper, reach staff Home and whatever the device's local books
 * held, by tapping that button — a real bypass, not a theoretical one. Tracking the current
 * screen closes it: the moment the engine's screen becomes a staff screen, this renders
 * nothing until a fresh check passes.
 *
 * The screen tracker is seeded from `initialScreen`, not read from `engine.state.screen`
 * directly, and only kept in sync with it via an effect. The engine's own protected
 * `BASE_STATE.screen` is always `'today'` on construction regardless of route — `RouteSync`
 * exists specifically to correct that on mount (its own comment: "The engine starts on Home
 * while a direct URL is being adopted"). Reading `engine.state.screen` directly here would
 * make every live-mode customer page (e.g. `/shop`) gate on that transient `'today'` on its
 * very first render — and since `RouteSync` is one of this component's own gated children,
 * it would never mount to correct it: a permanent deadlock, not just a flash.
 */
export function LiveGate({
  initialScreen,
  children
}: {
  initialScreen: ScreenKey;
  children: React.ReactNode;
}) {
  useOpsVals();
  const engine = useOpsEngine();
  const engineScreen = engine.state.screen as ScreenKey;
  // React's documented pattern for state derived from a changing value ("adjusting state
  // when a prop changes"): setState during render, not inside an effect — an effect would
  // apply the sync one render late, which is exactly the extra render this must not have.
  const [screen, setScreen] = useState<ScreenKey>(initialScreen);
  const [lastEngineScreen, setLastEngineScreen] = useState<ScreenKey>(engineScreen);
  if (engineScreen !== lastEngineScreen) {
    setLastEngineScreen(engineScreen);
    setScreen(engineScreen);
  }

  const live = isLiveMode();
  const configured = hasSupabaseConfig();
  const needsGate = live && !CUSTOMER_SCREENS.includes(screen);

  const [verified, setVerified] = useState(false);
  const verifiedRef = useRef(false);
  const runFirstCheck = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!live) return;
    if (!configured) {
      // A live build with no Supabase URL/key: there is nothing to verify against, and
      // `createClient()` would throw — which used to take the public shop down with it.
      // Customer screens need no check, so they render. A staff screen can never be
      // verified, so it stays closed and goes to sign-in, like a failed first check.
      runFirstCheck.current = () =>
        window.location.replace('/sign-in?next=' + encodeURIComponent(window.location.pathname));
      // Nothing to read the payment methods from either (MP-09 c2): the checkout shows none.
      if (engine instanceof OpsRuntime) void engine.loadShopPayment(null);
      // Nothing to read the published menu from: the shop shows no flavours (MP-09 c1b).
      if (CUSTOMER_SCREENS.includes(initialScreen) && engine instanceof OpsRuntime)
        void engine.loadShopMenu(null);
      return;
    }
    let cancelled = false;
    let idleStarted = false;
    let flavoursStarted = false;
    let stopIdle = () => undefined as void;
    const supabase = createClient();
    // MP-09 c2: the payment methods and shop texts, read on every live page, signed in or not.
    if (engine instanceof OpsRuntime) void engine.loadShopPayment(supabase);
    // B2: the pickup rules, the checkout, "Find my order" and the waiting list, on every live page.
    if (engine instanceof OpsRuntime) void engine.loadShopOrders(supabase);
    // B3: the owner's ordering window and "close now" switch, so every page says open or closed as the server does.
    if (engine instanceof OpsRuntime) void engine.loadShopStatus(supabase);
    // MP-09 c1b: customer pages show the owner's published menu (`shop_products`), signed
    // in or not. Staff pages load the full list instead (below).
    if (CUSTOMER_SCREENS.includes(initialScreen) && engine instanceof OpsRuntime)
      void engine.loadShopMenu(supabase);

    function lockOut() {
      if (cancelled) return;
      cancelled = true;
      verifiedRef.current = false;
      setVerified(false);
      stopIdle();
      void signOutAndRedirect(supabase, window.location.pathname);
    }

    async function verify(isFirstCheck: boolean) {
      if (cancelled) return;
      const result = await checkStaffProfile(supabase);
      if (cancelled) return;
      if (result.status === 'unknown') {
        // Only fail closed when nothing has been verified yet in this session — a
        // transient/offline failure on a later re-check must not sign out a till that
        // was already legitimately signed in (see checkStaffProfile's doc comment).
        if (isFirstCheck && !verifiedRef.current) lockOut();
        return;
      }
      if (result.status === 'denied') {
        lockOut();
        return;
      }
      engine.setRole(result.role);
      verifiedRef.current = true;
      setVerified(true);
      if (!idleStarted) {
        idleStarted = true;
        // First verified check only: re-checks (token refresh, tab visible again) must not
        // reload settings over an edit that is still waiting to save (MP-09 b2).
        const role = result.role;
        if (engine instanceof OpsRuntime) void engine.loadSettings(supabase, role);
        stopIdle = startIdleSignOut(role, lockOut, () =>
          idleMinutesFor(role, engine.state.cfg as Record<string, unknown> | undefined)
        );
      }
      // The full flavour list only on a staff screen: a signed-in owner on /shop sees what
      // customers see (the published menu), not flavours that are on the form but unpublished.
      if (
        !flavoursStarted &&
        engine instanceof OpsRuntime &&
        !CUSTOMER_SCREENS.includes(engine.state.screen as ScreenKey)
      ) {
        flavoursStarted = true;
        // B3: the owner's orders, once the flavour list is in (the screens need every ordered flavour).
        const owner = result.role === 'owner';
        // D4: the owner's upcoming bazaars, for the Bazaar screen's list.
        if (owner && !cancelled) void engine.loadScheduledEvents(supabase);
        // Only after the flavour list was read: an order for a flavour outside the ported list would crash the screens.
        void Promise.resolve(engine.loadFlavours(supabase)).then((loaded) => {
          if (owner && !cancelled && loaded !== false) void engine.loadOrders(supabase);
        });
      }
    }

    runFirstCheck.current = () => void verify(true);

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') lockOut();
      else if (event === 'TOKEN_REFRESHED') void verify(false);
    });

    function onVisible() {
      if (document.visibilityState === 'visible') {
        // A customer page has no staff session to re-check: verifying it finds none, and would sign the anonymous
        // customer "out" to /sign-in the moment they come back to the tab (say, from paying in their bank app).
        // A signed-in owner passing through a customer page (the shop preview) is still re-checked.
        if (verifiedRef.current || !CUSTOMER_SCREENS.includes(engine.state.screen as ScreenKey))
          void verify(false);
        // Customers order all day: read the owner's orders again when the tab comes back.
        if (engine instanceof OpsRuntime) void engine.reloadOrders();
        if (engine instanceof OpsRuntime) void engine.reloadShopStatus();
      }
    }
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
      stopIdle();
    };
  }, [live, configured, engine, initialScreen]);

  // `verified` (state), not `verifiedRef.current`: reading a ref during render is not
  // safe, and the two are always set together (see `lockOut`/`verify` above), so this is
  // the same value without the render-time ref read.
  const needsFirstCheck = needsGate && !verified;
  useEffect(() => {
    if (needsFirstCheck) runFirstCheck.current();
  }, [needsFirstCheck]);

  if (!needsGate) return <>{children}</>;
  if (!verified) return null;
  return <>{children}</>;
}
