import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InventoryLive } from '@/components/live/stock/inventory-live';
import { ITEMS, item, movement, stock, valsWith } from './stock-fixtures';
import type { LiveStockVals } from '@/lib/stock/live-stock-types';

afterEach(cleanup);
const draw = (liveStock: LiveStockVals | null) => render(<InventoryLive v={valsWith(liveStock)} />);

describe('B5 Inventory list', () => {
  it('shows "Stock is loading." and does not crash when liveStock is null', () => {
    draw(null);
    expect(screen.getByRole('heading', { level: 1, name: 'Inventory' })).toBeTruthy();
    expect(screen.getByText('Stock is loading.')).toBeTruthy();
  });

  it('shows the counts and every status as a word, not a colour alone', () => {
    draw(stock());
    const header = screen.getByLabelText('Stock counts');
    expect(header.textContent).toContain('3 items');
    expect(header.textContent).toContain('1 Out');
    expect(header.textContent).toContain('1 Low');
    const list = screen.getByRole('list', { name: 'Stock items' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText('Out')).toBeTruthy();
    expect(within(rows[1]!).getByText('Low')).toBeTruthy();
    expect(within(rows[2]!).getByText('Good')).toBeTruthy();
    expect(rows[1]!.textContent).toContain('Butter');
    expect(rows[1]!.textContent).toContain('300 g');
    expect(rows[1]!.textContent).toContain('Low below 500 g');
    expect(rows[1]!.textContent).toContain('Counted 3 Oct');
  });

  it('shows "Cost pending" verbatim and never a zero cost', () => {
    draw(stock());
    const rows = within(screen.getByRole('list', { name: 'Stock items' })).getAllByRole('listitem');
    expect(rows[0]!.textContent).toContain('Cost pending');
    expect(rows[0]!.textContent).not.toMatch(/₱0(\.00)?(?!\.\d)/);
  });

  it('chips filter, and the selected chip is aria-pressed', () => {
    draw(stock());
    const names = () =>
      within(screen.getByRole('list', { name: 'Stock items' }))
        .getAllByRole('listitem')
        .map((li) => li.textContent ?? '');
    expect(screen.getByRole('button', { name: /^All/ }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /^Out/ }));
    expect(screen.getByRole('button', { name: /^Out/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /^All/ }).getAttribute('aria-pressed')).toBe('false');
    expect(names()).toHaveLength(1);
    expect(names()[0]).toContain('Brown sugar');
    fireEvent.click(screen.getByRole('button', { name: /^Low/ }));
    expect(names()).toHaveLength(1);
    expect(names()[0]).toContain('Butter');
    fireEvent.click(screen.getByRole('button', { name: /^Good/ }));
    expect(names()[0]).toContain('Flour');
    fireEvent.click(screen.getByRole('button', { name: /^All/ }));
    expect(names()).toHaveLength(3);
  });

  it('a filter with no match says so, and an empty catalogue says "No items yet"', () => {
    const only = [ITEMS.Good];
    draw(stock({ items: only, counts: { total: 1, out: 0, low: 0 } }));
    fireEvent.click(screen.getByRole('button', { name: /^Out/ }));
    expect(screen.getByText('No items in this view.')).toBeTruthy();
    cleanup();
    draw(stock({ items: [], counts: { total: 0, out: 0, low: 0 } }));
    expect(screen.getByText('No items yet')).toBeTruthy();
  });

  it('a row is a button that opens the item', () => {
    const spy = vi.fn();
    const mine = item({ id: 'x', name: 'Oats', open: spy });
    draw(stock({ items: [mine], counts: { total: 1, out: 0, low: 0 } }));
    fireEvent.click(screen.getByRole('button', { name: /Oats/ }));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('shows the count note on the list header when there is one, and not otherwise', () => {
    draw(stock({ countNote: 'A count that finds less is booked as an expense.' }));
    expect(screen.getByText(/About counts: A count that finds less/)).toBeTruthy();
    cleanup();
    draw(stock());
    expect(screen.queryByText(/About counts/)).toBeNull();
  });

  it('says Offline when offline, and still draws the list', () => {
    draw(stock({ online: false }));
    expect(screen.getByText(/Offline/)).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Stock items' })).toBeTruthy();
    cleanup();
    draw(stock());
    expect(screen.queryByText(/Offline/)).toBeNull();
  });
});

describe('B5 Inventory item page', () => {
  const page = (over: Partial<NonNullable<LiveStockVals['page']>> = {}) => {
    const mine = item({
      id: 'p',
      name: 'Butter',
      qtyText: '300 g',
      status: 'Low',
      supplier: 'Dairy Direct'
    });
    return {
      mine,
      page: { item: mine, movementsState: 'ready' as const, movements: [], close: vi.fn(), ...over }
    };
  };

  it('shows the facts, a back button and the five actions that call their function', () => {
    const { mine, page: p } = page();
    draw(stock({ page: p }));
    expect(screen.getByRole('heading', { level: 1, name: 'Butter' })).toBeTruthy();
    const facts = screen.getByLabelText('Item facts');
    for (const text of [
      '300 g',
      'Low',
      'Low below 500 g',
      'Counted 3 Oct',
      '₱0.09 per g · average',
      'Dairy Direct',
      'Last paid ₱88.25 · 3 Oct'
    ])
      expect(facts.textContent).toContain(text);
    fireEvent.click(screen.getByRole('button', { name: 'Back to all items' }));
    expect(p.close).toHaveBeenCalledTimes(1);
    for (const [label, fn] of [
      ['Receive', mine.receive],
      ['Count', mine.count],
      ['Waste', mine.waste],
      ['Adjust', mine.adjust],
      ['Edit', mine.edit]
    ] as const) {
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(fn).toHaveBeenCalledTimes(1);
    }
  });

  it('leaves out "Last paid" when nothing was paid, and shows "Cost pending" as is', () => {
    const pending = item({ id: 'q', name: 'Salt', costText: 'Cost pending', lastPaidText: null });
    draw(
      stock({ page: { item: pending, movementsState: 'ready', movements: [], close: vi.fn() } })
    );
    const facts = screen.getByLabelText('Item facts');
    expect(facts.textContent).not.toContain('Last paid');
    expect(facts.textContent).toContain('Cost pending');
  });

  it('shows the count note above the actions when there is one', () => {
    const { page: p } = page();
    draw(stock({ page: p, countNote: 'Counts that find less are books expenses.' }));
    const note = screen.getByText(/About counts: Counts that find less/);
    const actions = screen.getByLabelText('Item actions');
    expect(note.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('movements: loading, unavailable and empty each say their line', () => {
    draw(stock({ page: page({ movementsState: 'loading' }).page }));
    const loading = screen.getByText('Loading movements…');
    expect(loading.closest('[aria-live="polite"]')).toBeTruthy();
    cleanup();
    draw(stock({ page: page({ movementsState: 'unavailable' }).page }));
    expect(screen.getByText('Movements are not available yet.')).toBeTruthy();
    cleanup();
    draw(stock({ page: page({ movementsState: 'ready', movements: [] }).page }));
    expect(screen.getByText('No movements yet.')).toBeTruthy();
  });

  it('movements: ready lists newest first with kind, change, cost, supplier, reason and Manila date', () => {
    const rows = [
      movement({ id: 'm1', kind: 'receipt', at: Date.UTC(2026, 9, 3, 6, 15) }),
      movement({
        id: 'm2',
        kind: 'waste',
        changeText: '−120 g',
        costText: null,
        supplier: '',
        reason: 'Spilled',
        at: Date.UTC(2026, 9, 1, 0, 5)
      }),
      movement({
        id: 'm3',
        kind: 'count',
        changeText: '−30 g',
        costText: 'Cost pending',
        reason: ''
      })
    ];
    draw(stock({ page: page({ movements: rows }).page }));
    const list = screen.getByRole('list', { name: 'Movements' });
    const lis = within(list).getAllByRole('listitem');
    expect(lis).toHaveLength(3);
    // Order is the contract's: newest first, as given.
    expect(lis[0]!.textContent).toContain('Receipt');
    expect(lis[0]!.textContent).toContain('+500 g');
    expect(lis[0]!.textContent).toContain('₱42.50');
    expect(lis[0]!.textContent).toContain('Mill & Co');
    expect(lis[0]!.textContent).toContain('Weekly delivery');
    expect(lis[0]!.textContent).toContain('3 Oct, 2:15 PM');
    expect(lis[1]!.textContent).toContain('Waste');
    expect(lis[1]!.textContent).toContain('−120 g');
    expect(lis[1]!.textContent).toContain('Spilled');
    // 1 Oct 00:05 UTC is 8:05 AM in Manila.
    expect(lis[1]!.textContent).toContain('1 Oct, 8:05 AM');
    expect(lis[1]!.textContent).not.toContain('₱');
    expect(lis[2]!.textContent).toContain('Count');
    expect(lis[2]!.textContent).toContain('Cost pending');
  });

  it('a movement kind of every sort is a word', () => {
    const kinds = ['opening', 'receipt', 'count', 'waste', 'adjust'] as const;
    const rows = kinds.map((kind, i) => movement({ id: `k${i}`, kind }));
    draw(stock({ page: page({ movements: rows }).page }));
    const text = screen.getByRole('list', { name: 'Movements' }).textContent ?? '';
    for (const word of ['Opening', 'Receipt', 'Count', 'Waste', 'Adjust'])
      expect(text).toContain(word);
  });
});
