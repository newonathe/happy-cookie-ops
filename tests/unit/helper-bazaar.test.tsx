import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  CLOSE_COPY,
  HELPER_COPY,
  HelperBazaar,
  HelperClose
} from '@/components/live/bazaar/helper-bazaar';
import type { HelperBazaarVals } from '@/lib/bazaar/helper-bazaar-types';

/** S3: a helper's Bazaar screen: the open day's till and nothing else, plain words when there is none, and the close as a count. */
const vals = (over: Partial<HelperBazaarVals> = {}): HelperBazaarVals => ({
  phase: 'none',
  online: true,
  dayName: 'Open fair',
  join: vi.fn(),
  close: null,
  ...over
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('the helper Bazaar screen (S3)', () => {
  it('looks for the open day when it opens, and again every 15 seconds while visible, never listing events', () => {
    vi.useFakeTimers();
    const helper = vals();
    render(<HelperBazaar helper={helper} till={<div>TILL</div>} />);
    expect(helper.join).toHaveBeenCalledTimes(1);
    act(() => void vi.advanceTimersByTime(15_000));
    expect(helper.join).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('TILL')).toBeNull();
    expect(screen.queryByText(/event/i)).toBeNull();
  });

  it('draws the till while the phone holds the day', () => {
    render(<HelperBazaar helper={vals({ phase: 'selling' })} till={<div>TILL</div>} />);
    expect(screen.getByText('TILL')).toBeInTheDocument();
    expect(screen.queryByText(HELPER_COPY.noneTitle)).toBeNull();
  });

  it('says plainly when no day is open, and offers to check again', () => {
    const helper = vals({ phase: 'none' });
    render(<HelperBazaar helper={helper} till={null} />);
    expect(screen.getByText(HELPER_COPY.noneTitle)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: HELPER_COPY.retry }));
    expect(helper.join).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['loading', HELPER_COPY.looking],
    ['error', HELPER_COPY.error],
    ['unavailable', HELPER_COPY.unavailable],
    ['refused', HELPER_COPY.refused]
  ] as const)('says what %s means', (phase, text) => {
    render(<HelperBazaar helper={vals({ phase })} till={null} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('offers no retry where retrying cannot help', () => {
    const { rerender } = render(<HelperBazaar helper={vals({ phase: 'refused' })} till={null} />);
    expect(screen.queryByRole('button', { name: HELPER_COPY.retry })).toBeNull();
    rerender(<HelperBazaar helper={vals({ phase: 'unavailable' })} till={null} />);
    expect(screen.queryByRole('button', { name: HELPER_COPY.retry })).toBeNull();
  });

  it('says there is no signal rather than that something broke', () => {
    render(<HelperBazaar helper={vals({ phase: 'error', online: false })} till={null} />);
    expect(screen.getByText(HELPER_COPY.offline)).toBeInTheDocument();
  });
});

describe('closing the day as a helper (S3)', () => {
  const close = (submit = vi.fn(async () => null as string | null)) => ({
    flavours: [
      { id: 'dcf', name: 'Double choc', onTable: 12 },
      { id: 'hc', name: 'Honey', onTable: 3 }
    ],
    submit,
    cancel: vi.fn()
  });

  it('starts from what the till says is on the table, and sends the counts and the cash', async () => {
    const c = close();
    render(<HelperClose close={c} dayName="Open fair" />);
    expect(screen.getByText(CLOSE_COPY.intro)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Double choc left/), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(CLOSE_COPY.cash), { target: { value: '410.50' } });
    fireEvent.click(screen.getByRole('button', { name: CLOSE_COPY.confirm }));
    await waitFor(() =>
      expect(c.submit).toHaveBeenCalledWith({ left: { dcf: 10, hc: 3 }, countedPesos: 410.5 })
    );
  });

  it('cash is optional', async () => {
    const c = close();
    render(<HelperClose close={c} dayName="" />);
    fireEvent.click(screen.getByRole('button', { name: CLOSE_COPY.confirm }));
    await waitFor(() =>
      expect(c.submit).toHaveBeenCalledWith({ left: { dcf: 12, hc: 3 }, countedPesos: null })
    );
  });

  it('refuses a count or an amount that is not a number, and sends nothing', () => {
    const c = close();
    render(<HelperClose close={c} dayName="" />);
    fireEvent.change(screen.getByLabelText(/Honey left/), { target: { value: '2.5' } });
    fireEvent.click(screen.getByRole('button', { name: CLOSE_COPY.confirm }));
    expect(screen.getByRole('alert')).toHaveTextContent('Count Honey as a whole number');
    fireEvent.change(screen.getByLabelText(/Honey left/), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(CLOSE_COPY.cash), { target: { value: 'lots' } });
    fireEvent.click(screen.getByRole('button', { name: CLOSE_COPY.confirm }));
    expect(screen.getByRole('alert')).toHaveTextContent('amount in pesos');
    expect(c.submit).not.toHaveBeenCalled();
  });

  it('shows what the server or the runtime said when the day did not close, and lets the helper go back to selling', async () => {
    const c = close(vi.fn(async () => '2 sales are still on this phone.' as string | null));
    render(<HelperClose close={c} dayName="" />);
    fireEvent.click(screen.getByRole('button', { name: CLOSE_COPY.confirm }));
    expect(await screen.findByText('2 sales are still on this phone.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: CLOSE_COPY.cancel }));
    expect(c.cancel).toHaveBeenCalled();
  });
});
