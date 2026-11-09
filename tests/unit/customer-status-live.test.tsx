import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import * as axe from 'axe-core';
import { CustomerStatusLive } from '@/components/live/customer/status-live';
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => true }));
import { OpsRuntime } from '@/store/ops-runtime';
import { registerLiveCustomerScreens } from '@/components/live/customer/register';
import { liveScreenFor } from '@/components/live/live-screens';

afterEach(cleanup);
it('registers a full-width live status page on phone, tablet and desktop beside the locked port', () => {
  const undo = registerLiveCustomerScreens();
  try {
    expect(liveScreenFor('status')).toBeDefined();
    for (const device of ['mobile', 'tablet', 'desktop'] as const) {
      const runtime = new OpsRuntime({});
      runtime.state = { ...runtime.state, screen: 'status', device };
      expect(runtime.renderVals().pageMax).toBe('none');
      expect(runtime.renderVals().pagePad).toBe('0');
    }
  } finally {
    undo();
  }
});

function fixture(known = true) {
  const runtime = new OpsRuntime({});
  runtime.state = { ...runtime.state, screen: 'status' };
  const v = runtime.renderVals();
  v.backToShop = vi.fn();
  v.openLookup = vi.fn();
  v.cust.reorder = vi.fn();
  v.cust.orderNo = known ? 'HC-1001' : '—';
  v.cust.heroTitle = known ? 'Order received' : 'We could not load your order';
  v.cust.heroBody = 'Current order information.';
  v.cust.windowText = 'Thu, Nov 12 · 9:00 AM';
  v.cust.timeline = [
    { what: 'Order received', sub: 'We have your order', done: true, now: false, todo: false },
    { what: 'Payment', sub: 'Waiting for your payment', done: false, now: true, todo: false }
  ];
  return v;
}
it('preserves status, progress, pickup and scoped actions without introducing delivery or payment claims', () => {
  const v = fixture(),
    ui = render(<CustomerStatusLive v={v} />);
  expect(ui.getByRole('heading', { level: 1 }).textContent).toBe('Order received');
  expect(ui.getByText('Order HC-1001')).toBeTruthy();
  expect(ui.getByText('Thu, Nov 12 · 9:00 AM')).toBeTruthy();
  expect(ui.getByText('Payment').closest('li')?.getAttribute('aria-current')).toBe('step');
  fireEvent.click(ui.getByRole('button', { name: 'Back to cookies' }));
  fireEvent.click(ui.getByRole('button', { name: 'Order this cookie again' }));
  expect(v.backToShop).toHaveBeenCalledOnce();
  expect(v.cust.reorder).toHaveBeenCalledOnce();
  expect(ui.container.textContent).not.toMatch(
    /Grab|Lalamove|Invoice|payment proof|Pickup code|Send payment again/
  );
});
it('keeps unread and missing states free of placeholder orders, empty progress and pickup claims', () => {
  const v = fixture(false),
    ui = render(<CustomerStatusLive v={v} />);
  expect(ui.queryByRole('article')).toBeNull();
  expect(ui.queryByLabelText('Pickup details')).toBeNull();
  expect(ui.queryByText('—')).toBeNull();
  expect(ui.queryByRole('button', { name: 'Order this cookie again' })).toBeNull();
  fireEvent.click(ui.getByRole('button', { name: 'Find my order' }));
  expect(v.openLookup).toHaveBeenCalledOnce();
});
it('has no automated accessibility violations', async () => {
  const ui = render(
    <main>
      <CustomerStatusLive v={fixture()} />
    </main>
  );
  expect(
    (await axe.run(ui.container, { rules: { 'color-contrast': { enabled: false } } })).violations
  ).toEqual([]);
});
