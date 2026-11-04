import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ProductionPlanEntry } from '@/components/live/production/production-plan-entry';
import type { LiveProductionStart } from '@/lib/production/live-production-types';
import { violations } from './ui-helpers';

afterEach(cleanup);
const start = (): LiveProductionStart => ({
  products: [
    { id: 'a', name: 'Chocolate', photo: '', yield: 12, version: 3, needed: 24 },
    { id: 'b', name: 'Biscoff', photo: '', yield: 12, version: 2, needed: 12 }
  ],
  draft: { productId: '', quantity: '', version: 0 },
  open: vi.fn(),
  choose: vi.fn(),
  setQuantity: vi.fn(),
  cancel: vi.fn(),
  begin: vi.fn(),
  multi: {
    choices: [
      { productId: 'a', quantity: '24', version: 3, kind: 'batch' },
      { productId: 'b', quantity: '12', version: 2, kind: 'batch' }
    ],
    reviewing: false,
    toggle: vi.fn(),
    setQuantity: vi.fn(),
    setKind: vi.fn(),
    useRecipe: vi.fn(),
    review: vi.fn(() => true),
    edit: vi.fn(),
    begin: vi.fn(() => true)
  }
});
it('shows several product selections and independent quantities with understandable labels', async () => {
  const data = start(),
    ui = render(<ProductionPlanEntry start={data} period="Drop 5" />);
  expect(screen.getByRole('checkbox', { name: 'Chocolate' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Biscoff' })).toBeChecked();
  fireEvent.change(screen.getByLabelText('Cookies planned for Biscoff'), {
    target: { value: '18' }
  });
  expect(data.multi!.setQuantity).toHaveBeenCalledWith('b', '18');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Chocolate' }));
  expect(data.multi!.toggle).toHaveBeenCalledWith('a');
  fireEvent.click(screen.getByRole('button', { name: 'Review 2 products' }));
  expect(data.multi!.review).toHaveBeenCalledOnce();
  expect(await violations(ui.container)).toEqual([]);
});
it('reviews the complete plan before creating independent work items and keeps failed plans visible', () => {
  const data = start();
  data.multi!.reviewing = true;
  data.multi!.begin = vi.fn(() => false);
  render(<ProductionPlanEntry start={data} period="Drop 5" />);
  expect(screen.getByRole('heading', { name: 'Review production plan' })).toBeTruthy();
  expect(screen.getByText('24 cookies')).toBeTruthy();
  expect(screen.getByText('12 cookies')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Start 2 production items' }));
  expect(screen.getByRole('alert').textContent).toContain('selections are kept');
  expect(data.multi!.begin).toHaveBeenCalledOnce();
});
it('requires explicit recipe update without throwing away quantities', () => {
  const data = start();
  data.products[1].version = 4;
  render(<ProductionPlanEntry start={data} period="Drop 5" />);
  expect(screen.getByRole('button', { name: 'Review 2 products' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Use version 4 for Biscoff' }));
  expect(data.multi!.useRecipe).toHaveBeenCalledWith('b');
  expect(screen.getByLabelText('Cookies planned for Biscoff')).toHaveValue(12);
});
