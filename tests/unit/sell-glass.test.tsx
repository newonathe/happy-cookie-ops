import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { OrdersLive } from '@/components/live/sell/orders-live';
import { OrderLive } from '@/components/live/sell/order-live';
import { PaymentsLive } from '@/components/live/sell/payments-live';
import { ShopLive } from '@/components/live/sell/shop-live';
import { CustomersLive } from '@/components/live/sell/customers-live';
import type { OpsVals } from '@/view-models/vals';
import { setReducedMotion } from './ui-helpers';

/** Sell on the espresso ground: the summary bar and tiles, that no action was lost, and the light order page. */
const as = (over: Record<string, unknown>) => ({ ...over }) as unknown as OpsVals;
const inSubpage = (el: Element | null) => el?.closest('[class*="subpage"]') != null;

beforeEach(() => setReducedMotion(true));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const order = (id: string, label: string, action: string | null) => ({
  id,
  label,
  name: `Customer ${id}`,
  fg: 'inherit',
  bg: 'transparent',
  br: 'transparent',
  pickup: 'Pickup',
  count: '6 cookies',
  summary: 'Dark chocolate x6',
  totalText: 'P780',
  warn: null,
  review: false,
  action,
  act: vi.fn(),
  go: vi.fn()
});

const tabs = (go = vi.fn()) => ({
  label: 'Sell',
  placeLabel: 'Sell',
  places: [
    { id: 'orders', label: 'Orders', active: true, go: vi.fn() },
    { id: 'shop', label: 'Shop', active: false, go }
  ],
  entries: []
});

describe('Orders, espresso glass', () => {
  const base = (list: unknown[], over: Record<string, unknown> = {}) => ({
    orderList: list,
    orderFilters: [],
    orderQ: '',
    hasOrderQ: false,
    orderEmpty: false,
    setOrderQ: vi.fn(),
    clearOrderQ: vi.fn(),
    liveScreen: { tabs: tabs() },
    ...over
  });

  it('draws the stage bar and tiles from the same groups the columns use', () => {
    const view = render(
      <OrdersLive
        v={as(
          base([
            order('1', 'Paid', 'Start baking'),
            order('2', 'Baking', 'Mark ready'),
            order('3', 'Ready', 'Mark collected'),
            order('4', 'Completed', null)
          ])
        )}
      />
    );
    const bar = view.getByRole('img', {
      name: '2 To prepare, 1 Ready for customer pickup, 0 Payments & other orders, 1 Closed'
    });
    expect(bar.querySelectorAll('[data-segment]')).toHaveLength(3);
    const summary = view.getByRole('group', { name: 'Orders by stage' });
    expect(within(summary).getByText('4 orders shown')).toBeTruthy();
    expect(within(summary).getByText('To prepare').parentElement?.textContent).toContain('2');
    expect(view.getByRole('heading', { level: 1, name: 'Orders' })).toBeTruthy();
    // The four stage columns are the only labelled regions.
    expect(view.getAllByRole('region')).toHaveLength(4);
  });

  it('keeps every filter, the search, Clear, a row and its next step reachable', () => {
    const go = vi.fn();
    const settings = vi.fn();
    const paid = order('1', 'Paid', 'Start baking');
    const view = render(
      <OrdersLive
        v={as(
          base([paid], {
            orderFilters: [{ label: 'To review', n: 2, active: false, go }],
            hasOrderQ: true,
            liveScreen: { tabs: tabs(settings) }
          })
        )}
      />
    );
    fireEvent.click(view.getByRole('button', { name: /To review/ }));
    expect(go).toHaveBeenCalledTimes(1);
    expect(view.getByRole('button', { name: /To review/ }).getAttribute('aria-pressed')).toBe(
      'false'
    );
    expect(view.getByRole('searchbox', { name: 'Search orders' })).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'Clear' }));
    fireEvent.click(view.getByRole('button', { name: /Customer 1/ }));
    expect(paid.go).toHaveBeenCalledTimes(1);
    fireEvent.click(view.getByRole('button', { name: 'Start baking' }));
    expect(paid.act).toHaveBeenCalledTimes(1);
    fireEvent.click(view.getByRole('button', { name: 'Settings' }));
    expect(settings).toHaveBeenCalledTimes(1);
  });
});

describe('Order detail, espresso glass', () => {
  it('puts the order on one light card and keeps its actions', () => {
    const pack = vi.fn();
    const copyLink = vi.fn();
    const od = {
      id: 'HC-1',
      name: 'Ana',
      placed: 'Today',
      label: 'Paid',
      fg: 'inherit',
      bg: 'transparent',
      br: 'transparent',
      contactBits: [],
      lines: [],
      timeline: [],
      canPack: true,
      packHint: 'Pack it',
      pack,
      pickup: 'Fri',
      pay: 'GCash',
      ref: '123',
      link: 'https://x',
      linkSent: 'Not sent',
      copyLink,
      totalText: 'P780'
    };
    const view = render(<OrderLive v={as({ od, goBack: vi.fn() })} />);
    expect(inSubpage(view.getByRole('heading', { level: 1, name: 'Order HC-1' }))).toBe(true);
    fireEvent.click(view.getByRole('button', { name: 'Mark packed' }));
    fireEvent.click(view.getByRole('button', { name: 'Copy' }));
    expect(pack).toHaveBeenCalledTimes(1);
    expect(copyLink).toHaveBeenCalledTimes(1);
  });

  it('shows a missing order on the light card with a way back', () => {
    const goBack = vi.fn();
    const view = render(<OrderLive v={as({ od: null, goBack })} />);
    expect(inSubpage(view.getByRole('heading', { level: 1 }))).toBe(true);
    fireEvent.click(view.getByRole('button', { name: 'Back to orders' }));
    expect(goBack).toHaveBeenCalledTimes(1);
  });
});

describe('Payments, espresso glass', () => {
  const ref = (n: string, ticked: boolean) => ({
    ref: `REF${n}`,
    id: `HC-${n}`,
    name: `Ana ${n}`,
    pay: 'GCash',
    amountText: 'P260.00',
    ticked,
    pending: false,
    flagged: false,
    flagText: '',
    toggle: vi.fn(),
    open: vi.fn()
  });

  it('counts the listed references and keeps every action', () => {
    const rows = [ref('1', true), ref('2', false), ref('3', false)];
    const tickAll = vi.fn();
    const clear = vi.fn();
    const view = render(
      <PaymentsLive
        v={as({
          recRows: rows,
          recMethods: [{ pay: 'GCash', totalText: 'P780.00', leftText: '2', n: 3, done: false }],
          recLeftText: '2 left to tick',
          recAllDone: false,
          recTotalText: 'P780.00',
          recTickAll: tickAll,
          recClear: clear,
          liveScreen: { tabs: tabs() }
        })}
      />
    );
    expect(
      view.getByRole('img', { name: '1 Ticked, 2 Not ticked' }).querySelectorAll('[data-segment]')
    ).toHaveLength(2);
    const glance = view.getByRole('group', { name: 'References at a glance' });
    expect(within(glance).getByText('References').parentElement?.textContent).toContain('3');
    fireEvent.click(view.getByRole('button', { name: 'Tick all' }));
    fireEvent.click(view.getByRole('button', { name: 'Start over' }));
    fireEvent.click(view.getByRole('checkbox', { name: 'Tick REF2' }));
    fireEvent.click(view.getByRole('button', { name: /REF1/ }));
    expect(tickAll).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(rows[1]?.toggle).toHaveBeenCalledTimes(1);
    expect(rows[0]?.open).toHaveBeenCalledTimes(1);
    expect(view.getByText('Total in the book')).toBeTruthy();
    expect(view.getByText('HC-1 · Ana 1 · GCash')).toBeTruthy();
  });

  it('keeps exact separator copy for a fully ticked payment method', () => {
    const view = render(
      <PaymentsLive
        v={as({
          recRows: [ref('1', true), ref('2', true), ref('3', true)],
          recMethods: [{ pay: 'GCash', totalText: 'P780.00', leftText: '', n: 3, done: true }],
          recLeftText: 'Everything matched',
          recAllDone: true,
          recTotalText: 'P780.00',
          recTickAll: vi.fn(),
          recClear: vi.fn(),
          liveScreen: { tabs: tabs() }
        })}
      />
    );
    expect(view.getByText('All matched · 3')).toBeTruthy();
    expect(view.getByText('HC-1 · Ana 1 · GCash')).toBeTruthy();
  });
});

describe('Shop, espresso glass', () => {
  it('keeps each settings row and each customer preview reachable', () => {
    const goRules = vi.fn();
    const goPreview = vi.fn();
    const closeEarly = vi.fn();
    const v = as({
      drop: {
        barConfirmed: {},
        barPending: {},
        pendingText: '2 pending',
        leftText: '10 left',
        open: true
      },
      drop2: {
        no: 'Drop 7',
        stateText: 'Open',
        scheduleLine: 'Fridays',
        capNum: 40,
        capValue: 100,
        capInput: '100',
        capDown: vi.fn(),
        capUp: vi.fn(),
        setCap: vi.fn(),
        closeEarly,
        reopen: vi.fn(),
        preview: vi.fn(),
        closed: false,
        extended: false
      },
      sheet: null,
      liveScreen: {
        tabs: {
          ...tabs(),
          entries: [
            { id: 'rules', label: 'Order rules', primary: false, go: goRules },
            { id: 'pv', label: 'Preview shop', primary: false, go: goPreview }
          ]
        }
      }
    });
    const view = render(<ShopLive v={v} />);
    expect(view.getByRole('heading', { level: 1, name: 'Shop' })).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'Open Order rules' }));
    fireEvent.click(view.getByRole('button', { name: 'Preview shop' }));
    expect(goRules).toHaveBeenCalledTimes(1);
    expect(goPreview).toHaveBeenCalledTimes(1);
    fireEvent.click(view.getByRole('button', { name: 'Open Opening schedule & drop' }));
    fireEvent.click(view.getByRole('button', { name: 'Close ordering' }));
    expect(closeEarly).toHaveBeenCalledTimes(1);
    expect(view.getByRole('button', { name: 'Back to Shop' })).toBeTruthy();
  });
});

describe('Customers, espresso glass', () => {
  it('lists customers and the waitlist and opens one onto a light card', () => {
    const open = vi.fn();
    const tell = vi.fn();
    const row = {
      key: 'k1',
      name: 'Ana',
      mobile: '0917',
      contactText: '',
      orderCountText: '1 order',
      lastOrderText: 'today',
      orders: [],
      recordCsv: ''
    };
    const v = as({
      liveCustomers: { loaded: true, online: true, rows: [row] },
      waitlist: [{ name: 'Ben', want: '', when: '', contacted: false, go: tell }],
      liveScreen: { tabs: tabs() }
    });
    const view = render(<CustomersLive v={v} />);
    fireEvent.click(view.getByRole('button', { name: 'Tell them' }));
    expect(tell).toHaveBeenCalledTimes(1);
    fireEvent.click(view.getByRole('button', { name: 'Open customer Ana' }));
    expect(inSubpage(view.getByRole('heading', { level: 1, name: 'Ana' }))).toBe(true);
    expect(open).not.toHaveBeenCalled();
  });
});
