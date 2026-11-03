import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OpsVals } from '@/view-models/vals';
import { ProductionFocusLive } from '@/components/live/production/production-focus-live';

afterEach(cleanup);
const vals = () => ({
  goodCount: 16,
  bakeFlavours: [{ id: 'cookie', label: 'Chocolate cookie' }],
  batch: { pid: 'cookie', name: 'Chocolate cookie', target: 24, imgStyle: '', doughText: '12 chilled dough',
    note: '', step1: true, step2: false, rows: [{ name: 'Flour', amountText: '150 g', onHandText: '100 g on hand',
      short: true, deltaText: '+1', minus: vi.fn(), plus: vi.fn() }], anyShort: true,
    doughLine: '12 from chilled dough; 6 mixed fresh.', exit: vi.fn(), discard: vi.fn(),
    setFlavour: vi.fn(), setNote: vi.fn(), toStep1: vi.fn() },
  liveBatchCounts: { periodText: 'Drop 5', recipeVersion: 3, actual: '18', rejects: '2', valid: true, saving: false,
    stock: [{ name: 'Flour', balance: 100, unit: 'g' }],
    setActual: vi.fn(), setRejects: vi.fn(), review: vi.fn(), confirm: vi.fn() }
});
describe('live production count and review', () => {
  it('separates total made, rejects and good cookies and retains the planned comparison', () => {
    const v = vals();
    render(<ProductionFocusLive v={v as unknown as OpsVals} />);
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Cookies made' }));
    expect(screen.getByText('good cookies will enter stock')).toBeTruthy();
    expect(screen.getByRole('figure', { name: 'Planned and actual cookies' }).textContent).toContain('16 good');
    fireEvent.change(screen.getByLabelText('Cookies made, including rejects'), { target: { value: '' } });
    expect(v.liveBatchCounts.setActual).toHaveBeenCalledWith('');
    fireEvent.change(screen.getByLabelText('Rejects'), { target: { value: '0' } });
    expect(v.liveBatchCounts.setRejects).toHaveBeenCalledWith('0');
    fireEvent.submit(screen.getByLabelText('Rejects').closest('form')!);
    expect(v.liveBatchCounts.review).toHaveBeenCalledTimes(1);
    expect(v.liveBatchCounts.confirm).not.toHaveBeenCalled();
  });
  it('does not display the previous good count as a result for a blank input', () => {
    const v = vals();
    v.liveBatchCounts.actual = ''; v.liveBatchCounts.valid = false;
    render(<ProductionFocusLive v={v as unknown as OpsVals} />);
    expect(screen.queryByRole('figure')).toBeNull();
    expect(screen.getByLabelText('Cookies made, including rejects').getAttribute('aria-invalid')).toBe('true');
    expect((screen.getByRole('button', { name: 'Review production' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText('good cookies will enter stock')).toBeNull();
  });
  it('retains ingredient adjustments, shortage explanation, Back and guarded confirmation', () => {
    const v = vals(); v.batch.step1 = false; v.batch.step2 = true;
    const ui = render(<ProductionFocusLive v={v as unknown as OpsVals} />);
    expect(screen.getByRole('alert').textContent).toContain('Some recorded stock is short');
    expect(screen.getByText('100 g recorded')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Use more Flour' }));
    expect(v.batch.rows[0]!.plus).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Back to counts' }));
    expect(v.batch.toStep1).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm production' }));
    expect(v.liveBatchCounts.confirm).toHaveBeenCalledTimes(1);
    v.liveBatchCounts.saving = true;
    ui.rerender(<ProductionFocusLive v={v as unknown as OpsVals} />);
    for (const name of ['Saving production…', 'Discard', 'Use more Flour', 'Back to counts'])
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Leave for now' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole('status').textContent).toContain('Waiting for the saved result');
  });
  it('keeps an unavailable recorded balance distinct from zero', () => {
    const v = vals(); v.batch.step2 = true; v.liveBatchCounts.stock = [];
    render(<ProductionFocusLive v={v as unknown as OpsVals} />);
    expect(screen.getByText('Recorded balance unavailable')).toBeTruthy();
    expect(screen.queryByText('100 g on hand')).toBeNull();
  });
});
