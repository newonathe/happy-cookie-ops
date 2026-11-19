import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HomeLive } from '@/components/live/home/home-live';
import type { OpsVals } from '@/view-models/vals';

afterEach(cleanup);

/** HCB-010: a helper's Home was blank. Interim content: the two places a helper may open, no money. */
it('shows a heading and links to Bazaar and Sales log, with no peso figure', () => {
  const bazaar = vi.fn();
  const sales = vi.fn();
  const v = { liveHome: null, liveHelperHome: { go: { bazaar, sales } } } as unknown as OpsVals;
  const { container } = render(<HomeLive v={v} />);
  expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Bazaar/ }));
  fireEvent.click(screen.getByRole('button', { name: /Sales log/ }));
  expect(bazaar).toHaveBeenCalledOnce();
  expect(sales).toHaveBeenCalledOnce();
  expect(container.textContent).not.toMatch(/₱|₱/);
});
