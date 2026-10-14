import {
  addBazaarDayStock,
  closeBazaarDay,
  feeError,
  fetchBazaar,
  finaliseBazaar,
  lossError,
  saveBazaarCost,
  saveBazaarDay,
  saveBazaarFee,
  saveBazaarLoss,
  saveBazaarTarget,
  type Bazaar,
  type BazaarClient,
  type BazaarDay,
  type BazaarSummary
} from '@/lib/data/bazaar-days';
import { dateRange, upcomingEvents, type ScheduledEvent } from '@/lib/data/scheduled-events';
import type {
  BazaarDayRow,
  BazaarEventView,
  CloseInput,
  DayPlanEditor,
  DayReviewView,
  DayWord,
  LiveBazaarVals,
  PlanFlavour
} from '@/lib/bazaar/live-bazaar-types';
import { cookiesText, pesoInput, pesoText, planFromForm } from '@/lib/bazaar/plan';
import {
  amountCents,
  closeFromForm,
  dayFiguresOf,
  eventFiguresOf,
  stockRowsOf,
  typedCostCents,
  unitCostText,
  wholeCount
} from '@/lib/bazaar/review';
import { costCentavosToPesos } from '@/lib/money';
import { COST_COPY } from '@/lib/orders/staff-copy';
import { formatManila } from '@/lib/time/business-clock';

/**
 * The owner's bazaar days (S2, S3): which booking is open, what `get_bazaar` returned for it, the day plan being edited
 * and the day being reviewed. It holds no money of its own: centavos stay as the database has them and become text only
 * in `src/lib/bazaar/plan.ts` and `src/lib/bazaar/review.ts`, which format the database's summary and work nothing out
 * again. The runtime owns one and builds its screens' data from `vals()`. What changes the engine (starting a day,
 * letting go of a closed one, the table's stock) is the runtime's, which this only asks for.
 */
export interface BazaarDaysDeps {
  client: () => BazaarClient | null;
  online: () => boolean;
  bookings: () => readonly ScheduledEvent[];
  /** False until the owner's bookings have been read. */
  bookingsRead: () => boolean;
  /** The flavours a day can be planned with: the engine's, with their menu price in centavos. */
  flavours: () => ReadonlyArray<{ id: string; name: string; priceCents: number }>;
  /** True while this phone holds an event (a started day, or one from before): a second cannot start. */
  holdsEvent: () => boolean;
  /**
   * The bazaar day this phone is selling, if any: how much the till has not sent yet (sales, voids and expenses), and
   * what it holds of each flavour.
   */
  held: () => {
    dayId: string;
    scheduledId: string;
    unsent: number;
    stock: Readonly<Record<string, number>>;
  } | null;
  begin: (
    booking: { id: string; name: string },
    day: { id: string; day: string }
  ) => Promise<'started' | 'offline' | 'refused'>;
  /** The day is closed on the database: a phone that holds it lets go of it, once it has sent everything. */
  dayClosed: (dayId: string) => void;
  /** Counts what this phone's queue has not sent (sales, voids, expenses); null when the queue cannot be read. */
  countUnsent: () => Promise<number | null>;
  /**
   * A close of this day was sent and its answer never came: it may have landed. The till stops selling the day until a
   * read settles it (null clears it), since a sale after a close is refused by the database.
   */
  closeInDoubt: (dayId: string | null) => void;
  /** A loss was recorded: the till has that many fewer to sell. */
  lossSaved: (dayId: string, productId: string, qty: number) => void;
  /** Stock was added: the till has `qty` more, and the day now holds `loaded` of the flavour. */
  stockAdded: (dayId: string, productId: string, qty: number, loaded: number) => void;
  /** The drop that cookies sent to the shop are written to as a batch. */
  dropNo: () => number;
  /** The event was closed: the books and production are read again. */
  finalised: () => void;
  rerender: () => void;
  toast: (text: string, kind?: 'warn') => void;
  today: () => string;
  now: () => number;
  newId: () => string;
  openAdd: () => void;
}

const WORD: Record<BazaarDay['state'], DayWord> = {
  planned: 'Planned',
  open: 'Selling',
  closed: 'Closed'
};

const COPY = {
  saved: 'Plan saved.',
  conflict: 'This day was changed somewhere else. It has been read again: check it and save.',
  refused: 'The plan could not be saved. Check the cookies, the prices and the float.',
  offline: 'Planning needs signal. Try again when you are back online.',
  needSignal: 'Needs signal',
  noStock: 'Plan some cookies first',
  anotherOpen: 'Close the day that is still open first',
  holding: 'This phone is already selling an event',
  openElsewhere: 'Selling has started. Sell on the phone that started it.',
  busy: 'Still saving the last change. Try again in a moment.',
  otherPhone:
    'This day is being sold on another phone. Sales still on that phone are not in these figures: send them from that phone first. Anything it sends after the close will show here as changed after the close.',
  changedAfter:
    'Changed after it was closed: a sale, a void, a loss or a fee arrived later. These are the figures now.',
  notCounted:
    'A day is still selling, so cookie cost covers every cookie made so far, sold or not.',
  stale:
    'The day changed since you looked: a sale, a loss or a fee arrived. It has been read again. Check the figures, then close it.',
  closeNeedsSignal: 'Closing a day needs signal.',
  queueUnread:
    'This phone could not check what it has not sent yet. Try again; if it keeps happening, reload the app with signal.',
  closeInDoubt:
    'The answer did not come back, so the day may already be closed. Selling is paused on this phone until it is read again with signal: tap Close out again.',
  repeat: 'That was already recorded: its first answer was lost on the way.',
  closeRefused:
    'The day could not be closed. Check each count, and that no sale was made after you started closing.',
  dayClosed: 'Day closed.',
  lossSaved: 'Loss recorded.',
  lossRefused: 'That loss could not be recorded. A flavour cannot go below zero left.',
  stockSaved: 'Stock added.',
  stockRefused:
    'That stock could not be added. Carried-over cookies are limited to what the day before set aside.',
  feeSaved: 'Fee added.',
  feeRefused: 'That fee could not be added. Check the name, the amount and the day.',
  targetSaved: 'Target saved.',
  costSaved: 'Cost saved.',
  valueRefused: 'That could not be saved. The event may already be closed.',
  moneyOffline: 'That needs signal. Try again when you are back online.',
  finaliseNeedsSignal: 'Closing the event needs signal.',
  finaliseOpenDay: 'Close the day that is still selling first.',
  finaliseStale:
    'The event changed since you looked. It has been read again. Check the figures, then close it.',
  finaliseRefused:
    'The event could not be closed. Every started day must be closed, and a flavour sent to the shop needs a recipe.',
  finalised: 'Event closed. It now counts in the books.',
  finalisedNotice: 'This event is closed. Its sales, fees and stock are counted in the books.',
  finalisedChanged:
    'Changed after it was closed: a sale or a void arrived later. The figures below are the ones that were booked.'
} as const;

/** `YYYY-MM-DD` from `a` to `b` inclusive. The bookings are at most 15 days (`scheduledEventError`). */
function datesBetween(a: string, b: string): string[] {
  const out: string[] = [];
  const [y, m, d] = a.split('-').map(Number) as [number, number, number];
  for (let i = 0; i < 31; i++) {
    const ymd = new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10);
    if (ymd > b) break;
    out.push(ymd);
  }
  return out;
}

const stamp = (at: number): string =>
  formatManila(
    at,
    { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true },
    'en-PH'
  );

export class BazaarDays {
  private bookingId: string | null = null;
  private data: Bazaar | null = null;
  private reading: 'read' | 'loading' | 'failed' = 'read';
  private seq = 0;
  private editing: { dayId: string; ymd: string; stamp: string | null } | null = null;
  /** The day whose review is open, where it was opened from, and words from the last close that was not taken. */
  private reviewing: { dayId: string; from: 'till' | 'event'; notice: string | null } | null = null;
  /** A change whose answer never came keeps its id and time, so saying it again exactly is the same change, never a second. */
  private pending = new Map<string, { clientId: string; at: number }>();
  private busy = false;

  constructor(private readonly deps: BazaarDaysDeps) {}

  /** The owner's way out of every view: back to the list, nothing kept. */
  reset(): void {
    this.bookingId = null;
    this.data = null;
    this.editing = null;
    this.reviewing = null;
    this.reading = 'read';
    this.seq += 1;
  }

  open(bookingId: string): void {
    this.bookingId = bookingId;
    this.data = null;
    this.editing = null;
    this.reviewing = null;
    void this.reload();
  }

  /**
   * Opens a day's review, from the till's "Close out" or from the day's row. What was read before is dropped: the review
   * is drawn only from a read made now, so the close is given back the hash of exactly what she is shown.
   */
  openReview(bookingId: string, dayId: string, from: 'till' | 'event'): void {
    this.bookingId = bookingId;
    this.data = null;
    this.editing = null;
    this.reviewing = { dayId, from, notice: null };
    void this.reload();
  }

  async reload(): Promise<boolean> {
    const client = this.deps.client();
    const id = this.bookingId;
    if (!id) return false;
    if (!client) {
      this.reading = 'failed';
      this.deps.rerender();
      return false;
    }
    const seq = (this.seq += 1);
    this.reading = 'loading';
    this.deps.rerender();
    try {
      const data = await fetchBazaar(client, id);
      // A newer read, or a different booking, has taken over: this answer is stale.
      if (seq !== this.seq || id !== this.bookingId) return false;
      this.data = data;
      this.reading = 'read';
      // A day this phone still holds that the database has closed (from another phone): the phone lets go of it.
      const held = this.deps.held();
      const heldDay = held ? data.days.find((d) => d.id === held.dayId) : undefined;
      // Selling pauses on a day the database has closed (the phone keeps it until it has sent everything), and
      // resumes only when a read shows the day still open: that settles a close whose answer was lost.
      if (heldDay?.state === 'closed') {
        this.deps.closeInDoubt(heldDay.id);
        this.deps.dayClosed(heldDay.id);
      } else if (heldDay?.state === 'open') this.deps.closeInDoubt(null);
      this.deps.rerender();
      return true;
    } catch {
      if (seq !== this.seq || id !== this.bookingId) return false;
      this.reading = 'failed';
      this.deps.rerender();
      return false;
    }
  }

  private booking(): ScheduledEvent | undefined {
    return this.deps.bookings().find((b) => b.id === this.bookingId);
  }

  /** The flavour's name as the rest of the app writes it; the database's own spelling when it is not in the list. */
  private names(): Map<string, string> {
    return new Map(this.deps.flavours().map((f) => [f.id, f.name]));
  }

  vals(): LiveBazaarVals {
    const booking = this.booking();
    const event = booking && this.data ? this.eventView(booking, this.data) : null;
    return {
      online: this.deps.online(),
      eventsRead: this.deps.bookingsRead(),
      state: this.bookingId && !this.data ? this.reading : 'read',
      list: upcomingEvents(this.deps.bookings(), this.deps.today()).map((b) => ({
        id: b.id,
        name: b.name,
        datesText: dateRange(b.startsOn, b.endsOn),
        placeText: b.place || 'No place set',
        open: () => this.open(b.id)
      })),
      event,
      editor: event && this.editing ? this.editorView(booking!, this.data!) : null,
      reviewing: this.reviewing !== null,
      review: this.data ? this.reviewView(this.data) : null,
      closeReview: this.leaveReview,
      add: () => this.deps.openAdd(),
      retry: () => (this.bookingId ? void this.reload() : this.deps.rerender()),
      back: this.back
    };
  }

  private back = (): void => {
    this.reset();
    this.deps.rerender();
  };

  /** From a review: to the till while this phone is selling, otherwise to the event's page. */
  private leaveReview = (): void => {
    const from = this.reviewing?.from;
    if (from === 'till' && this.deps.holdsEvent()) this.reset();
    else {
      this.reviewing = null;
      if (!this.data && this.bookingId) void this.reload();
    }
    this.deps.rerender();
  };

  private eventView(booking: ScheduledEvent, data: Bazaar): BazaarEventView {
    const planned = new Set(data.days.map((d) => d.day));
    const open = data.days.find((d) => d.state === 'open');
    const started = data.days.some((d) => d.state !== 'planned');
    const online = this.deps.online();
    const names = this.names();
    const dayText = new Map(data.days.map((d) => [d.id, dateRange(d.day, d.day)]));
    // A closed event shows what was booked; if rows changed afterwards it says so.
    const shown = data.finalSummary ?? data;
    const notices: string[] = [];
    if (data.finalised) {
      notices.push(COPY.finalisedNotice);
      if (data.finalSummary && data.finalSummary.hash !== data.hash)
        notices.push(COPY.finalisedChanged);
    }
    return {
      id: booking.id,
      name: booking.name,
      placeText: booking.place || 'No place set',
      datesText: dateRange(data.booking.startsOn, data.booking.endsOn),
      rentText: 'Stall rent ' + pesoText(data.booking.rentCents),
      days: [...data.days]
        .sort((a, b) => a.day.localeCompare(b.day))
        .map((d) => this.dayRow(booking, d, open)),
      notices,
      fees: shown.fees.parts.map((f) => ({
        id: f.clientId,
        text:
          f.label +
          ' · ' +
          (f.dayId === null ? 'Whole event' : (dayText.get(f.dayId) ?? 'One day')) +
          (f.atTheTill ? ' · added at the till' : ''),
        amountText: pesoText(f.amountCents)
      })),
      feesTotalText: pesoText(shown.fees.totalCents),
      feeFor: [
        { dayId: null, text: 'The whole event' },
        ...[...data.days]
          .sort((a, b) => a.day.localeCompare(b.day))
          .map((d) => ({ dayId: d.id, text: dateRange(d.day, d.day) }))
      ],
      addFee: data.finalised ? null : (input) => this.addFee(data, input),
      targetText: data.targetCents === null ? 'No target set' : pesoText(data.targetCents),
      targetPesos: data.targetCents === null ? '' : pesoInput(data.targetCents),
      saveTarget: data.finalised ? null : (pesos) => this.saveTarget(data, pesos),
      costs: this.costRows(data, shown, names),
      figures: started ? eventFiguresOf(shown) : [],
      figuresNote: started && !shown.counted ? COPY.notCounted : null,
      finalise:
        data.finalised || !started
          ? null
          : {
              blocked: !online ? COPY.finaliseNeedsSignal : open ? COPY.finaliseOpenDay : null,
              run: () => this.finalise(data)
            },
      unplanned: data.finalised
        ? []
        : datesBetween(data.booking.startsOn, data.booking.endsOn)
            .filter((ymd) => !planned.has(ymd))
            .map((ymd) => ({ ymd, text: dateRange(ymd, ymd) })),
      planDay: (ymd) => this.plan(ymd),
      back: this.back
    };
  }

  /**
   * Each flavour of the event with its cost per cookie in words. A flavour of a started day reads the summary's own cost
   * (hers if she typed one, else the recipe's as read at its first day). A flavour that is only planned so far has no
   * recipe cost read yet: it shows hers if she typed one, and otherwise says when the recipe's is read.
   */
  private costRows(
    data: Bazaar,
    shown: BazaarSummary,
    names: ReadonlyMap<string, string>
  ): BazaarEventView['costs'] {
    const planned = new Map<string, string>();
    for (const d of data.days) for (const l of d.lines) planned.set(l.productId, l.name);
    for (const l of shown.cookieCost.lines) planned.set(l.productId, l.name);
    return [...planned.keys()].sort().map((productId) => {
      const line = shown.cookieCost.lines.find((l) => l.productId === productId);
      const typed = data.costs.find((k) => k.productId === productId)?.typedCents ?? null;
      const typedPesos = costCentavosToPesos(typed);
      let text: string;
      if (line)
        text =
          line.unitCents === null
            ? COST_COPY.pending
            : unitCostText(line.unitCents) +
              ' per cookie · ' +
              (line.source === 'typed' ? 'typed by you' : 'from the recipe');
      else
        text =
          typed === null
            ? 'Read from the recipe when its first day starts'
            : unitCostText(typed) + ' per cookie · typed by you';
      return {
        productId,
        name: names.get(productId) ?? planned.get(productId) ?? productId,
        text,
        typedPesos: typedPesos === null ? '' : String(typedPesos),
        save: data.finalised ? null : (pesos) => this.saveCost(data, productId, pesos)
      };
    });
  }

  private dayRow(
    booking: ScheduledEvent,
    day: BazaarDay,
    open: BazaarDay | undefined
  ): BazaarDayRow {
    const total = day.lines.reduce((t, l) => t + l.made + l.carried, 0);
    const names = this.names();
    let action: BazaarDayRow['action'] = null;
    let note: string | null = null;
    let hint: string | null = null;
    if (day.state === 'planned') {
      action = 'start';
      if (total === 0) note = COPY.noStock;
      else if (open) note = COPY.anotherOpen;
      if (note === null) {
        if (!this.deps.online()) note = COPY.needSignal;
        else if (this.deps.holdsEvent()) note = COPY.holding;
      }
    } else if (day.state === 'open') {
      // An open day this phone does not hold (one it holds is drawn as the till): it can still be reviewed and closed here.
      action = 'review';
      hint = COPY.openElsewhere;
      if (!this.deps.online()) note = COPY.needSignal;
    } else {
      action = 'see';
      if (day.changedAfterClose) hint = 'Changed after it was closed';
      if (!this.deps.online()) note = COPY.needSignal;
    }
    return {
      id: day.id,
      dateText: dateRange(day.day, day.day),
      word: WORD[day.state],
      cookiesText: total === 0 ? 'Nothing planned' : cookiesText(total) + ' on the table',
      floatText: 'Float ' + pesoText(day.floatCents),
      lines: day.lines
        .filter((l) => l.made + l.carried > 0)
        .map(
          (l) =>
            (names.get(l.productId) ?? l.name) +
            ' · ' +
            (l.made + l.carried) +
            ' at ' +
            pesoText(l.priceCents)
        ),
      edit: day.state === 'planned' ? () => this.edit(day) : null,
      action,
      actionNote: note,
      hint,
      run: () =>
        day.state === 'planned'
          ? void this.start(booking, day)
          : this.openReview(booking.id, day.id, 'event')
    };
  }

  private plan(ymd: string): void {
    const existing = this.data?.days.find((d) => d.day === ymd);
    if (existing) return this.edit(existing);
    // The id is minted once for this form: a save whose reply was lost is repeated under the same id.
    this.editing = { dayId: this.deps.newId(), ymd, stamp: null };
    this.deps.rerender();
  }

  private edit(day: BazaarDay): void {
    this.editing = { dayId: day.id, ymd: day.day, stamp: day.updatedAt };
    this.deps.rerender();
  }

  private formFor(day: BazaarDay | undefined): { floatPesos: string; flavours: PlanFlavour[] } {
    return {
      floatPesos: day ? pesoInput(day.floatCents) : '',
      flavours: this.deps.flavours().map((f) => {
        const line = day?.lines.find((l) => l.productId === f.id);
        return {
          id: f.id,
          name: f.name,
          made: line && line.made > 0 ? String(line.made) : '',
          carried: line && line.carried > 0 ? String(line.carried) : '',
          price: pesoInput(line ? line.priceCents : f.priceCents)
        };
      })
    };
  }

  /**
   * What may be carried into a day: what the latest closed day before it set aside (the database's own bound when the
   * day starts). Null when no earlier day is closed.
   */
  private carryIn(data: Bazaar, ymd: string): DayPlanEditor['carryIn'] {
    const prev = [...data.days]
      .filter((d) => d.day < ymd && d.state === 'closed' && d.count)
      .sort((a, b) => b.day.localeCompare(a.day))[0];
    if (!prev?.count) return null;
    const byFlavour: Record<string, number> = {};
    for (const c of prev.count) if (c.carryNext > 0) byFlavour[c.productId] = c.carryNext;
    return { dateText: dateRange(prev.day, prev.day), byFlavour };
  }

  private editorView(booking: ScheduledEvent, data: Bazaar): DayPlanEditor | null {
    const editing = this.editing;
    if (!editing) return null;
    const own = data.days.find((d) => d.id === editing.dayId);
    const before = [...data.days]
      .filter((d) => d.day < editing.ymd)
      .sort((a, b) => b.day.localeCompare(a.day))[0];
    const form = this.formFor(own);
    const copy = before ? this.formFor(before) : null;
    return {
      dayId: editing.dayId,
      key: editing.dayId + ':' + (editing.stamp ?? 'new'),
      dateText: dateRange(editing.ymd, editing.ymd),
      isNew: !own,
      floatPesos: form.floatPesos,
      flavours: form.flavours,
      showCarried: !!before,
      copy: before && copy ? { ...copy, dateText: dateRange(before.day, before.day) } : null,
      carryIn: this.carryIn(data, editing.ymd),
      save: (input) => this.save(booking, input),
      back: () => {
        this.editing = null;
        this.deps.rerender();
      }
    };
  }

  private reviewView(data: Bazaar): DayReviewView | null {
    const r = this.reviewing;
    if (!r) return null;
    const day = data.days.find((d) => d.id === r.dayId);
    if (!day || day.state === 'planned') return null;
    const held = this.deps.held();
    const mine = held?.dayId === day.id;
    const online = this.deps.online();
    const names = this.names();
    const open = day.state === 'open' && !data.finalised;
    const lastDay = day.day === data.booking.endsOn;
    const notices: string[] = [];
    if (r.notice) notices.push(r.notice);
    if (open && !mine) notices.push(COPY.otherPhone);
    if (day.changedAfterClose) notices.push(COPY.changedAfter);
    let blocked: string | null = null;
    if (!online) blocked = COPY.closeNeedsSignal;
    else if (mine && held.unsent > 0) blocked = this.unsentText(held.unsent);
    return {
      dayId: day.id,
      dateText: dateRange(day.day, day.day),
      eventName: data.booking.name,
      state: day.state,
      online,
      notices,
      stock: stockRowsOf(day, names),
      losses: data.losses
        .filter((o) => o.dayId === day.id)
        .map((o) => ({
          id: o.clientId,
          text: `${o.qty} ${names.get(o.productId) ?? o.productId} · ${o.reason} · ${stamp(o.at)}`
        })),
      dayFigures: dayFiguresOf(data, day),
      eventFigures: eventFiguresOf(data),
      eventNote: data.counted ? null : COPY.notCounted,
      flavours: day.lines.map((l) => ({
        id: l.productId,
        name: names.get(l.productId) ?? l.name
      })),
      addLoss: open ? (input) => this.addLoss(day, input) : null,
      addStock: open ? (input) => this.addStock(day, input) : null,
      canAddCarried: Object.keys(this.carryIn(data, day.day)?.byFlavour ?? {}).length > 0,
      // The close is given back this read's own day: its hash and its flavours, exactly what is on the screen.
      close: open
        ? {
            lastDay,
            cashExpectedText: pesoText(day.cashExpectedCents),
            blocked,
            submit: (input) => this.closeDay(day, lastDay, input)
          }
        : null,
      backText: r.from === 'till' && mine ? 'Back to the till' : 'Back to the event',
      back: this.leaveReview
    };
  }

  private unsentText(n: number): string {
    return (
      (n === 1 ? '1 change is' : n + ' changes are') +
      ' still on this phone. Go back to the till, tap Sync now, then close the day.'
    );
  }

  /** The id and time a change keeps until it is answered, so a repeat after a lost reply is the same change. */
  private pendingFor(key: string): { clientId: string; at: number } {
    let p = this.pending.get(key);
    if (!p) {
      p = { clientId: this.deps.newId(), at: this.deps.now() };
      this.pending.set(key, p);
    }
    return p;
  }

  private async save(
    booking: ScheduledEvent,
    input: { floatPesos: string; flavours: PlanFlavour[] }
  ): Promise<string | null> {
    const editing = this.editing;
    if (!editing || this.busy) return null;
    const result = planFromForm(input);
    if (!result.ok) return result.error;
    const client = this.deps.client();
    if (!client || !this.deps.online()) return COPY.offline;
    this.busy = true;
    try {
      const { result: outcome } = await saveBazaarDay(
        client,
        {
          id: editing.dayId,
          scheduledId: booking.id,
          day: editing.ymd,
          ...result.plan
        },
        editing.stamp
      );
      if (outcome === 'saved') {
        this.editing = null;
        this.deps.toast(COPY.saved);
        await this.reload();
        return null;
      }
      if (outcome === 'conflict') {
        await this.reload();
        const fresh = this.data?.days.find((d) => d.id === editing.dayId);
        if (fresh) this.editing = { dayId: fresh.id, ymd: fresh.day, stamp: fresh.updatedAt };
        return COPY.conflict;
      }
      return outcome === 'refused' ? COPY.refused : COPY.offline;
    } finally {
      this.busy = false;
    }
  }

  private async start(booking: ScheduledEvent, day: BazaarDay): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const outcome = await this.deps.begin(
        { id: booking.id, name: booking.name },
        { id: day.id, day: day.day }
      );
      if (outcome === 'started') await this.reload();
    } finally {
      this.busy = false;
    }
  }

  /**
   * Closes the day she is looking at. `day` is the one the review was drawn from, so `expected` is the hash of what she
   * was shown. If the day changed since (40001) nothing more is sent: it is read again and she closes it again herself.
   */
  private async closeDay(
    day: BazaarDay,
    lastDay: boolean,
    input: CloseInput
  ): Promise<string | null> {
    if (this.busy) return COPY.busy;
    const client = this.deps.client();
    if (!client || !this.deps.online()) return COPY.closeNeedsSignal;
    const held = this.deps.held();
    if (held?.dayId === day.id) {
      // The queue itself, not the count on screen: a void or an expense still on the phone blocks the close too.
      const unsent = await this.deps.countUnsent();
      if (unsent === null) return COPY.queueUnread;
      if (unsent > 0) return this.unsentText(unsent);
    }
    const result = closeFromForm(day, input, lastDay, this.names());
    if (!result.ok) return result.error;
    const key = 'close:' + JSON.stringify([day.id, day.hash, result.lines, result.countedCents]);
    const { at } = this.pendingFor(key);
    this.busy = true;
    try {
      const outcome = await closeBazaarDay(client, {
        dayId: day.id,
        at,
        countedCents: result.countedCents,
        lines: result.lines,
        expected: day.hash
      });
      if (outcome === 'offline') {
        if (held?.dayId === day.id) this.deps.closeInDoubt(day.id);
        if (this.reviewing) this.reviewing.notice = COPY.closeInDoubt;
        // If the close did land, the read shows the day closed and the phone lets go of it.
        await this.reload();
        return COPY.closeInDoubt;
      }
      this.pending.delete(key);
      if (outcome === 'saved') {
        if (this.reviewing) this.reviewing.notice = null;
        // No sale on this day from now on: the pause lasts until the phone has let go of the day.
        if (held?.dayId === day.id) this.deps.closeInDoubt(day.id);
        this.deps.dayClosed(day.id);
        this.deps.toast(COPY.dayClosed);
        await this.reload();
        return null;
      }
      if (outcome === 'stale') {
        if (this.reviewing) this.reviewing.notice = COPY.stale;
        await this.reload();
        return COPY.stale;
      }
      // Read again: a refusal can be a close that already landed with another count.
      await this.reload();
      return COPY.closeRefused;
    } finally {
      this.busy = false;
    }
  }

  private async addLoss(
    day: BazaarDay,
    input: { productId: string; qty: string; reason: string }
  ): Promise<string | null> {
    if (this.busy) return COPY.busy;
    const client = this.deps.client();
    if (!client || !this.deps.online()) return COPY.moneyOffline;
    const qty = wholeCount(input.qty);
    if (qty === null) return 'How many is a whole number, 1 or more.';
    if (!day.lines.some((l) => l.productId === input.productId)) return 'Choose the flavour.';
    const held = this.deps.held();
    if (held?.dayId === day.id) {
      const onTable = held.stock[input.productId] ?? 0;
      if (qty > onTable)
        return `Only ${onTable} left on the table on this phone. A loss cannot be more than that.`;
    }
    const reason = input.reason.trim();
    const key = 'loss:' + day.id;
    const p = this.pendingFor(key);
    const fields = {
      clientId: 'loss:' + p.clientId,
      dayId: day.id,
      productId: input.productId,
      qty,
      reason,
      at: p.at
    };
    // A local error keeps the id: if an earlier answer was lost, the corrected loss is still that one change.
    const problem = lossError(fields);
    if (problem) return problem;
    this.busy = true;
    try {
      const outcome = await saveBazaarLoss(client, fields);
      if (outcome === 'offline') return COPY.moneyOffline;
      this.pending.delete(key);
      if (outcome !== 'saved' && outcome !== 'repeat') {
        await this.reload();
        return COPY.lossRefused;
      }
      // A repeat is a loss whose first answer was lost: the phone never applied it, so it does now.
      this.deps.lossSaved(day.id, input.productId, qty);
      this.deps.toast(outcome === 'repeat' ? COPY.repeat : COPY.lossSaved);
      await this.reload();
      return null;
    } finally {
      this.busy = false;
    }
  }

  private async addStock(
    day: BazaarDay,
    input: { productId: string; qty: string; kind: 'made' | 'carried' }
  ): Promise<string | null> {
    if (this.busy) return COPY.busy;
    const client = this.deps.client();
    if (!client || !this.deps.online()) return COPY.moneyOffline;
    const qty = wholeCount(input.qty);
    if (qty === null) return 'How many is a whole number, 1 or more.';
    if (!day.lines.some((l) => l.productId === input.productId)) return 'Choose the flavour.';
    const kind = input.kind === 'carried' ? 'carried' : 'made';
    const key = 'stock:' + day.id;
    const p = this.pendingFor(key);
    this.busy = true;
    try {
      const { result, loaded, duplicate } = await addBazaarDayStock(client, {
        clientId: p.clientId,
        dayId: day.id,
        productId: input.productId,
        qty,
        kind
      });
      if (result === 'offline') return COPY.moneyOffline;
      this.pending.delete(key);
      if (result !== 'saved' || loaded === null) {
        await this.reload();
        return COPY.stockRefused;
      }
      this.deps.stockAdded(day.id, input.productId, qty, loaded);
      this.deps.toast(duplicate ? COPY.repeat : COPY.stockSaved);
      await this.reload();
      return null;
    } finally {
      this.busy = false;
    }
  }

  private async addFee(
    data: Bazaar,
    input: { label: string; amount: string; dayId: string | null }
  ): Promise<string | null> {
    if (this.busy) return COPY.busy;
    const client = this.deps.client();
    if (!client || !this.deps.online()) return COPY.moneyOffline;
    const cents = amountCents(input.amount);
    if (cents === null || cents < 1) return 'The amount must be like 250 or 250.50.';
    const label = input.label.trim();
    const day = data.days.find((d) => d.id === input.dayId);
    const key = 'fee:' + data.booking.id;
    const p = this.pendingFor(key);
    const fields = {
      clientId: 'fee:' + p.clientId,
      scheduledId: data.booking.id,
      dayId: day ? day.id : null,
      label,
      category: 'Bazaar fees',
      amountCents: cents,
      // A day's fee is paid that day; a fee for the whole event, on its first day.
      paidOn: day ? day.day : data.booking.startsOn
    };
    // A local error keeps the id, as for a loss.
    const problem = feeError(fields);
    if (problem) return problem;
    this.busy = true;
    try {
      const outcome = await saveBazaarFee(client, fields);
      if (outcome === 'offline') return COPY.moneyOffline;
      this.pending.delete(key);
      if (outcome !== 'saved' && outcome !== 'repeat') {
        await this.reload();
        return COPY.feeRefused;
      }
      this.deps.toast(outcome === 'repeat' ? COPY.repeat : COPY.feeSaved);
      await this.reload();
      return null;
    } finally {
      this.busy = false;
    }
  }

  private async saveTarget(data: Bazaar, pesos: string): Promise<string | null> {
    if (this.busy) return COPY.busy;
    const client = this.deps.client();
    if (!client || !this.deps.online()) return COPY.moneyOffline;
    const cents = pesos.trim() === '' ? null : amountCents(pesos);
    if (pesos.trim() !== '' && cents === null) return 'The target must be like 5000 or 5000.50.';
    this.busy = true;
    try {
      const outcome = await saveBazaarTarget(client, data.booking.id, cents);
      if (outcome === 'offline') return COPY.moneyOffline;
      if (outcome !== 'saved') return COPY.valueRefused;
      this.deps.toast(COPY.targetSaved);
      await this.reload();
      return null;
    } finally {
      this.busy = false;
    }
  }

  private async saveCost(data: Bazaar, productId: string, pesos: string): Promise<string | null> {
    if (this.busy) return COPY.busy;
    const client = this.deps.client();
    if (!client || !this.deps.online()) return COPY.moneyOffline;
    const cents = pesos.trim() === '' ? null : typedCostCents(pesos);
    if (pesos.trim() !== '' && cents === null)
      return 'A cost per cookie must be like 12 or 12.50, with at most four decimals.';
    this.busy = true;
    try {
      const outcome = await saveBazaarCost(client, data.booking.id, productId, cents);
      if (outcome === 'offline') return COPY.moneyOffline;
      if (outcome !== 'saved') return COPY.valueRefused;
      this.deps.toast(COPY.costSaved);
      await this.reload();
      return null;
    } finally {
      this.busy = false;
    }
  }

  /**
   * Closes the event she is looking at, once. `data` is the read the page was drawn from, so `expected` is the hash of
   * the summary she was shown. A changed event (40001) is read again and she closes it again herself.
   */
  private async finalise(data: Bazaar): Promise<string | null> {
    if (this.busy) return COPY.busy;
    const client = this.deps.client();
    if (!client || !this.deps.online()) return COPY.finaliseNeedsSignal;
    if (data.days.some((d) => d.state === 'open')) return COPY.finaliseOpenDay;
    this.busy = true;
    try {
      const outcome = await finaliseBazaar(client, data.booking.id, data.hash, this.deps.dropNo());
      if (outcome === 'offline') return COPY.finaliseNeedsSignal;
      if (outcome === 'saved') {
        this.deps.finalised();
        this.deps.toast(COPY.finalised);
        await this.reload();
        return null;
      }
      if (outcome === 'stale') {
        await this.reload();
        return COPY.finaliseStale;
      }
      return COPY.finaliseRefused;
    } finally {
      this.busy = false;
    }
  }
}
