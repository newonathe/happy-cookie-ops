import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ProgressBar } from '@/components/ui/progress-bar';
import { StatusPill } from '@/components/ui/status-pill';
import type { Status } from '@/components/ui/status-pill';
import { violations } from './ui-helpers';

afterEach(cleanup);

describe('StatusPill', () => {
  const cases: Array<[Status, string, string]> = [
    ['selling', 'Selling', 'bg-ok-fill'],
    ['planned', 'Planned', 'bg-info-fill'],
    ['today', 'Today', 'bg-warm-high'],
    ['closed', 'Closed', 'bg-chip'],
    ['past', 'Past', 'bg-chip'],
    ['costPending', 'Cost pending', 'bg-warm-high'],
    ['good', 'Open', 'bg-ok-fill']
  ];
  it.each(cases)('%s says %s in its own colours', (status, word, fill) => {
    render(<StatusPill status={status} />);
    const pill = screen.getByText(word);
    expect(pill.className).toContain(fill);
    expect(pill).toHaveAttribute('data-status', status);
  });

  it('only selling has a dot', () => {
    const { container, rerender } = render(<StatusPill status="selling" />);
    expect(container.querySelector('.animate-breathe')).not.toBeNull();
    for (const [status] of cases.filter(([s]) => s !== 'selling')) {
      rerender(<StatusPill status={status} />);
      expect(container.querySelector('.animate-breathe')).toBeNull();
    }
  });

  it('good can say something other than Open', () => {
    render(<StatusPill status="good" label="On the menu" />);
    expect(screen.getByText('On the menu')).toBeInTheDocument();
  });
});

describe('ProgressBar', () => {
  const bar = () => screen.getByRole('progressbar');
  const fill = () => bar().querySelector('[data-part="fill"]') as HTMLElement;

  it('is empty, partly full and full', () => {
    const { rerender } = render(<ProgressBar value={0} max={200} label="0 of 200 sold" />);
    expect(bar()).toHaveAttribute('data-state', 'empty');
    expect(fill().style.transform).toBe('scaleX(0)');
    rerender(<ProgressBar value={144} max={200} label="144 of 200 sold" />);
    expect(bar()).toHaveAttribute('data-state', 'part');
    expect(fill().style.transform).toBe('scaleX(0.72)');
    expect(bar()).toHaveAttribute('aria-valuenow', '144');
    rerender(<ProgressBar value={200} max={200} label="200 of 200 sold" />);
    expect(bar()).toHaveAttribute('data-state', 'full');
  });

  it('past the total it stays full and says by how much', () => {
    render(<ProgressBar value={1210} max={1000} label="₱1,210 of ₱1,000" />);
    expect(bar()).toHaveAttribute('data-state', 'over');
    expect(fill().style.transform).toBe('scaleX(1)');
    expect(bar()).toHaveAttribute('aria-valuenow', '1000');
    expect(screen.getByText(/over by 210/)).toBeInTheDocument();
  });

  it('says how far over in the words it is given, for money', () => {
    render(
      <ProgressBar value={621000} max={600000} label="₱6,210.00 of ₱6,000.00" overBy="₱210.00" />
    );
    expect(screen.getByText(/over by ₱210.00/)).toBeInTheDocument();
  });

  it('with no total it is empty rather than dividing by zero', () => {
    render(<ProgressBar value={5} max={0} label="No target" />);
    expect(fill().style.transform).toBe('scaleX(0)');
  });

  it('draws a lighter second part behind the fill', () => {
    render(<ProgressBar value={100} secondary={50} max={200} label="x" />);
    const second = bar().querySelector('[data-part="secondary"]') as HTMLElement;
    expect(second.style.transform).toBe('scaleX(0.75)');
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <>
        <StatusPill status="selling" />
        <ProgressBar value={1} max={2} label="1 of 2" />
      </>
    );
    expect(await violations(container)).toEqual([]);
  });
});
