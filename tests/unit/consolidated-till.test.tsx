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
import { ConsolidatedTill, TillBoundary } from '@/components/live/bazaar/till';
import { clearBazaar } from '@/lib/offline/bazaar-state';
import type { OpsVals } from '@/view-models/vals';

/**
 * The consolidated till (19 October 2026). Only its look is new, so each control is checked to call the very handler the
 * ported till calls, from the same values. Then, through the runtime and the frame: the classic-till switch and its memory
 * on the phone, the fall back to the ported till if the new one throws, and a helper's till.
 */
type Till = NonNullable<OpsVals['liveTill']>;
type Sale = OpsVals['bzSales'][number];

const till = (over: Partial<Till> = {}): Till => ({
  photos: ['https://example.supabase.co/storage/v1/object/public/shop-media/flavours/dcf.webp', ''],
  classic: false,
  setClassic: vi.fn(),
  soldOutCount: 0,
  showSoldOut: false,
  toggleSoldOut: vi.fn(),
  allGone: false,
  home: vi.fn(),
  addCookies: vi.fn(),
  ...over
});
const tile = (name: string, over: Record<string, unknown> = {}) => ({
  imgStyle: '',
  inCart: 0,
  left: 5,
  minus: vi.fn(),
  name,
  priceText: '₱125',
  qtyText: '0',
  soldOut: false,
  tap: vi.fn(),
  ...over
});
const sale = (over: Partial<Sale> = {}): Sale => ({
  bad: false,
  clerk: 'Owner',
  ok: true,
  pay: 'Cash',
  refText: null,
  retry: vi.fn(),
  stateText: 'Synced',
  summary: '1× Double Chocolate Fudge',
  totalText: '₱125',
  void: vi.fn(),
  ...over
});
const vals = (over: Record<string, unknown> = {}) =>
  ({
    event: {
      name: 'Katipunan market',
      date: 'Sat, 24 Oct',
      reset: vi.fn(),
      stage1: false,
      stage2: true,
      stage3: false
    },
    bzSell: [tile('Double Chocolate Fudge', { inCart: 2 }), tile('White Chocolate Biscoff')],
    bzSales: [sale()],
    bzCartCount: 2,
    bzCartTotalNum: '₱250',
    bzSalesCount: '1 sale',
    bzRevenue: '₱125',
    syncBanner: false,
    syncText: '',
    syncing: false,
    syncDone: false,
    syncPartial: false,
    unsynced: 0,
    syncNow: vi.fn(),
    openPay: vi.fn(),
    recordFreebie: vi.fn(),
    askClose: vi.fn(),
    openEventExpense: vi.fn(),
    ...over
  }) as unknown as OpsVals;

afterEach(cleanup);

describe('the consolidated till calls the ported handlers', () => {
  it('a tile adds one, and its minus (only on a tile in the sale) takes one off', () => {
    const v = vals();
    render(<ConsolidatedTill v={v} till={till()} panel={null} />);
    fireEvent.click(screen.getByRole('button', { name: /White Chocolate Biscoff/ }));
    expect(v.bzSell[1]!.tap).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'One less White Chocolate Biscoff' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'One less Double Chocolate Fudge' }));
    expect(v.bzSell[0]!.minus).toHaveBeenCalledTimes(1);
    expect(v.bzSell[0]!.tap).not.toHaveBeenCalled();
  });

  it('draws the already-resolved photo as it is', () => {
    render(<ConsolidatedTill v={vals()} till={till()} panel={null} />);
    const photos = document.querySelectorAll('[data-photo]');
    expect(photos[0]!.getAttribute('data-photo')).toBe('yes');
    expect((photos[0] as HTMLElement).style.backgroundImage).toContain(
      'shop-media/flavours/dcf.webp'
    );
    expect(photos[1]!.getAttribute('data-photo')).toBe('none');
  });

  it('Charge and Freebie are the ported ones', () => {
    const v = vals();
    render(<ConsolidatedTill v={v} till={till()} panel={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Charge' }));
    fireEvent.click(screen.getByRole('button', { name: 'Freebie' }));
    expect(v.openPay).toHaveBeenCalledTimes(1);
    expect(v.recordFreebie).toHaveBeenCalledTimes(1);
    expect(screen.getByText('₱250')).toBeTruthy();
  });

  it('the menu offers the owner every way out, each through its own handler', () => {
    const v = vals();
    const t = till();
    render(<ConsolidatedTill v={v} till={t} panel={null} />);
    const open = () => fireEvent.click(screen.getByRole('button', { name: 'Till menu' }));
    const pickItem = (name: RegExp) => fireEvent.click(screen.getByRole('button', { name }));
    open();
    pickItem(/Add cookies/);
    open();
    pickItem(/Fees and expenses/);
    open();
    pickItem(/Review and close the day/);
    open();
    pickItem(/Back to Home/);
    open();
    pickItem(/Use the classic till/);
    expect(t.addCookies).toHaveBeenCalledTimes(1);
    expect(v.openEventExpense).toHaveBeenCalledTimes(1);
    expect(v.askClose).toHaveBeenCalledTimes(1);
    expect(t.home).toHaveBeenCalledTimes(1);
    expect(t.setClassic).toHaveBeenCalledWith(true);
    // Leaving never clears the event from the phone.
    expect(v.event!.reset).not.toHaveBeenCalled();
  });

  it('a helper, or a phone with no signal, gets no Home and no Add cookies', () => {
    render(
      <ConsolidatedTill v={vals()} till={till({ home: null, addCookies: null })} panel={null} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Till menu' }));
    expect(screen.queryByRole('button', { name: /Back to Home/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Add cookies/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Review and close the day/ })).toBeTruthy();
  });

  it('a sale is voided from its sheet, after a confirm, and "Keep it" voids nothing', () => {
    const v = vals();
    render(<ConsolidatedTill v={v} till={till()} panel={null} />);
    fireEvent.click(screen.getByRole('button', { name: /1× Double Chocolate Fudge/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(v.bzSales[0]!.void).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /1× Double Chocolate Fudge/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Void this sale' }));
    expect(v.bzSales[0]!.void).toHaveBeenCalledTimes(1);
  });

  it('a sale arriving while a sale is open does not change which sale is voided', () => {
    const older = sale({ summary: '2× White Chocolate Biscoff' });
    const first = vals({ bzSales: [older] });
    const { rerender } = render(<ConsolidatedTill v={first} till={till()} panel={null} />);
    fireEvent.click(screen.getByRole('button', { name: /2× White Chocolate Biscoff/ }));
    const newer = sale({ summary: '1× Double Chocolate Fudge' });
    rerender(<ConsolidatedTill v={vals({ bzSales: [newer, older] })} till={till()} panel={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Void this sale' }));
    expect(older.void).toHaveBeenCalledTimes(1);
    expect(newer.void).not.toHaveBeenCalled();
  });

  it('a sale that could not be sent keeps "Send again" on its row', () => {
    const bad = sale({ bad: true, ok: false });
    const v = vals({ bzSales: [bad] });
    render(<ConsolidatedTill v={v} till={till()} panel={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Send again' }));
    expect(bad.retry).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Void this sale' })).toBeNull();
  });

  it('the sync line and "Sync now" stay on the screen', () => {
    const v = vals({ syncBanner: true, syncText: '2 waiting to sync', unsynced: 2 });
    render(<ConsolidatedTill v={v} till={till()} panel={null} />);
    expect(screen.getByRole('status').textContent).toContain('2 waiting to sync');
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    expect(v.syncNow).toHaveBeenCalledTimes(1);
  });
});

describe('if the consolidated till throws', () => {
  it('the fallback (the ported till) is drawn instead', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const Broken = () => {
      throw new Error('boom');
    };
    render(
      <TillBoundary fallback={<p>ported till</p>}>
        <Broken />
      </TillBoundary>
    );
    expect(screen.getByText('ported till')).toBeTruthy();
    quiet.mockRestore();
  });
});

const DAY = '11111111-1111-4111-8111-111111111111';
const BOOKING = '22222222-2222-4222-8222-222222222222';

function Frame() {
  const v = useOpsVals();
  return v ? <AppFrame v={v} /> : null;
}

function mountFrame(role: 'owner' | 'helper' = 'owner') {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(
    <OpsRuntime ref={(r) => void (ref.current = r)}>
      <Frame />
    </OpsRuntime>
  );
  const runtime = ref.current!;
  act(() => runtime.setRole(role));
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
      eventStock: { dcf: 20, wcb: 5 },
      eventPrices: { dcf: 125, wcb: 90 },
      cart: {},
      sales: [],
      online: true
    } as never)
  );
  act(() => runtime.go('bazaar'));
  return runtime;
}

const consolidated = () => document.querySelector('[data-till="consolidated"]');

describe('in the frame', () => {
  beforeEach(() => {
    live = true;
    store.clear();
    localStorage.clear();
    clearBazaar();
    registerLiveBazaarScreens();
  });

  it('draws the consolidated till, and a tap rings up the ported cart', () => {
    const runtime = mountFrame();
    expect(consolidated()).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /White Chocolate Biscoff/ }));
    expect(runtime.state.cart).toMatchObject({ wcb: 1 });
  });

  it('switches to the classic till and back, and the phone remembers the choice', () => {
    mountFrame();
    fireEvent.click(screen.getByRole('button', { name: 'Till menu' }));
    fireEvent.click(screen.getByRole('button', { name: /Use the classic till/ }));
    expect(consolidated()).toBeNull();
    expect(screen.getByRole('button', { name: 'Close out' })).toBeTruthy();
    expect(localStorage.getItem('hc-live-classic-till')).toBe('1');

    // A fresh page load on the same phone keeps the classic till.
    cleanup();
    mountFrame();
    expect(consolidated()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Use the new till' }));
    expect(consolidated()).toBeTruthy();
    expect(localStorage.getItem('hc-live-classic-till')).toBeNull();
  });

  it('lifts the toast above the sale bar on a phone', () => {
    const runtime = mountFrame();
    act(() => runtime.toast('Test toast'));
    const toast = screen.getByText('Test toast').closest('[style*="bottom"]') as HTMLElement | null;
    expect(toast?.style.bottom).toBe('104px');
  });

  it('a helper sells on the consolidated till, with no Home and no Add cookies', () => {
    mountFrame('helper');
    expect(consolidated()).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Till menu' }));
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).queryByRole('button', { name: /Back to Home/ })).toBeNull();
    expect(within(sheet).queryByRole('button', { name: /Add cookies/ })).toBeNull();
  });
});
