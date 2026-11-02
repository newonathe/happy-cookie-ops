import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OpsVals } from '@/view-models/vals';
import type { LiveProductionVals } from '@/lib/production/live-production-types';
import { ProductionLive } from '@/components/live/production/production-live';

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
const vals = (d: LiveProductionVals | null = data(), over: Partial<OpsVals> = {}) =>
  ({
    liveProduction: d,
    bakeRows: [],
    bakeTotals: { toBakeNum: '8', summary: 'Dough is ready.' },
    startFirst: vi.fn(),
    cols2: '1fr',
    ic: { play: '' },
    ...over
  }) as unknown as OpsVals;
afterEach(cleanup);

describe('live bake plan and saved production charts', () => {
  it('retains the existing start, dough, batch and mixing actions', () => {
    const row = {
      name: 'Chocolate',
      imgStyle: '',
      done: false,
      hasDough: true,
      noDough: false,
      hasWork: true,
      doughText: '8 portions ready',
      actNum: '8',
      actWord: 'to bake',
      actLabel: 'Bake 8',
      canMixMore: true,
      act: vi.fn(),
      openDough: vi.fn(),
      mixAhead: vi.fn()
    };
    const v = vals(data(), { bakeRows: [row] });
    render(<ProductionLive v={v} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start production' }));
    const work = screen.getByRole('region', { name: 'Baking work' });
    for (const name of ['8 portions ready', 'Bake 8', 'Mix'])
      fireEvent.click(within(work).getByRole('button', { name }));
    expect(v.startFirst).toHaveBeenCalledTimes(1);
    expect(row.openDough).toHaveBeenCalledTimes(1);
    expect(row.act).toHaveBeenCalledTimes(1);
    expect(row.mixAhead).toHaveBeenCalledTimes(1);
  });
  it('keeps the existing screen outside the owner read', () => {
    const ui = render(<ProductionLive v={vals()} />);
    ui.rerender(<ProductionLive v={vals(null)} />);
    expect(screen.queryByLabelText('Saved production totals')).toBeNull();
    expect(document.querySelector('[data-screen-label="Bake plan"]')).not.toBeNull();
  });
  it('keeps saved results readable but prevents starting from an unavailable plan', () => {
    const v = vals(data({ planReady: false, state: 'failed' }));
    render(<ProductionLive v={v} />);
    const start = screen.getByRole('button', { name: 'Start production' });
    expect((start as HTMLButtonElement).disabled).toBe(true);
    expect(start.getAttribute('aria-describedby')).toBe(
      screen.getByText('The bake plan is not available yet.').id
    );
    fireEvent.click(start);
    expect(v.startFirst).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Saved production totals')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Baking work' })).toBeNull();
  });
});
