import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  BazaarDayRow,
  BazaarEventView,
  CloseInput,
  DayPlanEditor,
  DayReviewView,
  LiveBazaarVals,
  ReviewFigure
} from '@/lib/bazaar/live-bazaar-types';
import type { OpsVals } from '@/view-models/vals';
import { BazaarLive } from '@/components/live/bazaar/bazaar-live';
import { DayReview } from '@/components/live/bazaar/day-review';
import { EventPage } from '@/components/live/bazaar/event-page';
import { DayPlan } from '@/components/live/bazaar/day-plan';
import { BooksForm } from '@/components/live/books-form';
import { BOOKS_COPY } from '@/lib/orders/staff-copy';

/**
 * S3 part 4: the screens that draw the day review, the event's money and the carried-over plan. They hold no rules: every
 * test hands them a view model made by hand and looks at the words, the fields and what the actions receive.
 */
afterEach(cleanup);

/** The number a stepper of the close form is showing, read from the button she would tap to type it. */
const shown = (form: HTMLElement, name: string): string | null =>
  within(within(form).getByRole('group', { name })).getByRole('button', {
    name: /Tap to type a number/
  }).textContent;

const noop = () => undefined;

const revenue: ReviewFigure = {
  key: 'day-revenue',
  label: 'Revenue',
  valueText: '₱880.00',
  cents: 88000,
  note: null,
  parts: [
    { label: 'Cash sales', detail: '4 sales', valueText: '₱500' },
    { label: 'GCash sales', detail: null, valueText: '₱380' }
  ]
};
const cost: ReviewFigure = {
  key: 'cost',
  label: 'Cookie cost',
  valueText: 'Cost pending',
  note: 'Add a cost per cookie to see this.',
  parts: []
};

const stockRow = (over: Partial<DayReviewView['stock'][number]> = {}) => ({
  productId: 'dcf',
  name: 'Double Chocolate Fudge',
  onTableText: '20 made · 8 carried over',
  goneText: '5 sold · 1 given away · 1 lost',
  shouldBeLeft: 21,
  countText: null,
  hasRecipe: true as boolean | null,
  made: 20,
  carried: 8,
  sold: 5,
  given: 1,
  lost: 1,
  countedLeft: null as number | null,
  ...over
});
const emptyRow = stockRow({
  productId: 'ns',
  name: 'Nutella Stuffed',
  onTableText: '10 made',
  goneText: '10 sold',
  shouldBeLeft: 0,
  made: 10,
  carried: 0,
  sold: 10,
  given: 0,
  lost: 0
});

const review = (over: Partial<DayReviewView> = {}): DayReviewView => ({
  dayId: 'day1',
  dateText: 'Sat, Oct 24',
  eventName: 'Katipunan market',
  state: 'open',
  online: true,
  notices: [],
  stock: [stockRow(), emptyRow],
  losses: [
    { id: 'l1', text: '1 Double Chocolate Fudge · Dropped · 24 Oct, 2:15 PM', remove: null }
  ],
  dayFigures: [revenue, cost],
  report: null,
  eventFigures: [
    {
      key: 'profit',
      label: 'Profit so far',
      valueText: '₱120',
      note: null,
      parts: [{ label: 'Fees', detail: 'Stall rent', valueText: '₱2,500' }]
    }
  ],
  eventNote: 'Another day is still open, so these will change.',
  flavours: [
    { id: 'dcf', name: 'Double Chocolate Fudge' },
    { id: 'ns', name: 'Nutella Stuffed' }
  ],
  addLoss: vi.fn(async () => null),
  addStock: vi.fn(async () => null),
  canAddCarried: true,
  close: {
    lastDay: false,
    cashExpectedText: '₱1,000.00',
    cashExpectedCents: 100000,
    cashExpectedPesos: '1000.00',
    blocked: null,
    submit: vi.fn(async () => null)
  },
  backText: 'Back to the event',
  back: noop,
  ...over
});

describe('the day review', () => {
  it('draws the heading, the state word, the notices and each cookie', () => {
    render(<DayReview review={review({ notices: ['Selling on another phone.'] })} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Review · Sat, Oct 24');
    expect(screen.getByText('Katipunan market')).toBeTruthy();
    expect(screen.getByText('Selling')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Selling on another phone.');
    expect(screen.getByText('20 made · 8 carried over')).toBeTruthy();
    expect(screen.getByText('5 sold · 1 given away · 1 lost')).toBeTruthy();
    expect(screen.getAllByText('Should be left: 21')).toHaveLength(2);
    expect(screen.getByText(/Dropped/)).toBeTruthy();
  });

  it('draws the day as stat tiles, each opening to its parts, and the event as figures', () => {
    const { container } = render(<DayReview review={review()} />);
    const tiles = within(screen.getByRole('list', { name: 'This day' }));
    for (const label of ['Revenue', 'Cookie cost', 'Sold', 'Should be left', 'Lost']) {
      expect(tiles.getByText(label), label).toBeTruthy();
    }
    expect(screen.getAllByText('₱880.00').length).toBeGreaterThan(0);
    expect(screen.getByText('₱120')).toBeTruthy();
    expect(screen.getByText('Another day is still open, so these will change.')).toBeTruthy();
    // The event so far is still a figure that opens; the day's own figures are tiles.
    expect(container.querySelectorAll('details')).toHaveLength(1);
    const revenueTile = tiles.getByRole('button', { name: /Revenue/ });
    expect(revenueTile.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(revenueTile);
    expect(revenueTile.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Cash sales · 4 sales')).toBeTruthy();
    expect(screen.getByText('₱500')).toBeTruthy();
    expect(screen.getByText('GCash sales')).toBeTruthy();
  });

  it('adds up the sold, left and lost tiles from the flavours, and opens them by flavour', () => {
    render(<DayReview review={review()} />);
    const tiles = within(screen.getByRole('list', { name: 'This day' }));
    // 5 + 10 sold, 21 + 0 should be left, 1 + 0 lost.
    expect(tiles.getByRole('button', { name: 'Sold 15 1 given away' })).toBeTruthy();
    expect(tiles.getByRole('button', { name: 'Should be left 21' })).toBeTruthy();
    expect(tiles.getByRole('button', { name: 'Lost 1' })).toBeTruthy();
    fireEvent.click(tiles.getByRole('button', { name: 'Sold 15 1 given away' }));
    expect(tiles.getByText('Nutella Stuffed').nextSibling?.textContent).toBe('10');
  });

  it('shows "Cost pending" in words, with its note, and never a peso zero', () => {
    const { container } = render(<DayReview review={review()} />);
    expect(screen.getByText('Cost pending')).toBeTruthy();
    expect(screen.getByText('Add a cost per cookie to see this.')).toBeTruthy();
    // The count-up starts from 0 for an amount that is known; the unknown cost is words and has none.
    const tile = screen.getByText('Cookie cost').closest('[data-state]') as HTMLElement;
    expect(tile.textContent).not.toContain('₱');
    expect(container.textContent).not.toContain('₱0.00 Cost');
  });

  it('pre-fills the close: every flavour starts with what should be left, all of it carried over', () => {
    const r = review();
    render(<DayReview review={r} />);
    const form = screen.getByRole('form', { name: 'Close the day' });
    expect(within(form).getAllByRole('listitem')).toHaveLength(2);
    expect(within(form).getByText('Nutella Stuffed')).toBeTruthy();
    expect(within(form).getByText('Should be left: 0')).toBeTruthy();
    expect(shown(form, 'Double Chocolate Fudge: left')).toBe('21');
    expect(shown(form, 'Double Chocolate Fudge: carried over')).toBe('21');
    expect(shown(form, 'Double Chocolate Fudge: to the shop')).toBe('0');
    expect(shown(form, 'Double Chocolate Fudge: written off')).toBe('0');
    expect(shown(form, 'Nutella Stuffed: left')).toBe('0');
    expect(shown(form, 'Nutella Stuffed: carried over')).toBe('0');
    // The cash is pre-filled with what the drawer should hold (Ethan, 16 Oct).
    expect((within(form).getByLabelText('Cash counted (₱)') as HTMLInputElement).value).toBe(
      '1000.00'
    );
    expect(within(form).getByText('Matches')).toBeTruthy();
    expect(within(form).getByText('Cash expected in the drawer: ₱1,000.00')).toBeTruthy();
    expect(within(form).getByText('Leave blank if you did not count it.')).toBeTruthy();
  });

  it('closes with the defaults: what is sent is what is shown', async () => {
    const r = review();
    render(<DayReview review={r} />);
    const form = screen.getByRole('form', { name: 'Close the day' });
    fireEvent.click(within(form).getByRole('button', { name: 'Close the day' }));
    await waitFor(() => expect(r.close?.submit).toHaveBeenCalledTimes(1));
    const sent = vi.mocked(r.close?.submit ?? vi.fn()).mock.calls[0]?.[0] as CloseInput;
    expect(sent).toEqual({
      countedPesos: '1000.00',
      rows: [
        { productId: 'dcf', left: '21', carryNext: '21', toShop: '0', writtenOff: '0' },
        { productId: 'ns', left: '0', carryNext: '0', toShop: '0', writtenOff: '0' }
      ]
    });
  });

  it('clearing the cash sends it blank: not counted', async () => {
    const r = review();
    render(<DayReview review={r} />);
    fireEvent.change(screen.getByLabelText('Cash counted (₱)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close the day' }));
    await waitFor(() => expect(r.close?.submit).toHaveBeenCalledTimes(1));
    const sent = vi.mocked(r.close?.submit ?? vi.fn()).mock.calls[0]?.[0] as CloseInput;
    expect(sent.countedPesos).toBe('');
  });

  it('the rest follows what she changes, and the close sends exactly what the steppers show', async () => {
    const r = review();
    render(<DayReview review={r} />);
    const form = screen.getByRole('form', { name: 'Close the day' });
    const press = (name: string) => fireEvent.click(within(form).getByRole('button', { name }));
    press('Fewer Double Chocolate Fudge: left'); // 20 left, all carried
    expect(shown(form, 'Double Chocolate Fudge: carried over')).toBe('20');
    press('More Double Chocolate Fudge: to the shop'); // 1 to the shop, 19 carried
    press('More Double Chocolate Fudge: written off'); // 1 written off, 18 carried
    expect(shown(form, 'Double Chocolate Fudge: left')).toBe('20');
    expect(shown(form, 'Double Chocolate Fudge: carried over')).toBe('18');
    expect(shown(form, 'Double Chocolate Fudge: to the shop')).toBe('1');
    expect(shown(form, 'Double Chocolate Fudge: written off')).toBe('1');
    fireEvent.click(within(form).getByRole('button', { name: 'Close the day' }));
    await waitFor(() => expect(r.close?.submit).toHaveBeenCalledTimes(1));
    const sent = vi.mocked(r.close?.submit ?? vi.fn()).mock.calls[0]?.[0] as CloseInput;
    expect(sent.rows[0]).toEqual({
      productId: 'dcf',
      left: '20',
      carryNext: '18',
      toShop: '1',
      writtenOff: '1'
    });
  });

  it('says so, in words, when the parts she set do not add up to what is left', () => {
    render(<DayReview review={review()} />);
    const form = screen.getByRole('form', { name: 'Close the day' });
    // 21 left; 20 to the shop leaves 1 carried over, which is fine. Lowering Left under what she sent away does not add up.
    for (let i = 0; i < 21; i++)
      fireEvent.click(
        within(form).getByRole('button', { name: 'More Double Chocolate Fudge: to the shop' })
      );
    for (let i = 0; i < 5; i++)
      fireEvent.click(
        within(form).getByRole('button', { name: 'Fewer Double Chocolate Fudge: left' })
      );
    expect(
      within(form).getByText(
        'The 16 left must be split into carried over, to the shop and written off. These add up to 21.'
      )
    ).toBeTruthy();
  });

  it('keeps what she changed when the review is drawn again with new figures, and moves the rest', () => {
    const r = review();
    const { rerender } = render(<DayReview review={r} />);
    const form = () => screen.getByRole('form', { name: 'Close the day' });
    fireEvent.click(
      within(form()).getByRole('button', { name: 'More Double Chocolate Fudge: written off' })
    );
    rerender(<DayReview review={{ ...r, stock: [stockRow({ shouldBeLeft: 19 }), emptyRow] }} />);
    expect(shown(form(), 'Double Chocolate Fudge: written off')).toBe('1');
    // Untouched: Left follows the new "should be left", and the rest of it is carried over.
    expect(shown(form(), 'Double Chocolate Fudge: left')).toBe('19');
    expect(shown(form(), 'Double Chocolate Fudge: carried over')).toBe('18');
    expect(screen.getAllByText('Should be left: 19')).toHaveLength(2);
  });

  it('on the last day: no carried over, and the leftover goes to the shop when the flavour has a recipe', async () => {
    const base = review();
    const r = review({
      stock: [stockRow({ hasRecipe: true }), stockRow({ ...emptyRow, hasRecipe: false })],
      close: { ...(base.close as NonNullable<typeof base.close>), lastDay: true }
    });
    render(<DayReview review={r} />);
    const form = screen.getByRole('form', { name: 'Close the day' });
    expect(within(form).queryByRole('group', { name: /carried over/ })).toBeNull();
    expect(shown(form, 'Double Chocolate Fudge: to the shop')).toBe('21');
    expect(shown(form, 'Double Chocolate Fudge: written off')).toBe('0');
    fireEvent.click(within(form).getByRole('button', { name: 'Close the day' }));
    await waitFor(() => expect(r.close?.submit).toHaveBeenCalled());
    const sent = vi.mocked(r.close?.submit ?? vi.fn()).mock.calls[0]?.[0] as CloseInput;
    expect(sent.rows[0]).toEqual({
      productId: 'dcf',
      left: '21',
      carryNext: '',
      toShop: '21',
      writtenOff: '0'
    });
  });

  it('on the last day, a flavour with no recipe is written off, and an unknown one asks her to choose', () => {
    const base = review();
    const close = { ...(base.close as NonNullable<typeof base.close>), lastDay: true };
    const { unmount } = render(
      <DayReview review={review({ stock: [stockRow({ hasRecipe: false }), emptyRow], close })} />
    );
    const form = screen.getByRole('form', { name: 'Close the day' });
    expect(shown(form, 'Double Chocolate Fudge: to the shop')).toBe('0');
    expect(shown(form, 'Double Chocolate Fudge: written off')).toBe('21');
    unmount();
    render(
      <DayReview review={review({ stock: [stockRow({ hasRecipe: null }), emptyRow], close })} />
    );
    expect(
      screen.getByText('Choose where the 21 left go: to the shop or written off.')
    ).toBeTruthy();
  });

  describe('the drawer', () => {
    const form = () => screen.getByRole('form', { name: 'Close the day' });
    const cash = () => within(form()).getByLabelText('Cash counted (₱)') as HTMLInputElement;
    const type = (value: string) => fireEvent.change(cash(), { target: { value } });
    const closeButton = () => within(form()).getByRole('button', { name: 'Close the day' });

    it('says over, short or matches as she types', () => {
      render(<DayReview review={review()} />);
      type('1020');
      expect(within(form()).getByText('Over ₱20.00')).toBeTruthy();
      type('980.50');
      expect(within(form()).getByText('Short ₱19.50')).toBeTruthy();
      type('1000');
      expect(within(form()).getByText('Matches')).toBeTruthy();
      type('');
      expect(within(form()).queryByText(/Over|Short|Matches/)).toBeNull();
    });

    it('lets a difference at the line through without a question', async () => {
      const r = review();
      render(<DayReview review={r} />);
      type('1100'); // exactly ₱100.00 over ₱1,000.00
      expect(screen.queryByRole('alert')).toBeNull();
      fireEvent.click(closeButton());
      await waitFor(() => expect(r.close?.submit).toHaveBeenCalledTimes(1));
    });

    it('asks to count again above the line, and does not close until she keeps the amount', async () => {
      const r = review();
      render(<DayReview review={r} />);
      type('2000');
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toContain('That is ₱1,000.00 over. Count the drawer again?');
      fireEvent.click(closeButton());
      fireEvent.submit(form());
      expect(r.close?.submit).not.toHaveBeenCalled();
      fireEvent.click(within(alert).getByRole('button', { name: 'Keep ₱2,000.00' }));
      expect(screen.queryByRole('alert')).toBeNull();
      fireEvent.click(closeButton());
      await waitFor(() => expect(r.close?.submit).toHaveBeenCalledTimes(1));
      const sent = vi.mocked(r.close?.submit ?? vi.fn()).mock.calls[0]?.[0] as CloseInput;
      expect(sent.countedPesos).toBe('2000');
    });

    it('count again moves her back to the field, and a different amount asks again', () => {
      render(<DayReview review={review()} />);
      type('2000');
      fireEvent.click(screen.getByRole('button', { name: 'Count again' }));
      expect(document.activeElement).toBe(cash());
      fireEvent.click(screen.getByRole('button', { name: 'Keep ₱2,000.00' }));
      expect(screen.queryByRole('alert')).toBeNull();
      type('3000');
      expect(screen.getByRole('alert').textContent).toContain('That is ₱2,000.00 over');
    });

    it('asks when nothing was expected and ₱1,000.00 is typed (Ateneo A3)', () => {
      const base = review();
      const close = {
        ...(base.close as NonNullable<typeof base.close>),
        cashExpectedCents: 0,
        cashExpectedPesos: '0.00',
        cashExpectedText: '₱0.00'
      };
      render(<DayReview review={review({ close })} />);
      type('1000');
      expect(screen.getByRole('alert').textContent).toContain(
        'That is ₱1,000.00 over. Count the drawer again?'
      );
      expect(screen.getByRole('button', { name: 'Keep ₱1,000.00' })).toBeTruthy();
    });
  });

  it('leaves out "Carried over" on the last day and sends it blank', async () => {
    const base = review();
    const r = review({
      close: { ...(base.close as NonNullable<typeof base.close>), lastDay: true }
    });
    render(<DayReview review={r} />);
    const form = screen.getByRole('form', { name: 'Close the day' });
    expect(within(form).queryByRole('group', { name: /carried over/ })).toBeNull();
    fireEvent.click(within(form).getByRole('button', { name: 'Close the day' }));
    await waitFor(() => expect(r.close?.submit).toHaveBeenCalled());
    const sent = vi.mocked(r.close?.submit ?? vi.fn()).mock.calls[0]?.[0] as CloseInput;
    expect(sent.rows.every((row) => row.carryNext === '')).toBe(true);
  });

  it('puts the carried-over field in the Add stock form only when carrying is possible', () => {
    const { unmount } = render(<DayReview review={review({ canAddCarried: true })} />);
    const form = screen.getByRole('form', { name: 'Add stock' });
    expect(within(form).getByLabelText('Kind')).toBeTruthy();
    expect(within(form).getByRole('option', { name: 'Made today' })).toBeTruthy();
    expect(within(form).getByRole('option', { name: 'Carried over' })).toBeTruthy();
    unmount();
    render(<DayReview review={review({ canAddCarried: false })} />);
    expect(within(screen.getByRole('form', { name: 'Add stock' })).queryByLabelText('Kind')).toBe(
      null
    );
  });

  it('disables the close and says why when it is blocked', () => {
    const base = review();
    const close = {
      ...(base.close as NonNullable<typeof base.close>),
      blocked: 'Another phone is still selling.'
    };
    render(<DayReview review={review({ close })} />);
    const button = screen.getByRole('button', { name: 'Close the day' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText('Another phone is still selling.')).toBeTruthy();
    fireEvent.submit(screen.getByRole('form', { name: 'Close the day' }));
    expect(close.submit).not.toHaveBeenCalled();
  });

  it('shows the words a close answers with as an alert, and keeps the form', async () => {
    const base = review();
    const close = {
      ...(base.close as NonNullable<typeof base.close>),
      submit: vi.fn(async () => 'Count the cookies first.')
    };
    render(<DayReview review={review({ close })} />);
    const form = screen.getByRole('form', { name: 'Close the day' });
    for (let i = 0; i < 4; i++)
      fireEvent.click(
        within(form).getByRole('button', { name: 'Fewer Double Chocolate Fudge: left' })
      );
    fireEvent.click(screen.getByRole('button', { name: 'Close the day' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Count the cookies first.');
    expect(shown(form, 'Double Chocolate Fudge: left')).toBe('17');
  });

  it('draws no form at all for a closed day, and its count in words', () => {
    render(
      <DayReview
        review={review({
          state: 'closed',
          stock: [stockRow({ countText: '13 left: 8 carried over, 3 to the shop, 2 written off' })],
          addLoss: null,
          addStock: null,
          close: null
        })}
      />
    );
    expect(screen.queryAllByRole('form')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Close the day' })).toBeNull();
    expect(screen.getByText('Closed')).toBeTruthy();
    expect(screen.getByText('13 left: 8 carried over, 3 to the shop, 2 written off')).toBeTruthy();
    expect(screen.queryByText(/Should be left/)).toBeNull();
  });

  it('passes the typed strings of a loss on, clears the form when saved, and shows the words when not', async () => {
    const addLoss = vi.fn(async (): Promise<string | null> => 'Say how many.');
    render(<DayReview review={review({ addLoss })} />);
    const form = screen.getByRole('form', { name: 'Record a loss' });
    fireEvent.change(within(form).getByLabelText('Flavour'), { target: { value: 'ns' } });
    fireEvent.change(within(form).getByLabelText('How many'), { target: { value: '2' } });
    fireEvent.change(within(form).getByLabelText('What happened'), {
      target: { value: 'Dropped' }
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Record the loss' }));
    await waitFor(() =>
      expect(addLoss).toHaveBeenCalledWith({ productId: 'ns', qty: '2', reason: 'Dropped' })
    );
    expect((await within(form).findByRole('alert')).textContent).toBe('Say how many.');
    expect((within(form).getByLabelText('How many') as HTMLInputElement).value).toBe('2');
    addLoss.mockResolvedValueOnce(null);
    fireEvent.click(within(form).getByRole('button', { name: 'Record the loss' }));
    await waitFor(() =>
      expect((within(form).getByLabelText('How many') as HTMLInputElement).value).toBe('')
    );
    expect((within(form).getByLabelText('What happened') as HTMLInputElement).value).toBe('');
  });

  it('passes the typed strings of added stock on', async () => {
    const addStock = vi.fn(async (): Promise<string | null> => null);
    render(<DayReview review={review({ addStock })} />);
    const form = screen.getByRole('form', { name: 'Add stock' });
    fireEvent.change(within(form).getByLabelText('How many'), { target: { value: '6' } });
    fireEvent.change(within(form).getByLabelText('Kind'), { target: { value: 'carried' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add to the table' }));
    await waitFor(() =>
      expect(addStock).toHaveBeenCalledWith({ productId: 'dcf', qty: '6', kind: 'carried' })
    );
  });
});

const livePanel = (over: Partial<LiveBazaarVals> = {}): LiveBazaarVals => ({
  online: true,
  eventsRead: true,
  state: 'read',
  list: [],
  event: null,
  editor: null,
  reviewing: false,
  tillPanel: null,
  review: null,
  closeReview: noop,
  add: noop,
  readHub: noop,
  addEvent: async () => null,
  justAdded: null,
  retry: noop,
  back: noop,
  ...over
});
// A phone that holds an event: the till would be drawn if the review were not ahead of it.
const valsWith = (liveBazaar: LiveBazaarVals) =>
  ({ event: { name: 'Katipunan market' }, liveBazaar }) as unknown as OpsVals;

describe('the Bazaar screen with a review open', () => {
  it('draws the review ahead of the till', () => {
    render(<BazaarLive v={valsWith(livePanel({ reviewing: true, review: review() }))} />);
    expect(screen.getByRole('region', { name: 'Review of Sat, Oct 24' })).toBeTruthy();
  });

  it('says a day is being read while it loads', () => {
    render(<BazaarLive v={valsWith(livePanel({ reviewing: true, state: 'loading' }))} />);
    expect(screen.getByText('Reading this day…')).toBeTruthy();
  });

  it('draws the "could not be read" panel with Try again and Back when the read failed', () => {
    const retry = vi.fn();
    const closeReview = vi.fn();
    render(
      <BazaarLive
        v={valsWith(livePanel({ reviewing: true, state: 'failed', retry, closeReview }))}
      />
    );
    expect(screen.getByRole('alert').textContent).toBe(
      'This day could not be read. Check the signal and try again.'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(closeReview).toHaveBeenCalledTimes(1);
  });
});

const dayRow = (over: Partial<BazaarDayRow> = {}): BazaarDayRow => ({
  id: 'day1',
  dateText: 'Sat, Oct 24',
  word: 'Selling',
  cookiesText: '25 cookies on the table',
  floatText: 'Float ₱500',
  lines: [],
  edit: null,
  action: 'review',
  actionNote: null,
  hint: 'Selling on Ethan’s phone.',
  run: noop,
  ...over
});

const eventView = (over: Partial<BazaarEventView> = {}): BazaarEventView => ({
  id: 'b1',
  name: 'Katipunan market',
  placeText: 'Katipunan Ave, QC',
  datesText: 'Sat, Oct 24 – Sun, Oct 25',
  rentText: 'Stall rent ₱2,500',
  days: [
    dayRow(),
    dayRow({ id: 'day2', dateText: 'Sun, Oct 25', word: 'Closed', action: 'see', hint: null })
  ],
  notices: ['This event was changed after it was closed.'],
  fees: [
    { id: 'rent', text: 'Stall rent · Whole event', amountText: '₱2,500', remove: null },
    { id: 'f1', text: 'Permit · Whole event · Oct 24', amountText: '₱200', remove: null }
  ],
  feesTotalText: '₱2,700',
  feeFor: [
    { dayId: null, text: 'The whole event' },
    { dayId: 'day1', text: 'Sat, Oct 24' }
  ],
  addFee: vi.fn(async () => null),
  targetText: '₱500',
  targetPesos: '500',
  saveTarget: vi.fn(async () => null),
  costs: [
    {
      productId: 'dcf',
      name: 'Double Chocolate Fudge',
      text: '₱12.005 per cookie · from the recipe',
      typedPesos: '',
      save: vi.fn(async () => null)
    }
  ],
  figures: [revenue],
  figuresNote: 'A day is still open.',
  finalise: { blocked: null, run: vi.fn(async () => null) },
  unplanned: [],
  planDay: noop,
  back: noop,
  ...over
});

describe('the event page', () => {
  it('draws the notices, the day hints and the two review actions', () => {
    render(<EventPage event={eventView()} />);
    expect(screen.getByText('This event was changed after it was closed.')).toBeTruthy();
    expect(screen.getByText('Selling on Ethan’s phone.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Review and close' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'See the review' })).toBeTruthy();
  });

  it('draws the fees, adds one with the typed strings, and clears the form when saved', async () => {
    const addFee = vi.fn(async (): Promise<string | null> => null);
    render(<EventPage event={eventView({ addFee })} />);
    expect(screen.getByText('Permit · Whole event · Oct 24')).toBeTruthy();
    expect(screen.getByText('Total ₱2,700')).toBeTruthy();
    const form = screen.getByRole('form', { name: 'Add a fee' });
    fireEvent.change(within(form).getByLabelText('What for'), { target: { value: 'Parking' } });
    fireEvent.change(within(form).getByLabelText('Amount (₱)'), { target: { value: '150' } });
    fireEvent.change(within(form).getByLabelText('For'), { target: { value: 'day1' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add the fee' }));
    await waitFor(() =>
      expect(addFee).toHaveBeenCalledWith({ label: 'Parking', amount: '150', dayId: 'day1' })
    );
    await waitFor(() =>
      expect((within(form).getByLabelText('What for') as HTMLInputElement).value).toBe('')
    );
  });

  it('sends a fee for the whole event with a null day', async () => {
    const addFee = vi.fn(async (): Promise<string | null> => null);
    render(<EventPage event={eventView({ addFee })} />);
    const form = screen.getByRole('form', { name: 'Add a fee' });
    fireEvent.change(within(form).getByLabelText('What for'), { target: { value: 'Tarp' } });
    fireEvent.change(within(form).getByLabelText('Amount (₱)'), { target: { value: '90' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add the fee' }));
    await waitFor(() =>
      expect(addFee).toHaveBeenCalledWith({ label: 'Tarp', amount: '90', dayId: null })
    );
  });

  it('draws the target and saves what is typed', async () => {
    const saveTarget = vi.fn(async (): Promise<string | null> => null);
    render(<EventPage event={eventView({ saveTarget })} />);
    const form = screen.getByRole('form', { name: 'Target profit' });
    const target = within(form).getByLabelText('Target (₱)') as HTMLInputElement;
    expect(target.value).toBe('500');
    fireEvent.change(target, { target: { value: '800' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save the target' }));
    await waitFor(() => expect(saveTarget).toHaveBeenCalledWith('800'));
  });

  it('draws each cost per cookie with its own form', async () => {
    const save = vi.fn(async (): Promise<string | null> => null);
    const e = eventView();
    const first = e.costs[0];
    if (!first) throw new Error('a cost');
    render(<EventPage event={{ ...e, costs: [{ ...first, save }] }} />);
    expect(screen.getByText('₱12.005 per cookie · from the recipe')).toBeTruthy();
    const form = screen.getByRole('form', { name: 'Cost per cookie for Double Chocolate Fudge' });
    expect(within(form).getByText("Leave blank to use the recipe's cost.")).toBeTruthy();
    fireEvent.change(within(form).getByLabelText('Your cost per cookie (₱)'), {
      target: { value: '28.75' }
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Save the cost' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith('28.75'));
  });

  it('draws the event figures and leaves out the sections that have nothing', () => {
    const { unmount } = render(<EventPage event={eventView()} />);
    expect(screen.getByRole('heading', { name: 'The event' })).toBeTruthy();
    expect(screen.getByText('A day is still open.')).toBeTruthy();
    expect(screen.getByText('₱880.00')).toBeTruthy();
    unmount();
    render(
      <EventPage
        event={eventView({
          figures: [],
          costs: [],
          finalise: null,
          addFee: null,
          saveTarget: null
        })}
      />
    );
    expect(screen.queryByRole('heading', { name: 'The event' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Cost per cookie' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Close the event' })).toBeNull();
    expect(screen.queryAllByRole('form')).toHaveLength(0);
  });

  it('closes the event in two steps', async () => {
    const run = vi.fn(async (): Promise<string | null> => 'Close the open day first.');
    render(<EventPage event={eventView({ finalise: { blocked: null, run } })} />);
    expect(
      screen.getByText(
        'Closing the event counts its sales, fees and stock in the books. It cannot be undone.'
      )
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close the event' }));
    expect(run).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Not yet' }));
    expect(screen.getByRole('button', { name: 'Close the event' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close the event' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, close the event' }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect((await screen.findByRole('alert')).textContent).toBe('Close the open day first.');
  });

  it('disables closing the event and says why when it is blocked', () => {
    render(
      <EventPage
        event={eventView({
          finalise: { blocked: 'A day is still open.', run: vi.fn(async () => null) }
        })}
      />
    );
    expect(
      (screen.getByRole('button', { name: 'Close the event' }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(screen.getAllByText('A day is still open.').length).toBeGreaterThan(0);
  });
});

const planEditor = (over: Partial<DayPlanEditor> = {}): DayPlanEditor => ({
  dayId: 'day2',
  key: 'k1',
  dateText: 'Sun, Oct 25',
  isNew: true,
  floatPesos: '',
  flavours: [
    { id: 'dcf', name: 'Double Chocolate Fudge', made: '', carried: '', price: '125' },
    { id: 'ns', name: 'Nutella Stuffed', made: '', carried: '', price: '140' }
  ],
  showCarried: true,
  copy: null,
  carryIn: { dateText: 'Sat, Oct 24', byFlavour: { dcf: 8 } },
  save: vi.fn(async () => null),
  back: noop,
  ...over
});

describe('the day plan with cookies carried over', () => {
  const carriedInputs = () => screen.getAllByLabelText('Carried over') as HTMLInputElement[];

  it('fills a new day from what was set aside and says where it came from', () => {
    render(<DayPlan editor={planEditor()} online />);
    expect(carriedInputs().map((i) => i.value)).toEqual(['8', '']);
    expect(screen.getByText('8 set aside on Sat, Oct 24')).toBeTruthy();
    expect(screen.queryByText(/set aside.*Nutella/)).toBeNull();
  });

  it('leaves a saved plan as it is, and refills on the button', () => {
    render(<DayPlan editor={planEditor({ isNew: false })} online />);
    expect(carriedInputs().map((i) => i.value)).toEqual(['', '']);
    fireEvent.click(
      screen.getByRole('button', { name: 'Use what was carried over from Sat, Oct 24' })
    );
    expect(carriedInputs().map((i) => i.value)).toEqual(['8', '']);
  });

  it('copies the day before with the carried-over numbers, not blanks', () => {
    const e = planEditor({
      isNew: false,
      copy: {
        floatPesos: '500',
        dateText: 'Sat, Oct 24',
        flavours: [
          { id: 'dcf', name: 'Double Chocolate Fudge', made: '20', carried: '3', price: '125' },
          { id: 'ns', name: 'Nutella Stuffed', made: '10', carried: '2', price: '140' }
        ]
      }
    });
    render(<DayPlan editor={e} online />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy the day before (Sat, Oct 24)' }));
    expect(carriedInputs().map((i) => i.value)).toEqual(['8', '']);
    expect((screen.getAllByLabelText('Made') as HTMLInputElement[]).map((i) => i.value)).toEqual([
      '20',
      '10'
    ]);
  });

  it('changes nothing with no carry-in', () => {
    render(<DayPlan editor={planEditor({ carryIn: null })} online />);
    expect(carriedInputs().map((i) => i.value)).toEqual(['', '']);
    expect(screen.queryByText(/set aside on/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Use what was carried over/ })).toBeNull();
  });
});

describe('the books form', () => {
  const books = (held?: Array<{ id: string; name: string; detail: string }>) =>
    ({
      online: true,
      basis: 'bought',
      receipts: [],
      unpaid: null,
      held,
      setBasis: noop,
      correct: noop,
      download: noop,
      close: noop
    }) as NonNullable<OpsVals['liveBooks']>;

  it('shows the sales held back until the event is closed', () => {
    render(
      <BooksForm
        liveBooks={books([{ id: 'b1', name: 'Katipunan market', detail: '12 sales · ₱1,480' }])}
      />
    );
    expect(screen.getByText(BOOKS_COPY.heldTitle)).toBeTruthy();
    expect(screen.getByText(BOOKS_COPY.heldNote)).toBeTruthy();
    expect(screen.getByText('Katipunan market')).toBeTruthy();
    expect(screen.getByText('12 sales · ₱1,480')).toBeTruthy();
  });

  it('shows no such card when nothing is held', () => {
    render(<BooksForm liveBooks={books()} />);
    expect(screen.queryByText(BOOKS_COPY.heldTitle)).toBeNull();
  });
});

describe('a closed day (U5)', () => {
  const report = {
    tables: [
      {
        caption: 'Takings',
        lines: [
          { label: 'Before discounts and freebies', detail: '9 sales', cents: 104000 },
          { label: 'Discounts', cents: -1000 },
          { label: 'Given away', detail: 'At their price', cents: -15000 }
        ],
        totalCents: 88000
      },
      {
        caption: 'How it was paid',
        lines: [
          { label: 'Cash', cents: 50000 },
          { label: 'GCash', cents: 38000 }
        ],
        totalCents: 88000
      },
      { caption: 'Fees', lines: [], totalCents: 0 },
      {
        caption: 'Drawer',
        lines: [
          { label: 'Float', cents: 50000 },
          { label: 'Cash sales', cents: 50000 }
        ],
        totalCents: 100000,
        note: 'Counted ₱995.00 · ₱5.00 short'
      }
    ]
  };
  const closedReview = (over: Partial<DayReviewView> = {}) =>
    review({
      state: 'closed',
      stock: [stockRow({ countText: '13 left', countedLeft: 13 }), emptyRow],
      addLoss: null,
      addStock: null,
      close: null,
      report,
      ...over
    });

  it('draws the Z-report as receipts whose lines add up to the totals', () => {
    render(<DayReview review={closedReview()} />);
    const section = within(screen.getByRole('region', { name: 'Day summary' }));
    for (const caption of ['Takings', 'How it was paid', 'Fees', 'Drawer'])
      expect(section.getByRole('table', { name: caption }), caption).toBeTruthy();
    const takings = within(section.getByRole('table', { name: 'Takings' }));
    expect(takings.getByText('Before discounts and freebies')).toBeTruthy();
    expect(takings.getByText('₱1,040.00')).toBeTruthy();
    expect(takings.getByText('-₱10.00')).toBeTruthy();
    expect(takings.getByText('-₱150.00')).toBeTruthy();
    expect(takings.getByText('Revenue').nextSibling?.textContent).toBe('₱880.00');
    const drawer = section.getByRole('table', { name: 'Drawer' });
    expect(within(drawer).getByText('Expected').nextSibling?.textContent).toBe('₱1,000.00');
    expect(section.getByText('Counted ₱995.00 · ₱5.00 short')).toBeTruthy();
    expect(section.getByText('No fees for this day')).toBeTruthy();
    const flavours = within(section.getByRole('table', { name: /by flavour/i }));
    expect(flavours.getByText('Double Chocolate Fudge')).toBeTruthy();
  });

  it('shows the Closed pill, the counted left as a tile, and no close form', () => {
    const { container } = render(<DayReview review={closedReview()} />);
    expect(container.querySelector('[data-status="closed"]')?.textContent).toBe('Closed');
    expect(container.querySelector('[data-status="selling"]')).toBeNull();
    const tiles = within(screen.getByRole('list', { name: 'This day' }));
    expect(tiles.getByRole('button', { name: 'Left 13' })).toBeTruthy();
    expect(screen.queryByRole('form', { name: 'Close the day' })).toBeNull();
  });

  it('an open day shows the Selling pill and no summary', () => {
    const { container } = render(<DayReview review={review()} />);
    expect(container.querySelector('[data-status="selling"]')?.textContent).toBe('Selling');
    expect(screen.queryByRole('region', { name: 'Day summary' })).toBeNull();
  });

  it('settles the tiles once when the day closes while the review is open, and not for a day opened closed', () => {
    const open = review();
    const { rerender, container } = render(<DayReview review={open} />);
    const tiles = () => container.querySelector('ul[aria-label="This day"]') as HTMLElement;
    expect(tiles().className).not.toContain('motion-settle');
    rerender(<DayReview review={closedReview()} />);
    expect(tiles().className).toContain('motion-settle');
    cleanup();
    const fresh = render(<DayReview review={closedReview()} />);
    expect(
      (fresh.container.querySelector('ul[aria-label="This day"]') as HTMLElement).className
    ).not.toContain('motion-settle');
  });
});

describe('the pre-filled cash (U5)', () => {
  it('follows the expected cash until she changes it, and It matches puts it back', () => {
    const r = review();
    const { rerender } = render(<DayReview review={r} />);
    const cash = () => screen.getByLabelText('Cash counted (₱)') as HTMLInputElement;
    const moved = {
      ...r,
      close: {
        ...(r.close as NonNullable<typeof r.close>),
        cashExpectedCents: 80000,
        cashExpectedPesos: '800.00',
        cashExpectedText: '₱800.00'
      }
    };
    rerender(<DayReview review={moved} />);
    expect(cash().value).toBe('800.00'); // untouched: follows the new expected cash
    fireEvent.change(cash(), { target: { value: '795' } });
    expect(screen.getByText('Short ₱5.00')).toBeTruthy();
    rerender(<DayReview review={r} />);
    expect(cash().value).toBe('795'); // touched: kept
    fireEvent.click(screen.getByRole('button', { name: 'It matches' }));
    expect(cash().value).toBe('1000.00');
  });
});

describe('Keep is for the cash it was kept against (U5 review)', () => {
  it('asks again when a re-read moves the expected cash', () => {
    const r = review();
    const { rerender } = render(<DayReview review={r} />);
    fireEvent.change(screen.getByLabelText('Cash counted (₱)'), { target: { value: '2000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Keep ₱2,000.00' }));
    expect(screen.queryByRole('alert')).toBeNull();
    const close = {
      ...(r.close as NonNullable<typeof r.close>),
      cashExpectedCents: 80000,
      cashExpectedPesos: '800.00',
      cashExpectedText: '₱800.00'
    };
    rerender(<DayReview review={{ ...r, close }} />);
    expect(screen.getByRole('alert').textContent).toContain('That is ₱1,200.00 over');
  });
});
