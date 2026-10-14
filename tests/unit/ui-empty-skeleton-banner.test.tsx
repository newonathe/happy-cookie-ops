import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Banner } from '@/components/ui/banner';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { violations } from './ui-helpers';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('EmptyState', () => {
  it('says what is empty, why, and the one thing to do', () => {
    const press = vi.fn();
    render(
      <EmptyState
        title="Everything on the table is sold"
        body="Add cookies to keep selling."
        action={{ label: 'Add cookies', onPress: press }}
      />
    );
    expect(screen.getByText('Everything on the table is sold')).toBeInTheDocument();
    expect(screen.getByText('Add cookies to keep selling.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add cookies' }));
    expect(press).toHaveBeenCalledTimes(1);
  });

  it('is only a title when that is all it has', () => {
    render(<EmptyState title="No fees yet" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('Skeleton', () => {
  it('announces loading once and draws the lines it was asked for', () => {
    const { container } = render(<Skeleton lines={4} tile />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Loading')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-line]')).toHaveLength(4);
    expect(container.querySelectorAll('.motion-shimmer')).toHaveLength(5);
  });
});

describe('Banner', () => {
  it('interrupts for a warning or an error and only informs for the rest', () => {
    render(
      <>
        <Banner tone="danger" title="Could not save" />
        <Banner tone="warn" title="Count again" />
        <Banner tone="info" title="Offline" />
        <Banner tone="till" title="Back to the till" />
      </>
    );
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    expect(screen.getAllByRole('status')).toHaveLength(2);
  });

  it('has an action and a dismiss', () => {
    const act1 = vi.fn();
    const dismiss = vi.fn();
    render(
      <Banner
        tone="till"
        title="Selling now"
        body="Sat, 24 Oct"
        action={{ label: 'Back to the till', onPress: act1 }}
        onDismiss={dismiss}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back to the till' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(act1).toHaveBeenCalledTimes(1);
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('plays its exit, then goes', () => {
    vi.useFakeTimers();
    const { rerender } = render(<Banner tone="info" title="Offline" open />);
    rerender(<Banner tone="info" title="Offline" open={false} />);
    expect(screen.getByRole('status')).toHaveAttribute('data-leaving', 'true');
    act(() => void vi.advanceTimersByTime(200));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <>
        <Banner
          tone="warn"
          title="Count again"
          body="That is ₱1,000.00 over."
          action={{ label: 'Count again', onPress: () => undefined }}
        />
        <EmptyState title="Nothing" />
        <Skeleton />
      </>
    );
    expect(await violations(container)).toEqual([]);
  });
});
