import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { ScreenKey } from '@/lib/screens';

/**
 * Regression test for the "Back to ops" bypass a security review found: the ported
 * shop/order-status screens have a control that moves the engine straight to a staff
 * screen with no page load (`goBackOwner: () => this.go('today')`, protected
 * src/store/engine/ops-engine.js). Gating only on the page's initial screen let that
 * reach staff Home with no session. This exercises the fix — gating on the CURRENT
 * engine screen — end to end through the real component, with the engine faked.
 */
const engine = { state: { screen: 'shop' as ScreenKey }, setRole: vi.fn() };
vi.mock('@/store/use-ops', () => ({
  useOpsEngine: () => engine,
  useOpsVals: () => ({})
}));
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => true }));
let supabaseConfigured = true;
vi.mock('@/lib/supabase/config', () => ({ hasSupabaseConfig: () => supabaseConfigured }));

const createClient = vi.fn();
const getUser = vi.fn(async () => ({ data: { user: null }, error: null }));
const authSignOut = vi.fn(async () => ({ error: null }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => (createClient(), {
    auth: {
      getUser,
      signOut: authSignOut,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } })
    },
    from: vi.fn()
  })
}));

import { LiveGate } from '@/components/app/live-gate';

describe('LiveGate — "Back to ops" with no session', () => {
  const realLocation = window.location;
  const replace = vi.fn();

  beforeEach(() => {
    engine.state.screen = 'shop';
    supabaseConfigured = true;
    createClient.mockClear();
    engine.setRole.mockClear();
    getUser.mockClear();
    authSignOut.mockClear();
    replace.mockClear();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...realLocation, replace }
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
  });

  it('renders the customer screen unguarded, then blocks and signs out the moment the screen becomes staff-only', async () => {
    const { rerender } = render(
      <LiveGate initialScreen="shop">
        <div>staff frame</div>
      </LiveGate>
    );
    expect(screen.getByText('staff frame')).toBeInTheDocument();
    expect(getUser).not.toHaveBeenCalled();

    engine.state.screen = 'today'; // the "Back to ops" navigation
    rerender(
      <LiveGate initialScreen="shop">
        <div>staff frame</div>
      </LiveGate>
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith(expect.stringContaining('/sign-in')));
    expect(screen.queryByText('staff frame')).toBeNull();
    expect(authSignOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' });
  });

  it('with no Supabase configured, still renders the public shop and keeps staff screens closed', async () => {
    supabaseConfigured = false;
    const { rerender } = render(
      <LiveGate initialScreen="shop">
        <div>staff frame</div>
      </LiveGate>
    );
    expect(screen.getByText('staff frame')).toBeInTheDocument();
    expect(createClient).not.toHaveBeenCalled();

    engine.state.screen = 'today';
    rerender(
      <LiveGate initialScreen="shop">
        <div>staff frame</div>
      </LiveGate>
    );

    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    expect(replace).toHaveBeenCalledWith(expect.stringMatching(/^\/sign-in\?next=/));
    expect(screen.queryByText('staff frame')).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
    expect(engine.setRole).not.toHaveBeenCalled();
  });

  it('with no Supabase configured, a staff page opened directly never shows and goes to sign-in', async () => {
    supabaseConfigured = false;
    engine.state.screen = 'today';
    render(
      <LiveGate initialScreen="today">
        <div>staff frame</div>
      </LiveGate>
    );
    expect(screen.queryByText('staff frame')).toBeNull();
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    expect(replace).toHaveBeenCalledWith(expect.stringMatching(/^\/sign-in\?next=/));
    expect(screen.queryByText('staff frame')).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });
});
