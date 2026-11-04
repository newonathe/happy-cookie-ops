import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  ProductionDeviceNotice,
  ProductionRecoveryNotice
} from '@/components/live/production/production-recovery-notice';
import { violations } from './ui-helpers';

afterEach(cleanup);
it('gives a locked second tab a concrete recovery action', async () => {
  const retry = vi.fn();
  const ui = render(
    <ProductionRecoveryNotice
      data={{ status: 'locked', retry, setupPeriod: null, resumeSetup: vi.fn() }}
    />
  );
  expect(
    screen.getByText('Close that tab, then retry here. Your saved work is available to view.')
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry production work' }));
  expect(retry).toHaveBeenCalledOnce();
  expect(await violations(ui.container)).toEqual([]);
});
it('offers one way back into the retained setup for its original drop', () => {
  const resume = vi.fn();
  render(
    <ProductionRecoveryNotice
      data={{ status: 'ready', retry: vi.fn(), setupPeriod: 'Drop 5', resumeSetup: resume }}
    />
  );
  expect(screen.getByText('Your product and quantities are kept for Drop 5.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Continue setup' }));
  expect(resume).toHaveBeenCalledOnce();
});
it('makes device-write failure actionable without presenting it as a saved batch', () => {
  const retry = vi.fn();
  render(<ProductionDeviceNotice copyReady={false} connected retry={retry} />);
  fireEvent.click(screen.getByRole('button', { name: 'Retry device copy' }));
  expect(retry).toHaveBeenCalledOnce();
  expect(screen.queryByText(/Batch saved/i)).toBeNull();
});
it('explains offline recording while preserving the draft', () => {
  render(<ProductionDeviceNotice connected={false} copyReady />);
  expect(screen.getByText('Connect to record production')).toBeTruthy();
  expect(
    screen.getByText('Your draft is kept on this device. Nothing new is submitted while offline.')
  ).toBeTruthy();
});
