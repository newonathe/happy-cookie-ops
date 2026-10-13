/**
 * What the live owner's Bazaar screens (S2) draw: the event list, an event's page and a day's plan. The runtime builds this
 * from the bookings it has read and `get_bazaar`; the screens in src/components/live/bazaar/ only draw it and call its
 * actions. Every text is already words for the screen. The till is not part of this: while an event is open on the phone the
 * screen draws the ported Bazaar Mode, whatever this holds.
 *
 * This file is the contract between the data side (src/store/bazaar-days.ts, src/store/ops-runtime.tsx) and the screens.
 * Add to it only together with both sides.
 */

/** A day's state as a word first: the colour never says it alone. */
export type DayWord = 'Planned' | 'Selling' | 'Closed';

export interface BazaarListRow {
  id: string;
  name: string;
  /** "Sat, Oct 24 – Sun, Oct 25" */
  datesText: string;
  /** The place, or "No place set". */
  placeText: string;
  open: () => void;
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
   * `start`: a planned day, started with signal. `resume`: a day that is open on the server but not on this phone.
   * Null for a closed day. (A day this phone holds is drawn as the till, never as a row.)
   */
  action: 'start' | 'resume' | null;
  /** Why the action is not available now, in words; null when it is. */
  actionNote: string | null;
  run: () => void;
}

export interface BazaarEventView {
  id: string;
  name: string;
  placeText: string;
  datesText: string;
  /** "Stall rent ₱2,500" */
  rentText: string;
  days: BazaarDayRow[];
  /** Dates of the booking that have no plan yet, soonest first, as `YYYY-MM-DD` with their words. */
  unplanned: Array<{ ymd: string; text: string }>;
  planDay: (ymd: string) => void;
  back: () => void;
}

/** One flavour of the plan form: the strings are what the owner types, pesos and whole cookies. */
export interface PlanFlavour {
  id: string;
  name: string;
  made: string;
  carried: string;
  price: string;
}

export interface DayPlanEditor {
  dayId: string;
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
  /** Null when saved; otherwise the words for what is wrong (the form stays as it is). */
  save: (input: { floatPesos: string; flavours: PlanFlavour[] }) => Promise<string | null>;
  back: () => void;
}

export interface LiveBazaarVals {
  online: boolean;
  /** `loading` while a read is in flight; `failed` when it could not be read (shown with a retry). */
  state: 'read' | 'loading' | 'failed';
  list: BazaarListRow[];
  event: BazaarEventView | null;
  editor: DayPlanEditor | null;
  /** The existing "Bazaar events" form: where a booking is added. */
  add: () => void;
  retry: () => void;
  /** From a booking that could not be read (or any view of one) back to the list. */
  back: () => void;
}
