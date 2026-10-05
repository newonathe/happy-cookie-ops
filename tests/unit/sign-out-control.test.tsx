import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * Slice A3 (N3): the live app's one deliberate sign-out control. It always asks first. With
 * sales still on the phone it says how many and offers "Send now" and "Sign out anyway". It
 * never blocks a sign-out and never touches the queue: only `flush` (the runtime's own send)
 * can change it, and a sign-out never calls it. The sign-out itself is the gate's (`onSignOut`).
 */
let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));

const counts: Array<number | null> = [];
const queuedBeforeSignOut = vi.fn<(local?: unknown) => Promise<number | null | undefined>>(
  async () => (counts.length > 1 ? counts.shift() : counts[0])
);
vi.mock('@/lib/auth/sign-out-guard', () => ({
  queuedBeforeSignOut: (local?: unknown) => queuedBeforeSignOut(local)
}));

import { SignOutControl, SIGN_OUT_COPY } from '@/components/app/sign-out-control';

describe('SignOutControl', () => {
  const flush = vi.fn(async () => undefined);
  const onSignOut = vi.fn();
  const local = vi.fn(() => [{ id: 'S1', at: 1, synced: false }]);
  let eventOpen = false;

  beforeEach(() => {
    live = true;
    counts.length = 0;
    queuedBeforeSignOut.mockClear();
    flush.mockClear();
    onSignOut.mockClear();
    local.mockClear();
    eventOpen = false;
  });

  const view = (offline = false) =>
    render(
      <SignOutControl
        flush={flush}
        onSignOut={onSignOut}
        local={local}
        offline={offline}
        eventOpen={() => eventOpen}
      />
    );
  const tap = () => fireEvent.click(screen.getByRole('button', { name: SIGN_OUT_COPY.button }));

  it('shows nothing outside live mode', () => {
    live = false;
    view();
    expect(screen.queryByRole('button', { name: SIGN_OUT_COPY.button })).toBeNull();
  });

  it('asks first even when the phone holds no rows, and does not sign out on the tap', async () => {
    counts.push(0);
    view();
    tap();
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(SIGN_OUT_COPY.emptyBody);
    expect(onSignOut).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: SIGN_OUT_COPY.confirm }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(flush).not.toHaveBeenCalled();
  });

  it('hands the guard what is on screen, so a sale that never reached the queue is counted', async () => {
    counts.push(1);
    view();
    tap();
    await screen.findByRole('alertdialog');
    expect(queuedBeforeSignOut).toHaveBeenCalledWith([{ id: 'S1', at: 1, synced: false }]);
  });

  it('says how many rows are still on the phone and does not sign out yet', async () => {
    counts.push(3);
    view();
    tap();
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('3');
    expect(screen.getByRole('button', { name: SIGN_OUT_COPY.send })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: SIGN_OUT_COPY.anyway })).toBeInTheDocument();
    expect(onSignOut).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
  });

  it('"Sign out anyway" signs out and never calls the send', async () => {
    counts.push(2);
    view();
    tap();
    fireEvent.click(await screen.findByRole('button', { name: SIGN_OUT_COPY.anyway }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(flush).not.toHaveBeenCalled();
  });

  it('"Send now" sends, and signs out once nothing is left', async () => {
    counts.push(2, 0);
    view();
    tap();
    fireEvent.click(await screen.findByRole('button', { name: SIGN_OUT_COPY.send }));
    await waitFor(() => expect(onSignOut).toHaveBeenCalledTimes(1));
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('"Send now" that leaves rows behind stays on the warning with the new count', async () => {
    counts.push(4, 1);
    view();
    tap();
    fireEvent.click(await screen.findByRole('button', { name: SIGN_OUT_COPY.send }));
    await waitFor(() =>
      expect(screen.getByRole('alertdialog')).toHaveTextContent(SIGN_OUT_COPY.tried)
    );
    expect(screen.getByRole('alertdialog')).toHaveTextContent('1');
    expect(onSignOut).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: SIGN_OUT_COPY.anyway })).toBeInTheDocument();
  });

  it('a send that throws never blocks "Sign out anyway"', async () => {
    counts.push(2, 2);
    flush.mockRejectedValueOnce(new Error('network'));
    view();
    tap();
    fireEvent.click(await screen.findByRole('button', { name: SIGN_OUT_COPY.send }));
    fireEvent.click(await screen.findByRole('button', { name: SIGN_OUT_COPY.anyway }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('"Sign out anyway" works while a send is still out', async () => {
    counts.push(2);
    flush.mockImplementationOnce(() => new Promise(() => undefined));
    view();
    tap();
    fireEvent.click(await screen.findByRole('button', { name: SIGN_OUT_COPY.send }));
    fireEvent.click(await screen.findByRole('button', { name: SIGN_OUT_COPY.anyway }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('warns without a number when the rows cannot be counted, and still never blocks', async () => {
    counts.push(null);
    view();
    tap();
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(SIGN_OUT_COPY.unknownBody);
    fireEvent.click(screen.getByRole('button', { name: SIGN_OUT_COPY.anyway }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('"Keep selling" closes the warning and signs nobody out', async () => {
    counts.push(2);
    view();
    tap();
    fireEvent.click(await screen.findByRole('button', { name: SIGN_OUT_COPY.cancel }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onSignOut).not.toHaveBeenCalled();
  });

  it('a send that finishes after "Keep selling" does not sign out or bring the dialog back', async () => {
    counts.push(2, 0);
    let finish: () => void = () => undefined;
    flush.mockImplementationOnce(
      () => new Promise<undefined>((resolve) => (finish = () => resolve(undefined)))
    );
    view();
    tap();
    fireEvent.click(await screen.findByRole('button', { name: SIGN_OUT_COPY.send }));
    fireEvent.click(await screen.findByRole('button', { name: SIGN_OUT_COPY.cancel }));
    await act(async () => {
      finish();
    });
    expect(onSignOut).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('says plainly that she cannot sign back in when the server is out of reach', async () => {
    counts.push(0);
    view(true);
    tap();
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(SIGN_OUT_COPY.offline);
  });

  it('does not say that while the server is reachable', async () => {
    counts.push(0);
    view(false);
    tap();
    expect(await screen.findByRole('alertdialog')).not.toHaveTextContent(SIGN_OUT_COPY.offline);
  });

  it('says an event is open, and what signing out costs a stall, even while the phone still reports online', async () => {
    eventOpen = true;
    counts.push(0);
    view(false);
    tap();
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(SIGN_OUT_COPY.eventOpen);
  });

  it('does not say that with no event open', async () => {
    counts.push(0);
    view(false);
    tap();
    expect(await screen.findByRole('alertdialog')).not.toHaveTextContent(SIGN_OUT_COPY.eventOpen);
  });

  it('a send that finishes after the control is gone does not sign out', async () => {
    counts.push(2, 0);
    let finish: () => void = () => undefined;
    flush.mockImplementationOnce(
      () => new Promise<undefined>((resolve) => (finish = () => resolve(undefined)))
    );
    const { unmount } = view();
    tap();
    fireEvent.click(await screen.findByRole('button', { name: SIGN_OUT_COPY.send }));
    unmount();
    await act(async () => {
      finish();
    });
    expect(onSignOut).not.toHaveBeenCalled();
  });
});
