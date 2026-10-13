import {
  fetchBazaar,
  saveBazaarDay,
  type Bazaar,
  type BazaarClient,
  type BazaarDay
} from '@/lib/data/bazaar-days';
import { dateRange, upcomingEvents, type ScheduledEvent } from '@/lib/data/scheduled-events';
import type {
  BazaarDayRow,
  BazaarEventView,
  DayPlanEditor,
  DayWord,
  LiveBazaarVals,
  PlanFlavour
} from '@/lib/bazaar/live-bazaar-types';
import { cookiesText, pesoInput, pesoText, planFromForm } from '@/lib/bazaar/plan';

/**
 * The owner's bazaar days (S2): which booking is open, what `get_bazaar` returned for it, and the day plan being edited.
 * It holds no money of its own: centavos stay as the database has them and become text only in `src/lib/bazaar/plan.ts`.
 * The runtime owns one and builds its screens' data from `vals()`. Starting a day is the runtime's (`beginBazaarDay`): it
 * puts the day into the engine, which this only asks for.
 */
export interface BazaarDaysDeps {
  client: () => BazaarClient | null;
  online: () => boolean;
  bookings: () => readonly ScheduledEvent[];
  /** The flavours a day can be planned with: the engine's, with their menu price in centavos. */
  flavours: () => ReadonlyArray<{ id: string; name: string; priceCents: number }>;
  /** True while this phone holds an event (a started day, or one from before): a second cannot start. */
  holdsEvent: () => boolean;
  begin: (
    booking: { id: string; name: string },
    day: { id: string; day: string }
  ) => Promise<'started' | 'offline' | 'refused'>;
  rerender: () => void;
  toast: (text: string, kind?: 'warn') => void;
  today: () => string;
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
  holding: 'This phone is already selling an event'
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

export class BazaarDays {
  private bookingId: string | null = null;
  private data: Bazaar | null = null;
  private reading: 'read' | 'loading' | 'failed' = 'read';
  private seq = 0;
  private editing: { dayId: string; ymd: string; stamp: string | null } | null = null;
  private busy = false;

  constructor(private readonly deps: BazaarDaysDeps) {}

  /** The owner's way out of every view: back to the list, nothing kept. */
  reset(): void {
    this.bookingId = null;
    this.data = null;
    this.editing = null;
    this.reading = 'read';
    this.seq += 1;
  }

  open(bookingId: string): void {
    this.bookingId = bookingId;
    this.data = null;
    this.editing = null;
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

  vals(): LiveBazaarVals {
    const booking = this.booking();
    const event = booking && this.data ? this.eventView(booking, this.data) : null;
    return {
      online: this.deps.online(),
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
      add: () => this.deps.openAdd(),
      retry: () => (this.bookingId ? void this.reload() : this.deps.rerender()),
      back: this.back
    };
  }

  private back = (): void => {
    this.reset();
    this.deps.rerender();
  };

  private eventView(booking: ScheduledEvent, data: Bazaar): BazaarEventView {
    const planned = new Set(data.days.map((d) => d.day));
    const open = data.days.find((d) => d.state === 'open');
    return {
      id: booking.id,
      name: booking.name,
      placeText: booking.place || 'No place set',
      datesText: dateRange(data.booking.startsOn, data.booking.endsOn),
      rentText: 'Stall rent ' + pesoText(data.booking.rentCents),
      days: [...data.days]
        .sort((a, b) => a.day.localeCompare(b.day))
        .map((d) => this.dayRow(booking, d, open)),
      unplanned: datesBetween(data.booking.startsOn, data.booking.endsOn)
        .filter((ymd) => !planned.has(ymd))
        .map((ymd) => ({ ymd, text: dateRange(ymd, ymd) })),
      planDay: (ymd) => this.plan(ymd),
      back: this.back
    };
  }

  private dayRow(
    booking: ScheduledEvent,
    day: BazaarDay,
    open: BazaarDay | undefined
  ): BazaarDayRow {
    const total = day.lines.reduce((t, l) => t + l.made + l.carried, 0);
    let action: BazaarDayRow['action'] = null;
    let note: string | null = null;
    if (day.state === 'planned') {
      action = 'start';
      if (total === 0) note = COPY.noStock;
      else if (open) note = COPY.anotherOpen;
    } else if (day.state === 'open') action = 'resume';
    if (action && note === null) {
      if (!this.deps.online()) note = COPY.needSignal;
      else if (this.deps.holdsEvent()) note = COPY.holding;
    }
    return {
      id: day.id,
      dateText: dateRange(day.day, day.day),
      word: WORD[day.state],
      cookiesText: total === 0 ? 'Nothing planned' : cookiesText(total) + ' on the table',
      floatText: 'Float ' + pesoText(day.floatCents),
      lines: day.lines
        .filter((l) => l.made + l.carried > 0)
        .map((l) => l.name + ' · ' + (l.made + l.carried) + ' at ' + pesoText(l.priceCents)),
      edit: day.state === 'planned' ? () => this.edit(day) : null,
      action,
      actionNote: note,
      run: () => void this.start(booking, day)
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
      save: (input) => this.save(booking, input),
      back: () => {
        this.editing = null;
        this.deps.rerender();
      }
    };
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
}
