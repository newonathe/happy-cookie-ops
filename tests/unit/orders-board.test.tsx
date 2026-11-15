import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { OpsVals } from '@/view-models/vals';
import { OrdersLive } from '@/components/live/sell/orders-live';

afterEach(cleanup);

/**
 * Orders pipeline board (from `lg`): one column per group, side by side. The list and the board are
 * the same markup (CSS only), so every order action on a phone is in its column on a wide screen.
 */
const order = (id: string, label: string, action: string | null, act = vi.fn()) => ({
  id,
  label,
  name: `Customer ${id}`,
  fg: 'inherit',
  bg: 'transparent',
  br: 'transparent',
  pickup: 'Pickup',
  count: '6 cookies',
  summary: 'Dark chocolate x6',
  totalText: 'P780',
  warn: null,
  review: false,
  action,
  act,
  go: vi.fn()
});

const page = (orderList: unknown[]) =>
  render(
    <OrdersLive
      v={
        {
          orderList,
          orderFilters: [],
          orderQ: '',
          hasOrderQ: false,
          orderEmpty: false,
          setOrderQ: vi.fn(),
          clearOrderQ: vi.fn()
        } as unknown as OpsVals
      }
    />
  );

describe('Orders pipeline board', () => {
  it('has one column per group with its count, in work order', () => {
    page([
      order('1', 'Paid', 'Start baking'),
      order('2', 'Baking', 'Mark ready'),
      order('3', 'Ready', 'Mark collected')
    ]);
    const columns = screen.getAllByRole('region');
    expect(columns.map((c) => c.getAttribute('aria-label'))).toEqual([
      'To prepare (2)',
      'Ready for customer pickup (1)',
      'Payments & other orders (0)',
      'Closed (0)'
    ]);
    expect(within(columns[0] as HTMLElement).getByText('Customer 1')).toBeTruthy();
    expect(within(columns[0] as HTMLElement).getByText('Customer 2')).toBeTruthy();
    expect(within(columns[1] as HTMLElement).getByText('Customer 3')).toBeTruthy();
  });

  it('an empty group keeps its column and says Nothing here; a phone hides it', () => {
    page([order('1', 'Paid', null)]);
    const closed = screen.getByRole('region', { name: 'Closed (0)' });
    expect(within(closed).getByText('Nothing here')).toBeTruthy();
    expect(closed.className).toContain('hidden');
    expect(closed.className).toContain('lg:block');
    const filled = screen.getByRole('region', { name: 'To prepare (1)' });
    expect(filled.className).not.toMatch(/(^|\s)hidden(\s|$)/);
  });

  it('every order action stays in its column and still acts', () => {
    const acts = [vi.fn(), vi.fn(), vi.fn()];
    page([
      order('1', 'Paid', 'Start baking', acts[0]),
      order('2', 'Ready', 'Mark collected', acts[1]),
      order('3', 'Completed', null, acts[2])
    ]);
    const prepare = screen.getByRole('region', { name: 'To prepare (1)' });
    const ready = screen.getByRole('region', { name: 'Ready for customer pickup (1)' });
    const closed = screen.getByRole('region', { name: 'Closed (1)' });
    const start = within(prepare).getAllByRole('button').slice(-1)[0] as HTMLElement;
    fireEvent.click(start);
    expect(acts[0]).toHaveBeenCalledOnce();
    expect(within(ready).getAllByRole('button')).toHaveLength(2);
    fireEvent.click(within(ready).getAllByRole('button')[1] as HTMLElement);
    expect(acts[1]).toHaveBeenCalledOnce();
    expect(within(closed).getAllByRole('button')).toHaveLength(1);
    // Each row is rendered once, so the list and the board cannot disagree.
    expect(screen.getAllByText('Customer 1')).toHaveLength(1);
  });
});
