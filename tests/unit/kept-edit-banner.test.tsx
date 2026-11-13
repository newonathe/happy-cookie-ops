import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { KeptEditBanner } from '@/components/live/recipes/kept-edit-banner';

afterEach(cleanup);
const view = (kind: 'offer' | 'newer') => ({
  kind,
  restore: vi.fn(),
  discard: vi.fn(),
  dismiss: vi.fn()
});

describe('HCB-038: the kept recipe edit banner', () => {
  it('offers the kept edit back, and applies nothing by itself', () => {
    const kept = view('offer');
    render(<KeptEditBanner kept={kept} />);
    expect(
      screen.getByText('You have unsaved changes to this recipe from before the page reloaded.')
    ).toBeTruthy();
    expect(kept.restore).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Restore changes' }));
    expect(kept.restore).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(kept.discard).toHaveBeenCalledTimes(1);
  });
  it('says that a newer saved recipe replaced it, and can be dismissed', () => {
    const kept = view('newer');
    render(<KeptEditBanner kept={kept} />);
    expect(
      screen.getByText(
        'The recipe was saved elsewhere after your unsaved changes; they were not kept.'
      )
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Restore changes' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(kept.dismiss).toHaveBeenCalledTimes(1);
  });
  it('shows nothing when there is nothing kept', () => {
    const { container } = render(<KeptEditBanner kept={null} />);
    expect(container.textContent).toBe('');
  });
});
