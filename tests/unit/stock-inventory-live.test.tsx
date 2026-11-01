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
    expect(rows[1]!.textContent).toContain('1 kg bag · 1,000 g per pack');
    expect(rows[1]!.textContent).toContain('Counted 3 Oct');
  });

  it('shows "Cost pending" verbatim and never a zero cost', () => {
    draw(stock());
    const rows = within(screen.getByRole('list', { name: 'Stock items' })).getAllByRole('listitem');
    expect(rows[0]!.textContent).toContain('Cost pending');
    expect(rows[0]!.textContent).not.toMatch(/₱0(\.00)?(?!\.\d)/);
  });

  it('keeps retired items out of the working inventory and its counts', () => {
    draw(
      stock({
        items: [
          ITEMS.Good,
          item({ id: 'retired', name: 'Old jar', active: false, category: 'Ingredients' })
        ]
      })
    );
    expect(screen.queryByRole('button', { name: /Old jar|Retired supplies/ })).toBeNull();
    expect(screen.getByLabelText('Stock counts')).toHaveTextContent('1 item');
  });

  it('one status selector filters the current category', () => {
    draw(stock());
    const names = () =>
      within(screen.getByRole('list', { name: 'Stock items' }))
        .getAllByRole('listitem')
        .map((li) => li.textContent ?? '');
    const filter = screen.getByRole('combobox', { name: 'Stock status' });
    expect(filter).toHaveValue('All');
    fireEvent.change(filter, { target: { value: 'Out' } });
    expect(filter).toHaveValue('Out');
    expect(names()).toHaveLength(1);
    expect(names()[0]).toContain('Brown sugar');
    fireEvent.change(filter, { target: { value: 'Low' } });
    expect(names()).toHaveLength(1);
    expect(names()[0]).toContain('Butter');
    fireEvent.change(filter, { target: { value: 'Good' } });
    expect(names()[0]).toContain('Flour');
    fireEvent.change(filter, { target: { value: 'All' } });
    expect(names()).toHaveLength(3);
  });

  it('a filter with no match says so, and an empty catalogue says "No items yet"', () => {
    const only = [ITEMS.Good];
    draw(stock({ items: only, counts: { total: 1, out: 0, low: 0 } }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Stock status' }), {
      target: { value: 'Out' }
    });
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

  it('groups stock by category and retains the category and status after returning from an item', () => {
    const pack = item({ id: 'pack', name: 'Cookie pouch', category: 'Packaging', status: 'Low' });
    const view = stock({ items: [ITEMS.Good, pack] });
    const { rerender } = draw(view);
    expect(screen.queryByRole('button', { name: /Cookie pouch/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Packaging' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Stock status' }), {
      target: { value: 'Low' }
    });
    expect(screen.getByRole('button', { name: /Cookie pouch/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Flour/ })).toBeNull();
    rerender(
      <InventoryLive
        v={valsWith({
          ...view,
          page: { item: pack, movementsState: 'ready', movements: [], close: vi.fn() }
        })}
      />
    );
    rerender(<InventoryLive v={valsWith(view)} />);
    expect(screen.getByRole('button', { name: 'Packaging' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('combobox', { name: 'Stock status' })).toHaveValue('Low');
    expect(screen.getByRole('button', { name: /Cookie pouch/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ingredients' }));
    expect(screen.getByText('No items in this view.')).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'Stock status' }), {
      target: { value: 'All' }
    });
    expect(screen.getByRole('button', { name: /Flour/ })).toBeTruthy();
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

  it('shows pack/balance facts and keeps editing, receiving, counting and stock changes reachable', () => {
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
      '1 kg bag · 1,000 g per pack',
      'Last paid ₱88.25 · 3 Oct'
    ])
      expect(facts.textContent).toContain(text);
    fireEvent.click(screen.getByRole('button', { name: 'Back to inventory' }));
    expect(p.close).toHaveBeenCalledTimes(1);
    for (const [label, fn] of [
      ['Receive', mine.receive],
      ['Count', mine.count],
      ['Edit item', mine.edit]
    ] as const) {
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(fn).toHaveBeenCalledTimes(1);
    }
    for (const [label, run] of [
      ['Record waste', mine.waste],
      ['Correct stock', mine.adjust]
    ] as const) {
      fireEvent.click(screen.getByText('Waste or correction'));
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(run).toHaveBeenCalledOnce();
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
    const loading = screen.getByText('Loading stock history…');
    expect(loading.closest('[aria-live="polite"]')).toBeTruthy();
    cleanup();
    draw(stock({ page: page({ movementsState: 'unavailable' }).page }));
    expect(screen.getByText('Stock history is unavailable.')).toBeTruthy();
    cleanup();
    draw(stock({ page: page({ movementsState: 'ready', movements: [] }).page }));
    expect(screen.getByText('No stock changes recorded yet.')).toBeTruthy();
  });

  it('offers Retry history without requiring the owner to leave the item', () => {
    const retry = vi.fn();
    draw(stock({ page: page({ movementsState: 'unavailable', retry }).page }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry history' }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByRole('heading', { name: 'Butter', level: 1 })).toBeTruthy();
  });

  it('keeps archived history readable and editing reachable without offering stock movements', () => {
    const archived = item({ id: 'archived', name: 'Old flour', active: false });
    draw(
      stock({ page: { item: archived, movementsState: 'ready', movements: [], close: vi.fn() } })
    );
    expect(
      screen.getByText('This item is archived. Edit item to make it active again.')
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Receive' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Count' })).toBeNull();
    expect(screen.queryByText('Waste or correction')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit item' }));
    expect(archived.edit).toHaveBeenCalledOnce();
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
    const list = screen.getByRole('list', { name: 'Stock history' });
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
    const text = screen.getByRole('list', { name: 'Stock history' }).textContent ?? '';
    for (const word of ['Opening', 'Receipt', 'Count', 'Waste', 'Adjust'])
      expect(text).toContain(word);
  });
});
