import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { CustomerStatusReadNotice } from '@/components/live/customer-status-read-notice';

afterEach(cleanup);
it('shows a read-only local Retry and distinguishes retained data from an initial failure', () => {
  const retry = vi.fn();
  const read = { state: 'error' as const, stale: false, online: true, retry };
  const ui = render(<CustomerStatusReadNotice read={read} />);
  expect(ui.queryByText(/last successful/)).toBeNull();
  fireEvent.click(ui.getByRole('button', { name: 'Retry order status' }));
  expect(retry).toHaveBeenCalledTimes(1);
  ui.rerender(<CustomerStatusReadNotice read={{ ...read, stale: true, online: false }} />);
  expect(ui.getByRole('status').textContent).toContain('status may have changed');
  expect(ui.getByRole('status').textContent).toContain('Connect to retry');
  expect((ui.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(ui.getByRole('button'));
  expect(retry).toHaveBeenCalledTimes(1);
  ui.rerender(<CustomerStatusReadNotice read={{ ...read, stale: true, state: 'loading' }} />);
  expect(ui.getByRole('status').textContent).toContain('Refreshing your order');
  expect(ui.queryByRole('button')).toBeNull();
  for (const state of ['loaded', 'missing', 'idle'] as const) {
    ui.rerender(<CustomerStatusReadNotice read={{ ...read, state }} />);
    expect(ui.queryByRole('status')).toBeNull();
  }
});
