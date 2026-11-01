import { act } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));

import { OpsRuntime } from '@/store/ops-runtime';
import { OpsProvider } from '@/store/engine/ops-engine';
import type { OpsEngineState } from '@/store/engine/ops-engine';
import { useOpsVals } from '@/store/use-ops';
import { AppFrame } from '@/components/shell/app-frame';
import { SCREEN_KEYS } from '@/lib/screens';
import { PLACES, TABS, placeOfRoute, tabOfRoute } from '@/lib/nav/function-map';
import { clearBazaar, readBazaar } from '@/lib/offline/bazaar-state';

function Frame() {
  return <AppFrame v={useOpsVals()} />;
}
function mount(role: 'owner' | 'helper' | 'support' = 'owner', device = 'mobile') {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(
    <OpsRuntime ref={(r) => void (ref.current = r)}>
      <Frame />
    </OpsRuntime>
  );
  const runtime = ref.current!;
  act(() => runtime.setRole(role));
  act(() => runtime.setState({ device }));
  return runtime;
}
const TAB_LABELS = ['Home', 'Bazaar', 'Sell', 'Make', 'Stock', 'Money'];
const dock = (runtime: OpsRuntime) => runtime.renderVals().dockNav;
const labels = (runtime: OpsRuntime) => dock(runtime).map((item) => item.label);
const marked = (runtime: OpsRuntime) =>
  dock(runtime)
    .filter((item) => item.active)
    .map((item) => item.label);
const strip = (runtime: OpsRuntime) => runtime.renderVals().liveScreen?.tabs ?? null;
const places = (runtime: OpsRuntime) => (strip(runtime)?.places ?? []).map((item) => item.label);
const entries = (runtime: OpsRuntime) => (strip(runtime)?.entries ?? []).map((item) => item.label);
const open = (items: Array<{ label: string; active: boolean }> | undefined) =>
  (items ?? []).filter((item) => item.active).map((item) => item.label);
const row = (kind: 'places' | 'entries') => document.querySelector(`[data-sub-tabs="${kind}"]`);

afterEach(() => {
  cleanup();
  clearBazaar();
  localStorage.clear();
  live = true;
});

describe('the six tabs on the live owner’s dock and sidebar', () => {
  it('shows Home, Bazaar, Sell, Make, Stock, Money with the engine’s own icons', () => {
    const runtime = mount();
    expect(labels(runtime)).toEqual(TAB_LABELS);
    const ported = OpsProvider.prototype.renderVals.call(runtime).dockNav;
    const icon = (label: string) =>
      ported.find((item: { label: unknown }) => item.label === label)?.icon;
    expect(dock(runtime).map((item) => item.icon)).toEqual(
      ['Home', 'Bazaar', 'Orders', 'Bake', 'Inventory', 'P&L'].map(icon)
    );
    expect(String(runtime.renderVals().dockPillStyle)).toContain('calc((100% - 12px) / 6)');
    for (const label of TAB_LABELS) {
      const button = screen.getByRole('button', { name: label });
      expect(within(button).getByText(label)).toBeTruthy();
    }
    // The old destinations and the catch-all are off the dock.
    for (const gone of ['Orders', 'Bake', 'Inventory', 'All tools', 'Sales log'])
      expect(dock(runtime).some((item) => item.label === gone)).toBe(false);
  });

  it('opens each tab on its first place', () => {
    const runtime = mount();
    for (const tab of TABS) {
      act(() =>
        dock(runtime)
          .find((item) => item.label === tab.label)!
          .go()
      );
      expect([tab.label, runtime.state.screen]).toEqual([tab.label, tab.screen]);
      expect(marked(runtime)).toEqual([tab.label]);
    }
  });

  it('marks the tab every route belongs to, Home for Account, and none outside the tabs', () => {
    const runtime = mount();
    for (const route of SCREEN_KEYS) {
      act(() => runtime.go(route));
      const tab = tabOfRoute(route);
      const wanted =
        placeOfRoute(route)?.home === 'account'
          ? 'Home'
          : (TABS.find((item) => item.id === tab)?.label ?? null);
      expect([route, ...marked(runtime)]).toEqual(wanted ? [route, wanted] : [route]);
      const at = wanted ? TAB_LABELS.indexOf(wanted) : -1;
      expect(String(runtime.renderVals().dockPillStyle)).toContain(
        at < 0 ? 'opacity: 0' : `translate3d(${at * 100}%, 0, 0); opacity: 1`
      );
      expect(String(runtime.renderVals().railPillStyle)).toContain(
        at < 0 ? 'opacity: 0' : `translate3d(0, ${at * 44}px, 0); opacity: 1`
      );
    }
  });

  it('gives the sidebar the same six', () => {
    const runtime = mount('owner', 'desktop');
    expect(runtime.renderVals().railNav.map((item) => item.label)).toEqual(TAB_LABELS);
    expect(runtime.renderVals().railNav.map((item) => item.icon)).toEqual(
      dock(runtime).map((item) => item.icon)
    );
    act(() => runtime.renderVals().railNav[4]!.go());
    expect(runtime.state.screen).toBe('inventory');
  });

  it('carries the Orders and Grocery counts on their tabs and their sub-tabs', () => {
    const runtime = mount();
    const ported = OpsProvider.prototype.renderVals.call(runtime).dockNav;
    const count = (label: string) =>
      Number(ported.find((item: { label: unknown }) => item.label === label)?.badge) || 0;
    const tab = (label: string) =>
      Number(dock(runtime).find((item) => item.label === label)?.badge) || 0;
    expect(tab('Sell')).toBe(count('Orders'));
    expect(tab('Stock')).toBe(count('Grocery'));
    // What All tools carried (the backup flag, unsent sales) is on Home, where Account sits.
    expect(tab('Home')).toBe(count('All tools'));
  });
});

describe('B1: the sub-tab strip, drawn through the screen slot', () => {
  it('lists the places of the open tab and marks the open one', () => {
    const runtime = mount();
    act(() => runtime.go('orders'));
    expect(places(runtime)).toEqual(['Orders', 'Payments', 'Customers/Waitlist', 'Shop']);
    expect(open(strip(runtime)?.places)).toEqual(['Orders']);
    expect(entries(runtime)).toEqual(['Orders & payments', 'Payments', 'Customer messages']);
    expect(open(strip(runtime)?.entries)).toEqual(['Orders & payments']);
    // On screen, above the ported Orders screen, which still renders.
    const first = row('places')!;
    expect(within(first as HTMLElement).getAllByRole('button')).toHaveLength(4);
    expect(
      within(first as HTMLElement)
        .getByRole('button', { name: 'Orders' })
        .getAttribute('aria-current')
    ).toBe('page');
    expect(document.querySelector('[data-screen-label="Orders"]')).toBeTruthy();
    expect(runtime.renderVals().screens.orders).toBe(true);
    expect(runtime.renderVals().liveScreen?.screen).toBeNull();
  });

  it('opens contextual tools without a second navigation row or a duplicate Orders button', () => {
    const runtime = mount();
    act(() => runtime.go('orders'));
    expect(row('entries')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Orders' })).toHaveLength(1);
    fireEvent.click(screen.getByText('Orders settings & tools'));
    expect(screen.queryByRole('button', { name: 'Orders & payments' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Customer messages' })).toBeTruthy();
    expect(
      within(row('places') as HTMLElement).getByRole('button', { name: 'Payments' })
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Payments' }));
    expect(runtime.state.screen).toBe('reconcile');
    expect(open(strip(runtime)?.places)).toEqual(['Payments']);
    expect(open(strip(runtime)?.entries)).toEqual(['Payments']);
    expect(marked(runtime)).toEqual(['Sell']);
    // The order page belongs to Orders too; no entry is marked on it.
    act(() => runtime.go('order'));
    expect(open(strip(runtime)?.places)).toEqual(['Orders']);
    expect(open(strip(runtime)?.entries)).toEqual([]);
  });

  it('opens Shop on Drops with its nine entries, and Customers on its one sheet', () => {
    const runtime = mount();
    act(() => runtime.go('orders'));
    act(() =>
      strip(runtime)!
        .places.find((item) => item.label === 'Shop')!
        .go()
    );
    expect(runtime.state.screen).toBe('drops');
    expect(open(strip(runtime)?.places)).toEqual(['Shop']);
    expect(entries(runtime)).toHaveLength(9);
    expect(open(strip(runtime)?.entries)).toEqual(['Drops']);
    act(() =>
      strip(runtime)!
        .places.find((item) => item.label === 'Customers/Waitlist')!
        .go()
    );
    expect(runtime.state.screen).toBe('drops');
    expect((runtime.state.sheet as { kind?: string } | null)?.kind).toBe('customers');
  });

  it('puts Account on Home’s strip until the top bar has a button for it', () => {
    const runtime = mount();
    expect(places(runtime)).toEqual(['This week', 'Account']);
    expect(open(strip(runtime)?.places)).toEqual(['This week']);
    expect(entries(runtime)).toEqual([]);
    act(() =>
      strip(runtime)!
        .places.find((item) => item.label === 'Account')!
        .go()
    );
    expect(runtime.state.screen).toBe('settings');
    expect(marked(runtime)).toEqual(['Home']);
    expect(open(strip(runtime)?.places)).toEqual(['Account']);
    expect(entries(runtime)).toEqual(['Settings', 'System health', 'Backups & export']);
    act(() =>
      strip(runtime)!
        .entries.find((item) => item.label === 'System health')!
        .go()
    );
    expect(runtime.state.screen).toBe('health');
    // Two entries open this screen; only the first is marked.
    expect(open(strip(runtime)?.entries)).toEqual(['System health']);
  });

  it('offers every entry that has a home under a tab or Account exactly once', () => {
    const runtime = mount();
    const offered: string[] = [];
    for (const place of PLACES.filter((p) => !['bell', 'customer', 'retired'].includes(p.home))) {
      if (place.screen) {
        act(() => runtime.go(place.screen!));
        expect([place.id, open(strip(runtime)?.places)]).toEqual([place.id, [place.label]]);
        if (place.entries.length > 1) offered.push(...entries(runtime));
        else offered.push(...place.entries.map((entry) => entry.label));
      } else {
        // No screen yet: its chip is its one entry.
        act(() => runtime.go(TABS.find((tab) => tab.id === place.home)!.screen));
        expect(places(runtime)).toContain(place.label);
        offered.push(place.entries[0]!.label);
      }
    }
    const wanted = PLACES.filter((p) => !['bell', 'customer', 'retired'].includes(p.home)).flatMap(
      (place) => place.entries.map((entry) => entry.label)
    );
    expect([...offered].sort()).toEqual([...wanted].sort());
    expect(new Set(offered).size).toBe(offered.length);
    expect(offered).toHaveLength(31);
    // The other two: Notifications is behind the bell, Form queue is retired.
    const all = runtime.liveToolEntries().map((item) => String(item.label));
    expect(all.filter((label) => !offered.includes(label)).sort()).toEqual([
      'Form queue',
      'Notifications'
    ]);
  });

  it('draws nothing on Bazaar Mode once an event is on the phone, at any stage', () => {
    const runtime = mount();
    act(() => runtime.go('bazaar'));
    // No event yet: the bookings list, with the way to Bazaar events.
    expect(entries(runtime)).toEqual(['Bazaar Mode', 'Bazaar events']);
    for (const stage of ['stock', 'selling', 'closed']) {
      act(() =>
        runtime.setState({ event: { name: 'Fair', stage } as OpsEngineState['event'], sales: [] })
      );
      expect([stage, runtime.renderVals().liveScreen]).toEqual([stage, null]);
      expect([stage, row('places')]).toEqual([stage, null]);
    }
    expect(marked(runtime)).toEqual(['Bazaar']);
  });

  it('draws nothing on Bazaar Mode on a phone that reopens with a saved event', () => {
    // What the gate opens offline: the saved event is back before the first tap.
    localStorage.setItem(
      'hc-live-bazaar',
      JSON.stringify({
        event: { id: 'd1e0c105-0000-4000-8000-0000000000e1', name: 'Fair', stage: 'selling' },
        sales: []
      })
    );
    expect(readBazaar()).toBeTruthy();
    const runtime = mount();
    act(() => runtime.go('bazaar'));
    expect(runtime.state.event).toMatchObject({ stage: 'selling' });
    expect(runtime.renderVals().liveScreen).toBeNull();
    expect(row('places')).toBeNull();
  });

  it('keeps counts navigable while bell, All tools and customer pages have no strip', () => {
    const runtime = mount();
    for (const route of ['notifications', 'more', 'formqueue', 'shop', 'checkout'] as const) {
      act(() => runtime.go(route));
      expect([route, runtime.renderVals().liveScreen]).toEqual([route, null]);
    }
    act(() => runtime.go('inventory'));
    expect(strip(runtime)).toBeTruthy();
    // This is a shell-state test; starting a real count now requires the owner catalogue and a device lock.
    act(() => runtime.setState({ stocktake: { i: 0, items: [], counts: {} } }));
    expect(runtime.renderVals().showTopBar).toBe(true);
    expect(runtime.renderVals().showDock).toBe(true);
    expect(strip(runtime)).toBeTruthy();
    expect(marked(runtime)).toEqual(['Stock']);
    expect(String(runtime.renderVals().toastStyle)).toContain('bottom: 96px');
  });

  it('keeps All tools working by address, grouped by home, without Form queue', () => {
    const runtime = mount();
    act(() => runtime.go('more'));
    const groups = runtime.renderVals().toolGroups;
    const shown = groups.flatMap((group) => group.items.map((item) => String(item.label)));
    expect(shown).toHaveLength(32);
    expect(new Set(shown).size).toBe(32);
    expect(shown).not.toContain('Form queue');
    expect(groups.map((group) => group.title)).toEqual([
      'Sell · Orders',
      'Bazaar · Bazaar',
      'Sell · Customers/Waitlist',
      'Sell · Shop',
      'Make · Bake plan',
      'Make · Recipes',
      'Stock · Inventory',
      'Stock · Shopping',
      'Stock · Suppliers',
      'Money · P&L',
      'Money · Sales',
      'Money · Expenses',
      'Account',
      'Notifications'
    ]);
    act(() =>
      groups
        .flatMap((group) => group.items)
        .find((item) => item.label === 'Sales log')!
        .go()
    );
    expect(runtime.state.screen).toBe('sales');
  });
});

describe('B1: who keeps what they had', () => {
  it('leaves a helper and support their own short docks, labelled, with no strip', () => {
    const helper = mount('helper');
    expect(labels(helper)).toEqual(['Home', 'Sales log', 'Bazaar']);
    expect(String(helper.renderVals().dockPillStyle)).toContain('calc((100% - 12px) / 3)');
    expect(within(screen.getByRole('button', { name: 'Bazaar' })).getByText('Bazaar')).toBeTruthy();
    for (const route of ['today', 'sales', 'bazaar', 'orders'] as const) {
      act(() => helper.go(route));
      expect([route, helper.renderVals().liveScreen]).toEqual([route, null]);
    }
    cleanup();
    const support = mount('support');
    expect(labels(support)).toEqual(['All tools']);
    expect(support.renderVals().liveScreen).toBeNull();
    // Support's All tools is the engine's own short list, not the owner's index.
    expect(
      support.renderVals().toolGroups.flatMap((group) => group.items.map((item) => item.label))
    ).toEqual(['Notifications', 'System health', 'Backups & export']);
  });

  it('demo mode keeps the ported dock: nine icons, no visible labels, no strip', () => {
    live = false;
    const runtime = mount();
    const ported = OpsProvider.prototype.renderVals.call(runtime);
    const vals = runtime.renderVals();
    expect(vals.dockNav.map((item) => [item.label, item.icon])).toEqual(
      ported.dockNav.map((item: { label: unknown; icon: unknown }) => [item.label, item.icon])
    );
    expect(vals.dockNav).toHaveLength(9);
    expect(vals.dockPillStyle).toBe(ported.dockPillStyle);
    expect(vals.railPillStyle).toBe(ported.railPillStyle);
    expect(vals.railNav.map((item) => [item.label, item.icon])).toEqual(
      ported.railNav.map((item: { label: unknown; icon: unknown }) => [item.label, item.icon])
    );
    expect(vals.liveScreen).toBeUndefined();
    expect(row('places')).toBeNull();
    const home = screen.getByRole('button', { name: 'Home' });
    expect(within(home).queryByText('Home')).toBeNull();
  });
});
