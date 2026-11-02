import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LiveProductionVals } from '@/lib/production/live-production-types';
import { ProductionResults } from '@/components/live/production/production-results';
import { violations } from './ui-helpers';

const batch = (over: Partial<LiveProductionVals['rows'][number]> = {}) => ({
  productId: 'dcf',
  name: 'Double Chocolate Fudge',
  photo: 'assets/double-chocolate-fudge.png',
  qty: 26,
  target: 24,
  rejects: 2,
  version: 3,
  at: 1793602800000,
  ...over
});
const data = (over: Partial<LiveProductionVals> = {}): LiveProductionVals => ({
  state: 'read',
  periodText: 'Drop 5',
  planReady: true,
  rows: [batch()],
  refresh: vi.fn(),
  ...over
});
const totals = () => screen.getByRole('group', { name: 'Saved production totals' });
afterEach(cleanup);

describe('saved production results', () => {
  it('uses one common scale, keeps actual over-plan quantity, and gives the source history', () => {
    render(
      <ProductionResults
        data={data({
          rows: [
            batch(),
            batch({ productId: 'hc', name: 'Happy Camper', qty: 13, target: 12, rejects: 1 })
          ]
        })}
      />
    );
    expect(totals().querySelector('strong')?.textContent).toBe('39');
    expect(within(totals()).getByText('36 good · 3 not for sale')).toBeTruthy();
    const bars = [...document.querySelectorAll<HTMLElement>('[data-baked-bar]')];
    expect(bars.map((b) => b.style.width)).toEqual(['100%', '50%']);
    expect(
      screen.getByRole('img', {
        name: 'Double Chocolate Fudge: 24 planned; 26 baked; 2 not for sale'
      })
    ).toBeTruthy();
    expect(screen.getByText('24 good · 2 not for sale')).toBeTruthy();
    fireEvent.click(screen.getByText('Production history'));
    expect(screen.getAllByText(/Recipe version 3/)).toHaveLength(2);
  });
  it('keeps absent and partial plans unknown instead of deriving them from baked quantities', () => {
    const ui = render(<ProductionResults data={data({ rows: [batch({ target: null })] })} />);
    expect(screen.getByText('No plan saved')).toBeTruthy();
    expect(document.querySelector('[data-plan-bar]')).toBeNull();
    ui.rerender(
      <ProductionResults
        data={data({ rows: [batch(), batch({ target: null, qty: 4, rejects: 0 })] })}
      />
    );
    expect(screen.getByText('Plan incomplete')).toBeTruthy();
    expect(within(totals()).getByText('28 good · 2 not for sale')).toBeTruthy();
  });
  it('retains cached results during failure and distinguishes unread from confirmed empty', () => {
    const d = data({ state: 'failed' }),
      ui = render(<ProductionResults data={d} />);
    expect(screen.getByText('Showing the last saved results.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry production' }));
    expect(d.refresh).toHaveBeenCalledTimes(2);
    ui.rerender(<ProductionResults data={data({ state: 'loading', rows: [] })} />);
    expect(screen.queryByLabelText('Saved production totals')).toBeNull();
    expect(screen.queryByText('No production saved for this drop.')).toBeNull();
    ui.rerender(<ProductionResults data={data({ rows: [] })} />);
    expect(screen.getByText('No production saved for this drop.')).toBeTruthy();
  });
  it('has accessible labels and history controls', async () => {
    const ui = render(<ProductionResults data={data()} />);
    expect(await violations(ui.container)).toEqual([]);
  });
});
