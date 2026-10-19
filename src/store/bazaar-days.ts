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
  saveFlavourCost,
  voidBazaarEntry,
  type Bazaar,
  type BazaarClient,
  type BazaarDay,
  type BazaarSummary,
  type TillFigures
} from '@/lib/data/bazaar-days';
import { saveScheduledEvent, type ScheduledEvent } from '@/lib/data/scheduled-events';
import { dayRange, dayText as dayWords } from '@/lib/date/day-text';
import { validateEventForm, type EventFormInput } from '@/lib/bazaar/event-form';
import {
  hubFactsOf,
  hubNeedsRead,
  hubOrder,
  hubPlace,
  type HubFacts,
  type HubRead
} from '@/lib/bazaar/hub';
import type {
  BazaarDayRow,
  BazaarEventView,
  CloseInput,
  DayPlanEditor,
  DayReviewView,
  DayWord,
  LiveBazaarVals,
  FinaliseInput,
  PlanFlavour,
  TillPanelView
} from '@/lib/bazaar/live-bazaar-types';
import {
  costPendingOf,
  dayOutcomeOf,
  nextDate,
  startPromptOf,
  strandedRowsOf,
  validateFinalise
} from '@/lib/bazaar/event-rules';
import { feeCentsOf, pesosText } from '@/lib/bazaar/forms';
import { cookiesText, eventWhen, pesoInput, planFromForm } from '@/lib/bazaar/plan';
import type { RecipeCost } from '@/lib/data/costs';
import { pesoUnit } from '@/lib/money/format';
import { peso } from '@/lib/money/format';
import {
  closeFromForm,
  centsToPesosText,
  dayFiguresOf,
  dayReportOf,
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
  flavours: () => ReadonlyArray<{
    id: string;
    name: string;
    priceCents: number;
    /** U4: the tile's picture (a stored image path), and whether the flavour is on the menu now. */
    photo?: string;
    onMenu?: boolean;
  }>;
  /** True while this phone holds an event (a started day, or one from before): a second cannot start. */
  holdsEvent: () => boolean;
  /**
   * U5: whether a flavour has a recipe (the database refuses a flavour with none sent to the shop); null while the recipes
   * have not been read. Only chooses where the last day's leftover is suggested to go.
   */
  hasRecipe?: (productId: string) => boolean | null;
  /** U4: the database's cost of a flavour's recipe, per cookie, for the event page's receipt; null when it was not read. */
  recipeCost?: (productId: string) => RecipeCost | null;
  /**
   * The bazaar day this phone is selling, if any: how much the till has not sent yet (sales, voids and expenses), and
   * what it holds of each flavour.
   */
  held: () => {
    dayId: string;
    scheduledId: string;
    unsent: number;
    /** S3.1: sales of the day the server refused outright. Kept on the phone for review; they no longer hold the close. */
    refused: number;
    stock: Readonly<Record<string, number>>;
  } | null;
  begin: (
    booking: { id: string; name: string },
    day: { id: string; day: string }
  ) => Promise<'started' | 'offline' | 'refused'>;
  /** The day is closed on the database: a phone that holds it lets go of it, once it has sent everything. */
  dayClosed: (dayId: string) => void;
  /**
   * S3.1: for the day this phone holds, what its queue has not sent (refused rows left out) and the till's own figures
   * (sales that are not voided or refused, and their cash), which the close gives the server to check. Null when the queue
   * cannot be read.
   */
  tillFigures: () => Promise<({ unsent: number } & TillFigures) | null>;
  /**
   * A close of this day was sent and its answer never came: it may have landed. The till stops selling the day until a
   * read settles it (null clears it), since a sale after a close is refused by the database.
   */
  closeInDoubt: (dayId: string | null) => void;
  /** A loss was recorded: the till has that many fewer to sell. */
  lossSaved: (dayId: string, productId: string, qty: number) => void;
  /** S3.1: a loss was taken back: the till has those cookies to sell again. */
  lossVoided: (dayId: string, productId: string, qty: number) => void;
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
  /** U3: reads the owner's bookings again (after one was added). Whether the read worked. */
  refreshBookings: () => Promise<boolean>;
}

const WORD: Record<BazaarDay['state'], DayWord> = {
  planned: 'Planned',
  open: 'Selling',
  closed: 'Closed'
};

const PENDING_KEY = 'hc-bazaar-pending';
type PendingBody = { productId: string; qty: number; kind: 'made' | 'carried' } | null;
interface PendingChange {
  clientId: string;
  at: number;
  body: PendingBody;
}
const isStockBody = (b: unknown): b is NonNullable<PendingBody> =>
  !!b &&
  typeof b === 'object' &&
  typeof (b as { productId?: unknown }).productId === 'string' &&
  Number.isInteger((b as { qty?: unknown }).qty) &&
  ((b as { kind?: unknown }).kind === 'made' || (b as { kind?: unknown }).kind === 'carried');
const isPendingChange = (v: unknown): v is PendingChange =>
  !!v &&
  typeof v === 'object' &&
  typeof (v as { clientId?: unknown }).clientId === 'string' &&
  Number.isInteger((v as { at?: unknown }).at) &&
  ((v as { body?: unknown }).body === null || isStockBody((v as { body?: unknown }).body));

const COPY = {
  saved: 'Plan saved.',
  conflict: 'This day was changed somewhere else. It has been read again: check it and save.',
  refused: 'The plan could not be saved. Check the cookies, the prices and the float.',
  offline: 'Planning needs signal. Try again when you are back online.',
  needSignal: 'Needs signal',
  eventAdded: 'Event added.',
  eventOffline: 'Adding an event needs signal. Try again when you are back online.',
  eventRefused:
    'The event could not be saved. Check the name, the dates (at most 15 days) and the rent.',
  eventConflict:
    'That event may already be saved, or changed somewhere else. The list has been read again: check it before adding it again.',
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
    'The day changed since you looked, or a sale on the till has not reached the server yet. It has been read again. On the selling phone tap Sync now, check the figures, then close it.',
  refusedSales: (n: number) =>
    (n === 1 ? '1 sale on this phone was' : n + ' sales on this phone were') +
    ' refused by the server and is kept here, unsent. Void it on the till if it was a mistake; otherwise tell Ethan before closing.',
  earlierStockSent:
    'An earlier stock change whose answer was lost was sent first. Check the stock, then add this one again.',
  removed: 'Removed.',
  removeRefused:
    'That could not be removed. A loss can only be taken back while its day is selling.',
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
  noHeldDay: 'This phone is not selling a day now.',
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
    'The event changed since you looked, or a sale on this phone has not reached the server yet. It has been read again. Tap Sync now on the till, check the figures, then close it.',
  finaliseRefused:
    'The event could not be closed. Every started day must be closed, and a flavour sent to the shop needs a recipe.',
  finalised: 'Event closed. It now counts in the books.',
  finalisedNotice: 'This event is closed. Its sales, fees and stock are counted in the books.',
  finalisedChanged:
    'Changed after it was closed: a sale or a void arrived later. The figures below are the ones that were booked.'
} as const;

/** What she was shown that a typed cost cannot change: the sales, the takings, the fees and the stranded cookies. */
function shownTotals(d: Bazaar): string {
  return JSON.stringify([
    d.revenue.sales,
    d.revenue.revenueCents,
    d.fees.totalCents,
    d.stranded.map((x) => [x.productId, x.qty])
  ]);
}

/**
 * Whether the live figures still equal the ones booked. The hash is not used: it covers every field of the summary, so a summary
 * stored before a field was added (migration 70: stranded cookies, the flavour's cost) would always differ with nothing changed.
 */
function sameBooks(booked: BazaarSummary, live: BazaarSummary): boolean {
  const books = (d: BazaarSummary) =>
    JSON.stringify([d.revenue.sales, d.revenue.revenueCents, d.fees.totalCents]);
  return books(booked) === books(live);
}

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
  /**
   * A change whose answer never came keeps its id, time and body, so saying it again is the same change, never a second.
   * S3.1 (L2): kept in localStorage too, so a reload or a closed app does not mint a new id for a change that may have landed.
   */
  private pending = new Map<string, PendingChange>();
  private pendingRead = false;
  private busy = false;
  /**
   * U2: the form open over the till. It reads the held booking the way an event page does (`bookingId`, `data`), and closing
   * it lets the booking go again, so the list is what is drawn once the day has gone.
   */
  private tillPanel: 'fees' | 'cookies' | null = null;
  /** U3: what the last read of each booking that is not over said, and which reads are out or failed. Screen state only. */
  private hubFacts = new Map<string, HubFacts>();
  private hubState = new Map<string, 'reading' | 'failed'>();
  private justAdded: string | null = null;

  constructor(private readonly deps: BazaarDaysDeps) {}

  /** The owner's way out of every view: back to the list, nothing kept. */
  reset(): void {
    this.justAdded = null;
    this.bookingId = null;
    this.data = null;
    this.editing = null;
    this.reviewing = null;
    this.tillPanel = null;
    this.reading = 'read';
    this.seq += 1;
  }

  open(bookingId: string): void {
    this.justAdded = null;
    this.bookingId = bookingId;
    this.data = null;
    this.editing = null;
    this.reviewing = null;
    this.tillPanel = null;
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
    this.tillPanel = null;
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
        // The form over the till has nothing to add to now: the booking is let go, and the phone with the day.
        if (this.tillPanel) {
          this.tillPanel = null;
          this.bookingId = null;
          this.data = null;
        }
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
      list: this.hubList(),
      event,
      editor: event && this.editing ? this.editorView(booking!, this.data!) : null,
      reviewing: this.reviewing !== null,
      review: this.data ? this.reviewView(this.data) : null,
      tillPanel: this.tillPanelView(),
      closeReview: this.leaveReview,
      add: () => this.deps.openAdd(),
      readHub: () => void this.readHub(),
      addEvent: (input) => this.addEvent(input),
      justAdded: this.justAdded,
      retry: () => (this.bookingId ? void this.reload() : this.deps.rerender()),
      back: this.back
    };
  }

  /** U3: every switched-on booking with its group and pill, active first, then upcoming, then past. */
  private hubList(): LiveBazaarVals['list'] {
    const today = this.deps.today();
    const now = new Date(this.deps.now());
    const online = this.deps.online();
    const placed = this.deps.bookings().flatMap((b) => {
      // A booking nobody has asked about yet is "reading" only while a read can still come.
      const read: HubRead =
        this.hubFacts.get(b.id) ?? this.hubState.get(b.id) ?? (online ? undefined : 'failed');
      const place = hubPlace(b, today, read);
      return place ? [{ b, place, read }] : [];
    });
    const rank = { active: 0, upcoming: 1, past: 2 } as const;
    placed.sort(
      (x, y) => rank[x.place.group] - rank[y.place.group] || hubOrder(x.place.group, x.b, y.b)
    );
    return placed.map(({ b, place, read }) => {
      const facts = typeof read === 'object' ? read : null;
      return {
        id: b.id,
        name: b.name,
        datesText: dayRange(b.startsOn, b.endsOn, now),
        placeText: b.place || 'No place set',
        open: () => this.open(b.id),
        group: place.group,
        status: place.status,
        reading: place.reading,
        whenText: place.group === 'past' ? null : eventWhen(b.startsOn, b.endsOn, today),
        figures:
          place.group === 'active' && facts?.today
            ? {
                revenueText: peso(facts.today.revenueCents),
                soldText: facts.today.sold + ' sold'
              }
            : null,
        note:
          read === 'failed' && place.group === 'active'
            ? 'Its figures could not be read, so it may already be closed.'
            : null
      };
    });
  }

  /**
   * U3: reads each switched-on booking that is not over, so the hub can say which are selling and which are closed (the
   * bookings list cannot: see `hub.ts`). The last answer stays on screen while a new one is out. With no signal nothing is
   * asked, and those bookings are placed by their dates, without a status they cannot prove.
   */
  async readHub(): Promise<void> {
    const client = this.deps.client();
    const today = this.deps.today();
    const wanted = this.deps.bookings().filter((b) => hubNeedsRead(b, today));
    if (!client || !this.deps.online()) {
      for (const b of wanted) if (!this.hubFacts.has(b.id)) this.hubState.set(b.id, 'failed');
      this.deps.rerender();
      return;
    }
    const asked = wanted.filter((b) => this.hubState.get(b.id) !== 'reading');
    for (const b of asked) this.hubState.set(b.id, 'reading');
    if (asked.length === 0) return;
    this.deps.rerender();
    await Promise.all(
      asked.map(async (b) => {
        try {
          this.hubFacts.set(b.id, hubFactsOf(await fetchBazaar(client, b.id), today));
          this.hubState.delete(b.id);
        } catch {
          // The last answer, if there was one, still stands.
          this.hubState.set(b.id, 'failed');
        }
      })
    );
    this.deps.rerender();
  }

  /**
   * U3: adds one event. The id is the sheet's own, kept while it is open, so a retry after a lost reply is the same event.
   * Whatever the answer, the bookings are read again: an event that is now listed was saved, whatever the reply said.
   */
  async addEvent(input: EventFormInput): Promise<string | null> {
    const checked = validateEventForm(input, new Date(this.deps.now()));
    if (!checked.ok) return checked.errors[0]?.message ?? COPY.eventRefused;
    const client = this.deps.client();
    if (!client || !this.deps.online()) return COPY.eventOffline;
    const outcome = await saveScheduledEvent(client, checked.fields, null);
    await this.deps.refreshBookings();
    const listed = this.deps.bookings().some((b) => b.id === checked.fields.id);
    if (outcome !== 'saved' && !listed) {
      if (outcome === 'conflict') return COPY.eventConflict;
      return outcome === 'refused' ? COPY.eventRefused : COPY.eventOffline;
    }
    // An event that was just created has no day and is not closed: that is known without a read, so its row is placed at once.
    this.hubFacts.set(checked.fields.id, {
      finalised: false,
      sellingNow: false,
      dayStarted: false,
      costPending: false,
      today: null
    });
    this.hubState.delete(checked.fields.id);
    this.justAdded = checked.fields.id;
    this.deps.toast(COPY.eventAdded);
    this.deps.rerender();
    return null;
  }

  /** A day's review is open (it is drawn ahead of the till). */
  isReviewing(): boolean {
    return this.reviewing !== null;
  }

  /** U4: the day plan is open, and it stands on a sticky footer (a phone lifts its toast above it). */
  hasStickyFooter(): boolean {
    return this.editing !== null && this.reviewing === null && this.bookingId !== null;
  }

  /** U2: opens the fee form or the add-cookies form over the till. Needs signal, and a day this phone is selling. */
  openTillPanel(kind: 'fees' | 'cookies'): void {
    const held = this.deps.held();
    if (!held || !this.deps.online()) return;
    this.bookingId = held.scheduledId;
    this.data = null;
    this.editing = null;
    this.reviewing = null;
    this.tillPanel = kind;
    void this.reload();
  }

  closeTillPanel(): void {
    if (!this.tillPanel) return;
    this.reset();
    this.deps.rerender();
  }

  private tillPanelView(): TillPanelView | null {
    const kind = this.tillPanel;
    const held = this.deps.held();
    if (!kind || !held || this.bookingId !== held.scheduledId) return null;
    const data = this.data;
    // The booking comes back with the day's own read, so the form does not wait on the bookings list (which a weak signal
    // may have failed to read): the event page needs only its id, name and place.
    const booking =
      this.booking() ?? (data ? { ...data.booking, started: true, updatedAt: '' } : undefined);
    const event = data && booking ? this.eventView(booking, data) : null;
    const day = data?.days.find((d) => d.id === held.dayId);
    const stock: TillPanelView['stock'] =
      day && day.state === 'open' && !data!.finalised
        ? {
            flavours: day.lines.map((l) => ({
              id: l.productId,
              name: this.names().get(l.productId) ?? l.name
            })),
            canAddCarried: Object.keys(this.carryIn(data!, day.day)?.byFlavour ?? {}).length > 0,
            addStock: (input) => this.addHeldStock(input)
          }
        : null;
    const ready = kind === 'fees' ? event !== null : stock !== null;
    return {
      kind,
      status: ready ? 'loaded' : data || this.reading === 'failed' ? 'failed' : 'loading',
      event: kind === 'fees' ? event : null,
      stock: kind === 'cookies' ? stock : null,
      retry: () => void this.reload(),
      close: () => this.closeTillPanel()
    };
  }

  /**
   * U2: more cookies on the day this phone is selling, from the till. The day is read here, so no review has to be open;
   * the add itself is the review's `addStock`, under the same `stock:` key, so a change whose answer was lost is the same
   * change from either screen.
   */
  async addHeldStock(input: {
    productId: string;
    qty: string;
    kind: 'made' | 'carried';
  }): Promise<string | null> {
    const held = this.deps.held();
    if (!held) return COPY.noHeldDay;
    if (this.busy) return COPY.busy;
    const client = this.deps.client();
    if (!client || !this.deps.online()) return COPY.moneyOffline;
    let data = this.bookingId === held.scheduledId ? this.data : null;
    if (!data) {
      try {
        data = await fetchBazaar(client, held.scheduledId);
      } catch {
        return COPY.moneyOffline;
      }
    }
    const day = data.days.find((d) => d.id === held.dayId);
    if (!day || day.state !== 'open') return COPY.noHeldDay;
    return this.addStock(day, input);
  }

  /**
   * U2: Home's card when no day is selling here: the event under way, else the next one (the bookings read; none, none). It is
   * the hub's first active or upcoming row, so a closed event whose dates are still ahead is never offered (U4): the booking
   * list's own `started` flag is never set by bazaar days, and only a read of the event can say it is closed.
   */
  nextEvent(): { name: string; datesText: string; whenText: string; open: () => void } | null {
    if (!this.deps.bookingsRead()) return null;
    const row = this.hubList().find((r) => r.group === 'active' || r.group === 'upcoming');
    if (!row) return null;
    return {
      name: row.name,
      datesText: row.datesText,
      whenText: row.whenText ?? 'Today',
      open: row.open
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
    const dayText = new Map(
      data.days.map((d) => [d.id, dayRange(d.day, d.day, new Date(this.deps.now()))])
    );
    // A closed event shows what was booked; if rows changed afterwards it says so.
    const shown = data.finalSummary ?? data;
    const notices: string[] = [];
    if (data.finalised) {
      notices.push(COPY.finalisedNotice);
      if (data.finalSummary && !sameBooks(data.finalSummary, data))
        notices.push(COPY.finalisedChanged);
    }
    return {
      id: booking.id,
      name: booking.name,
      placeText: booking.place || 'No place set',
      datesText: dayRange(data.booking.startsOn, data.booking.endsOn, new Date(this.deps.now())),
      rentText: 'Stall rent ' + peso(data.booking.rentCents),
      rentCents: data.booking.rentCents,
      status:
        hubPlace(booking, this.deps.today(), hubFactsOf(data, this.deps.today()))?.status ??
        'planned',
      soldCount: shown.days.reduce((n, d) => n + d.lines.reduce((m, l) => m + l.sold, 0), 0),
      profitCents: shown.profit.cents,
      targetCents: data.targetCents,
      days: [...data.days]
        .sort((a, b) => a.day.localeCompare(b.day))
        .map((d) => this.dayRow(booking, d, open, started)),
      notices,
      fees: shown.fees.parts.map((f) => ({
        id: f.clientId,
        remove:
          !data.finalised && !f.atTheTill && !f.clientId.startsWith('rent:')
            ? () => this.removeEntry('fee', f.clientId, null)
            : null,
        text:
          f.label +
          ' · ' +
          (f.dayId === null ? 'Whole event' : (dayText.get(f.dayId) ?? 'One day')) +
          (f.atTheTill ? ' · added at the till' : ''),
        amountText: peso(f.amountCents),
        amountCents: f.amountCents
      })),
      feesTotalText: peso(shown.fees.totalCents),
      feesTotalCents: shown.fees.totalCents,
      feeFor: [
        { dayId: null, text: 'The whole event' },
        ...[...data.days]
          .sort((a, b) => a.day.localeCompare(b.day))
          .map((d) => ({ dayId: d.id, text: dayRange(d.day, d.day, new Date(this.deps.now())) }))
      ],
      addFee: data.finalised ? null : (input) => this.addFee(data, input),
      targetText: data.targetCents === null ? 'No target set' : peso(data.targetCents),
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
              ...this.finaliseAsks(data, names),
              run: (input) => this.finalise(data, input)
            },
      unplanned: data.finalised
        ? []
        : datesBetween(data.booking.startsOn, data.booking.endsOn)
            .filter((ymd) => !planned.has(ymd))
            .map((ymd) => ({ ymd, text: dayRange(ymd, ymd, new Date(this.deps.now())) })),
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
              (line.source === 'typed'
                ? 'typed by you'
                : line.source === 'flavour'
                  ? 'typed by you for the flavour'
                  : 'from the recipe');
      else
        text =
          typed === null
            ? 'Read from the recipe when its first day starts'
            : unitCostText(typed) + ' per cookie · typed by you';
      const recipe = this.deps.recipeCost?.(productId) ?? null;
      const recipeCents = recipe?.perCookie == null ? null : recipe.perCookie * 100;
      // What this event is using: the line's cost once a day has started, else hers, else the recipe's today.
      const unit = line ? line.unitCents : typed !== null ? typed : recipeCents;
      const usingRecipe = line ? line.source === 'recipe' : typed === null;
      const sourceText = line
        ? line.source === 'typed'
          ? 'typed by you'
          : line.source === 'flavour'
            ? 'typed by you for the flavour'
            : 'from the recipe'
        : typed !== null
          ? 'typed by you'
          : recipeCents !== null
            ? "from the recipe's cost today"
            : 'read when its first day starts';
      let breakdown: BazaarEventView['costs'][number]['breakdown'] = null;
      let breakdownNote: string | null = null;
      if (recipe && recipeCents !== null) {
        const same = unit !== null && Math.abs(unit - recipeCents) < 0.0005;
        if (usingRecipe && !same) {
          breakdownNote =
            'The recipe has changed since this cost was read: today it costs ' +
            pesoUnit(recipeCents) +
            ' per cookie.';
        } else {
          const lines: Array<{ label: string; valueText: string }> = [];
          if (recipe.ingredientPerCookie !== null)
            lines.push({
              label: 'Ingredients',
              valueText: pesoUnit(recipe.ingredientPerCookie * 100)
            });
          if (recipe.packagingPerCookie !== null && recipe.packagingPerCookie > 0)
            lines.push({
              label: 'Packaging',
              valueText: pesoUnit(recipe.packagingPerCookie * 100)
            });
          lines.push({ label: 'Recipe cost per cookie', valueText: pesoUnit(recipeCents) });
          breakdown = lines;
          if (!usingRecipe) breakdownNote = "For comparison: the recipe's cost today.";
        }
      }
      return {
        productId,
        name: names.get(productId) ?? planned.get(productId) ?? productId,
        text,
        typedPesos: typedPesos === null ? '' : String(typedPesos),
        save: data.finalised ? null : (pesos) => this.saveCost(data, productId, pesos),
        unitText: unit === null ? COST_COPY.pending : unitCostText(unit),
        sourceText,
        breakdown,
        breakdownNote
      };
    });
  }

  /** A1 and A5: what closing the event must ask first: the stranded cookies and the flavours with no cost. */
  private finaliseAsks(
    data: Bazaar,
    names: ReadonlyMap<string, string>
  ): Pick<NonNullable<BazaarEventView['finalise']>, 'stranded' | 'strandedFor' | 'costPending'> {
    const nameOf = (id: string, fallback: string) => names.get(id) ?? fallback;
    const stranded = strandedRowsOf(
      data.stranded,
      (id) => this.deps.hasRecipe?.(id) ?? null,
      nameOf
    );
    const from = data.stranded[0] ? data.days.find((d) => d.id === data.stranded[0]?.dayId) : null;
    return {
      stranded,
      strandedFor: from ? dayWords(nextDate(from.day), new Date(this.deps.now())) : null,
      costPending: costPendingOf(data.cookieCost.lines, nameOf)
    };
  }

  private dayRow(
    booking: ScheduledEvent,
    day: BazaarDay,
    open: BazaarDay | undefined,
    eventStarted: boolean
  ): BazaarDayRow {
    const startPrompt =
      day.state === 'planned'
        ? startPromptOf({
            dayYmd: day.day,
            today: this.deps.today(),
            now: new Date(this.deps.now()),
            firstStart: !eventStarted
          })
        : null;
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
      dateText: dayRange(day.day, day.day, new Date(this.deps.now())),
      word: WORD[day.state],
      cookiesText: total === 0 ? 'Nothing planned' : cookiesText(total) + ' on the table',
      floatText: 'Float ' + peso(day.floatCents),
      lines: day.lines
        .filter((l) => l.made + l.carried > 0)
        .map(
          (l) =>
            (names.get(l.productId) ?? l.name) +
            ' · ' +
            (l.made + l.carried) +
            ' at ' +
            peso(l.priceCents)
        ),
      edit: day.state === 'planned' ? () => this.edit(day) : null,
      action,
      actionNote: note,
      hint,
      outcome: dayOutcomeOf(day),
      startPrompt,
      start: (confirmed) => {
        if (day.state === 'planned') void this.start(booking, day, confirmed, startPrompt !== null);
      },
      run: () =>
        day.state === 'planned'
          ? void this.start(booking, day, false, startPrompt !== null)
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
          price: pesoInput(line ? line.priceCents : f.priceCents),
          photo: f.photo ?? '',
          onMenu: f.onMenu ?? true,
          menuPrice: pesoInput(f.priceCents)
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
    return { dateText: dayRange(prev.day, prev.day, new Date(this.deps.now())), byFlavour };
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
      eventName: booking.name,
      key: editing.dayId + ':' + (editing.stamp ?? 'new'),
      dateText: dayRange(editing.ymd, editing.ymd, new Date(this.deps.now())),
      isNew: !own,
      // A new day starts with the float of the day before it: a fact she can change, not a decision made for her.
      floatPesos: !own && before ? pesoInput(before.floatCents) : form.floatPesos,
      flavours: form.flavours,
      showCarried: !!before,
      copy:
        before && copy
          ? { ...copy, dateText: dayRange(before.day, before.day, new Date(this.deps.now())) }
          : null,
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
    if (mine && held.refused > 0) notices.push(COPY.refusedSales(held.refused));
    let blocked: string | null = null;
    if (!online) blocked = COPY.closeNeedsSignal;
    else if (mine && held.unsent > 0) blocked = this.unsentText(held.unsent);
    return {
      dayId: day.id,
      dateText: dayRange(day.day, day.day, new Date(this.deps.now())),
      eventName: data.booking.name,
      state: day.state,
      online,
      notices,
      stock: stockRowsOf(day, names, (id) => this.deps.hasRecipe?.(id) ?? null),
      losses: data.losses
        .filter((o) => o.dayId === day.id)
        .map((o) => ({
          id: o.clientId,
          text: `${o.qty} ${names.get(o.productId) ?? o.productId} · ${o.reason} · ${stamp(o.at)}`,
          remove: open
            ? () =>
                this.removeEntry('loss', o.clientId, {
                  dayId: day.id,
                  productId: o.productId,
                  qty: o.qty
                })
            : null
        })),
      dayFigures: dayFiguresOf(data, day),
      report: day.state === 'closed' ? dayReportOf(data, day) : null,
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
            cashExpectedText: peso(day.cashExpectedCents),
            cashExpectedCents: day.cashExpectedCents,
            cashExpectedPesos: centsToPesosText(day.cashExpectedCents),
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

  /**
   * The id, time and body a change keeps until it is answered, so a repeat after a lost reply is the same change. The
   * first body given is the one kept: a later call under the same key gets it back and sends it, not its own.
   */
  private pendingFor(key: string, body: PendingBody = null): PendingChange {
    this.readPending();
    let p = this.pending.get(key);
    if (!p) {
      p = { clientId: this.deps.newId(), at: this.deps.now(), body };
      this.pending.set(key, p);
      this.writePending();
    }
    return p;
  }

  /** The change under `key` was answered (saved, repeated or refused): its id is not needed again. */
  private settle(key: string): void {
    this.readPending();
    this.pending.delete(key);
    this.writePending();
  }

  /** Read once, on first use and never in the constructor (it runs before hydration); a store that throws leaves memory only. */
  private readPending(): void {
    if (this.pendingRead) return;
    this.pendingRead = true;
    try {
      const raw = globalThis.localStorage?.getItem(PENDING_KEY);
      const saved: unknown = raw ? JSON.parse(raw) : null;
      if (!saved || typeof saved !== 'object') return;
      for (const [key, value] of Object.entries(saved as Record<string, unknown>)) {
        if (!this.pending.has(key) && isPendingChange(value)) this.pending.set(key, value);
      }
    } catch {
      /* private mode or a damaged entry: the ids live in memory for this session */
    }
  }

  private writePending(): void {
    try {
      if (this.pending.size)
        globalThis.localStorage?.setItem(
          PENDING_KEY,
          JSON.stringify(Object.fromEntries(this.pending))
        );
      else globalThis.localStorage?.removeItem(PENDING_KEY);
    } catch {
      /* as above */
    }
  }

  /**
   * S3.1 (M3): takes back a fee or a loss. The row stays on the server, flagged. A loss on the day this phone sells gives
   * the till its cookies back, once: only when this read still listed it, so a repeat after a lost answer adds nothing twice.
   */
  private async removeEntry(
    kind: 'fee' | 'loss',
    clientId: string,
    loss: { dayId: string; productId: string; qty: number } | null
  ): Promise<string | null> {
    if (this.busy) return COPY.busy;
    const client = this.deps.client();
    if (!client || !this.deps.online()) return COPY.moneyOffline;
    const listed = kind === 'loss' && !!this.data?.losses.some((o) => o.clientId === clientId);
    this.busy = true;
    try {
      const outcome = await voidBazaarEntry(client, kind, clientId);
      if (outcome === 'offline') return COPY.moneyOffline;
      if (outcome !== 'saved') {
        await this.reload();
        return COPY.removeRefused;
      }
      if (loss && listed) this.deps.lossVoided(loss.dayId, loss.productId, loss.qty);
      this.deps.toast(COPY.removed);
      await this.reload();
      return null;
    } finally {
      this.busy = false;
    }
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

  /** A2: a day that is not today starts only once she has confirmed it (`asks`), whoever calls. */
  private async start(
    booking: ScheduledEvent,
    day: BazaarDay,
    confirmed: boolean,
    asks: boolean
  ): Promise<void> {
    if (this.busy) return;
    // Worked out again here: a page drawn before midnight and tapped after it must still ask.
    if ((asks || day.day !== this.deps.today()) && !confirmed) return;
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
    let till: TillFigures | null = null;
    if (held?.dayId === day.id) {
      // The queue itself, not the count on screen: a void or an expense still on the phone blocks the close too. A sale the
      // server refused does not (S3.1); the server checks the till's own figures instead, which leave it out.
      const figures = await this.deps.tillFigures();
      if (figures === null) return COPY.queueUnread;
      if (figures.unsent > 0) return this.unsentText(figures.unsent);
      till = { salesCount: figures.salesCount, cashCents: figures.cashCents };
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
        expected: day.hash,
        till
      });
      if (outcome === 'offline') {
        if (held?.dayId === day.id) this.deps.closeInDoubt(day.id);
        if (this.reviewing) this.reviewing.notice = COPY.closeInDoubt;
        // If the close did land, the read shows the day closed and the phone lets go of it.
        await this.reload();
        return COPY.closeInDoubt;
      }
      this.settle(key);
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
      this.settle(key);
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
    // The call adds and the server keeps no body for it, so a change whose answer was lost is sent again exactly as it was.
    const p = this.pendingFor(key, { productId: input.productId, qty, kind });
    const sent: NonNullable<PendingBody> = isStockBody(p.body)
      ? p.body
      : { productId: input.productId, qty, kind };
    const earlier = sent.productId !== input.productId || sent.qty !== qty || sent.kind !== kind;
    this.busy = true;
    try {
      const { result, loaded, duplicate } = await addBazaarDayStock(client, {
        clientId: p.clientId,
        dayId: day.id,
        productId: sent.productId,
        qty: sent.qty,
        kind: sent.kind
      });
      if (result === 'offline') return COPY.moneyOffline;
      this.settle(key);
      if (result !== 'saved' || loaded === null) {
        await this.reload();
        return COPY.stockRefused;
      }
      this.deps.stockAdded(day.id, sent.productId, sent.qty, loaded);
      this.deps.toast(duplicate ? COPY.repeat : COPY.stockSaved);
      await this.reload();
      return earlier ? COPY.earlierStockSent : null;
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
    const cents = feeCentsOf(input.amount);
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
      this.settle(key);
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
    const cents = pesos.trim() === '' ? null : feeCentsOf(pesos);
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
    const cents = pesos.trim() === '' ? null : typedCostCents(pesosText(pesos));
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
   * Closes the event she is looking at, once. `data` is the read the page was drawn from. What she decided is checked first
   * against what was asked (`validateFinalise`: the stranded cookies, A1, and the flavours with no cost, A5). A typed cost is
   * saved for the flavour, then the event is read again, because a cost changes the summary and with it the hash that closing
   * is given back as `expected`; the close is then made against that fresh read. A changed event (40001) is read again and she
   * closes it again herself.
   */
  private async finalise(data: Bazaar, input: FinaliseInput): Promise<string | null> {
    if (this.busy) return COPY.busy;
    const client = this.deps.client();
    if (!client || !this.deps.online()) return COPY.finaliseNeedsSignal;
    if (data.days.some((d) => d.state === 'open')) return COPY.finaliseOpenDay;
    const names = this.names();
    const asks = this.finaliseAsks(data, names);
    const checked = validateFinalise({ ...asks, value: input });
    if (!checked.ok) return checked.errors[0]?.message ?? COPY.finaliseRefused;
    // Busy from here, so a second tap cannot start a second close while the first waits on the till's figures.
    this.busy = true;
    try {
      // S3.1: a closed day this phone still holds (it has something unsent) is checked against the till's own figures.
      const held = this.deps.held();
      let till: ({ dayId: string } & TillFigures) | null = null;
      if (held && data.days.some((d) => d.id === held.dayId)) {
        const figures = await this.deps.tillFigures();
        if (figures === null) return COPY.queueUnread;
        till = { dayId: held.dayId, salesCount: figures.salesCount, cashCents: figures.cashCents };
      }
      let fresh = data;
      if (checked.costs.length > 0) {
        for (const c of checked.costs) {
          const saved = await saveFlavourCost(client, c.productId, c.cents);
          if (saved === 'offline') return COPY.moneyOffline;
          if (saved !== 'saved') {
            await this.reload();
            return COPY.valueRefused;
          }
        }
        try {
          fresh = await fetchBazaar(client, data.booking.id);
        } catch {
          return COPY.moneyOffline;
        }
        this.data = fresh;
        this.deps.rerender();
        // A cost changes the hash, and the close is given the new one. That must not also take in something else that
        // changed since she looked (a sale, a fee, a different stranded count): she closes it again herself.
        if (shownTotals(fresh) !== shownTotals(data)) return COPY.finaliseStale;
        // What was asked may have changed with the read: the split is checked again against it.
        const asks2 = this.finaliseAsks(fresh, names);
        // A cost that was saved but is not in the fresh summary would close the event with no profit after she chose to
        // give one: stop and say so.
        if (asks2.costPending.length > 0)
          return (
            'The cost was saved, but the event still has no cost for ' +
            asks2.costPending.map((p) => p.name).join(', ') +
            '. Check it on the event page, or close without cost.'
          );
        const again = validateFinalise({
          ...asks2,
          value: { ...input, withoutCost: true }
        });
        if (!again.ok) return again.errors[0]?.message ?? COPY.finaliseRefused;
        checked.split = again.split;
      }
      const outcome = await finaliseBazaar(
        client,
        fresh.booking.id,
        fresh.hash,
        this.deps.dropNo(),
        till,
        checked.split
      );
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
