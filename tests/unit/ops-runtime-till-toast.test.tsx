import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, render } from '@testing-library/react';

vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => true }));
vi.mock('@/lib/offline/idb', () => ({
  idb: {
    put: async () => undefined,
    all: async () => [],
    get: async () => undefined,
    delete: async () => undefined,
    supported: () => true
  }
}));
vi.mock('@/lib/device', () => ({ deviceId: () => 'dev1' }));

import { OpsRuntime } from '@/store/ops-runtime';
import { clearBazaar } from '@/lib/offline/bazaar-state';

/**
 * HCB-005: the message that appears while a sale is in hand must not sit on Charge, or on the payment sheet's wallet
 * buttons. On a phone or tablet it stands above the sale bar; while the payment sheet is open it moves to the top.
 */
const ABOVE_BAR =
  'bottom: calc(var(--workspace-dock, 0px) + 12px + var(--till-sale-bar, 76px) + 8px)';

function selling(device: 'mobile' | 'tablet' | 'desktop', sheet: { kind: string } | null = null) {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
  const runtime = ref.current!;
  act(() => runtime.setRole('owner'));
  act(() =>
    runtime.setState({
      device,
      event: { id: 'e1', name: 'Market', stage: 'selling', dayId: 'd1' },
      eventLoaded: { dcf: 10 },
      eventStock: { dcf: 10 },
      eventPrices: { dcf: 125 },
      cart: { dcf: 1 },
      sales: [],
      screen: 'bazaar',
      sheet,
      online: true
    } as never)
  );
  return runtime;
}
const style = (runtime: OpsRuntime) => String(runtime.renderVals().toastStyle);

beforeEach(async () => {
  localStorage.clear();
  await clearBazaar();
});
afterEach(cleanup);

describe('toast over the consolidated till', () => {
  it.each(['mobile', 'tablet'] as const)(
    'stands above the sale bar on a %s, whatever its height',
    (device) => {
      const toast = style(selling(device));
      expect(toast).toContain(ABOVE_BAR);
      expect(toast).not.toMatch(/bottom: \d+px/);
      expect(toast).toContain('left: 14px; right: 14px');
    }
  );

  it('is untouched on desktop', () => {
    expect(style(selling('desktop'))).toContain('bottom: 18px');
  });

  it.each(['mobile', 'tablet'] as const)(
    'moves to the top of a %s while the payment sheet is open',
    (device) => {
      const toast = style(selling(device, { kind: 'pay' }));
      expect(toast).toContain('top: 14px; bottom: auto');
      expect(toast).not.toContain('var(--till-sale-bar');
      expect(toast).toContain('left: 14px; right: 14px');
    }
  );

  it('keeps the desktop payment sheet toast where it was', () => {
    expect(style(selling('desktop', { kind: 'pay' }))).toContain('bottom: 18px');
  });
});
