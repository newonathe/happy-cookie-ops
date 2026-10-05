import { act } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));

import { OpsRuntime } from '@/store/ops-runtime';
import { OpsProvider } from '@/store/engine/ops-engine';
import { useOpsVals } from '@/store/use-ops';
import { AppFrame } from '@/components/shell/app-frame';

function Frame() {
  return <AppFrame v={useOpsVals()} />;
}
function mount(role: 'owner' | 'helper' | 'support' = 'owner') {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(
    <OpsRuntime ref={(r) => void (ref.current = r)}>
      <Frame />
    </OpsRuntime>
  );
  const runtime = ref.current!;
  act(() => runtime.setRole(role));
  act(() => runtime.setState({ device: 'mobile' }));
  return runtime;
}
const dock = (runtime: OpsRuntime) => runtime.renderVals().dockNav;
const labels = (runtime: OpsRuntime) => dock(runtime).map((item) => item.label);
const marked = (runtime: OpsRuntime) =>
  dock(runtime)
    .filter((item) => item.active)
    .map((item) => item.label);

afterEach(() => {
  cleanup();
  live = true;
});

describe('UX review proposal 3: the live phone dock', () => {
  it('shows the owner five labelled destinations, in order, with their badges', () => {
    const runtime = mount();
    expect(labels(runtime)).toEqual(['Home', 'Orders', 'Bake', 'Inventory', 'All tools']);
    const ported = OpsProvider.prototype.renderVals.call(runtime).dockNav;
    for (const item of dock(runtime)) {
      const original = ported.find((row: { label: unknown }) => row.label === item.label);
      expect(item.badge).toBe(original?.badge);
      expect(item.icon).toBe(original?.icon);
    }
    expect(String(runtime.renderVals().dockPillStyle)).toContain('calc((100% - 12px) / 5)');
    // The labels are on screen, one per destination, inside the dock buttons.
    for (const label of ['Home', 'Orders', 'Bake', 'Inventory', 'All tools']) {
      const button = screen.getByRole('button', { name: label });
      expect(within(button).getByText(label)).toBeTruthy();
    }
    expect(screen.queryByRole('button', { name: 'Sales log' })).toBeNull();
  });

  it('marks the destination a screen belongs to, and All tools for everything reached through it', () => {
    const runtime = mount();
    expect(marked(runtime)).toEqual(['Home']);
    for (const [screenKey, label] of [
      ['orders', 'Orders'],
      ['order', 'Orders'],
      ['bake', 'Bake'],
      ['batch', 'Bake'],
      ['inventory', 'Inventory'],
      ['more', 'All tools'],
      ['sales', 'All tools'],
      ['grocery', 'All tools'],
      ['bazaar', 'All tools'],
      ['pnl', 'All tools'],
      ['products', 'All tools'],
      ['health', 'All tools']
    ] as const) {
      act(() => runtime.go(screenKey));
      expect([screenKey, ...marked(runtime)]).toEqual([screenKey, label]);
      const at = ['Home', 'Orders', 'Bake', 'Inventory', 'All tools'].indexOf(label);
      expect(String(runtime.renderVals().dockPillStyle)).toContain(
        `translate3d(${at * 100}%, 0, 0); opacity: 1`
      );
    }
  });

  it('keeps Sales log, Grocery, Bazaar and P&L one tap away in All tools', () => {
    const runtime = mount();
    const tools = runtime.renderVals().toolGroups.flatMap((group) => group.items);
    for (const label of ['Sales log', 'Grocery', 'Bazaar Mode', 'Profit & loss'])
      expect(tools.filter((item) => item.label === label)).toHaveLength(1);
    act(() => tools.find((item) => item.label === 'Sales log')!.go());
    expect(runtime.state.screen).toBe('sales');
  });

  it('gives Sales log its own icon, in All tools and in the tablet and desktop sidebar', () => {
    const runtime = mount();
    const vals = runtime.renderVals();
    const rail = (label: string) => vals.railNav.find((item) => item.label === label)?.icon;
    expect(rail('Sales log')).toBeTruthy();
    expect(rail('Sales log')).not.toBe(rail('P&L'));
    expect(vals.railNav.map((item) => item.label)).toEqual(
      OpsProvider.prototype.renderVals
        .call(runtime)
        .railNav.map((item: { label: unknown }) => item.label)
    );
    expect(
      vals.toolGroups.flatMap((group) => group.items).find((item) => item.label === 'Sales log')
        ?.icon
    ).toBe(rail('Sales log'));
  });

  it('leaves a helper and support their own short docks, labelled', () => {
    const helper = mount('helper');
    expect(labels(helper)).toEqual(['Home', 'Sales log', 'Bazaar']);
    expect(String(helper.renderVals().dockPillStyle)).toContain('calc((100% - 12px) / 3)');
    expect(within(screen.getByRole('button', { name: 'Bazaar' })).getByText('Bazaar')).toBeTruthy();
    cleanup();
    const support = mount('support');
    expect(labels(support)).toEqual(['All tools']);
  });

  it('demo mode keeps the ported dock: nine icons, no visible labels, the engine’s icons', () => {
    live = false;
    const runtime = mount();
    const ported = OpsProvider.prototype.renderVals.call(runtime);
    const vals = runtime.renderVals();
    expect(vals.dockNav.map((item) => [item.label, item.icon])).toEqual(
      ported.dockNav.map((item: { label: unknown; icon: unknown }) => [item.label, item.icon])
    );
    expect(vals.dockNav).toHaveLength(9);
    expect(vals.dockPillStyle).toBe(ported.dockPillStyle);
    expect(vals.railNav.map((item) => item.icon)).toEqual(
      ported.railNav.map((item: { icon: unknown }) => item.icon)
    );
    const home = screen.getByRole('button', { name: 'Home' });
    expect(within(home).queryByText('Home')).toBeNull();
  });
});
