'use client';

import { useEffect, useRef } from 'react';
import { useOpsEngine } from '@/store/use-ops';
import { pathForScreen, screenForPath, type ScreenKey } from '@/lib/screens';

/**
 * Keeps the address bar and the engine's screen in step.
 *
 * The prototype navigated in state only. Deep links, the back button and a reloaded
 * kitchen phone all need real URLs, so the screen key is the path segment. history
 * .replaceState is used rather than the router: the app is one client tree and a router
 * navigation would remount it and drop the open sheet.
 */
export function RouteSync({ initialScreen }: { initialScreen: ScreenKey }) {
  const engine = useOpsEngine();
  const screen = engine.state.screen;
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (engine.state.screen !== initialScreen) engine.go(initialScreen);
  }, [engine, initialScreen]);

  useEffect(() => {
    const path = pathForScreen(screen);
    if (window.location.pathname !== path) window.history.replaceState(null, '', path);
  }, [screen]);

  useEffect(() => {
    const onPop = () => engine.go(screenForPath(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [engine]);

  return null;
}
