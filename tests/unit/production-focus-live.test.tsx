import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OpsVals } from '@/view-models/vals';
import { ProductionFocusLive } from '@/components/live/production/production-focus-live';

afterEach(cleanup);
const vals = () => ({
  goodCount: 16,
  bakeFlavours: [{ id: 'cookie', label: 'Chocolate cookie' }],
  batch: {
    pid: 'cookie',
    name: 'Chocolate cookie',
    target: 24,
    imgStyle: '',
    doughText: '12 chilled dough',
    note: '',
    step1: true,
    step2: false,
    rows: [
      {
        name: 'Flour',
        amountText: '150 g',
        onHandText: '100 g on hand',
        short: true,
        deltaText: '+1',
        minus: vi.fn(),
        plus: vi.fn()
      }
    ],
    anyShort: true,
    doughLine: '12 from chilled dough; 6 mixed fresh.',
    exit: vi.fn(),
    discard: vi.fn(),
    setFlavour: vi.fn(),
    setNote: vi.fn(),
    toStep1: vi.fn()
  },
  liveBatchCounts: {
    periodText: 'Drop 5',
    recipeVersion: 3,
    actual: '18',
    rejects: '2',
    valid: true,
    saving: false,
    uncertain: false,
    stock: [{ name: 'Flour', balance: 100, unit: 'g' }],
    setActual: vi.fn(),
    setRejects: vi.fn(),
    review: vi.fn(),
    confirm: vi.fn()
  }
});
describe('live production count and review', () => {
  it('keeps counts editable but hides unverified recipe use and blocks review until the recipe can be read', () => {
    const v = vals(),
      retryRecipe = vi.fn();
    const counts = {
      ...v.liveBatchCounts,
      sourceUnavailable: true,
      recipeVersion: null,
      retryRecipe
    };
    render(<ProductionFocusLive v={{ ...v, liveBatchCounts: counts } as unknown as OpsVals} />);
    expect(screen.getByText('Saved recipe unavailable')).toBeTruthy();
    expect(
      (screen.getByLabelText('Cookies made, including rejects') as HTMLInputElement).disabled
    ).toBe(false);
    expect(
      (screen.getByRole('button', { name: 'Review production' }) as HTMLButtonElement).disabled
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Retry saved recipe' }));
    expect(retryRecipe).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Leave for now' }));
    expect(v.batch.exit).toHaveBeenCalledOnce();
  });
  it('keeps an unanswered submission immutable and offers the original result check at either step', () => {
    const v = vals();
    v.liveBatchCounts.uncertain = true;
    const ui = render(<ProductionFocusLive v={v as unknown as OpsVals} />);
    expect(
      (screen.getByLabelText('Cookies made, including rejects') as HTMLInputElement).disabled
    ).toBe(true);
    expect((screen.getByRole('button', { name: 'Discard' }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(screen.getByRole('alert').textContent).toContain('Save result not confirmed');
    expect(screen.getByText('good cookies in this submission')).toBeTruthy();
    expect(screen.queryByText('good cookies ready for orders')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Check saved result' }));
    expect(v.liveBatchCounts.confirm).toHaveBeenCalledTimes(1);
    v.batch.step1 = false;
    v.batch.step2 = true;
    ui.rerender(<ProductionFocusLive v={v as unknown as OpsVals} />);
    expect(screen.queryByRole('region', { name: 'Ingredients used' })).toBeNull();
    expect(screen.queryByText(v.batch.doughLine)).toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Back to counts' }) as HTMLButtonElement).disabled
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Check saved result' }));
    expect(v.liveBatchCounts.confirm).toHaveBeenCalledTimes(2);
  });
  it('separates total made, rejects and good cookies and retains the planned comparison', () => {
    const v = vals();
    render(<ProductionFocusLive v={v as unknown as OpsVals} />);
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Cookies made' }));
    expect(screen.getByText('good cookies ready for orders')).toBeTruthy();
    expect(
      screen.getByRole('figure', { name: 'Planned and actual cookies' }).textContent
    ).toContain('16 good');
    fireEvent.change(screen.getByLabelText('Cookies made, including rejects'), {
      target: { value: '' }
    });
    expect(v.liveBatchCounts.setActual).toHaveBeenCalledWith('');
    fireEvent.change(screen.getByLabelText('Rejects'), { target: { value: '0' } });
    expect(v.liveBatchCounts.setRejects).toHaveBeenCalledWith('0');
    fireEvent.submit(screen.getByLabelText('Rejects').closest('form')!);
    expect(v.liveBatchCounts.review).toHaveBeenCalledTimes(1);
    expect(v.liveBatchCounts.confirm).not.toHaveBeenCalled();
  });
  it('does not display the previous good count as a result for a blank input', () => {
    const v = vals();
    v.liveBatchCounts.actual = '';
    v.liveBatchCounts.valid = false;
    render(<ProductionFocusLive v={v as unknown as OpsVals} />);
    expect(screen.queryByRole('figure')).toBeNull();
    expect(
      screen.getByLabelText('Cookies made, including rejects').getAttribute('aria-invalid')
    ).toBe('true');
    expect(
      (screen.getByRole('button', { name: 'Review production' }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(screen.queryByText('good cookies ready for orders')).toBeNull();
  });
  it('retains ingredient adjustments, shortage explanation, Back and guarded confirmation', () => {
    const v = vals();
    v.batch.step1 = false;
    v.batch.step2 = true;
    const ui = render(<ProductionFocusLive v={v as unknown as OpsVals} />);
    expect(screen.getByRole('alert').textContent).toContain('Your records show too little of some ingredients');
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
    expect(
      (screen.getByRole('button', { name: 'Leave for now' }) as HTMLButtonElement).disabled
    ).toBe(false);
    expect(screen.getByRole('status').textContent).toContain('Waiting for the saved result');
  });
  it('keeps an unavailable recorded balance distinct from zero', () => {
    const v = vals();
    v.batch.step2 = true;
    v.liveBatchCounts.stock = [];
    render(<ProductionFocusLive v={v as unknown as OpsVals} />);
    expect(screen.getByText('Recorded balance unavailable')).toBeTruthy();
    expect(screen.queryByText('100 g on hand')).toBeNull();
  });
});
