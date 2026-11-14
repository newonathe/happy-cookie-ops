import { act } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));
vi.mock('@/lib/device', () => ({ deviceId: () => 'dev1' }));
vi.mock('@/lib/offline/idb', () => ({
  idb: {
    put: async () => undefined,
    all: async () => [],
    get: async () => undefined,
    delete: async () => undefined,
    supported: () => true
  }
}));

import { OpsRuntime } from '@/store/ops-runtime';
import { useOpsVals } from '@/store/use-ops';
import { AppFrame } from '@/components/shell/app-frame';
import { registerLiveBazaarScreens } from '@/components/live/bazaar/register';
import { clearBazaar } from '@/lib/offline/bazaar-state';
import { flavoursRead } from '@/lib/data/flavours-read-state';

/**
 * HCB-002e: when the owner's events cannot be read the Bazaar page says so and offers Try again; it never sits on
 * "Reading your events…" for good. Each `Mutation:` line names a change one of these tests must catch.
 */
const NOW = new Date('2026-10-20T03:00:00Z');
const booking = {
  id: 'd5b00000-0000-4000-8000-000000000001',
  name: 'Katipunan market',
  starts_on: '2026-10-24',
  ends_on: '2026-10-25',
  place: 'Katipunan Ave, QC',
  rent_cents: 250000,
  active: true,
  started: false,
  updated_at: '2026-10-20T02:00:00.123456+00:00'
};

type Mode = 'fail' | 'ok' | 'empty';
function fakeClient(mode: { current: Mode }) {
  const rpc = vi.fn(async (name: string) => {
    if (name !== 'get_scheduled_events') return { data: null, error: null };
    if (mode.current === 'fail') return { data: null, error: { code: '500', message: 'down' } };
    return { data: mode.current === 'empty' ? [] : [booking], error: null };
  });
  return { rpc, client: { rpc } };
}

function Frame() {
  return <AppFrame v={useOpsVals()} />;
}
async function mount(first: Mode) {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(
    <OpsRuntime ref={(r) => void (ref.current = r)}>
      <Frame />
    </OpsRuntime>
  );
  const runtime = ref.current!;
  act(() => runtime.setRole('owner'));
  act(() => runtime.setState({ device: 'mobile' }));
  const mode = { current: first };
  const fake = fakeClient(mode);
  await act(async () => {
    await runtime.loadScheduledEvents(fake.client as never);
  });
  act(() => runtime.go('bazaar'));
  return { runtime, mode, ...fake };
}
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 30))));
const tryAgain = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await settle();
};

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  live = true;
  flavoursRead.reset();
  localStorage.clear();
  clearBazaar();
  registerLiveBazaarScreens();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  flavoursRead.reset();
});

describe('HCB-002e: the events read fails', () => {
  it('(a) a failed first read says so with Try again, never "Reading your events…"', async () => {
    await mount('fail');
    expect(screen.getByText('Your events could not be read.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.queryByText('Reading your events…')).toBeNull();
    expect(screen.queryByText(/No events yet/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Add an event' }).hasAttribute('disabled')).toBe(
      true
    );
    // Mutation: a failed read that records nothing leaves the page on "Reading your events…" for good.
  });

  it('(b) Try again with a good read shows the events', async () => {
    const { mode } = await mount('fail');
    mode.current = 'ok';
    await tryAgain();
    expect(screen.getByRole('button', { name: /Katipunan market/ })).toBeTruthy();
    expect(screen.queryByText('Your events could not be read.')).toBeNull();
  });

  it('(b) Try again that fails again keeps the failure, with Try again', async () => {
    const { rpc } = await mount('fail');
    rpc.mockClear();
    await tryAgain();
    expect(rpc).toHaveBeenCalledWith('get_scheduled_events');
    expect(screen.getByText('Your events could not be read.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('(c) a good read then a failed reload keeps the list and warns it was not refreshed', async () => {
    const { runtime, mode } = await mount('ok');
    expect(screen.getByRole('button', { name: /Katipunan market/ })).toBeTruthy();
    mode.current = 'fail';
    await act(async () => {
      await runtime.loadScheduledEvents(null);
    });
    expect(screen.getByRole('button', { name: /Katipunan market/ })).toBeTruthy();
    expect(screen.getByText('Could not refresh your events.')).toBeTruthy();
    expect(screen.queryByText('Your events could not be read.')).toBeNull();
    mode.current = 'ok';
    await tryAgain();
    expect(screen.queryByText('Could not refresh your events.')).toBeNull();
    expect(screen.getByRole('button', { name: /Katipunan market/ })).toBeTruthy();
  });

  it('(d) "No events yet" only after a successful read of none', async () => {
    const { mode } = await mount('fail');
    expect(screen.queryByText('No events yet')).toBeNull();
    mode.current = 'empty';
    await tryAgain();
    expect(screen.getByText('No events yet')).toBeTruthy();
  });

  it('(e) an answer from an older read does not set the failure', async () => {
    const { runtime, mode } = await mount('ok');
    let fail!: () => void;
    const slow = {
      rpc: vi.fn(
        () =>
          new Promise((resolve) => {
            fail = () => resolve({ data: null, error: { code: '500', message: 'late' } });
          })
      )
    };
    let older!: Promise<boolean>;
    await act(async () => {
      older = runtime.loadScheduledEvents(slow as never);
    });
    mode.current = 'ok';
    await act(async () => {
      await runtime.loadScheduledEvents(fakeClient(mode).client as never);
    });
    await act(async () => {
      fail();
      expect(await older).toBe(false);
    });
    expect(screen.queryByText('Could not refresh your events.')).toBeNull();
    expect(screen.getByRole('button', { name: /Katipunan market/ })).toBeTruthy();
  });

  it('(e) an answer for another owner does not set the failure', async () => {
    const { runtime } = await mount('ok');
    let fail!: () => void;
    const slow = {
      rpc: vi.fn(
        () =>
          new Promise((resolve) => {
            fail = () => resolve({ data: null, error: { code: '500', message: 'late' } });
          })
      )
    };
    let reading!: Promise<boolean>;
    await act(async () => {
      reading = runtime.loadScheduledEvents(slow as never);
    });
    (runtime as unknown as { productionActorEpoch: number }).productionActorEpoch += 1;
    await act(async () => {
      fail();
      expect(await reading).toBe(false);
    });
    expect(
      (runtime as unknown as { scheduledReadFailedActor: number | null }).scheduledReadFailedActor
    ).toBeNull();
    expect(screen.queryByText('Could not refresh your events.')).toBeNull();
  });

  it('(f) a read that never answers fails after the limit with Try again, and a late answer clears it', async () => {
    const { runtime } = await mount('empty');
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    let answer!: () => void;
    const hung = {
      rpc: vi.fn(
        () =>
          new Promise((resolve) => {
            answer = () => resolve({ data: [booking], error: null });
          })
      )
    };
    let reading!: Promise<boolean>;
    await act(async () => {
      reading = runtime.loadScheduledEvents(hung as never);
    });
    expect(screen.queryByText('Could not refresh your events.')).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(14_000);
    });
    expect(screen.queryByText('Could not refresh your events.')).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(screen.getByText('Could not refresh your events.')).toBeTruthy();
    expect(await reading).toBe(false);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect((runtime as unknown as { scheduledReading: boolean }).scheduledReading).toBe(false);
    // The late answer is for the same read, so it still applies and clears the failure.
    await act(async () => {
      answer();
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(screen.queryByText('Could not refresh your events.')).toBeNull();
    expect(screen.getByRole('button', { name: /Katipunan market/ })).toBeTruthy();
  });

  it('(f) a first read that never answers shows the failure, not "Reading your events…"', async () => {
    const ref: { current: OpsRuntime | null } = { current: null };
    render(
      <OpsRuntime ref={(r) => void (ref.current = r)}>
        <Frame />
      </OpsRuntime>
    );
    const runtime = ref.current!;
    act(() => runtime.setRole('owner'));
    act(() => runtime.setState({ device: 'mobile' }));
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const hung = { rpc: vi.fn(() => new Promise(() => undefined)) };
    await act(async () => {
      void runtime.loadScheduledEvents(hung as never);
    });
    act(() => runtime.go('bazaar'));
    expect(screen.getByText('Reading your events…')).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16_000);
    });
    expect(screen.queryByText('Reading your events…')).toBeNull();
    expect(screen.getByText('Your events could not be read.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
