import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CountInventory } from '@/components/live/stock/count-inventory';
import { stock, valsWith } from './stock-fixtures';
import type { OpsVals } from '@/view-models/vals';

afterEach(cleanup);

function mount(save = vi.fn(async (): Promise<string | null> => null), missing = false) {
  const back = vi.fn(),
    discard = vi.fn();
  function Harness() {
    const [value, setValue] = useState('');
    const liveStock = stock({
      count: {
        paused: false,
        saving: false,
        pending: false,
        storageError: null,
        recover: vi.fn(async () => null),
        back,
        discard,
        resume: vi.fn(),
        save,
        rows: value.trim()
          ? [
              {
                name: 'Butter',
                amountText: `${value} g`,
                error: Number(value) < 0 ? 'A count cannot be below 0.' : null
              }
            ]
          : []
      }
    });
    const v = valsWith(liveStock);
    v.stock = {
      name: 'Butter',
      unit: 'g',
      value,
      expected: '300 g',
      pos: '1 of 1',
      varianceText: '',
      onInput: (event: unknown) =>
        setValue((event as React.ChangeEvent<HTMLInputElement>).target.value),
      prev: vi.fn(),
      next: vi.fn(),
      cancel: vi.fn(),
      done: vi.fn(),
      down: vi.fn(),
      pause: vi.fn(),
      up: vi.fn(),
      progress: 'width: 100%',
      reason: '',
      setReason: vi.fn(),
      varianceNone: value === '',
      varianceOk: false,
      varianceWarn: false
    } satisfies NonNullable<OpsVals['stock']>;
    if (missing) v.stock = null;
    return <CountInventory v={v} stock={liveStock} />;
  }
  render(<Harness />);
  return { save, back, discard, input: () => screen.getByLabelText('Counted quantity (g)') };
}

it('requires a physical count and treats zero as a valid count only after review', async () => {
  const ui = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Review count' }));
  expect(screen.getByRole('alert').textContent).toContain('Enter at least one physical count');
  expect(ui.save).not.toHaveBeenCalled();
  fireEvent.change(ui.input(), { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review count' }));
  expect(screen.getByRole('heading', { name: 'Review count' })).toBeTruthy();
  expect(screen.getByText('0 g')).toBeTruthy();
  expect(ui.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save count' }));
  await waitFor(() => expect(ui.save).toHaveBeenCalledTimes(1));
});

it('keeps Back and explicit discard available when the current item disappears', () => {
  const ui = mount(undefined, true);
  expect(screen.getByText(/current item is unavailable/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Back to inventory' }));
  expect(ui.back).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel count' }));
  fireEvent.click(screen.getByRole('button', { name: 'Discard count' }));
  expect(ui.discard).toHaveBeenCalledTimes(1);
});

it('keeps entered values when changing the review and keeps a refused save on review', async () => {
  const ui = mount(vi.fn(async () => 'Not confirmed. Your entries are kept.'));
  fireEvent.change(ui.input(), { target: { value: '250' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review count' }));
  fireEvent.click(screen.getByRole('button', { name: 'Change counts' }));
  expect((ui.input() as HTMLInputElement).value).toBe('250');
  fireEvent.click(screen.getByRole('button', { name: 'Review count' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save count' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Not confirmed'));
  expect(screen.getByText('250 g')).toBeTruthy();
});

it('Back keeps the task and cancelling requires a separate discard confirmation', () => {
  const ui = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Back to inventory' }));
  expect(ui.back).toHaveBeenCalledTimes(1);
  expect(ui.discard).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel count' }));
  expect(ui.discard).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Discard count' }));
  expect(ui.discard).toHaveBeenCalledTimes(1);
  expect(ui.save).not.toHaveBeenCalled();
});
