import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import * as axe from 'axe-core';
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => true }));
import { OpsRuntime } from '@/store/ops-runtime';
import { CustomerCheckoutLive } from '@/components/live/customer/checkout-live';

function fixture() {
  const runtime = new OpsRuntime({});
  runtime.state = { ...runtime.state, screen: 'checkout' };
  const v = runtime.renderVals();
  v.backToShop = vi.fn();
  v.cust.lines = [{ name: 'Chocolate', qty: '2×', line: '₱250', imgStyle: '' }];
  v.cust.countText = '2 cookies';
  v.cust.totalText = '₱250';
  return v;
}
afterEach(cleanup);
describe('fluid customer checkout', () => {
  it('retains the real form, read recovery, chosen quantities and Back action', () => {
    const v = fixture(),
      ui = render(<CustomerCheckoutLive v={v} />);
    expect(ui.getByText('About you')).toBeTruthy();
    expect(ui.getByText('Cookie subtotal')).toBeTruthy();
    expect(
      within(ui.getByRole('complementary', { name: 'Order summary' })).getAllByText('₱250')
    ).toHaveLength(2);
    expect(ui.getByText('2× Chocolate').textContent).toBe('2× Chocolate');
    expect(ui.queryByText('Chocolate × 2×')).toBeNull();
    expect(ui.getByRole('button', { name: 'Place order' })).toBeDisabled();
    fireEvent.click(ui.getByRole('button', { name: 'Back to cookies' }));
    expect(v.backToShop).toHaveBeenCalledOnce();
  });
  it('does not ask for a payment reference before payment and leaves saved reference data intact', () => {
    const v = fixture();
    v.liveCheckout!.fields.ref = 'Historical receipt';
    const ui = render(<CustomerCheckoutLive v={v} />);
    expect(ui.queryByRole('textbox', { name: /Reference number/ })).toBeNull();
    expect(v.liveCheckout!.fields.ref).toBe('Historical receipt');
  });

  it('uses the acknowledged server total instead of the current catalogue subtotal after receipt', () => {
    const v = fixture();
    v.liveCheckout!.placed = {
      orderNo: 'HC-1001',
      statusUrl: 'https://shop.example/status#t=' + 'a'.repeat(64),
      totalText: '₱330',
      pickupText: 'Thursday',
      extraLines: ['Box 6 × 1'],
      copyLink: vi.fn(),
      seeOrder: vi.fn(),
      orderAgain: vi.fn()
    };
    const ui = render(<CustomerCheckoutLive v={v} />);
    expect(ui.getByText('Order total').textContent).toBe('Order total');
    expect(ui.queryByText('Cookie subtotal')).toBeNull();
    expect(ui.queryByText('₱250')).toBeNull();
    expect(
      within(ui.getByRole('complementary', { name: 'Order summary' })).getByText('₱330').textContent
    ).toBe('₱330');
    expect(ui.getByRole('button', { name: 'See my order' })).toBeTruthy();
  });
  it('keeps named form controls and has no automated component accessibility violations', async () => {
    const ui = render(
      <main>
        <CustomerCheckoutLive v={fixture()} />
      </main>
    );
    expect(
      (await axe.run(ui.container, { rules: { 'color-contrast': { enabled: false } } })).violations
    ).toEqual([]);
  });
});
