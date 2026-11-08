import { act } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpsRuntime } from '@/store/ops-runtime';
import { KitchenTransferDesk, type KitchenTransferView } from '@/lib/bazaar/kitchen-transfer-desk';
import type { BazaarClient } from '@/lib/data/bazaar-days';
import { parseBazaar } from '@/lib/data/bazaar-days';
import { bindProductionOwner } from './production-runtime-helpers';
import example from '../fixtures/bazaar-example.json';

type Ports = ConstructorParameters<typeof KitchenTransferDesk>[0];
const desks = vi.hoisted(() => [] as Array<{ ports: Ports; close: ReturnType<typeof vi.fn> }>);
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => true }));
vi.mock('@/lib/bazaar/kitchen-transfer-desk', () => ({
  KitchenTransferDesk: class {
    close = vi.fn();
    constructor(readonly ports: Ports) {
      desks.push(this);
    }
    async open() {}
    vals() {
      return this.ports.current()
        ? ({ name: 'Synthetic destination' } as KitchenTransferView)
        : null;
    }
  }
}));
afterEach(() => {
  cleanup();
  desks.length = 0;
});
interface Access {
  productionClient: BazaarClient | null;
  kitchenTransferAction: (booking: string, day: string) => (() => void) | null;
  bazaarDays: {
    selectedBookingId: () => string | null;
    openReview: (booking: string, day: string, from: 'event') => void;
  };
}
async function mount() {
  let runtime!: OpsRuntime;
  render(
    <OpsRuntime
      ref={(r) => {
        if (r) runtime = r;
      }}
    />
  );
  await bindProductionOwner(runtime);
  await act(async () => runtime.setState({ role: 'owner', screen: 'bazaar', event: null }));
  const access = runtime as unknown as Access;
  access.productionClient = { rpc: vi.fn() } as unknown as BazaarClient;
  const booking = example.summary.booking.id,
    day = parseBazaar(example)!.days[0];
  vi.spyOn(access.bazaarDays, 'selectedBookingId').mockReturnValue(booking);
  return {
    runtime,
    access,
    booking,
    day,
    action: () => access.kitchenTransferAction(booking, day.id)
  };
}

describe('verified production authority at the Bazaar transfer door', () => {
  it.each(['client', 'period', 'destination', 'identity', 'role', 'day-selection'])(
    'retires a saved day action after %s changes',
    async (change) => {
      const f = await mount(),
        action = f.action()!;
      if (change === 'day-selection')
        act(() => f.access.bazaarDays.openReview(f.booking, example.summary.days[1].id, 'event'));
      if (change === 'client')
        f.access.productionClient = { rpc: vi.fn() } as unknown as BazaarClient;
      if (change === 'period')
        await act(async () => f.runtime.setState({ dropNo: Number(f.runtime.state.dropNo) + 1 }));
      if (change === 'destination')
        vi.spyOn(f.access.bazaarDays, 'selectedBookingId').mockReturnValue('another');
      if (change === 'role') await act(async () => f.runtime.setState({ role: 'helper' }));
      if (change === 'identity') await act(async () => f.runtime.setProductionIdentity(null));
      act(() => action());
      expect(desks).toHaveLength(0);
    }
  );
  it('retires a cached action when another day transfer is selected in the same booking', async () => {
    const f = await mount(),
      actionA = f.action()!;
    act(() => f.access.kitchenTransferAction(f.booking, example.summary.days[1].id)!());
    act(() => actionA());
    expect(desks).toHaveLength(1);
    expect(desks[0].ports.dayId).toBe(example.summary.days[1].id);
  });
  it('keeps unsent sales and applies incoming totals once in the matching held day', async () => {
    const f = await mount(),
      pid = f.day.lines[0].productId;
    f.day.lines = f.day.lines.slice(0, 1);
    f.day.lines[0].made = 6;
    f.day.lines[0].carried = 0;
    act(() => f.action()!());
    const ports = desks[0].ports;
    (f.runtime as unknown as { bazaarDirectory: boolean }).bazaarDirectory = true;
    await act(async () =>
      f.runtime.setState({
        event: { dayId: f.day.id, scheduledId: f.booking } as never,
        eventLoaded: { [pid]: 4 },
        eventStock: { [pid]: 1 }
      })
    );
    // The owner is in the directory while this phone retains the till.
    (f.runtime as unknown as { bazaarDirectory: boolean }).bazaarDirectory = true;
    let applied!: Promise<boolean>;
    act(() => {
      applied = ports.updated(f.day);
    });
    expect(await applied).toBe(true);
    expect((f.runtime.state.eventStock as Record<string, number>)[pid]).toBe(3);
    act(() => {
      applied = ports.updated(f.day);
    });
    expect(await applied).toBe(true);
    expect((f.runtime.state.eventStock as Record<string, number>)[pid]).toBe(3);
  });
  it('rechecks authority inside a queued till update', async () => {
    const f = await mount(),
      pid = f.day.lines[0].productId;
    f.day.lines = f.day.lines.slice(0, 1);
    f.day.lines[0].made = 6;
    f.day.lines[0].carried = 0;
    (f.runtime as unknown as { bazaarDirectory: boolean }).bazaarDirectory = true;
    await act(async () =>
      f.runtime.setState({
        event: { dayId: f.day.id, scheduledId: f.booking } as never,
        eventLoaded: { [pid]: 4 },
        eventStock: { [pid]: 1 }
      })
    );
    act(() => f.action()!());
    let applied!: Promise<boolean>;
    act(() => {
      applied = desks[0].ports.updated(f.day);
      f.access.productionClient = { rpc: vi.fn() } as unknown as BazaarClient;
    });
    expect(await applied).toBe(false);
    expect((f.runtime.state.eventStock as Record<string, number>)[pid]).toBe(1);
  });
  it('ignores old close callbacks and drops the current desk when leaving the page', async () => {
    const f = await mount();
    act(() => f.action()!());
    const first = desks[0];
    act(() => f.action()!());
    const second = desks[1];
    act(() => first.ports.close());
    expect(second.close).not.toHaveBeenCalled();
    await act(async () => f.runtime.setState({ screen: 'today' }));
    expect(second.close).toHaveBeenCalledTimes(1);
  });
});

describe('kitchen access from the held owner till', () => {
  it('opens directly without first leaving the till for the directory', async () => {
    const f = await mount();
    await act(async () =>
      f.runtime.setState({
        event: { dayId: f.day.id, scheduledId: f.booking } as never,
        online: true
      })
    );
    act(() => f.action()!());
    expect(desks).toHaveLength(1);
    expect(desks[0].ports.current()).toBe(true);
  });
  it.each(['offline', 'role'])(
    'refuses a saved held-till action after %s changes',
    async (change) => {
      const f = await mount();
      await act(async () =>
        f.runtime.setState({
          event: { dayId: f.day.id, scheduledId: f.booking } as never,
          online: true
        })
      );
      const action = f.action()!;
      if (change === 'offline') await act(async () => f.runtime.setState({ online: false }));
      else await act(async () => f.runtime.setState({ role: 'helper' }));
      act(() => action());
      expect(desks).toHaveLength(0);
    }
  );
});

describe('captured held-day authority', () => {
  it.each(['day', 'booking', 'cleared', 'day-in-directory'])(
    'retires a captured till action after %s changes',
    async (change) => {
      const f = await mount();
      await act(async () =>
        f.runtime.setState({
          event: { dayId: f.day.id, scheduledId: f.booking } as never,
          online: true
        })
      );
      const action = f.action()!;
      await act(async () =>
        f.runtime.setState({
          event:
            change === 'cleared'
              ? null
              : ({
                  dayId: change === 'booking' ? f.day.id : 'other-day',
                  scheduledId: change === 'booking' ? 'other-booking' : f.booking
                } as never)
        })
      );
      if (change === 'day-in-directory')
        (f.runtime as unknown as { bazaarDirectory: boolean }).bazaarDirectory = true;
      act(() => action());
      expect(desks).toHaveLength(0);
    }
  );
  it('retires callbacks already opened from the old held day', async () => {
    const f = await mount();
    await act(async () =>
      f.runtime.setState({
        event: { dayId: f.day.id, scheduledId: f.booking } as never,
        online: true
      })
    );
    act(() => f.action()!());
    const ports = desks[0].ports;
    await act(async () =>
      f.runtime.setState({ event: { dayId: 'other-day', scheduledId: f.booking } as never })
    );
    expect(ports.current()).toBe(false);
    expect(await ports.updated(f.day)).toBe(false);
  });
});

describe('directory-origin transfer authority', () => {
  it.each(['same-day', 'other-day'])(
    'retires a cached directory action when a %s till replaces it',
    async (change) => {
      const f = await mount(),
        action = f.action()!;
      await act(async () =>
        f.runtime.setState({
          event: {
            dayId: change === 'same-day' ? f.day.id : 'another-day',
            scheduledId: f.booking
          } as never,
          online: true
        })
      );
      act(() => action());
      expect(desks).toHaveLength(0);
    }
  );
  it('retires directory-origin callbacks when a till opens', async () => {
    const f = await mount();
    act(() => f.action()!());
    const ports = desks[0].ports;
    await act(async () =>
      f.runtime.setState({
        event: { dayId: 'another-day', scheduledId: f.booking } as never,
        online: true
      })
    );
    expect(ports.current()).toBe(false);
    expect(await ports.updated(f.day)).toBe(false);
  });
});
