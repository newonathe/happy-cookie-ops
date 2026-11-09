import { beforeEach, describe, expect, it, vi } from 'vitest';

let live = false;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));

import { OpsRuntime, deviceForWidth } from '@/store/ops-runtime';
import { OpsProvider } from '@/store/engine/ops-engine';
import { render, screen } from '@testing-library/react';
import { registerLiveScreen } from '@/components/live/live-screens';
import { CheckoutScreen } from '@/components/screens/checkout';
import { ShopScreen } from '@/components/screens/shop';

function vals(device: 'mobile' | 'tablet' | 'desktop') {
  const runtime = new OpsRuntime({});
  runtime.state = { ...runtime.state, device };
  return runtime.renderVals();
}

describe('live frame: the real app, not the review harness', () => {
  beforeEach(() => {
    live = false;
  });

  it('maps the viewport width to the prototype layout for that screen', () => {
    expect(deviceForWidth(375)).toBe('mobile');
    expect(deviceForWidth(767)).toBe('mobile');
    expect(deviceForWidth(768)).toBe('tablet');
    expect(deviceForWidth(1199)).toBe('tablet');
    expect(deviceForWidth(1200)).toBe('desktop');
    expect(deviceForWidth(1920)).toBe('desktop');
  });

  it('in live mode drops the harness and fills the screen', () => {
    live = true;
    for (const device of ['mobile', 'tablet', 'desktop'] as const) {
      const v = vals(device);
      expect(v.bareFrame).toBe(true);
      expect(v.showFlowStrip).toBe(false);
      expect(v.flow).toBeNull();
      expect(v.devices).toEqual([]);
      expect(v.roles).toEqual([]);
      expect(v.showPhoneWidths).toBe(false);
      expect(v.frameOuterStyle).toBe('width: 100%; height: 100dvh; flex-shrink: 0');
      expect(String(v.frameStyle)).toMatch(/^width: 100%; height: 100%; transform: scale\(1\);/);
      expect(String(v.frameStyle)).not.toMatch(/border-radius|box-shadow|border:/);
    }
    expect(vals('desktop').showRail).toBe(true);
    expect(vals('tablet').showRail).toBe(true);
    expect(vals('mobile').showDock).toBe(true);
  });

  it('lets the registered public Shop use the whole viewport without changing checkout or demo sizing', () => {
    const undo = registerLiveScreen('shop', ShopScreen);
    try {
      live = true;
      const runtime = new OpsRuntime({});
      runtime.state = { ...runtime.state, screen: 'shop', device: 'desktop' };
      expect(runtime.renderVals().pageMax).toBe('none');
      expect(runtime.renderVals().pagePad).toBe('0');
      runtime.state = { ...runtime.state, screen: 'checkout' };
      expect(runtime.renderVals().pageMax).toBe('640px');
      live = false;
      runtime.state = { ...runtime.state, screen: 'shop' };
      expect(runtime.renderVals().pageMax).toBe('640px');
    } finally {
      undo();
    }
  });

  it('lets a registered live checkout fill the viewport while keeping the unregistered fallback and demo', () => {
    live = true;
    const runtime = new OpsRuntime({});
    runtime.state = { ...runtime.state, screen: 'checkout', device: 'desktop' };
    expect(runtime.renderVals().pageMax).toBe('640px');
    const undo = registerLiveScreen('checkout', CheckoutScreen);
    try {
      expect(runtime.renderVals().pageMax).toBe('none');
      expect(runtime.renderVals().pagePad).toBe('0');
      live = false;
      expect(runtime.renderVals().pageMax).toBe('640px');
    } finally {
      undo();
    }
  });

  it('in demo mode leaves every frame value exactly as the ported engine computes it', () => {
    const runtime = new OpsRuntime({});
    const engine = OpsProvider.prototype.renderVals.call(runtime);
    const v = runtime.renderVals();
    expect(v.bareFrame).toBeUndefined();
    expect(v.frameOuterStyle).toBe(engine.frameOuterStyle);
    expect(v.frameStyle).toBe(engine.frameStyle);
    expect(v.showFlowStrip).toBe(engine.showFlowStrip);
    expect(v.devices).toHaveLength(3);
  });

  it('hides the owner-preview controls from customers on the live shop, and only there', () => {
    live = true;
    const { unmount } = render(<ShopScreen v={vals('mobile')} />);
    expect(screen.queryByText('Back to ops')).toBeNull();
    expect(screen.queryByText('Preview · customer view')).toBeNull();
    expect(screen.getByText("This week's drop")).toBeInTheDocument();
    unmount();

    live = false;
    render(<ShopScreen v={vals('mobile')} />);
    expect(screen.getByText('Back to ops')).toBeInTheDocument();
    expect(screen.getByText('Preview · customer view')).toBeInTheDocument();
  });
});
