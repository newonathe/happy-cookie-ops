/**
 * What the live owner's Bazaar screens (S2) draw: the event list, an event's page and a day's plan. The runtime builds this
 * from the bookings it has read and `get_bazaar`; the screens in src/components/live/bazaar/ only draw it and call its
 * actions. Every text is already words for the screen. The till is not part of this: while an event is open on the phone the
 * screen draws the ported Bazaar Mode, whatever this holds.
 *
 * This file is the contract between the data side (src/store/bazaar-days.ts, src/store/ops-runtime.tsx) and the screens.
 * Add to it only together with both sides.
 */

import type { EventFormInput } from '@/lib/bazaar/event-form';
import type { HubStatus } from '@/lib/bazaar/hub';

/** A day's state as a word first: the colour never says it alone. */
export type DayWord = 'Planned' | 'Selling' | 'Closed';

export interface BazaarListRow {
  id: string;
  name: string;
  /** "Sat, 24 Oct – Sun, 25 Oct" */
  datesText: string;
  /** The place, or "No place set". */
  placeText: string;
  open: () => void;
  /** U3: where the hub draws it. Active is pinned; Upcoming and Past sit behind the filter chips. */
  group: 'active' | 'upcoming' | 'past';
  /** U3: the pill. The word always shows with it; the colour is never the only signal. */
  status: 'today' | 'selling' | 'planned' | 'closed' | 'past' | 'costPending';
  /** U3: its read is still out. It is placed by its dates and drawn without a status it may not have. */
  reading: boolean;
  /** U3: "Today", "Tomorrow", "In 9 days"; null once it is over. */
  whenText: string | null;
  /** U3: today's takings and cookies sold, only for an active event that was read; never a ₱0.00 for an unknown. */
  figures: { revenueText: string; soldText: string } | null;
  /** U3: words under the row that block nothing (its read failed). */
  note: string | null;
}

/** B4: what a closed day came to, in words: shown on its row in place of its plan. */
export interface DayOutcome {
  /** "13 sold" */
  soldText: string;
  /** "₱1,640.00" */
  revenueText: string;
  /** "8 left" */
  leftText: string;
  /** "5 carried over"; null when none were. */
  carriedText: string | null;
  /** "Matches", "₱20.00 over", "₱20.00 short"; null when the drawer was not counted. */
  drawerText: string | null;
}

/** A2: asked before a day is started on a date that is not today. */
export interface StartPrompt {
  title: string;
  body: string;
}

export interface BazaarDayRow {
  id: string;
  /** "Sat, Oct 24" */
  dateText: string;
  word: DayWord;
  /** "25 cookies on the table", or "Nothing planned". */
  cookiesText: string;
  /** "Float ₱500" */
  floatText: string;
  /** Each flavour with how many and its price, e.g. "Double Chocolate Fudge · 20 at ₱125". */
  lines: string[];
  /** Only a planned day can be changed. */
  edit: (() => void) | null;
  /**
   * `start`: a planned day, started with signal. `review`: an open day this phone does not hold, reviewed and closed here
   * (one this phone holds is drawn as the till, never as a row, and reviewed from "Close out"). `see`: a closed day's review.
   */
  action: 'start' | 'review' | 'see' | null;
  /** Why the action is not available now, in words; null when it is. */
  actionNote: string | null;
  /** Words under the row that block nothing: where an open day is selling, how a closed day was counted. */
  hint: string | null;
  /** B4: for a closed day, what happened; null otherwise. */
  outcome: DayOutcome | null;
  /** A2: set for a planned day whose date is not today; the day starts only once she confirms it. */
  startPrompt: StartPrompt | null;
  /** Starts a planned day. With a `startPrompt` it does nothing unless `confirmed` is true. */
  start: (confirmed: boolean) => void;
  run: () => void;
}

/** One figure of a review or of the event, with the parts that open under it. Every text is already words. */
export interface ReviewFigure {
  key: string;
  label: string;
  /** "₱880", or "Cost pending" for a figure that is not known: never ₱0 for an unknown. */
  valueText: string;
  /** Words under the figure (why it is pending, what it covers); null for none. */
  note: string | null;
  parts: Array<{ label: string; detail: string | null; valueText: string }>;
  /** U5: the amount in centavos for a figure that is one (so a tile can count up to it); absent for words. */
  cents?: number;
}

export interface ReviewStockRow {
  productId: string;
  name: string;
  /** "20 made · 8 carried over" */
  onTableText: string;
  /** "5 sold · 1 given away · 1 lost" */
  goneText: string;
  /** What should be left before she counts: on the table less sold, given away and lost. */
  shouldBeLeft: number;
  /** A closed day: "13 left: 8 carried over, 3 to the shop, 2 written off · 1 not accounted". Null while open. */
  countText: string | null;
  /**
   * U5: whether the flavour has a recipe (the database refuses a flavour with none sent to the shop); null while the recipes
   * have not been read, when no split is suggested for the last day.
   */
  hasRecipe: boolean | null;
  /** U5: the numbers behind the words above, for the tiles and the per-flavour table. */
  made: number;
  carried: number;
  sold: number;
  given: number;
  lost: number;
  /** U5: her count of a closed day; null while open. */
  countedLeft: number | null;
}

/** One line of a Z-report table, in centavos. */
export interface ReportLine {
  label: string;
  detail?: string;
  cents: number;
}

/** One table of a day's Z-report: lines, and the total the database gives. The lines add up to the total. */
export interface ReportTable {
  caption: string;
  lines: ReportLine[];
  totalCents: number;
  note?: string;
}

/** U5: a closed day as a receipt: takings, how it was paid, fees and the drawer. */
export interface DayReport {
  tables: ReportTable[];
}

/** What she types to close a day: text, whole cookies and pesos. A blank is 0, except `left` of a flavour with cookies. */
export interface CloseInput {
  countedPesos: string;
  rows: Array<{
    productId: string;
    left: string;
    carryNext: string;
    toShop: string;
    writtenOff: string;
  }>;
}

/** A day's review: what is left, what was lost, the takings, the cash, and the event so far. Drawn ahead of the till. */
export interface DayReviewView {
  dayId: string;
  /** "Sat, Oct 24" */
  dateText: string;
  eventName: string;
  state: 'open' | 'closed';
  online: boolean;
  /** Words she must read first: selling on another phone, changed after the close, read again. */
  notices: string[];
  stock: ReviewStockRow[];
  /** "1 Double Chocolate Fudge · Dropped · 24 Oct, 2:15 PM" */
  losses: Array<{ id: string; text: string; remove: (() => Promise<string | null>) | null }>;
  /** The day's own figures: revenue, cash, fees. */
  dayFigures: ReviewFigure[];
  /** U5: the day as a receipt, once it is closed; null while it is selling. */
  report: DayReport | null;
  /** The event so far: revenue, fees, cookie cost, profit, against the target. */
  eventFigures: ReviewFigure[];
  /** Words over the event's figures while a day is still open; null otherwise. */
  eventNote: string | null;
  /** The flavours of the day, for the loss and the add-stock forms. */
  flavours: Array<{ id: string; name: string }>;
  /** Null when the day is closed. Each returns null when saved, otherwise the words for what is wrong. */
  addLoss:
    ((input: { productId: string; qty: string; reason: string }) => Promise<string | null>) | null;
  addStock:
    | ((input: {
        productId: string;
        qty: string;
        kind: 'made' | 'carried';
      }) => Promise<string | null>)
    | null;
  /** Carried-over cookies can be added only when an earlier day of the booking set some aside. */
  canAddCarried: boolean;
  /** Null for a closed day. */
  close: {
    /** Nothing carries over from the booking's last day: the field is not offered. */
    lastDay: boolean;
    /** "₱1,000" */
    cashExpectedText: string;
    /** U5: what the drawer should hold, in centavos, and as the pesos "It matches" puts in the field ("1640.00"). */
    cashExpectedCents: number;
    cashExpectedPesos: string;
    /** Why the day cannot be closed now, in words; null when it can. */
    blocked: string | null;
    /** Null when the day is closed; otherwise the words for what is wrong (the form stays as it is). */
    submit: (input: CloseInput) => Promise<string | null>;
  } | null;
  /** "Back to the till" or "Back to the event". */
  backText: string;
  back: () => void;
}

export interface BazaarEventView {
  id: string;
  name: string;
  placeText: string;
  datesText: string;
  /** "Stall rent ₱2,500" */
  rentText: string;
  /** U4: the stall rent in centavos, for the fees receipt. */
  rentCents: number;
  /** U4: the pill by the name: where the event stands. */
  status: HubStatus;
  /** U4: cookies sold across the event so far. */
  soldCount: number;
  /** U4: the event's profit and target in centavos; null while not known or not set. */
  profitCents: number | null;
  targetCents: number | null;
  days: BazaarDayRow[];
  /** Words she must read first (closed, changed after it was closed); none is an empty list. */
  notices: string[];
  /** The fees with the stall rent first: "Permit · Whole event · Oct 24" and its amount. */
  fees: Array<{
    id: string;
    text: string;
    amountText: string;
    /** U4: the amount in centavos, for the receipt. */
    amountCents: number;
    /** S3.1: takes the fee back. Null for the rent, a till expense, and once the event is closed. */
    remove: (() => Promise<string | null>) | null;
  }>;
  feesTotalText: string;
  /** U4: the fees' total in centavos (the rent included), for the receipt. */
  feesTotalCents: number;
  /** What a new fee can be for: the whole event (null) or one of its days. */
  feeFor: Array<{ dayId: string | null; text: string }>;
  /** Null once the event is closed. Returns null when saved, otherwise the words for what is wrong. */
  addFee:
    | ((input: { label: string; amount: string; dayId: string | null }) => Promise<string | null>)
    | null;
  /** "₱500", or "No target set". */
  targetText: string;
  /** The target as the input shows it; blank for none. */
  targetPesos: string;
  /** Null once the event is closed. Blank sets no target. */
  saveTarget: ((pesos: string) => Promise<string | null>) | null;
  /**
   * Each flavour of a started day with its cost per cookie in words ("₱12.005 per cookie · from the recipe",
   * "₱28.7525 per cookie · typed by you", or "Cost pending"). `save` takes her typed pesos, or blank to go back to the
   * recipe's; null once the event is closed.
   */
  costs: Array<{
    productId: string;
    name: string;
    text: string;
    typedPesos: string;
    save: ((pesos: string) => Promise<string | null>) | null;
    /** U4: the cost per cookie alone ("₱12.005", or "Cost pending") and where it came from ("from the recipe"). */
    unitText: string;
    sourceText: string;
    /**
     * U4: the recipe's cost per cookie as the database works it out, as a receipt ("Ingredients", "Packaging", then the
     * total). Null when the recipe's cost has not been read, or when it is not the cost this event is using (`note` says
     * so). Nothing is worked out here: these are the database's own figures.
     */
    breakdown: Array<{ label: string; valueText: string }> | null;
    breakdownNote: string | null;
  }>;
  /** The event's figures, each openable: revenue, fees, cookie cost, profit, against the target. Empty before a day starts. */
  figures: ReviewFigure[];
  /** Words over the figures while a day is still open; null otherwise. */
  figuresNote: string | null;
  /** "Close the event". Null once it is closed, and before any day has started. */
  finalise: {
    /** Why it cannot be closed now, in words; null when it can. */
    blocked: string | null;
    /** A1: cookies a day set aside to carry over that no day took. Empty when none were stranded. */
    stranded: StrandedRow[];
    /** "Sun, 25 Oct": the day they were carried to, which has not started; null when none were stranded. */
    strandedFor: string | null;
    /** A5: flavours with cookies and no cost per cookie, so no profit. Empty when every cost is known. */
    costPending: Array<{ productId: string; name: string; sold: number }>;
    /**
     * Closes the event: saves each typed cost first (the flavour's own), reads the event again, then closes it with the
     * split. Null when closed; otherwise the words for what is wrong.
     */
    run: (input: FinaliseInput) => Promise<string | null>;
  } | null;
  /** Dates of the booking that have no plan yet, soonest first, as `YYYY-MM-DD` with their words. */
  unplanned: Array<{ ymd: string; text: string }>;
  planDay: (ymd: string) => void;
  back: () => void;
}

/** A1: one flavour's stranded cookies, with where they are suggested to go. */
export interface StrandedRow {
  productId: string;
  name: string;
  qty: number;
  /** Whether the flavour has a recipe (the database refuses cookies sent to the shop without one); null while unread. */
  hasRecipe: boolean | null;
  /** What is suggested to go to the shop: all of it with a recipe, none without; null while the recipes are unread. */
  suggestedToShop: number | null;
}

/** What she decided in the "Close the event" confirmation. Texts are what she typed; counts are whole cookies. */
export interface FinaliseInput {
  /** Per stranded flavour: how many go to the shop; the rest are written off. Null for none chosen. */
  toShop: Record<string, number | null>;
  /** Pesos per cookie typed for a flavour without a cost, by flavour. */
  costs: Record<string, string>;
  /** She chose to close with the cost still missing; profit stays "Cost pending". */
  withoutCost: boolean;
}

/** One flavour of the plan form: the strings are what the owner types, pesos and whole cookies. */
export interface PlanFlavour {
  id: string;
  name: string;
  made: string;
  carried: string;
  price: string;
  /** A stored image path for the tile; blank for none. */
  photo: string;
  /** On the menu now: these come first (finding B5). */
  onMenu: boolean;
  /** The menu's price as the input shows it, so a changed price can say what it was. */
  menuPrice: string;
}

export interface DayPlanEditor {
  dayId: string;
  eventName: string;
  /** Changes whenever the day is read again, so the form starts again from what was read. */
  key: string;
  dateText: string;
  isNew: boolean;
  floatPesos: string;
  flavours: PlanFlavour[];
  /** Cookies carried from an earlier day can be typed only when the booking has an earlier day. */
  showCarried: boolean;
  /** The day before's float and lines, for "Copy the day before"; null when there is none. */
  copy: { floatPesos: string; flavours: PlanFlavour[]; dateText: string } | null;
  /**
   * What the latest closed earlier day set aside to carry over, by flavour (only those above 0), with that day's date;
   * null when no earlier day is closed. Carrying in more than this is refused when the day starts.
   */
  carryIn: { dateText: string; byFlavour: Record<string, number> } | null;
  /** Null when saved; otherwise the words for what is wrong (the form stays as it is). */
  save: (input: { floatPesos: string; flavours: PlanFlavour[] }) => Promise<string | null>;
  back: () => void;
}

/**
 * U2: what the owner opens over the till without leaving it. `fees` is the event's own fee form (the one list, removable);
 * `cookies` adds stock to the day this phone is selling. Both are read from the database when they open.
 */
export interface TillPanelView {
  kind: 'fees' | 'cookies';
  /** `loading` while the day is read; `failed` when it could not be; `loaded` when the form can be drawn. */
  status: 'loading' | 'failed' | 'loaded';
  /** The event, for the fee form; null until read. */
  event: BazaarEventView | null;
  /** The held day's flavours and the add, for the cookies form; null until read. */
  stock: {
    flavours: Array<{ id: string; name: string }>;
    canAddCarried: boolean;
    addStock: NonNullable<DayReviewView['addStock']>;
  } | null;
  retry: () => void;
  close: () => void;
}

export interface LiveBazaarVals {
  online: boolean;
  /** False until the owner's bookings have been read: the list must not say there are none before it knows. */
  eventsRead: boolean;
  /** `loading` while a read is in flight; `failed` when it could not be read (shown with a retry). */
  state: 'read' | 'loading' | 'failed';
  list: BazaarListRow[];
  event: BazaarEventView | null;
  editor: DayPlanEditor | null;
  /**
   * True while a day's review is open (from the till's "Close out", or from an open or closed day's row): the screen draws
   * it ahead of the till. `review` is null while it is being read or when it could not be read (`state` says which).
   */
  reviewing: boolean;
  review: DayReviewView | null;
  /** U2: the fee form or the add-cookies form over the till, or null. */
  tillPanel: TillPanelView | null;
  /** Leaves a review that is still being read or could not be read. */
  closeReview: () => void;
  /** The existing "Bazaar events" form, with a row for every booking: where one is changed or switched off (until U4 moves editing to the event page). */
  add: () => void;
  /** U3: reads the started events that are under way, so the hub can place each one. Call when the hub is shown; it is safe to repeat. */
  readHub: () => void;
  /**
   * U3: adds one event from the sheet. Returns null once it is saved and listed, otherwise the words for what is wrong (no
   * signal, a refusal). The sheet checks each field itself with `validateEventForm`; this checks again before sending.
   */
  addEvent: (input: EventFormInput) => Promise<string | null>;
  /** U3: the id of the event added last, so its row can rise and show a ring. Null once she opens an event or leaves. */
  justAdded: string | null;
  retry: () => void;
  /** From a booking that could not be read (or any view of one) back to the list. */
  back: () => void;
}
