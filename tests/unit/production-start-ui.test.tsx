import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OpsVals } from '@/view-models/vals';
import type { LiveProductionStart } from '@/lib/production/live-production-types';
import { ProductionLive } from '@/components/live/production/production-live';
import { violations } from './ui-helpers';

const product = {
  id: 'dcf',
  name: 'Chocolate cookie',
  photo: 'assets/double-chocolate-fudge.png',
  yield: 12,
  version: 3,
  needed: 0
};
function Harness({
  begin,
  version = 3,
  initial = null,
  failed = false
}: {
  begin: () => boolean;
  version?: number;
  initial?: LiveProductionStart['draft'];
  failed?: boolean;
}) {
  const [draft, setDraft] = useState(initial);
  const start: LiveProductionStart = {
    products: failed ? [] : [{ ...product, version }],
    draft,
    open: () => setDraft({ productId: 'dcf', quantity: '', version }),
    cancel: () => setDraft(null),
    choose: (id) => setDraft((old) => ({ productId: id, quantity: old?.quantity ?? '', version })),
    setQuantity: (quantity) => setDraft((old) => (old ? { ...old, quantity } : null)),
    begin
  };
  const v = {
    bakeRows: [],
    bakeTotals: { toBakeNum: '0', summary: '' },
    cols2: '1fr',
    ic: { play: '' },
    startFirst: vi.fn(),
    liveProduction: {
      state: failed ? 'failed' : 'read',
      periodText: 'Drop 5',
      planReady: failed, // The order plan can remain cached when the production refresh fails.
      rows: [],
      refresh: vi.fn(),
      start
    }
  } as unknown as OpsVals;
  return <ProductionLive v={v} />;
}
afterEach(cleanup);

describe('visible production entry', () => {
  it('points an unavailable production read to Retry rather than recipe setup', () => {
    render(<Harness begin={() => true} failed />);
    const button = screen.getByRole('button', { name: 'Start production' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(
      screen.getByText('Production could not be refreshed. Use Retry production below.')
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry production' })).toBeTruthy();
  });
  it('opens a manual entry with readable product/recipe facts and requires a whole quantity', () => {
    const begin = vi.fn(() => true);
    render(<Harness begin={begin} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start production' }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Start production' }));
    expect(screen.getByLabelText('Product', { exact: true })).toBeTruthy();
    expect(screen.getByText('Recipe version 3 · Makes 12 cookies')).toBeTruthy();
    const quantity = screen.getByLabelText('Cookies planned');
    const next = () => screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement;
    expect(next().disabled).toBe(true);
    fireEvent.change(quantity, { target: { value: '2.5' } });
    expect(next().disabled).toBe(true);
    fireEvent.change(quantity, { target: { value: '24' } });
    expect(next().disabled).toBe(false);
    fireEvent.click(next());
    expect(begin).toHaveBeenCalledTimes(1);
  });
  it('returns Cancel to the original start control with focus', () => {
    render(<Harness begin={() => true} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start production' }));
    fireEvent.change(screen.getByLabelText('Cookies planned'), { target: { value: '24' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('heading', { name: 'Production' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Start production' }));
  });
  it('requires the updated saved recipe without discarding the planned quantity', () => {
    const begin = vi.fn(() => true);
    render(
      <Harness
        begin={begin}
        version={4}
        initial={{ productId: 'dcf', quantity: '20', version: 3 }}
      />
    );
    expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(begin).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Use version 4' }));
    expect((screen.getByLabelText('Cookies planned') as HTMLInputElement).value).toBe('20');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(begin).toHaveBeenCalledTimes(1);
  });
  it('keeps the entry after a refused navigation and exposes accessible fields', async () => {
    const begin = vi.fn(() => false);
    const ui = render(
      <Harness begin={begin} initial={{ productId: 'dcf', quantity: '20', version: 3 }} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('alert').textContent).toContain('details changed');
    expect((screen.getByLabelText('Cookies planned') as HTMLInputElement).value).toBe('20');
    expect(await violations(ui.container)).toEqual([]);
  });
});
