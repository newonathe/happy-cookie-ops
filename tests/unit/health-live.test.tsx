import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HealthLive } from '@/components/live/account/account-live';
import type { OpsVals } from '@/view-models/vals';

function view(canRetry = true, online = true) {
  const retry = vi.fn();
  const v = {
    healthTitle: 'Needs attention',
    healthSub: 'The last check could not be read.',
    healthRows: [],
    hasRecords: false,
    healthCanRetry: canRetry,
    online,
    retryBackup: retry,
    exportNow: vi.fn(),
    contactSupport: vi.fn()
  } as unknown as OpsVals;
  render(<HealthLive v={v} />);
  return retry;
}
describe('live health read recovery', () => {
  it('offers an explicit read-only check after failure', () => {
    const retry = view();
    fireEvent.click(screen.getByRole('button', { name: 'Check results again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
  it.each([
    [false, true],
    [true, false]
  ])('does not offer an actionable check without a source/connection (%s,%s)', (source, online) => {
    const retry = view(source, online);
    const button = screen.getByRole('button', { name: 'Check results again' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(retry).not.toHaveBeenCalled();
  });
});
