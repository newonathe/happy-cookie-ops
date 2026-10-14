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

const noop = () => undefined;

const revenue: ReviewFigure = {
  key: 'revenue',
  label: 'Revenue',
  valueText: '₱880',
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
  ...over
});
const emptyRow = stockRow({
  productId: 'ns',
  name: 'Nutella Stuffed',
  onTableText: '10 made',
  goneText: '10 sold',
  shouldBeLeft: 0
});

const review = (over: Partial<DayReviewView> = {}): DayReviewView => ({
  dayId: 'day1',
  dateText: 'Sat, Oct 24',
  eventName: 'Katipunan market',
  state: 'open',
  online: true,
  notices: [],
  stock: [stockRow(), emptyRow],
  losses: [{ id: 'l1', text: '1 Double Chocolate Fudge · Dropped · 24 Oct, 2:15 PM' }],
  dayFigures: [revenue, cost],
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
    cashExpectedText: '₱1,000',
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

  it('draws every figure with its value, and its parts once the details is opened', () => {
    const { container } = render(<DayReview review={review()} />);
    for (const label of ['Revenue', 'Cookie cost', 'Profit so far']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText('₱880')).toBeTruthy();
    expect(screen.getByText('₱120')).toBeTruthy();
    expect(screen.getByText('Another day is still open, so these will change.')).toBeTruthy();
    const details = [...container.querySelectorAll('details')];
    expect(details).toHaveLength(2);
    expect(details[0]?.open).toBe(false);
    fireEvent.click(within(details[0] as HTMLElement).getByText('Revenue'));
    expect(details[0]?.open).toBe(true);
    expect(screen.getByText('Cash sales')).toBeTruthy();
    expect(screen.getByText('4 sales')).toBeTruthy();
    expect(screen.getByText('₱500')).toBeTruthy();
    expect(screen.getByText('GCash sales')).toBeTruthy();
  });

  it('shows "Cost pending" in words, with its note, and never a peso zero', () => {
    const { container } = render(<DayReview review={review()} />);
    expect(screen.getByText('Cost pending')).toBeTruthy();
    expect(screen.getByText('Add a cost per cookie to see this.')).toBeTruthy();
    expect(container.textContent).not.toContain('₱0');
  });

  it('offers a close row for a flavour that should have none left, and submits every row in order as typed', async () => {
    const r = review();
    render(<DayReview review={r} />);
    const form = screen.getByRole('form', { name: 'Close the day' });
    const cards = within(form).getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    expect(within(cards[1] as HTMLElement).getByText('Nutella Stuffed')).toBeTruthy();
    expect(within(cards[1] as HTMLElement).getByText('Should be left: 0')).toBeTruthy();
    const left1 = within(cards[0] as HTMLElement).getByLabelText('Left') as HTMLInputElement;
    const left2 = within(cards[1] as HTMLElement).getByLabelText('Left') as HTMLInputElement;
    expect(left1.value).toBe('');
    expect(left2.value).toBe('0');
    expect(left1.inputMode).toBe('numeric');
    fireEvent.change(left1, { target: { value: '13' } });
    fireEvent.change(within(cards[0] as HTMLElement).getByLabelText('Carried over'), {
      target: { value: '8' }
    });
    fireEvent.change(within(cards[0] as HTMLElement).getByLabelText('To the shop'), {
      target: { value: '3' }
    });
    fireEvent.change(within(cards[0] as HTMLElement).getByLabelText('Written off'), {
      target: { value: '2' }
    });
    fireEvent.change(within(form).getByLabelText('Cash counted (₱)'), {
      target: { value: '1,010.50' }
    });
    expect(within(form).getByText('Cash expected in the drawer: ₱1,000')).toBeTruthy();
    expect(within(form).getByText('Leave blank if you did not count it.')).toBeTruthy();
    fireEvent.click(within(form).getByRole('button', { name: 'Close the day' }));
    await waitFor(() => expect(r.close?.submit).toHaveBeenCalledTimes(1));
    const sent = vi.mocked(r.close?.submit ?? vi.fn()).mock.calls[0]?.[0] as CloseInput;
    expect(sent).toEqual({
      countedPesos: '1,010.50',
      rows: [
        { productId: 'dcf', left: '13', carryNext: '8', toShop: '3', writtenOff: '2' },
        { productId: 'ns', left: '0', carryNext: '', toShop: '', writtenOff: '' }
      ]
    });
  });

  it('keeps what she typed when the review is drawn again with new figures', () => {
    const r = review();
    const { rerender } = render(<DayReview review={r} />);
    fireEvent.change(screen.getAllByLabelText('Left')[0] as HTMLElement, {
      target: { value: '7' }
    });
    rerender(<DayReview review={{ ...r, stock: [stockRow({ shouldBeLeft: 19 }), emptyRow] }} />);
    expect((screen.getAllByLabelText('Left')[0] as HTMLInputElement).value).toBe('7');
    expect(screen.getAllByText('Should be left: 19')).toHaveLength(2);
  });

  it('leaves out "Carried over" on the last day and sends it blank', async () => {
    const base = review();
    const r = review({
      close: { ...(base.close as NonNullable<typeof base.close>), lastDay: true }
    });
    render(<DayReview review={r} />);
    const form = screen.getByRole('form', { name: 'Close the day' });
    expect(within(form).queryByLabelText('Carried over')).toBeNull();
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
    fireEvent.change(screen.getAllByLabelText('Left')[0] as HTMLElement, {
      target: { value: '4' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Close the day' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Count the cookies first.');
    expect((screen.getAllByLabelText('Left')[0] as HTMLInputElement).value).toBe('4');
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
  review: null,
  closeReview: noop,
  add: noop,
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
    { id: 'rent', text: 'Stall rent · Whole event', amountText: '₱2,500' },
    { id: 'f1', text: 'Permit · Whole event · Oct 24', amountText: '₱200' }
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
    expect(screen.getByText('₱880')).toBeTruthy();
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
