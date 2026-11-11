import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KitchenTransferPane } from '@/components/live/bazaar/kitchen-transfer-pane';
import type { KitchenTransferView } from '@/lib/bazaar/kitchen-transfer-desk';

afterEach(cleanup);
function fixture(over: Partial<KitchenTransferView> = {}) {
  const row: KitchenTransferView['rows'][number] = {
    id: 'work-a',
    name: 'Chocolate',
    source: 'Drop 5',
    qty: '4',
    busy: false,
    pending: false,
    confirmed: false,
    canSubmit: true,
    available: 6,
    dayTotal: 0,
    message: null,
    edit: vi.fn(),
    submit: vi.fn(async () => {}),
    discard: vi.fn()
  };
  const view: KitchenTransferView = {
    name: 'Synthetic fair',
    date: 'Sun, 8 Nov',
    loading: false,
    failed: false,
    availabilityFailed: false,
    phase: 'ready',
    products: [
      {
        id: 'cookie',
        name: row.name,
        source: 'From Drop 5',
        disabled: false,
        available: 6
      }
    ],
    rows: [row],
    otherSaved: 0,
    retry: vi.fn(),
    retryStorage: vi.fn(),
    add: vi.fn(() => null),
    close: vi.fn(),
    ...over
  };
  return { row, view };
}
describe('kitchen transfer review and recovery controls', () => {
  it('shows the known destination and intended quantity effects before confirmation', () => {
    const f = fixture();
    render(<KitchenTransferPane view={f.view} online />);
    expect(screen.getByText('Synthetic fair · Sun, 8 Nov')).toBeVisible();
    expect(screen.getByLabelText('Review transfer')).toBeVisible();
    expect(screen.getByText('2 cookies')).toBeVisible();
    expect(screen.getByText('0 → 4 cookies in total')).toBeVisible();
    expect(f.row.submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Record transfer' }));
    expect(f.row.submit).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain('work-a');
  });
  it('keeps an exact uncertain retry available when the current count is zero', () => {
    const f = fixture();
    Object.assign(f.row, { pending: true, available: 0, discard: null });
    render(<KitchenTransferPane view={f.view} online />);
    expect(screen.getByLabelText('Cookies to transfer')).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: 'Discard this draft' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check transfer result' }));
    expect(f.row.submit).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Review transfer')).not.toBeInTheDocument();
  });
  it('keeps unavailable counts unknown, retains inputs offline and blocks new submissions', () => {
    const f = fixture({ availabilityFailed: true });
    f.row.available = null;
    f.row.canSubmit = false;
    f.view.products[0].available = null;
    f.view.products[0].disabled = true;
    render(<KitchenTransferPane view={f.view} online={false} />);
    expect(screen.getByText('Kitchen counts could not be checked.')).toBeVisible();
    expect(screen.queryByText('0 baked cookies available')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Cookies to transfer'), {
      target: { value: '3' }
    });
    expect(f.row.edit).toHaveBeenCalledWith('3');
    expect(screen.getByRole('button', { name: 'Record transfer' })).toBeDisabled();
  });
  it('keeps a definite shortage count visible without allowing an impossible new transfer', () => {
    const f = fixture();
    f.row.qty = '7';
    render(<KitchenTransferPane view={f.view} online />);
    expect(screen.getByLabelText('Cookies to transfer')).toHaveValue('7');
    expect(screen.getByRole('alert')).toHaveTextContent('not enough recorded baked cookies');
    expect(screen.getByRole('button', { name: 'Record transfer' })).toBeDisabled();
    expect(f.row.submit).not.toHaveBeenCalled();
  });
  it.each(['0', '2.5', 'oops', '10000'])('explains an invalid retained count: %s', (value) => {
    const f = fixture();
    f.row.qty = value;
    render(<KitchenTransferPane view={f.view} online />);
    expect(screen.getByLabelText('Cookies to transfer')).toHaveValue(value);
    expect(screen.getByLabelText('Cookies to transfer')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Enter a whole count from 1 to 9,999.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Record transfer' })).toBeDisabled();
  });
  it('switches independent saved work before submitting and keeps confirmation read-only', () => {
    const f = fixture(),
      second = {
        ...f.row,
        id: 'work-b',
        name: 'White chocolate',
        qty: '2',
        confirmed: true,
        submit: vi.fn(async () => {})
      };
    f.view.rows.push(second);
    render(<KitchenTransferPane view={f.view} online />);
    fireEvent.click(screen.getByRole('button', { name: /White chocolate · 2/ }));
    expect(screen.getByLabelText('Cookies to transfer')).toHaveValue('2');
    expect(screen.getByLabelText('Cookies to transfer')).toHaveAttribute('readonly');
    fireEvent.click(screen.getByRole('button', { name: 'Check balances' }));
    expect(second.submit).toHaveBeenCalledTimes(1);
    expect(f.row.submit).not.toHaveBeenCalled();
  });
});
