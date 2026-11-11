import { act } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));
vi.mock('@/lib/device', () => ({ deviceId: () => 'dev1' }));

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

import { OpsRuntime } from '@/store/ops-runtime';
import { useOpsVals } from '@/store/use-ops';
import { AppFrame } from '@/components/shell/app-frame';
import { registerLiveBazaarScreens } from '@/components/live/bazaar/register';
import { TillBar } from '@/components/live/bazaar/till-bar';
import { clearBazaar } from '@/lib/offline/bazaar-state';
import type { OpsVals } from '@/view-models/vals';
import type { TillPanelView } from '@/lib/bazaar/live-bazaar-types';

/**
 * U2: what the owner sees around the ported till. The bar and its panels are drawn from view models made by hand; the
 * whole frame is then driven through the runtime to prove the way out and the way back, and that the ported till under
 * the bar is still the one that sells.
 */
type Till = NonNullable<OpsVals['liveTill']>;
const till = (over: Partial<Till> = {}): Till => ({
  photos: [],
  classic: false,
  setClassic: vi.fn(),
  soldOutCount: 0,
  cartTotalText: '₱0.00',
  cartLines: {},
  ledger: {
    totals: null,
    drawer: {
      expectedText: '₱500.00',
      floatText: '₱500.00',
      cashSalesText: '₱0.00',
      receivedText: null,
      changeGivenText: null
    },
    target: null,
    cookies: { sold: 0, left: 0, freebies: 0 },
    rows: []
  },
  leave: null,
  allGone: false,
  home: vi.fn(),
  addCookies: vi.fn(),
  ...over
});
const panel = (over: Partial<TillPanelView> = {}): TillPanelView => ({
  kind: 'cookies',
  status: 'loading',
  event: null,
  stock: null,
  retry: vi.fn(),
  close: vi.fn(),
  ...over
});

afterEach(cleanup);

describe('the bar above the till', () => {
  it('offers Home and Add cookies to the owner', () => {
    const t = till({ soldOutCount: 2 });
    render(<TillBar till={t} panel={null} />);
    fireEvent.click(screen.getByRole('button', { name: '← Home' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add cookies' }));
    expect(t.home).toHaveBeenCalledTimes(1);
    // Planned cookies that sold out are always on the till, so there is nothing to toggle.
    expect(screen.queryByRole('button', { name: /sold out/i })).toBeNull();
    expect(t.addCookies).toHaveBeenCalledTimes(1);
  });

  it('draws nothing for a helper when there is nothing to do', () => {
    const { container } = render(
      <TillBar till={till({ soldOutCount: 1, home: null, addCookies: null })} panel={null} />
    );
    expect(container.querySelector('[role="toolbar"]')).toBeNull();
  });

  it('says when everything is sold, with the one thing to do about it', () => {
    const t = till({ allGone: true, soldOutCount: 3 });
    render(<TillBar till={t} panel={null} />);
    expect(screen.getByText('Everything on the table is sold')).toBeTruthy();
    // The bar's button and the empty state's both add cookies.
    const adds = screen.getAllByRole('button', { name: 'Add cookies' });
    expect(adds).toHaveLength(2);
    fireEvent.click(adds[1]!);
    expect(t.addCookies).toHaveBeenCalledTimes(1);
  });

  it('tells a helper to ask the owner when everything is sold', () => {
    render(<TillBar till={till({ allGone: true, home: null, addCookies: null })} panel={null} />);
    expect(screen.getByText('Tell the owner to add more cookies.')).toBeTruthy();
  });
});

describe('the panels over the till', () => {
  it('says the day is being read, and offers to try again when it could not be', () => {
    const { rerender } = render(<TillBar till={till()} panel={panel()} />);
    expect(screen.getByText('Reading this day…')).toBeTruthy();
    const retry = vi.fn();
    rerender(<TillBar till={till()} panel={panel({ status: 'failed', retry })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('draws the add-cookies form from the held day and sends what is typed', async () => {
    const addStock = vi.fn(async () => null);
    render(
      <TillBar
        till={till()}
        panel={panel({
          status: 'loaded',
          stock: {
            flavours: [
              { id: 'dcf', name: 'Double Chocolate Fudge' },
              { id: 'wcb', name: 'White Chocolate Biscoff' }
            ],
            canAddCarried: false,
            addStock
          }
        })}
      />
    );
    const dialog = screen.getByRole('dialog', { name: 'Add cookies' });
    const form = within(dialog).getByRole('form', { name: 'Add stock' });
    fireEvent.change(within(form).getByLabelText('Flavour'), { target: { value: 'wcb' } });
    fireEvent.change(within(form).getByLabelText('How many'), { target: { value: '6' } });
    await act(async () => {
      fireEvent.click(within(form).getByRole('button', { name: 'Add to the table' }));
    });
    expect(addStock).toHaveBeenCalledWith({ productId: 'wcb', qty: '6', kind: 'made' });
  });

  it('closes from Done and from Escape', () => {
    const close = vi.fn();
    render(<TillBar till={till()} panel={panel({ close })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(close).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------- the whole frame, through the runtime
const DAY = 'd5a00000-0000-4000-8000-000000000001';
const BOOKING = 'd5b00000-0000-4000-8000-000000000001';

function Frame() {
  return <AppFrame v={useOpsVals()} />;
}
function mountFrame() {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(
    <OpsRuntime ref={(r) => void (ref.current = r)}>
      <Frame />
    </OpsRuntime>
  );
  const runtime = ref.current!;
  act(() => runtime.setRole('owner'));
  act(() => runtime.setState({ device: 'mobile' }));
  act(() =>
    runtime.setState({
      event: {
        id: 'e1',
        name: 'Katipunan market',
        date: 'Sat, 24 Oct',
        stage: 'selling',
        snapshot: ['dcf', 'wcb'],
        dayId: DAY,
        scheduledId: BOOKING
      },
      eventLoaded: { dcf: 20, wcb: 5 },
      eventStock: { dcf: 0, wcb: 5 },
      eventPrices: { dcf: 125, wcb: 90 },
      cart: {},
      sales: [],
      online: true
    } as never)
  );
  act(() => runtime.go('bazaar'));
  return runtime;
}

beforeEach(() => {
  live = true;
  store.clear();
  localStorage.clear();
  clearBazaar();
  registerLiveBazaarScreens();
});

describe('leaving the till and coming back, in the frame', () => {
  it('Home leaves the day open, shows the selling card, and Back to the till returns to the same till', () => {
    const runtime = mountFrame();
    // The consolidated till is drawn, with the planned, sold-out Double Chocolate Fudge marked.
    expect(document.querySelector('[data-till="consolidated"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Double Chocolate Fudge.*sold out/ })).toBeTruthy();
    expect(screen.getByText('White Chocolate Biscoff')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Till menu' }));
    fireEvent.click(screen.getByRole('button', { name: /Back to Home/ }));
    expect(runtime.state.screen).toBe('today');
    expect(runtime.state.event).toMatchObject({ dayId: DAY });
    const card = screen.getByRole('region', { name: 'Bazaar' });
    expect(within(card).getByText('Katipunan market')).toBeTruthy();
    expect(within(card).getByText('₱0.00')).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: 'Back to the till →' }));
    expect(runtime.state.screen).toBe('bazaar');
    expect(document.querySelector('[data-screen-label="Bazaar Mode"]')).toBeTruthy();
  });

  it('shows the banner on another screen, and not the card', () => {
    const runtime = mountFrame();
    act(() => runtime.go('pnl'));
    expect(screen.getByText('Katipunan market is selling')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Bazaar' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back to the till' }));
    expect(runtime.state.screen).toBe('bazaar');
  });
});
