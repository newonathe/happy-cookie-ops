import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { CustomerShopLive } from '@/components/live/customer/shop-live';
import type { OpsVals } from '@/view-models/vals';

function fixture(opts: { sizes?: number[]; cookies?: number; box?: boolean } = {}) {
  const pick = vi.fn(),
    plus = vi.fn(),
    minus = vi.fn();
  const row = (name: string, qty: number) => ({
    name,
    desc: '',
    kind: null,
    allergens: '',
    imgStyle: '',
    available: true,
    soldOut: false,
    picked: qty > 0,
    qty,
    priceText: '₱250',
    plus,
    minus
  });
  const cookies = opts.cookies ?? 0;
  const v = {
    shopTagline: '',
    dropBannerTitle: 'Orders are open',
    dropBannerSub: '',
    shopFlavours: [row('Smores', cookies), row('Sampler', 3)],
    boxTitle: 'Your order',
    boxCountText: 'Nothing picked yet',
    boxProgressText: '',
    boxTotalText: '₱0',
    boxCta: 'Continue',
    boxReady: true,
    pickedItems: [],
    custToCheckout: vi.fn(),
    openLookup: vi.fn(),
    openWaitlist: vi.fn(),
    shopBox:
      opts.box === false ? null : { sizes: opts.sizes ?? [6, 8, 12], cookies, samplerRow: 1, pick }
  } as unknown as OpsVals;
  return { v, pick, plus };
}
afterEach(cleanup);

describe('Order a box!', () => {
  it('shows the button only when the shop offers a box', () => {
    expect(
      render(<CustomerShopLive v={fixture().v} />).queryByRole('button', { name: 'Order a box!' })
    ).not.toBeNull();
    cleanup();
    expect(
      render(<CustomerShopLive v={fixture({ box: false }).v} />).queryByRole('button', {
        name: 'Order a box!'
      })
    ).toBeNull();
  });

  it('makes one tab per active size, never a fixed list', () => {
    const ui = render(<CustomerShopLive v={fixture({ sizes: [4, 10] }).v} />);
    fireEvent.click(ui.getByRole('button', { name: 'Order a box!' }));
    expect(ui.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Box of 4', 'Box of 10']);
  });

  it('enables Continue only when the box is exactly full, and says what changed', () => {
    for (const [cookies, ok] of [
      [5, false],
      [6, true],
      [7, false]
    ] as const) {
      const f = fixture({ cookies });
      const ui = render(<CustomerShopLive v={f.v} />);
      fireEvent.click(ui.getByRole('button', { name: 'Order a box!' }));
      const go = ui
        .getAllByRole('button', { name: 'Continue' })
        .find((b) => !(b as HTMLButtonElement).disabled);
      expect(Boolean(go)).toBe(ok);
      if (ok) {
        fireEvent.click(go!);
        expect(f.pick).toHaveBeenCalledWith(6);
      }
      cleanup();
    }
    const ui = render(<CustomerShopLive v={fixture({ cookies: 7 }).v} />);
    fireEvent.click(ui.getByRole('button', { name: 'Order a box!' }));
    expect(ui.getByText('A box of 6 holds 6. Remove 1 to continue.')).toBeTruthy();
    fireEvent.click(ui.getByRole('tab', { name: 'Box of 8' }));
    expect(ui.getByText('Add 1 more.')).toBeTruthy();
  });

  it('leaves the sampler out and stops adding past a full box', () => {
    const f = fixture({ cookies: 6 });
    const ui = render(<CustomerShopLive v={f.v} />);
    fireEvent.click(ui.getByRole('button', { name: 'Order a box!' }));
    expect(ui.queryByRole('article', { name: 'Sampler' })).toBeNull();
    const card = ui.getByRole('article', { name: 'Smores' });
    expect(
      (within(card).getByRole('button', { name: 'Add one' }) as HTMLButtonElement).disabled
    ).toBe(true);
  });
});
