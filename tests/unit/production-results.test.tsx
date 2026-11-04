import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LiveProductionVals } from '@/lib/production/live-production-types';
import { ProductionResults } from '@/components/live/production/production-results';
import { violations } from './ui-helpers';

const batch = (over: Partial<LiveProductionVals['rows'][number]> = {}) => ({
  productId: 'dcf',
  name: 'Double Chocolate Fudge',
  photo: 'assets/double-chocolate-fudge.png',
  // get_production (SQL58): qty is effective GOOD output; rejects are separate.
  qty: 24,
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
  it('compares saved batch targets on one scale, keeps over-plan quantity and gives source history', () => {
    render(
      <ProductionResults
        data={data({
          rows: [
            batch(),
            batch({ productId: 'hc', name: 'Happy Camper', qty: 12, target: 12, rejects: 1 })
          ]
        })}
      />
    );
    expect(totals().querySelector('strong')?.textContent).toBe('39');
    expect(screen.getByText('Saved batch plans')).toBeTruthy();
    expect(within(totals()).getByText('36 good · 3 not for sale')).toBeTruthy();
    const bars = [...document.querySelectorAll<HTMLElement>('[data-baked-bar]')];
    expect(bars.map((b) => b.style.width)).toEqual(['100%', '50%']);
    expect(
      screen.getByRole('img', {
        name: 'Double Chocolate Fudge: 24 planned; 26 baked; 24 good; 2 not for sale'
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
    expect(screen.getByText('Production history could not be refreshed.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry production' }));
    expect(d.refresh).toHaveBeenCalledTimes(2);
    ui.rerender(<ProductionResults data={data({ state: 'loading', rows: [] })} />);
    expect(screen.queryByLabelText('Saved production totals')).toBeNull();
    expect(screen.queryByText('No saved batches yet.')).toBeNull();
    ui.rerender(<ProductionResults data={data({ rows: [] })} />);
    expect(screen.getByText('No saved batches yet.')).toBeTruthy();
  });
  it.each([0, 2])(
    'shows good output %s with the remaining rejects without subtracting them twice',
    (good) => {
      render(
        <ProductionResults
          data={data({ rows: [batch({ qty: good, rejects: 12 - good, target: 12 })] })}
        />
      );
      expect(totals().querySelector('strong')?.textContent).toBe('12');
      expect(within(totals()).getByText(`${good} good · ${12 - good} not for sale`)).toBeTruthy();
      expect(
        screen.getByRole('img', {
          name: `Double Chocolate Fudge: 12 planned; 12 baked; ${good} good; ${12 - good} not for sale`
        })
      ).toBeTruthy();
      for (const bar of document.querySelectorAll<HTMLElement>('[data-baked-bar] i'))
        expect(parseFloat(bar.style.width)).toBeGreaterThanOrEqual(0);
    }
  );
  it('labels returned history across drops with real dates, independently of the selected plan drop', () => {
    const rows = [
      batch({ at: Date.parse('2026-11-02T07:00:00Z') }),
      batch({ at: Date.parse('2026-11-04T07:00:00Z') })
    ];
    const ui = render(<ProductionResults data={data({ rows })} />);
    expect(screen.getByText('Recent history · all drops')).toBeTruthy();
    expect(screen.queryByText('Drop 5')).toBeNull();
    const date = (at: number) =>
      new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      }).format(at);
    expect(screen.getByText(`${date(rows[0].at)} – ${date(rows[1].at)}`)).toBeTruthy();
    ui.rerender(<ProductionResults data={data({ rows, periodText: 'Drop 6' })} />);
    expect(screen.queryByText('Drop 6')).toBeNull();
    expect(totals().querySelector('strong')?.textContent).toBe('52');
  });
  it('shows one date when all returned batches are on the same Manila day', () => {
    render(<ProductionResults data={data({ rows: [batch({ at: Date.parse('2026-11-04T00:00:00Z') }),
      batch({ at: Date.parse('2026-11-04T07:00:00Z') })] })} />);
    const day = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', day: 'numeric',
      month: 'short', year: 'numeric' }).format(Date.parse('2026-11-04T07:00:00Z'));
    expect(screen.getByText(day, { exact: true })).toBeTruthy();
    expect(screen.queryByText(`${day} – ${day}`, { exact: true })).toBeNull();
  });
  it('has accessible labels and history controls', async () => {
    const ui = render(<ProductionResults data={data()} />);
    expect(await violations(ui.container)).toEqual([]);
  });
});
