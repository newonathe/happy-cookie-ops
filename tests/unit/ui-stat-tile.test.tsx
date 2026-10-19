import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatTile } from '@/components/ui/stat-tile';
import { peso } from '@/lib/money/format';
import { setReducedMotion, violations } from './ui-helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('StatTile', () => {
  it('writes a text value as given and a number with grouped digits (reduced motion: no count-up)', () => {
    setReducedMotion(true);
    render(
      <>
        <StatTile label="Revenue" value="₱6,050.00" />
        <StatTile label="Sold" value={1250} unit="cookies" />
      </>
    );
    expect(screen.getByText('₱6,050.00')).toBeInTheDocument();
    expect(screen.getAllByText('1,250').length).toBeGreaterThan(0);
    expect(screen.getByText('cookies')).toBeInTheDocument();
  });

  it('formats a counted number with the format it is given', () => {
    setReducedMotion(true);
    render(<StatTile label="Cash expected" value={164000} format={peso} />);
    expect(screen.getAllByText('₱1,640.00').length).toBeGreaterThan(0);
  });

  it('is pending, not zero, when there is no value', () => {
    render(<StatTile label="Profit" value={null} detail="Cost pending" tone="warn" />);
    expect(screen.getByLabelText('Not known yet')).toHaveTextContent('—');
    expect(screen.getByText('Cost pending').className).toContain('text-warn');
    expect(screen.getByText('Profit').closest('[data-state]')).toHaveAttribute(
      'data-state',
      'pending'
    );
  });

  it('counts a zero as a zero', () => {
    setReducedMotion(true);
    render(<StatTile label="Lost" value={0} />);
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('Not known yet')).toBeNull();
  });

  it('with parts it is a button that opens and closes them, and says so', () => {
    setReducedMotion(true);
    const onOpen = vi.fn();
    render(
      <StatTile
        label="Revenue"
        value="₱500.00"
        parts={[
          { label: 'Cash', value: '₱300.00' },
          { label: 'GCash', value: '₱200.00' }
        ]}
        onOpen={onOpen}
      />
    );
    const tile = screen.getByRole('button', { name: /Revenue/ });
    expect(tile).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('GCash')).toBeNull();
    fireEvent.click(tile);
    expect(tile).toHaveAttribute('aria-expanded', 'true');
    const list = screen.getByText('GCash').closest('dl') as HTMLElement;
    expect(within(list).getByText('₱200.00')).toBeInTheDocument();
    expect(tile).toHaveAttribute('aria-controls', list.id);
    fireEvent.click(tile);
    expect(screen.queryByText('GCash')).toBeNull();
    expect(onOpen.mock.calls).toEqual([[true], [false]]);
  });

  it('without parts it is not a button', () => {
    render(<StatTile label="Sold" value="144" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('has no axe violations', async () => {
    setReducedMotion(true);
    const { container } = render(
      <StatTile label="Revenue" value={500} parts={[{ label: 'Cash', value: '₱300.00' }]} />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(await violations(container)).toEqual([]);
  });
});
