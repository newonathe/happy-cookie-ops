import { act } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as axe from 'axe-core';
import type { OpsVals } from '@/view-models/vals';
import { OpsRuntime } from '@/store/ops-runtime';
import { AppFrame } from '@/components/shell/app-frame';
import { useOpsVals } from '@/store/use-ops';
import { registerLiveRecipeScreens } from '@/components/live/recipes/register';
import { ProductsLive } from '@/components/live/recipes/products-live';

let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));
const product = (over: Partial<OpsVals['productRows'][number]> = {}) => ({
  name: 'QA cookie',
  desc: 'Chocolate and sea salt',
  imgStyle: 'background-image:url(/images/qa.webp)',
  priceText: '₱125',
  costText: 'Cost pending',
  tag: 'Popular',
  rotating: false,
  soldOut: false,
  offForm: false,
  formLabel: 'Take QA cookie off the order form',
  formBtnStyle: '',
  formIcon: '',
  toggleOnForm: vi.fn(),
  edit: vi.fn(),
  goRecipe: vi.fn(),
  ...over
});
const vals = (rows = [product()]) =>
  ({
    productRows: rows,
    liveScreen: { tabs: { label: 'Make' } }
  }) as unknown as OpsVals;

afterEach(() => {
  cleanup();
  localStorage.clear();
  live = true;
});

describe('product-centered Make library', () => {
  it('opens the selected recipe/editor and retains the actual order-form action without an icon-only control', () => {
    const row = product();
    render(<ProductsLive v={vals([row])} />);
    const card = screen.getByRole('article', { name: 'QA cookie' });
    fireEvent.click(within(card).getByRole('button', { name: 'Recipe for QA cookie' }));
    fireEvent.click(within(card).getByRole('button', { name: 'Edit product QA cookie' }));
    fireEvent.click(within(card).getByRole('button', { name: row.formLabel }));
    expect(row.goRecipe).toHaveBeenCalledTimes(1);
    expect(row.edit).toHaveBeenCalledTimes(1);
    expect(row.toggleOnForm).toHaveBeenCalledTimes(1);
    expect(within(card).getByText('On the order form')).toBeTruthy();
    expect(within(card).getByText('Cost pending')).toBeTruthy();
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByText(/cookies in stock/)).toBeNull();
  });

  it('shows actual visibility/sold-out/rotating labels and explains the optional shop badge', () => {
    render(<ProductsLive v={vals([product({ offForm: true, soldOut: true, rotating: true })])} />);
    for (const text of ['Off the order form', 'Sold out', 'Rotating', 'Popular'])
      expect(screen.getByText(text)).toBeTruthy();
    fireEvent.click(screen.getByText('About product labels'));
    expect(screen.getByText(/A badge is a short label beside a cookie in your shop/)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Take QA cookie off the order form' }).textContent
    ).toContain('Show on order form');
  });

  it('has an honest empty state and accessible product cards', async () => {
    const ui = render(<ProductsLive v={vals()} />);
    expect(
      (await axe.run(ui.container, { rules: { 'color-contrast': { enabled: false } } })).violations
    ).toEqual([]);
    ui.rerender(<ProductsLive v={vals([])} />);
    expect(screen.getByText('No products loaded yet.')).toBeTruthy();
  });

  it('returns keyboard focus to the selected product recipe action', () => {
    render(
      <ProductsLive
        v={vals([product(), product({ name: 'Other cookie', returnRecipeFocus: true })])}
      />
    );
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Recipe for Other cookie' })
    );
  });

  it('registers the owner library beside the recipe reader and preserves the demo product screen', () => {
    const undo = registerLiveRecipeScreens();
    const ref: { current: OpsRuntime | null } = { current: null };
    function Frame() {
      return <AppFrame v={useOpsVals()} />;
    }
    render(
      <OpsRuntime
        ref={(r) => {
          ref.current = r;
        }}
      >
        <Frame />
      </OpsRuntime>
    );
    act(() => {
      ref.current!.setRole('owner');
      ref.current!.go('products');
    });
    expect(screen.getByRole('heading', { name: 'Products', level: 1 })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit price' })).toBeNull();
    cleanup();
    live = false;
    render(
      <OpsRuntime
        ref={(r) => {
          ref.current = r;
        }}
      >
        <Frame />
      </OpsRuntime>
    );
    act(() => {
      ref.current!.setRole('owner');
      ref.current!.go('products');
    });
    expect(
      screen.getAllByRole('button', { name: 'Edit price' }).length
    ).toBeGreaterThan(0);
    undo();
  });

  it('keeps the existing product markup outside the owner section', () => {
    render(<ProductsLive v={{ ...vals(), liveScreen: null } as OpsVals} />);
    expect(
      screen.getByRole('button', { name: 'Edit price' }).textContent?.trim()
    ).toBe('Edit price');
    expect(screen.queryByRole('region', { name: 'Product library' })).toBeNull();
  });
});
