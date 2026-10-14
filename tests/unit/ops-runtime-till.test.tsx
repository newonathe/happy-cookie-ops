import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, render } from '@testing-library/react';

let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));

type Row = Record<string, unknown> & { clientId: string };
const store = new Map<string, Row>();
vi.mock('@/lib/offline/idb', () => ({
  idb: {
    put: async (v: Row) => void store.set(v.clientId, JSON.parse(JSON.stringify(v)) as Row),
    all: async () => [...store.values()],
    get: async (k: string) => store.get(k),
    delete: async (k: string) => void store.delete(k),
    supported: () => true
  }
}));
vi.mock('@/lib/device', () => ({ deviceId: () => 'dev1' }));

import { OpsRuntime } from '@/store/ops-runtime';
import { clearBazaar } from '@/lib/offline/bazaar-state';

/**
 * U2: the till as the owner leaves and comes back to it. What is pinned: leaving keeps the day and the open sale; sold-out
 * and never-loaded tiles leave the grid and come back; a helper gets the same grid but none of the owner's controls; the
 * till's expense "Add" opens the fee panel and never the old expense sheet; nothing here exists in the demo.
 */
const DAY = 'd5a00000-0000-4000-8000-000000000001';
const BOOKING = 'd5b00000-0000-4000-8000-000000000001';

interface Till {
  soldOutCount: number;
  showSoldOut: boolean;
  toggleSoldOut: () => void;
  allGone: boolean;
  home: (() => void) | null;
  addCookies: (() => void) | null;
}
interface Seen {
  liveTill?: Till | null;
  bzSell: Array<{ name: string; soldOut: boolean; inCart: number; left: number }>;
  openEventExpense: () => void;
  liveBazaar?: { tillPanel: { kind: string; status: string } | null } | null;
  liveScreen?: {
    till?: {
      name: string;
      sales: number;
      revenueText: string | null;
      back: () => void;
    } | null;
    next?: { name: string; open: () => void } | null;
  } | null;
}
const seen = (runtime: OpsRuntime) => runtime.renderVals() as unknown as Seen;
const names = (runtime: OpsRuntime) => seen(runtime).bzSell.map((t) => t.name);

function mounted(role: 'owner' | 'helper' = 'owner') {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
  const runtime = ref.current!;
  act(() => runtime.setRole(role));
  return runtime;
}
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 20))));

/** A day on the table: 20 Double Chocolate Fudge, 5 White Chocolate Biscoff, and every other flavour never loaded. */
function onTheTable(runtime: OpsRuntime, dayId = DAY) {
  act(() =>
    runtime.setState({
      event: {
        id: 'e1',
        name: 'Katipunan market',
        date: 'Sat, 24 Oct',
        stage: 'selling',
        snapshot: ['dcf', 'wcb'],
        dayId,
        scheduledId: BOOKING
      },
      eventLoaded: { dcf: 20, wcb: 5 },
      eventStock: { dcf: 20, wcb: 5 },
      eventPrices: { dcf: 125, wcb: 90 },
      cart: {},
      sales: [],
      screen: 'bazaar',
      online: true
    } as never)
  );
}
const stock = (runtime: OpsRuntime, over: Record<string, number>) =>
  act(() => runtime.setState({ eventStock: { dcf: 20, wcb: 5, ...over } } as never));

beforeEach(() => {
  live = true;
  store.clear();
  localStorage.clear();
  clearBazaar();
});
afterEach(() => cleanup());

describe('the grid: never-loaded and sold-out tiles (Ateneo B1)', () => {
  it('draws only the flavours the day put on the table', () => {
    const runtime = mounted();
    onTheTable(runtime);
    expect(names(runtime)).toEqual(['Double Chocolate Fudge', 'White Chocolate Biscoff']);
    // Mutation: dropping the filter draws all of the engine's flavours, each marked Sold out.
  });

  it('hides a real sell-out, counts it, and brings it back with the toggle', () => {
    const runtime = mounted();
    onTheTable(runtime);
    stock(runtime, { dcf: 0 });
    expect(names(runtime)).toEqual(['White Chocolate Biscoff']);
    expect(seen(runtime).liveTill).toMatchObject({ soldOutCount: 1, showSoldOut: false });
    act(() => seen(runtime).liveTill!.toggleSoldOut());
    const shown = seen(runtime);
    expect(shown.liveTill).toMatchObject({ soldOutCount: 1, showSoldOut: true });
    expect(shown.bzSell.map((t) => [t.name, t.soldOut])).toEqual([
      ['Double Chocolate Fudge', true],
      ['White Chocolate Biscoff', false]
    ]);
    // Never-loaded flavours stay out even with the toggle on.
    expect(shown.bzSell).toHaveLength(2);
  });

  it('keeps a sold-out flavour that is in the open sale, and does not count it', () => {
    const runtime = mounted();
    onTheTable(runtime);
    act(() => runtime.setState({ eventStock: { dcf: 0, wcb: 5 }, cart: { dcf: 1 } } as never));
    expect(names(runtime)).toContain('Double Chocolate Fudge');
    expect(seen(runtime).liveTill?.soldOutCount).toBe(0);
  });

  it('brings the tile back when cookies return to the table (a void, or more cookies)', () => {
    const runtime = mounted();
    onTheTable(runtime);
    stock(runtime, { dcf: 0 });
    expect(names(runtime)).not.toContain('Double Chocolate Fudge');
    stock(runtime, { dcf: 3 });
    expect(names(runtime)).toContain('Double Chocolate Fudge');
    expect(seen(runtime).liveTill?.soldOutCount).toBe(0);
  });

  it('draws a flavour that has only just been added to the table', () => {
    const runtime = mounted();
    onTheTable(runtime);
    act(() =>
      runtime.setState({
        eventLoaded: { dcf: 20, wcb: 5, hc: 6 },
        eventStock: { dcf: 20, wcb: 5, hc: 6 }
      } as never)
    );
    expect(names(runtime)).toHaveLength(3);
  });

  it('says everything is sold only when every flavour on the table has gone', () => {
    const runtime = mounted();
    onTheTable(runtime);
    stock(runtime, { dcf: 0 });
    expect(seen(runtime).liveTill?.allGone).toBe(false);
    stock(runtime, { dcf: 0, wcb: 0 });
    const gone = seen(runtime);
    expect(gone.liveTill).toMatchObject({ allGone: true, soldOutCount: 2 });
    expect(gone.bzSell).toEqual([]);
    // A tile in the open sale is still on the grid, so it is not "everything".
    act(() => runtime.setState({ cart: { dcf: 1 } } as never));
    expect(seen(runtime).liveTill?.allGone).toBe(false);
  });

  it('starts hidden again for the next day', () => {
    const runtime = mounted();
    onTheTable(runtime);
    stock(runtime, { dcf: 0 });
    act(() => seen(runtime).liveTill!.toggleSoldOut());
    act(() => runtime.setState({ event: null } as never));
    expect(seen(runtime).liveTill ?? null).toBeNull();
    onTheTable(runtime, 'd5a00000-0000-4000-8000-000000000002');
    stock(runtime, { dcf: 0 });
    expect(seen(runtime).liveTill?.showSoldOut).toBe(false);
  });

  it('is the same for a helper, who gets no owner control', () => {
    const runtime = mounted('helper');
    onTheTable(runtime);
    stock(runtime, { dcf: 0 });
    expect(names(runtime)).toEqual(['White Chocolate Biscoff']);
    expect(seen(runtime).liveTill).toMatchObject({ soldOutCount: 1, home: null, addCookies: null });
  });

  it('changes nothing in the demo', () => {
    live = false;
    const runtime = mounted();
    onTheTable(runtime);
    stock(runtime, { dcf: 0 });
    const vals = seen(runtime);
    expect(vals.liveTill).toBeUndefined();
    expect(vals.bzSell.length).toBeGreaterThan(2);
    expect(vals.bzSell.find((t) => t.name === 'Double Chocolate Fudge')?.soldOut).toBe(true);
  });
});

describe('leaving the till and coming back', () => {
  it('Home keeps the day, the stock and the open sale; the way back is on every other screen', () => {
    const runtime = mounted();
    onTheTable(runtime);
    act(() => runtime.setState({ cart: { wcb: 2 } } as never));
    expect(seen(runtime).liveTill?.home).toBeTypeOf('function');
    // On the till itself there is no banner.
    expect(seen(runtime).liveScreen?.till ?? null).toBeNull();
    act(() => seen(runtime).liveTill!.home!());
    expect(runtime.state.screen).toBe('today');
    expect(runtime.state.event).toMatchObject({ dayId: DAY, name: 'Katipunan market' });
    expect(runtime.state.cart).toEqual({ wcb: 2 });
    expect(runtime.state.eventStock).toMatchObject({ dcf: 20, wcb: 5 });
    const home = seen(runtime).liveScreen!.till!;
    expect(home).toMatchObject({ name: 'Katipunan market', sales: 0, revenueText: '₱0.00' });
    act(() => runtime.go('pnl'));
    expect(seen(runtime).liveScreen!.till).toMatchObject({ name: 'Katipunan market' });
    act(() => seen(runtime).liveScreen!.till!.back());
    expect(runtime.state.screen).toBe('bazaar');
    expect(runtime.state.event).toMatchObject({ dayId: DAY });
    // Mutation: a Home that calls resetEvent would put the day's cookies back into the shop's stock.
  });

  it('is offered to the owner only, with signal, and not when the app is narrowed to Bazaar Mode', () => {
    const runtime = mounted();
    onTheTable(runtime);
    expect(seen(runtime).liveTill?.home).not.toBeNull();
    act(() => runtime.setState({ online: false } as never));
    expect(seen(runtime).liveTill?.home).toBeNull();
    expect(seen(runtime).liveTill?.addCookies).toBeNull();
    act(() => runtime.setState({ online: true } as never));
    act(() => runtime.setGateAccess(true));
    expect(seen(runtime).liveTill?.home).toBeNull();
    act(() => runtime.setGateAccess(false));
    expect(seen(runtime).liveTill?.home).not.toBeNull();
  });

  it('shows a helper the way back without the takings, and nothing when no day is selling', () => {
    const helper = mounted('helper');
    onTheTable(helper);
    act(() => helper.go('today'));
    expect(seen(helper).liveScreen?.till).toMatchObject({
      name: 'Katipunan market',
      revenueText: null
    });
    cleanup();
    clearBazaar();
    localStorage.clear();
    const owner = mounted();
    act(() => owner.go('today'));
    expect(seen(owner).liveScreen?.till ?? null).toBeNull();
    expect(seen(owner).liveTill ?? null).toBeNull();
  });

  it('names the next booking on Home when no day is selling', () => {
    const runtime = mounted();
    (runtime as unknown as { scheduledRows: unknown }).scheduledRows = [
      {
        id: BOOKING,
        name: 'Katipunan market',
        startsOn: '2999-10-24',
        endsOn: '2999-10-25',
        place: 'Hall',
        rentCents: 0,
        active: true,
        started: false,
        updatedAt: '2026-10-20T00:00:00Z'
      }
    ];
    act(() => runtime.go('today'));
    expect(seen(runtime).liveScreen?.next).toMatchObject({ name: 'Katipunan market' });
    act(() => seen(runtime).liveScreen!.next!.open());
    expect(runtime.state.screen).toBe('bazaar');
  });
});

describe("the till's expense Add (Ateneo B2)", () => {
  it('opens the fee panel for the day and never the old expense sheet', async () => {
    const runtime = mounted();
    onTheTable(runtime);
    act(() => seen(runtime).openEventExpense());
    await settle();
    expect(runtime.state.sheet).toBeNull();
    expect(seen(runtime).liveBazaar?.tillPanel).toMatchObject({ kind: 'fees' });
    // Mutation: leaving the ported openEventExpense opens sheet('evExp'), a second list the books never see.
  });

  it('says the owner adds fees, and opens nothing, for a helper', () => {
    const runtime = mounted('helper');
    onTheTable(runtime);
    act(() => seen(runtime).openEventExpense());
    expect(runtime.state.sheet).toBeNull();
    expect(JSON.stringify(runtime.state.toast ?? null)).toContain('owner');
  });

  it('needs signal, and says so', () => {
    const runtime = mounted();
    onTheTable(runtime);
    act(() => runtime.setState({ online: false } as never));
    act(() => seen(runtime).openEventExpense());
    expect(runtime.state.sheet).toBeNull();
    expect(seen(runtime).liveBazaar?.tillPanel ?? null).toBeNull();
    expect(JSON.stringify(runtime.state.toast ?? null)).toContain('signal');
  });
});

describe('a form over the till does not outlive its day or its gate', () => {
  it('is closed when the app narrows to Bazaar Mode', async () => {
    const runtime = mounted();
    onTheTable(runtime);
    act(() => seen(runtime).openEventExpense());
    await settle();
    expect(seen(runtime).liveBazaar?.tillPanel).not.toBeNull();
    act(() => runtime.setGateAccess(true));
    expect(seen(runtime).liveBazaar?.tillPanel ?? null).toBeNull();
    // Mutation: a flag-only setGateAccess leaves a signed-out session able to add a fee.
  });

  it('is closed when the day is let go, so it cannot come back over the next day', async () => {
    const runtime = mounted();
    onTheTable(runtime);
    act(() => seen(runtime).openEventExpense());
    await settle();
    await act(async () => {
      await (runtime as unknown as { dropClosedDay: (id: string) => Promise<void> }).dropClosedDay(
        DAY
      );
    });
    expect(runtime.state.event).toBeNull();
    onTheTable(runtime, 'd5a00000-0000-4000-8000-000000000002');
    expect(seen(runtime).liveBazaar?.tillPanel ?? null).toBeNull();
  });
});

describe('Add cookies', () => {
  it('opens the cookies panel for the held day', async () => {
    const runtime = mounted();
    onTheTable(runtime);
    act(() => seen(runtime).liveTill!.addCookies!());
    await settle();
    expect(seen(runtime).liveBazaar?.tillPanel).toMatchObject({ kind: 'cookies' });
  });
});
