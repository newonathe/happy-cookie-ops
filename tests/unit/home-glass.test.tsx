import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { HomeLive } from '@/components/live/home/home-live';
import type { LiveHome, OpsVals } from '@/view-models/vals';
import { setReducedMotion } from './ui-helpers';

/** Home on the espresso ground: the goal ring, the split bars, and that no action or link was lost. */
const GO = [
  'orders',
  'payments',
  'production',
  'stock',
  'receive',
  'count',
  'products',
  'shopping',
  'money',
  'bazaar'
] as const;

function build(over: Partial<LiveHome> = {}, goal: OpsVals['profitGoal'] = null) {
  const go = Object.fromEntries(GO.map((key) => [key, vi.fn<() => void>()])) as Record<
    (typeof GO)[number],
    ReturnType<typeof vi.fn<() => void>>
  >;
  const home: LiveHome = {
    greeting: 'Good evening, Owner.',
    dateText: 'Sunday, 15 Nov',
    orders: { review: 2, toPrepare: 3, ready: 0 },
    stockCounts: { ok: 5, low: 2, out: 1, unknown: 0, neverCounted: 0 },
    stockAttention: [
      { name: 'Butter', status: 'Out', detail: '0 g left', open: vi.fn() },
      { name: 'Pouch', status: 'Low', detail: '7 left', open: vi.fn() }
    ],
    production: [{ id: 'p1', name: 'Happy Camper', detail: '24 cookies', open: vi.fn() }],
    month: { revenue: 12000, expenses: 4000, profit: 8000 },
    flavours: 6,
    go,
    ...over
  };
  return { go, home, v: { liveHome: home, profitGoal: goal } as unknown as OpsVals };
}

describe('Home, espresso glass', () => {
  beforeEach(() => setReducedMotion(true));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('sets the greeting formally: as written, in the body font, never forced to lowercase (Cine, 19 November)', () => {
    const { v } = build();
    const view = render(<HomeLive v={v} />);
    const heading = view.getByRole('heading', { level: 1, name: 'Good evening, Owner.' });
    expect(heading.className).not.toMatch(/(^|\s)lowercase(\s|$)/);
    expect(heading.className).not.toMatch(/(^|\s)font-display(\s|$)/);
  });
  it('draws the goal ring at the right percentage when the goal is known', () => {
    const { v } = build({}, { goal: 20000, profit: 8000, set: vi.fn() });
    const view = render(<HomeLive v={v} />);
    const ring = view.getByRole('img', { name: "40% of this month's profit goal" });
    expect(ring.getAttribute('data-goal-pct')).toBe('40');
    expect(ring.textContent).toContain('40%');
    expect(view.getByText('of ₱20,000 goal')).toBeTruthy();
    expect(ring.querySelector('circle[style*="stroke-dasharray"]')).not.toBeNull();
  });

  it('caps the ring at 100% and is absent with no goal or no profit read yet', () => {
    const over = render(<HomeLive v={build({}, { goal: 5000, profit: 8000, set: vi.fn() }).v} />);
    expect(over.getByRole('img', { name: "100% of this month's profit goal" })).toBeTruthy();
    cleanup();
    const none = render(<HomeLive v={build({}, null).v} />);
    expect(none.container.querySelector('[data-goal-pct]')).toBeNull();
    expect(none.queryByText(/goal$/)).toBeNull();
    cleanup();
    const unread = render(
      <HomeLive v={build({}, { goal: 20000, profit: null, set: vi.fn() }).v} />
    );
    expect(unread.container.querySelector('[data-goal-pct]')).toBeNull();
  });

  it('shows the books at their exact final figures, to the centavo', () => {
    const { v } = build({ month: { revenue: 12000.5, expenses: 4000, profit: 8000.5 } });
    const view = render(<HomeLive v={v} />);
    expect(view.getAllByText('₱8,000.50').length).toBeGreaterThan(0);
    expect(view.getAllByText('+₱12,000.50').length).toBeGreaterThan(0);
    expect(view.getAllByText('−₱4,000.00').length).toBeGreaterThan(0);
  });

  it('draws one order segment per non-zero group, each with its count', () => {
    const { v } = build({ orders: { review: 2, toPrepare: 3, ready: 0 } });
    const view = render(<HomeLive v={v} />);
    const bar = view.getByRole('img', {
      name: '2 Payments to check, 3 Orders to prepare, 0 Ready for pickup'
    });
    const segments = [...bar.querySelectorAll('[data-segment]')];
    expect(
      segments.map((s) => [s.getAttribute('data-segment'), s.getAttribute('data-count')])
    ).toEqual([
      ['review', '2'],
      ['prepare', '3']
    ]);
  });

  it('draws one stock segment per non-zero group, with the existing chart name', () => {
    const { v } = build({ stockCounts: { ok: 5, low: 0, out: 1, unknown: 2, neverCounted: 2 } });
    const view = render(<HomeLive v={v} />);
    const bar = view.getByRole('img', { name: '1 Out, 0 Low, 5 In stock, 2 Unknown count' });
    expect(
      [...bar.querySelectorAll('[data-segment]')].map((s) => [
        s.getAttribute('data-segment'),
        s.getAttribute('data-count')
      ])
    ).toEqual([
      ['out', '1'],
      ['ok', '5'],
      ['unknown', '2']
    ]);
    expect(view.getByText(/2 items have never been counted/)).toBeTruthy();
  });

  it('keeps a dash, never a zero, and no bar segments while orders are loading', () => {
    const { v } = build({ orders: null, stockCounts: null, month: null });
    const view = render(<HomeLive v={v} />);
    expect(view.getAllByText('—')).toHaveLength(3);
    expect(view.container.querySelectorAll('[data-segment]')).toHaveLength(0);
    expect(view.getByText('Orders are still loading.')).toBeTruthy();
    expect(view.getByText('Your books are still loading.')).toBeTruthy();
    expect(view.getByText('Stock is still loading.')).toBeTruthy();
  });

  it('keeps every quick action and opens the screen it opened before', () => {
    const { v, go } = build();
    const view = render(<HomeLive v={v} />);
    const press: Array<[RegExp, (typeof GO)[number]]> = [
      [/Start production/, 'production'],
      [/Add to inventory/, 'receive'],
      [/Count stock/, 'count'],
      [/Products & recipes/, 'products'],
      [/Shopping list/, 'shopping']
    ];
    for (const [name, key] of press) {
      fireEvent.click(view.getByRole('button', { name }));
      expect(go[key]).toHaveBeenCalledTimes(1);
    }
    expect(view.getByText('6 on the menu')).toBeTruthy();
  });

  it('keeps every link: orders, payments, stock, money, and each Needs you and work row', () => {
    const { v, go, home } = build();
    const view = render(<HomeLive v={v} />);
    fireEvent.click(view.getByRole('button', { name: 'Open orders' }));
    fireEvent.click(view.getByRole('button', { name: 'Open stock' }));
    fireEvent.click(view.getByRole('button', { name: 'Open Money' }));
    expect(go.orders).toHaveBeenCalledTimes(1);
    expect(go.stock).toHaveBeenCalledTimes(1);
    expect(go.money).toHaveBeenCalledTimes(1);
    // Payments to check opens from Needs you and from its count under Orders.
    const needs = within(view.getByRole('region', { name: 'Needs you' }));
    fireEvent.click(needs.getByRole('button', { name: /Payments to check/ }));
    fireEvent.click(view.getByRole('button', { name: /^2\s*Payments to check$/ }));
    expect(go.payments).toHaveBeenCalledTimes(2);
    fireEvent.click(needs.getByRole('button', { name: /Butter/ }));
    fireEvent.click(needs.getByRole('button', { name: /Pouch/ }));
    expect(home.stockAttention[0]!.open).toHaveBeenCalledTimes(1);
    expect(home.stockAttention[1]!.open).toHaveBeenCalledTimes(1);
    // A stock status is an icon and a word, not a colour.
    expect(needs.getByText('Out')).toBeTruthy();
    expect(needs.getByText('Low')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: /Happy Camper/ }));
    expect(home.production[0]!.open).toHaveBeenCalledTimes(1);
    expect(view.getByText('24 cookies · not recorded yet')).toBeTruthy();
    expect(view.container.querySelectorAll('[data-screen-label="Home"]')).toHaveLength(1);
  });

  it('shows the top three stock items and the rest behind Show all', () => {
    const rows = ['A', 'B', 'C', 'D', 'E'].map((name) => ({
      name,
      status: 'Low' as const,
      detail: 'low',
      open: vi.fn()
    }));
    const { v } = build({ stockAttention: rows });
    const view = render(<HomeLive v={v} />);
    const needs = within(view.getByRole('region', { name: 'Needs you' }));
    expect(needs.queryByRole('button', { name: /^D/ })).toBeNull();
    fireEvent.click(needs.getByRole('button', { name: 'Show all 5' }));
    expect(needs.getByRole('button', { name: /^E/ })).toBeTruthy();
  });

  it('shows where income went while income covers the costs, and nothing for a loss', () => {
    const view = render(<HomeLive v={build().v} />);
    const bar = view.getByRole('img', { name: '33% spent, 67% kept' });
    expect(bar.querySelector('[data-segment="spent"]')).not.toBeNull();
    expect(bar.querySelector('[data-segment="kept"]')).not.toBeNull();
    expect(view.getByText('₱67 kept of every ₱100')).toBeTruthy();
    cleanup();
    const loss = render(
      <HomeLive v={build({ month: { revenue: 1000, expenses: 3000, profit: -2000 } }).v} />
    );
    expect(loss.queryByText(/kept of every/)).toBeNull();
    expect(loss.getByText('Loss this month')).toBeTruthy();
  });

  it.each([
    [[160.15, -420.42, 0, 0, 0, 0, 0], '−₱260.27'],
    [[0, 0, 0, 0, 0, 0, -0.01], '−₱0.01'],
    [[0.1, 0.2, -0.3, 0, 0, 0, 0], '₱0.00'],
    [[12345678.91, 0, 0, 0, 0, 0, -0.01], '₱12,345,678.90']
  ])('keeps the signed weekly net to the centavo: %s', (amounts, expected) => {
    const week = amounts.map((income, i) => ({ label: `Day ${i}`, income, today: i === 6 }));
    const view = render(<HomeLive v={build({ week }).v} />);
    const region = view.getByRole('region', { name: 'Sales this week' });
    const card = within(region);
    // One animated visual and one stable screen-reader figure must agree.
    expect(region.querySelector('span.font-mono')?.textContent).toBe(expected + expected);
    expect(
      card.getByText(`Day 0: ₱${amounts[0]!.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`)
    ).toBeTruthy();
  });

  it('draws sales this week as seven bars, today last, with the figures as a list', () => {
    const week = ['Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon'].map((label, i) => ({
      label,
      income: [0, 300, 0, 1200, 0, -50, 400][i] ?? 0,
      today: i === 6
    }));
    const view = render(<HomeLive v={build({ week }).v} />);
    const card = within(view.getByRole('region', { name: 'Sales this week' }));
    expect(card.getAllByText('₱1,850.00').length).toBeGreaterThan(0);
    expect(card.getByText('Today: ₱400.00')).toBeTruthy();
    expect(card.getByText('Sun: −₱50.00')).toBeTruthy();
    expect(card.getByText('Below the line: refunds exceed sales.')).toBeTruthy();
    expect(view.container.querySelector('[data-net-cents="-5000"]')).not.toBeNull();
    const bars = view.container.querySelectorAll('[style*="--i"]');
    const heights = [...bars]
      .map((bar) => (bar as HTMLElement).style.height)
      .filter((height) => height.endsWith('%'));
    expect(heights).toEqual(['12.5%', '50%', '2.083333333333333%', '16.666666666666664%']);
    cleanup();
    const loading = render(<HomeLive v={build({ week: null }).v} />);
    expect(
      within(loading.getByRole('region', { name: 'Sales this week' })).getByText(
        'Sales are still loading.'
      )
    ).toBeTruthy();
  });
});
