'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { hasSupabaseConfig } from '@/lib/supabase/config';
import { isLiveMode } from '@/lib/config/app-mode';
import { useOpsEngine, useOpsVals } from '@/store/use-ops';
import { CUSTOMER_SCREENS, type ScreenKey } from '@/lib/screens';
import {
  checkStaffProfile,
  hasStoredSession,
  signOutAndRedirect,
  signOutLocal,
  type ProfileCheck
} from '@/lib/auth/live-gate';
import { ACTIVITY_EVENTS, idleMinutesFor, startIdleSignOut } from '@/lib/auth/idle-signout';
import {
  checkStillFresh,
  holdsOpenEvent,
  idleWasSpent,
  markIdleSpent,
  offlineBazaarRole,
  rememberCheck
} from '@/lib/auth/offline-trust';
import type { LocalSale } from '@/lib/auth/sign-out-guard';
import { OpsRuntime } from '@/store/ops-runtime';
import type { Role } from '@/store/engine/ops-engine';
import { registerLiveStockScreens } from '@/components/live/stock/register';
import { registerLiveBazaarScreens } from '@/components/live/bazaar/register';
import { registerLiveRecipeScreens } from '@/components/live/recipes/register';
import { OfflineHold } from './offline-hold';
import { SignOutControl } from './sign-out-control';

// The live owner's New Stock screens (B5) take the guarded slot, once, when this module loads.
registerLiveStockScreens();
// The live Bazaar (S2) takes the `bazaar` slot too; it draws the ported till itself while this phone holds an event.
registerLiveBazaarScreens();
// The live recipe book (U7) takes the `recipes` slot; the ported Recipes screen is drawn inside it, for editing a recipe.
registerLiveRecipeScreens();

/** How long one identity check may take before the gate treats the server as unreachable. */
export const CHECK_TIMEOUT_MS = 8_000;
/** How often the check is tried again while the server has not answered. */
export const RECHECK_MS = 60_000;
/** How long an overdue idle sign-out waits for the queued sales to send first. */
export const FLUSH_BEFORE_SIGN_OUT_MS = 15_000;

const BAZAAR: ScreenKey = 'bazaar';
/** The sheets Bazaar Mode itself opens: take payment, an event expense, the close-out. */
export const BAZAAR_SHEETS: readonly string[] = ['pay', 'evExp', 'closeout'];

/** All that Bazaar-only access draws: the bazaar screen, with at most one of its own sheets over it. */
function showsBazaarAlone(screen: ScreenKey, state: Readonly<Record<string, unknown>>): boolean {
  const sheet = (state.sheet as { kind?: string } | null)?.kind;
  return screen === BAZAAR && !state.quick && (!sheet || BAZAAR_SHEETS.includes(sheet));
}

/**
 * closed    nothing decided yet on this page load: nothing renders.
 * verified  the server passed the identity check: the whole app.
 * bazaar    the server could not be reached and `offlineBazaarRole()` allows it: Bazaar Mode only.
 * waiting   the server could not be reached and this phone may not open offline: a notice.
 * signin    signed out with the sign-in page out of reach: a notice, no redirect.
 */
type Access = 'closed' | 'verified' | 'bazaar' | 'waiting' | 'signin';

/** `landing`: the screen this page load opens on. `hold`: shown in place of the frame, or null. */
export interface GateView {
  landing: ScreenKey;
  hold: React.ReactNode;
}

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
 *
 * Slice A2 (the bazaar phone with no signal). A first check the server never answers is no
 * longer a sign-out: that stopped a stall selling for no security reason, and sent it to a
 * sign-in page it could not load. Instead, inside the bounds of `src/lib/auth/offline-trust.ts`,
 * Bazaar Mode alone opens; every other screen and sheet is replaced by a notice. Outside those
 * bounds the app stays closed behind a notice. In both cases the full check runs again when the
 * phone reconnects, when the tab comes back and once a minute, and a definite denial still
 * signs out. "No signal" means the check came back `unknown`, never `navigator.onLine`: a
 * stall's dead Wi-Fi reports online.
 *
 * Idle time is still charged. With an event open and the server out of reach the idle
 * sign-out is put off, not cancelled. When the idle time runs out the app narrows to Bazaar
 * Mode alone and the expiry is marked on the phone; no tap and no reload undoes it. The first
 * check the server answers sends the queued sales and signs out, as idle always did.
 *
 * Signal back mid-sale (6 October 2026). When the first check the server answers confirms the
 * role Bazaar Mode was opened offline as, with an event open and the selling screen drawn, the
 * screen and its sheet are left as they are: the queue is sent and the whole app is open again,
 * but nobody is moved to Home with a payment half taken. A different role, a denial and the
 * put-off idle sign-out are unchanged.
 *
 * `children` may be a function: it is given the landing screen (so `RouteSync` does not move
 * an offline open back to Home) and the notice to draw instead of the frame, which keeps
 * `RouteSync` and `OfflineBridge` mounted while a screen is refused.
 */
export function LiveGate({
  initialScreen,
  children
}: {
  initialScreen: ScreenKey;
  children: React.ReactNode | ((view: GateView) => React.ReactNode);
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

  const [access, setAccessState] = useState<Access>('closed');
  const accessRef = useRef<Access>('closed');
  // Decided once an offline open happens and never moved back: `RouteSync` reads it on mount.
  const [landing, setLanding] = useState<ScreenKey>(initialScreen);
  const actions = useRef({
    firstCheck: () => undefined as void,
    retry: () => undefined as void,
    signIn: () => undefined as void,
    signOut: () => undefined as void
  });

  useEffect(() => {
    if (!live) return;
    const signInPath = () => '/sign-in?next=' + encodeURIComponent(window.location.pathname);
    if (!configured) {
      // A live build with no Supabase URL/key: there is nothing to verify against, and
      // `createClient()` would throw — which used to take the public shop down with it.
      // Customer screens need no check, so they render. A staff screen can never be
      // verified, so it stays closed and goes to sign-in, like a failed first check.
      actions.current.firstCheck = () => window.location.replace(signInPath());
      // Nothing to read the payment methods from either (MP-09 c2): the checkout shows none.
      if (engine instanceof OpsRuntime) void engine.loadShopPayment(null);
      // Nothing to read the published menu from: the shop shows no flavours (MP-09 c1b).
      if (CUSTOMER_SCREENS.includes(initialScreen) && engine instanceof OpsRuntime)
        void engine.loadShopMenu(null);
      return;
    }
    let cancelled = false;
    let leaving = false;
    let settingsStarted = false;
    let settingsLoaded = false;
    let flavoursStarted = false;
    let idleRunning = false;
    // The role idle time is measured for: the verified one, or the remembered one offline.
    let idleRole: Role | null = null;
    // The role `holdOffline` opened Bazaar Mode as on this page load, until a check passes or
    // the idle time runs out. Never set by `narrow`, which reaches the same access another way.
    let offlineRole: Role | null = null;
    let stopIdleTimer = () => undefined as void;
    let recheck: ReturnType<typeof setInterval> | undefined;
    let outstanding = 0;
    let lastActivity = Date.now();
    const supabase = createClient();
    const setAccess = (next: Access) => {
      accessRef.current = next;
      setAccessState(next);
      // U2: Home on the till is offered only while the whole app is open, never in Bazaar-only mode.
      if (engine instanceof OpsRuntime) engine.setGateAccess(next !== 'verified');
    };
    const cfg = () => engine.state.cfg as Record<string, unknown> | undefined;
    // MP-09 c2: the payment methods and shop texts, read on every live page, signed in or not.
    if (engine instanceof OpsRuntime) void engine.loadShopPayment(supabase);
    // Slice B2: the shop's own name, contact line and tagline, on every live page.
    if (engine instanceof OpsRuntime) void engine.loadShopIdentity(supabase);
    // B2: the pickup rules, the checkout, "Find my order" and the waiting list, on every live page.
    if (engine instanceof OpsRuntime) void engine.loadShopOrders(supabase);
    // B3: the owner's ordering window and "close now" switch, so every page says open or closed as the server does.
    if (engine instanceof OpsRuntime) void engine.loadShopStatus(supabase);
    // MP-09 c1b: customer pages show the owner's published menu (`shop_products`), signed
    // in or not. Staff pages load the full list instead (below).
    if (CUSTOMER_SCREENS.includes(initialScreen) && engine instanceof OpsRuntime)
      void engine.loadShopMenu(supabase);

    const idleSpent = (role: Role) =>
      Date.now() - lastActivity >= idleMinutesFor(role, cfg()) * 60_000;
    const active = () => {
      // A tap after the idle time already ran out does not bring the session back. When the
      // page was frozen (a locked phone) the tap can land before the overdue timer does: the
      // idle path runs here and now, so the whole app is not left open for another idle period.
      // Never once this page has signed out: the mark would outlive the sign-out that clears
      // it and sign the next session out again.
      if (!cancelled && idleRole && idleSpent(idleRole)) {
        const current = accessRef.current;
        if (current === 'verified') onIdle();
        else if (current === 'bazaar' || current === 'waiting') markIdleSpent();
      }
      lastActivity = Date.now();
    };
    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, active, { passive: true }));

    function stopIdle() {
      idleRunning = false;
      stopIdleTimer();
    }
    function stopRecheck() {
      clearInterval(recheck);
      recheck = undefined;
    }
    function startRecheck() {
      recheck ??= setInterval(() => {
        if (!outstanding) void verify(false);
      }, RECHECK_MS);
    }

    /**
     * A definite denial. The sale queue is never touched. With no network, or when this is
     * already the app shell answering for `/sign-in` (the service worker's fallback), a
     * redirect would only load this shell again and deny again, without end: the notice is
     * shown in place and the redirect waits for the phone to come back online.
     */
    function lockOut() {
      if (cancelled) return;
      cancelled = true;
      stopIdle();
      stopRecheck();
      const path = window.location.pathname || '/';
      if (navigator.onLine === false || path.startsWith('/sign-in')) {
        setAccess('signin');
        void signOutLocal(supabase);
        return;
      }
      setAccess('closed');
      void signOutAndRedirect(supabase, path);
    }

    /**
     * The idle sign-out once the server can be reached again: the sales the phone is holding
     * are sent first (the session they need is about to go), for a bounded time, then it
     * signs out. A sale that does not make it stays queued and is sent after the next sign-in.
     */
    function signOutAfterFlush() {
      if (cancelled || leaving) return;
      markIdleSpent();
      // Nothing of an open event to send: sign out at once, as idle always did.
      if (!holdsOpenEvent()) {
        lockOut();
        return;
      }
      leaving = true;
      // While the queue is being sent, only Bazaar Mode is on screen.
      narrow();
      const sent =
        engine instanceof OpsRuntime
          ? Promise.resolve(engine.flushSales()).catch(() => undefined)
          : Promise.resolve();
      const limit = new Promise<void>((resolve) => setTimeout(resolve, FLUSH_BEFORE_SIGN_OUT_MS));
      void Promise.race([sent, limit]).then(lockOut);
    }

    /**
     * The first check of this page load got no answer from the server. Bazaar Mode opens only
     * inside the offline bounds and only with a session still stored on this phone; a phone
     * that was signed out has none, and `checkStaffProfile` denies it without the network.
     */
    function holdOffline() {
      const role = hasStoredSession() ? offlineBazaarRole() : null;
      if (role) {
        idleRole = role;
        offlineRole = role;
        if (engine instanceof OpsRuntime) engine.restoreStallCopy();
        // Slice B2: and the name this phone remembered for that role, for the sales it rings up.
        if (engine instanceof OpsRuntime) engine.restoreStaffName(role);
        if (engine.state.role !== role) engine.setRole(role);
        if (engine.state.screen !== BAZAAR) engine.go(BAZAAR);
        setLanding(BAZAAR);
        setAccess('bazaar');
      } else {
        setAccess('waiting');
      }
      startRecheck();
    }

    /**
     * The idle time ran out with an event open. Signing out with no signal would end selling,
     * so the session is kept, but from here on it counts as expired: the app narrows to Bazaar
     * Mode alone (past the offline hours, or with no open event, to the notice), no tap or
     * reload widens it again (the mark is kept on the phone), and the first check the server
     * answers sends the queue and signs out. It runs before the server is asked, never after:
     * a check can take seconds to fail on a dead connection, and nothing wider may stay on
     * screen while it does.
     */
    function narrow() {
      markIdleSpent();
      stopIdle();
      offlineRole = null;
      if (holdsOpenEvent() && checkStillFresh()) {
        if (engine.state.screen !== BAZAAR) engine.go(BAZAAR);
        setLanding(BAZAAR);
        setAccess('bazaar');
      } else {
        setAccess('waiting');
      }
      startRecheck();
    }

    function startIdle(role: Role) {
      stopIdle();
      idleRole = role;
      idleRunning = true;
      stopIdleTimer = startIdleSignOut(
        role,
        () => onIdle(),
        () => idleMinutesFor(role, cfg())
      );
    }

    /**
     * Idle sign-out, except at a stall with no signal: signing out there ends selling until
     * she can reach a sign-in page. With an event open the app narrows at once (`narrow`),
     * then the server is asked: reachable, it signs out as before after sending what is
     * queued; out of reach, the sign-out waits, re-checked once a minute.
     */
    function onIdle() {
      if (!holdsOpenEvent()) {
        lockOut();
        return;
      }
      narrow();
      void limited(probe()).then((result) => {
        if (cancelled || !result) return;
        if (result.status === 'denied') lockOut();
        else if (result.status === 'ok') signOutAfterFlush();
      });
    }

    function apply(result: ProfileCheck, isFirstCheck: boolean) {
      if (cancelled) return;
      if (result.status === 'unknown') {
        // Not evidence of anything (see checkStaffProfile's doc comment). A session already
        // verified on this page load is left as it is. Bazaar-only access (an offline open, or
        // a session whose idle time ran out) ends when the offline hours do.
        if (isFirstCheck && accessRef.current === 'closed') holdOffline();
        else if (accessRef.current === 'bazaar' && !checkStillFresh()) setAccess('waiting');
        return;
      }
      if (result.status === 'denied') {
        lockOut();
        return;
      }
      const role = result.role;
      // The server answers again and the idle time ran out while it could not: the sign-out
      // that was put off happens now. Nothing is opened first.
      if (idleWasSpent() || idleSpent(role)) {
        signOutAfterFlush();
        return;
      }
      // Signal back at the stall. Bazaar Mode was opened offline as this same role, an event is
      // still open and the selling screen is what is drawn: the sale in hand carries on. The
      // protected engine's setRole would close the payment sheet and go home, to apply a role
      // the engine already holds. In every other case the role is applied as before.
      const sellingOn =
        offlineRole === role &&
        accessRef.current === 'bazaar' &&
        engine.state.role === role &&
        holdsOpenEvent() &&
        showsBazaarAlone(engine.state.screen as ScreenKey, engine.state);
      offlineRole = null;
      // The protected engine clears an in-progress stocktake on setRole. A same-role
      // token refresh or visibility check must not reset the owner's count.
      if (!sellingOn && (accessRef.current !== 'verified' || engine.state.role !== role))
        engine.setRole(role);
      rememberCheck(role);
      stopRecheck();
      // Reopening after a spell with no server: send what the phone is holding now. On a dead
      // connection that comes back no `online` event fires, so nothing else would until the
      // next sale.
      const reopened = accessRef.current === 'bazaar' || accessRef.current === 'waiting';
      setAccess('verified');
      if (reopened && engine instanceof OpsRuntime)
        void Promise.resolve(engine.flushSales()).catch(() => undefined);
      // Only once the owner's settings are in: before that `cfg` holds the engine's defaults,
      // and saving those would replace her discounts and float on the phone.
      const keepStallCopy = () => {
        if (!cancelled && settingsLoaded && engine instanceof OpsRuntime) engine.saveStallCopy();
      };
      if (engine instanceof OpsRuntime && role !== 'helper')
        void engine.loadOperationsHealth(supabase);
      // Slice B2: the signed-in person's own name (the greeting, and who rang a sale up). Asked
      // again at each later check until one read has answered: a stall on weak signal must not
      // spend the day selling as "Helper" because the first try was lost.
      if (engine instanceof OpsRuntime && engine.staffNameRole !== role)
        void engine.loadStaffName(supabase, role);
      if (!settingsStarted) {
        settingsStarted = true;
        // First verified check only: re-checks (token refresh, tab visible again) must not
        // reload settings over an edit that is still waiting to save (MP-09 b2).
        if (engine instanceof OpsRuntime)
          void Promise.resolve(engine.loadSettings(supabase, role)).then((loaded) => {
            settingsLoaded = loaded === true;
            keepStallCopy();
          });
      } else {
        keepStallCopy();
      }
      if (!idleRunning) startIdle(role);
      // The full flavour list only on a staff screen: a signed-in owner on /shop sees what
      // customers see (the published menu), not flavours that are on the form but unpublished.
      if (
        !flavoursStarted &&
        engine instanceof OpsRuntime &&
        !CUSTOMER_SCREENS.includes(engine.state.screen as ScreenKey)
      ) {
        flavoursStarted = true;
        // B3: the owner's orders, once the flavour list is in (the screens need every ordered flavour).
        const owner = role === 'owner';
        // D4: the owner's upcoming bazaars, for the Bazaar screen's list.
        if (owner && !cancelled) void engine.loadScheduledEvents(supabase);
        if (owner && !cancelled) void engine.loadStockCatalogue(supabase);
        // C2: the owner's batches, dough and baked counts.
        if (owner && !cancelled) void engine.loadProduction(supabase);
        // E1: the owner's books, for the P&L, Home profit and the expense list.
        if (owner && !cancelled) void engine.loadBooks(supabase);
        // Only after the flavour list was read: an order for a flavour outside the ported list would crash the screens.
        void Promise.resolve(engine.loadFlavours(supabase)).then((loaded) => {
          keepStallCopy();
          if (owner && !cancelled && loaded !== false) void engine.loadOrders(supabase);
          // A4: the owner's recipes, for the flavours the list just brought in.
          if (owner && !cancelled && loaded !== false) void engine.loadRecipes(supabase);
        });
      }
    }

    /** Counted, so the once-a-minute re-check never stacks behind a request that is still out. */
    function probe(): Promise<ProfileCheck> {
      outstanding += 1;
      return checkStaffProfile(supabase).finally(() => {
        outstanding -= 1;
      });
    }

    /**
     * supabase-js puts no time limit on a request, so on a weak signal a check could leave a
     * blank page (or a growing pile of requests) for as long as the radio keeps trying. Null
     * means the limit passed: the server counts as unreachable for now.
     */
    async function limited(pending: Promise<ProfileCheck>): Promise<ProfileCheck | null> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const slow = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), CHECK_TIMEOUT_MS);
      });
      const answer = await Promise.race([pending, slow]);
      clearTimeout(timer);
      return answer;
    }

    async function verify(isFirstCheck: boolean) {
      if (cancelled) return;
      const pending = probe();
      const answer = await limited(pending);
      if (answer) {
        apply(answer, isFirstCheck);
        return;
      }
      apply({ status: 'unknown' }, isFirstCheck);
      // The answer, if it still comes, is applied as a re-check.
      void pending.then((late) => {
        if (late.status !== 'unknown') apply(late, false);
      });
    }

    actions.current.firstCheck = () => void verify(true);
    actions.current.retry = () => void verify(false);
    actions.current.signIn = () => window.location.assign(signInPath());
    // A3: the deliberate sign-out (`SignOutControl`) is this same lock-out.
    actions.current.signOut = () => lockOut();

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
        // A phone that slept past the idle time: the idle path runs before anything else can.
        if (accessRef.current === 'verified' && idleRole && idleSpent(idleRole)) onIdle();
        else if (
          accessRef.current !== 'closed' ||
          !CUSTOMER_SCREENS.includes(engine.state.screen as ScreenKey)
        )
          void verify(false);
        // Customers order all day: read the owner's orders again when the tab comes back.
        if (engine instanceof OpsRuntime) void engine.reloadOrders();
        if (engine instanceof OpsRuntime) void engine.reloadShopStatus();
        if (accessRef.current === 'verified' && engine instanceof OpsRuntime)
          void engine.loadOperationsHealth(null);
      }
    }
    document.addEventListener('visibilitychange', onVisible);

    // Back online: the full check runs at once, whatever this page load had decided.
    function onOnline() {
      if (accessRef.current === 'signin') window.location.replace(signInPath());
      else if (accessRef.current !== 'closed') void verify(false);
    }
    window.addEventListener('online', onOnline);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, active));
      stopRecheck();
      stopIdle();
    };
  }, [live, configured, engine, initialScreen]);

  const needsFirstCheck = needsGate && access === 'closed';
  useEffect(() => {
    if (needsFirstCheck) actions.current.firstCheck();
  }, [needsFirstCheck]);

  const view = (hold: React.ReactNode) =>
    typeof children === 'function' ? children({ landing, hold }) : (hold ?? children);

  // A3: the deliberate sign-out. Never over the Bazaar screen or an open sheet or the Quick add
  // layer (a stray tap while a sale is being taken), never when there is no session to sign out.
  const sheetOpen = Boolean(engine.state.sheet) || Boolean(engine.state.quick);
  const signOut =
    needsGate &&
    screen !== BAZAAR &&
    !sheetOpen &&
    (access === 'verified' || (access === 'waiting' && hasStoredSession())) ? (
      <SignOutControl
        flush={() =>
          engine instanceof OpsRuntime ? Promise.resolve(engine.flushSales()) : Promise.resolve()
        }
        onSignOut={() => actions.current.signOut()}
        local={() => (engine.state.sales as LocalSale[] | undefined) ?? []}
        offline={access !== 'verified' || navigator.onLine === false}
        eventOpen={holdsOpenEvent}
      />
    ) : null;

  if (!needsGate || access === 'verified')
    return (
      <>
        {view(null)}
        {signOut}
      </>
    );
  if (access === 'bazaar') {
    // Books, P&L, orders, stock and settings stay closed until a check passes: only the
    // bazaar screen, with at most one of its own sheets over it, is drawn.
    const open = showsBazaarAlone(screen, engine.state);
    const back = () => {
      engine.setState({ sheet: null, quick: false });
      engine.go(BAZAAR);
    };
    return <>{view(open ? null : <OfflineHold kind="elsewhere" onAction={back} />)}</>;
  }
  if (access === 'waiting')
    return (
      <>
        <OfflineHold kind="waiting" onAction={() => actions.current.retry()} />
        {signOut}
      </>
    );
  if (access === 'signin')
    return <OfflineHold kind="signin" onAction={() => actions.current.signIn()} />;
  return null;
}
