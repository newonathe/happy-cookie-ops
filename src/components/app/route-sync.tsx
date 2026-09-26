'use client';

import { useEffect, useRef } from 'react';
import { useOpsEngine, useOpsVals } from '@/store/use-ops';
import { isScreenKey, pathForScreen, screenForPath, type ScreenKey } from '@/lib/screens';

const HISTORY_KEY = '__hcOpsNavigation';

interface HistoryMarker {
  index: number;
  screens: ScreenKey[];
}

function screenHistory(value: unknown): ScreenKey[] {
  return Array.isArray(value) ? value.filter((item): item is ScreenKey => typeof item === 'string' && isScreenKey(item)).slice(-64) : [];
}

function readMarker(value: unknown): HistoryMarker | null {
  if (!value || typeof value !== 'object') return null;
  const marker = (value as Record<string, unknown>)[HISTORY_KEY];
  if (!marker || typeof marker !== 'object') return null;
  const { index, screens } = marker as Record<string, unknown>;
  if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0 || !Array.isArray(screens) || screens.length > 64 || screens.some((item) => typeof item !== 'string' || !isScreenKey(item))) return null;
  return { index, screens: screens as ScreenKey[] };
}

function withMarker(marker: HistoryMarker): Record<string, unknown> {
  const current: unknown = window.history.state;
  const state = current && typeof current === 'object' && !Array.isArray(current) ? current as Record<string, unknown> : {};
  return { ...state, [HISTORY_KEY]: marker };
}

/**
 * Keeps the address bar and the engine's screen in step.
 *
 * The prototype navigated in state only. Deep links, the back button and a reloaded
 * kitchen phone all need real URLs. History API writes keep the same client tree:
 * a user navigation pushes an entry, while initialization only replaces a mismatch.
 */
export function RouteSync({ initialScreen }: { initialScreen: ScreenKey }) {
  // The engine context holds a stable class instance. Subscribe to its changing
  // render values so navigation also updates the browser address.
  useOpsVals();
  const engine = useOpsEngine();
  const screen = engine.state.screen;
  const started = useRef(false);
  const initialRouteApplied = useRef(false);
  const stocktakeTick = useRef<number | null>(null);
  const previousNavigation = useRef<{ screen: ScreenKey; tick: number } | null>(null);
  const popNavigationTick = useRef<number | null>(null);
  const browserIndex = useRef(0);
  const viewScreen = initialScreen === 'stocktake' ? 'inventory' : initialScreen;
  const navTick = Number(engine.state.navTick || 0);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (initialScreen === 'stocktake') stocktakeTick.current = navTick + 1;
    if (engine.state.screen !== viewScreen) engine.go(viewScreen);
  }, [engine, initialScreen, navTick, viewScreen]);

  useEffect(() => {
    // The engine starts on Home while a direct URL is being adopted. Writing that
    // temporary screen to history can make Next remount Home before go() commits.
    if (!initialRouteApplied.current) {
      if (screen !== viewScreen) return;
      initialRouteApplied.current = true;
    }
    const previous = previousNavigation.current;
    const fromPop = popNavigationTick.current === navTick;
    if (fromPop) popNavigationTick.current = null;
    previousNavigation.current = { screen, tick: navTick };
    if (!previous) {
      const marker = readMarker(window.history.state);
      if (marker) {
        browserIndex.current = marker.index;
        engine.setState({ history: marker.screens });
      } else {
        window.history.replaceState(withMarker({ index: 0, screens: screenHistory(engine.state.history) }), '', window.location.href);
      }
    }
    // Stock counting uses Inventory's existing screen; retain its direct URL
    // until a later in-app navigation changes the engine navigation tick.
    if (screen === 'inventory' && window.location.pathname === '/stocktake' && navTick === stocktakeTick.current) return;
    const path = pathForScreen(screen);
    if (window.location.pathname === path) return;
    // Some protected engine actions switch screens without touching navTick
    // (for example, starting a bake batch). They still need a browser entry.
    if (previous && (previous.tick !== navTick || previous.screen !== screen) && !fromPop) {
      const index = browserIndex.current + 1;
      window.history.pushState(withMarker({ index, screens: screenHistory(engine.state.history) }), '', path);
      browserIndex.current = index;
    } else {
      window.history.replaceState(withMarker({ index: browserIndex.current, screens: screenHistory(engine.state.history) }), '', path);
    }
  }, [engine, screen, navTick, viewScreen]);

  useEffect(() => {
    const onPop = () => {
      const path = window.location.pathname;
      const marker = readMarker(window.history.state);
      const priorIndex = browserIndex.current;
      browserIndex.current = marker?.index ?? 0;
      if (!marker) window.history.replaceState(withMarker({ index: 0, screens: [] }), '', window.location.href);
      const nextTick = Number(engine.state.navTick || 0) + 1;
      popNavigationTick.current = nextTick;
      stocktakeTick.current = path === '/stocktake' ? nextTick : null;
      const target = path === '/stocktake' ? 'inventory' : screenForPath(path);
      if (marker) {
        engine.setState({ screen: target, history: marker.screens, navTick: nextTick, navDir: marker.index < priorIndex ? 'back' : 'fwd', sheet: null });
      } else {
        engine.go(target);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [engine]);

  return null;
}
