import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import * as axe from 'axe-core';
import { CustomerShopLive } from '@/components/live/customer/shop-live';
import type { OpsVals } from '@/view-models/vals';

function fixture() {
  const plus = vi.fn(),
    minus = vi.fn(),
    remove = vi.fn(),
    checkout = vi.fn(),
    lookup = vi.fn(),
    waitlist = vi.fn();
  const v = {
    shopTagline: 'Baked for your week.',
    dropBannerTitle: 'Orders are open',
    dropBannerSub: 'Pickup details appear at checkout.',
    shopFlavours: [
      {
        name: 'Chocolate',
        desc: 'Dark chocolate chunks.',
        kind: 'Classic',
        allergens: 'Contains milk',
        imgStyle: '',
        available: true,
        soldOut: false,
        picked: true,
        qty: 2,
        priceText: '₱250',
        plus,
        minus
      }
    ],
    boxTitle: 'Your cookies',
    boxCountText: '2 cookies picked',
    boxProgressText: '1 flavour',
    boxTotalText: '₱500',
    boxCta: 'Continue · ₱500',
    boxReady: true,
    pickedItems: [{ name: 'Chocolate', qty: 2, imgStyle: '', remove }],
    custToCheckout: checkout,
    openLookup: lookup,
    openWaitlist: waitlist,
    priceNote: 'You pay per cookie — no extra packaging charge.'
  } as unknown as OpsVals;
  return { v, plus, minus, remove, checkout, lookup, waitlist };
}
afterEach(cleanup);
describe('fluid client Shop', () => {
  it('preserves the cart, lookup, waiting-list and checkout actions with contextual product controls', () => {
    const f = fixture(),
      ui = render(<CustomerShopLive v={f.v} />),
      product = ui.getByRole('article', { name: 'Chocolate' });
    fireEvent.click(within(product).getByRole('button', { name: 'Add one' }));
    fireEvent.click(within(product).getByRole('button', { name: 'Remove one' }));
    fireEvent.click(ui.getByRole('button', { name: 'Remove one Chocolate' }));
    fireEvent.click(ui.getAllByRole('button', { name: 'Continue · ₱500' })[0]!);
    fireEvent.click(ui.getByRole('button', { name: 'Find my order' }));
    fireEvent.click(ui.getByRole('button', { name: 'Join the waiting list' }));
    for (const action of [f.plus, f.minus, f.remove, f.checkout, f.lookup, f.waitlist])
      expect(action).toHaveBeenCalledOnce();
    expect(ui.getByText('Contains milk')).toBeTruthy();
    expect(ui.container.textContent).not.toContain('no extra packaging charge');
    expect(ui.getByText(/Boxes, add-ons|boxes, add-ons/)).toBeTruthy();
  });
  it('keeps a selected removed item inspectable, blocks empty checkout and hides unset allergen placeholders', () => {
    const f = fixture();
    f.v.shopFlavours[0]!.available = false;
    f.v.shopFlavours[0]!.soldOut = true;
    f.v.shopFlavours[0]!.allergens = 'Contains';
    f.v.boxReady = false;
    const ui = render(<CustomerShopLive v={f.v} />);
    expect(ui.getByText('Sold out this drop')).toBeTruthy();
    expect(ui.queryByRole('button', { name: 'Add one' })).toBeNull();
    expect(ui.getByRole('button', { name: 'Remove one Chocolate' })).toBeTruthy();
    expect(ui.queryByText('Contains', { exact: true })).toBeNull();
    for (const button of ui.getAllByRole('button', { name: 'Continue · ₱500' }))
      expect(button).toBeDisabled();
  });
  it('preserves the runtime ask-us allergen warning when confirmation is needed', () => {
    const f = fixture();
    f.v.shopFlavours[0]!.allergens = 'Allergens: please ask us before ordering.';
    const ui = render(<CustomerShopLive v={f.v} />);
    expect(ui.getByText('Allergens: please ask us before ordering.')).toBeTruthy();
  });

  it('has named controls and no automated accessibility violations', async () => {
    const ui = render(
      <main>
        <CustomerShopLive v={fixture().v} />
      </main>
    );
    expect(
      (await axe.run(ui.container, { rules: { 'color-contrast': { enabled: false } } })).violations
    ).toEqual([]);
  });
});
