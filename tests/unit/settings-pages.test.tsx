import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { OpsVals } from '@/view-models/vals';
import {
  NoShowLive,
  PeopleLive,
  PricingLive,
  RefundLive,
  RetentionLive,
  RulesLive,
  SwapLive
} from '@/components/live/settings-pages';
import { MoneyCategoriesLive, TransactionLive } from '@/components/live/money/money-pages';
import { SettingsAreaPage } from '@/components/live/account/settings-areas';
import { OpsRuntime } from '@/store/ops-runtime';
import { AppFrame } from '@/components/shell/app-frame';
import { useOpsVals } from '@/store/use-ops';
import { registerLiveRecipeScreens } from '@/components/live/recipes/register';

let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));

afterEach(() => {
  cleanup();
  live = true;
});
const vals = (over: Record<string, unknown>) =>
  ({ closeSheet: vi.fn(), ...over }) as unknown as OpsVals;

/** Each page calls the engine's own handler, as the locked sheet it replaces does. */
describe('sheets shown as pages', () => {
  it('closes Make settings before returning to the current Products destination', () => {
    const events: string[] = [];
    const back = vi.fn(() => events.push('back'));
    const go = vi.fn(() => events.push('go'));
    render(
      <SettingsAreaPage
        v={vals({
          settingsGroups: [
            {
              title: 'Products & recipes',
              rows: [{ label: 'Products and prices', value: '2 on the menu', go }]
            }
          ]
        })}
        area="make"
        backLabel="Back to products"
        onBack={back}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Products and prices/ }));
    expect(back).toHaveBeenCalledOnce();
    expect(go).toHaveBeenCalledOnce();
    expect(events).toEqual(['back', 'go']);
  });

  it('returns from Make settings to Products when its row routes to the same screen', () => {
    const unregister = registerLiveRecipeScreens();
    const ref: { current: OpsRuntime | null } = { current: null };
    function Frame() {
      return <AppFrame v={useOpsVals()} />;
    }
    try {
      render(
        <OpsRuntime ref={(runtime) => void (ref.current = runtime)}>
          <Frame />
        </OpsRuntime>
      );
      act(() => {
        ref.current!.setRole('owner');
        ref.current!.go('products');
      });
      fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
      expect(screen.getByRole('heading', { name: 'Make settings' })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: /Products and prices/ }));
      expect(screen.getByRole('heading', { name: 'Products', level: 1 })).toBeTruthy();
    } finally {
      unregister();
    }
  });

  it('Rules: steppers, typing, ordering week and a way back', () => {
    const rule = {
      label: 'Tax',
      value: '3',
      valueText: '3%',
      note: 'Set aside',
      up: vi.fn(),
      down: vi.fn(),
      set: vi.fn()
    };
    const week = { label: 'Opens', value: 'Monday', prev: vi.fn(), next: vi.fn() };
    const hour = { label: 'Closes at', valueText: '9 PM', up: vi.fn(), down: vi.fn() };
    const v = vals({ rules: [rule], schedRows: [week], schedHours: [hour] });
    render(<RulesLive v={v} />);
    fireEvent.click(screen.getByRole('button', { name: 'Raise Tax' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lower Tax' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Tax' }), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Later Opens' }));
    fireEvent.click(screen.getByRole('button', { name: 'Earlier Closes at' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(rule.up).toHaveBeenCalledOnce();
    expect(rule.down).toHaveBeenCalledOnce();
    expect(rule.set).toHaveBeenCalledOnce();
    expect(week.next).toHaveBeenCalledOnce();
    expect(hour.down).toHaveBeenCalledOnce();
    expect(v.closeSheet).toHaveBeenCalledOnce();
  });

  it('People shows each person and what they can do, with nothing to change', () => {
    render(
      <PeopleLive
        v={vals({ users: [{ name: 'Helper', role: 'Helper', can: 'Sells', extra: 'Temporary' }] })}
      />
    );
    expect(screen.getByText(/Helper · Sells/)).toBeTruthy();
    expect(screen.getByText('Temporary')).toBeTruthy();
  });

  it('Retention and pricing pick with the engine, and show which is on by more than colour', () => {
    const pick = vi.fn();
    const publish = vi.fn();
    render(<RetentionLive v={vals({ retentionOptions: [{ label: '1 year', on: true, pick }] })} />);
    const option = screen.getByRole('button', { name: '1 year' });
    expect(option.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(option);
    expect(pick).toHaveBeenCalledOnce();
    cleanup();
    render(
      <PricingLive
        v={vals({
          priceModes: [{ label: 'Menu', on: true, pick }],
          priceModePreview: { items: 'Six cookies', total: 'Total' },
          publishPriceMode: publish
        })}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Publish this rule' }));
    expect(publish).toHaveBeenCalledOnce();
  });

  it('Refund submits the same form, and Keep the order does not', () => {
    const saveRefund = vi.fn((event: Event) => event.preventDefault());
    const v = vals({ saveRefund, sheetAmountText: '₱100' });
    render(<RefundLive v={v} />);
    fireEvent.click(screen.getByRole('button', { name: 'Keep the order' }));
    expect(saveRefund).not.toHaveBeenCalled();
    expect(v.closeSheet).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Record refund and cancel' }));
    // S1: a blank reference is refused here, with the reason beside the field.
    expect(saveRefund).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe(
      'Add the refund reference from your send-money receipt.'
    );
    fireEvent.change(screen.getByLabelText('Refund reference'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record refund and cancel' }));
    expect(saveRefund).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Refund reference'), { target: { value: 'REF1' } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Record refund and cancel' }));
    expect(saveRefund).toHaveBeenCalledOnce();
  });

  it('No-show and swap use the engine actions', () => {
    const confirmNoShow = vi.fn();
    const go = vi.fn();
    const v = vals({ confirmNoShow, sheetName: 'Customer' });
    render(<NoShowLive v={v} />);
    fireEvent.click(screen.getByRole('button', { name: 'Still waiting' }));
    expect(confirmNoShow).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Mark as no-show' }));
    expect(confirmNoShow).toHaveBeenCalledOnce();
    cleanup();
    render(
      <SwapLive
        v={vals({
          swapIntro: 'Pick',
          swapOptions: [{ name: 'Cookie', stockText: '2', deltaText: 'same price', go }]
        })}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Cookie/ }));
    expect(go).toHaveBeenCalledOnce();
  });

  it('Categories keep add, rename and hide', () => {
    const rename = vi.fn();
    const toggle = vi.fn();
    const saveCategory = vi.fn((event: Event) => event.preventDefault());
    render(
      <MoneyCategoriesLive
        v={vals({
          catRows: [{ name: 'Ingredients', stateText: 'Active', off: false, rename, toggle }],
          saveCategory
        })}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Rename Ingredients' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hide Ingredients' }));
    fireEvent.change(screen.getByLabelText('New category'), { target: { value: 'Gas' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add category' }));
    expect(rename).toHaveBeenCalledOnce();
    expect(toggle).toHaveBeenCalledOnce();
    expect(saveCategory).toHaveBeenCalledOnce();
  });
});

describe('Transaction', () => {
  it('shows where a line came from, and has a way back', () => {
    const back = vi.fn();
    render(
      <TransactionLive
        back={back}
        row={{
          id: 'book-1',
          label: 'Flour',
          cat: 'Ingredients',
          when: '1 Nov',
          kind: 'expense',
          signed: -50
        }}
      />
    );
    expect(screen.getByText('Expense')).toBeTruthy();
    expect(screen.getByText('book-1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Money' }));
    expect(back).toHaveBeenCalledOnce();
  });
});
