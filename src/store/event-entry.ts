import {
  emptyEventEntry,
  freezeEventEntry,
  type EventEntryRead,
  type EventEntryRecord,
  type EventEntryScope,
  type FrozenEventRequest
} from '@/lib/bazaar/event-entry-recovery';
import {
  validateEventForm,
  type EventFormError,
  type EventFormField,
  type EventFormInput
} from '@/lib/bazaar/event-form';

/** `closed`: no verified owner yet. `locked`: another tab holds this. `invalid`/`unavailable`: the device copy is in the way. */
export type EventEntryPhase = 'closed' | 'locked' | 'invalid' | 'unavailable' | 'ready';

export interface EventEntryPorts {
  lock: (scope: EventEntryScope) => Promise<(() => void) | null>;
  read: (scope: EventEntryScope) => EventEntryRead;
  write: (scope: EventEntryScope, value: EventEntryRecord, resolvedId?: string) => boolean;
  /** True only once the server holds this event: its receipt, or the same id read back. */
  send: (body: FrozenEventRequest) => Promise<boolean>;
  changed: () => void;
  online: () => boolean;
  uuid: () => string;
  /** Moves an unreadable device copy aside, keeping its bytes. */
  keepInvalid?: (scope: EventEntryScope) => boolean;
  /** Reads the bookings again: is this id there? Null when the read did not answer. */
  listed?: (id: string) => Promise<boolean | null>;
}

export interface EventEntryView {
  phase: EventEntryPhase;
  /** The page is showing. A retained draft can exist with the page closed. */
  open: boolean;
  step: 'entry' | 'review';
  draft: EventFormInput | null;
  errors: EventFormError[];
  /** A request was retained and is not known to have reached the server. It can only be sent again. */
  pending: boolean;
  saving: boolean;
  /** Said once a send has not been confirmed. */
  unconfirmed: boolean;
  offline: boolean;
  saved: { id: string } | null;
}

/** The view plus what the page can do. */
export interface EventEntryVals extends EventEntryView {
  begin: () => void;
  set: (field: EventFormField, value: string) => void;
  review: () => void;
  change: () => void;
  save: () => Promise<void>;
  leave: () => void;
  discard: () => void;
  retryStorage: () => Promise<void>;
  setAside: () => void;
  abandon: () => Promise<void>;
  acknowledgeSaved: () => void;
}

const blank = (id: string): EventFormInput => ({
  id,
  name: '',
  place: '',
  startsOn: '',
  endsOn: '',
  rent: ''
});

/**
 * Adding an event. What was typed stays on this device, for this owner and backend, so leaving the
 * page or reloading loses nothing. Before the first send the exact request is written down; every
 * retry sends those same bytes under the same id, so a lost reply can never make a second event.
 * The request is let go only on the server's confirmation, or when the owner abandons it after a
 * read shows the server does not have it.
 */
export class EventEntry {
  private scope: EventEntryScope | null = null;
  private generation = 0;
  private release: (() => void) | null = null;
  private record: EventEntryRecord | null = null;
  private phase: EventEntryPhase = 'closed';
  private open = false;
  private step: 'entry' | 'review' = 'entry';
  private errors: EventFormError[] = [];
  private saving = false;
  private unconfirmed = false;
  private offline = false;
  private saved: { id: string } | null = null;
  /** A confirmed id whose device copy could not be cleared yet. */
  private resolving: string | null = null;

  constructor(private readonly ports: EventEntryPorts) {}

  /** Binds to the verified owner: the lock first, and only then the device copy. Null closes. */
  async bind(scope: EventEntryScope | null): Promise<void> {
    // The same owner again changes nothing: a repeat must not drop the open page or its own lock.
    if (
      scope &&
      this.scope &&
      this.phase !== 'locked' &&
      scope.userId === this.scope.userId &&
      scope.business === this.scope.business
    )
      return;
    this.reset();
    if (!scope) return this.ports.changed();
    this.scope = scope;
    const generation = this.generation;
    let release = await this.ports.lock(scope).catch(() => null);
    // A lock this tab just gave up is freed a moment later, so one refusal is asked again before saying so.
    if (!release && generation === this.generation) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (generation === this.generation) release = await this.ports.lock(scope).catch(() => null);
    }
    if (generation !== this.generation) {
      release?.();
      return;
    }
    if (!release) {
      this.phase = 'locked';
      return this.ports.changed();
    }
    this.release = release;
    this.loadRecord(scope);
    this.ports.changed();
  }

  dispose(): void {
    this.reset();
    this.ports.changed();
  }

  private reset(): void {
    this.generation += 1;
    this.release?.();
    this.release = null;
    this.scope = null;
    this.record = null;
    this.phase = 'closed';
    this.open = false;
    this.step = 'entry';
    this.errors = [];
    this.saving = false;
    this.unconfirmed = false;
    this.offline = false;
    this.saved = null;
    this.resolving = null;
  }

  private loadRecord(scope: EventEntryScope): void {
    const read = this.ports.read(scope);
    if (read.status === 'invalid' || read.status === 'unavailable') {
      this.record = null;
      this.phase = read.status;
      return;
    }
    this.record = read.value ?? emptyEventEntry(scope);
    this.phase = 'ready';
    if (this.record.submitted) this.step = 'review';
  }

  private store(next: EventEntryRecord, resolvedId?: string): boolean {
    if (!this.scope) return false;
    const ok = this.ports.write(this.scope, next, resolvedId);
    if (!ok) this.phase = 'unavailable';
    return ok;
  }

  private get pending(): boolean {
    return !!this.record?.submitted;
  }

  begin(): void {
    if (this.phase !== 'ready' || !this.record) return;
    this.open = true;
    this.saved = null;
    if (!this.record.draft) {
      const next = { ...this.record, draft: blank(this.ports.uuid()) };
      this.record = next;
      this.store(next);
    }
    this.ports.changed();
  }

  set(field: EventFormField, value: string): void {
    const record = this.record;
    if (this.phase !== 'ready' || !record?.draft || this.pending || this.step === 'review') return;
    const draft = { ...record.draft, [field]: value };
    // The last day follows the first while it is blank or would come before it.
    if (field === 'startsOn' && (draft.endsOn === '' || draft.endsOn < value)) draft.endsOn = value;
    const next = { ...record, draft };
    this.record = next;
    this.errors = this.errors.filter((error) => error.field !== field);
    this.store(next);
    this.ports.changed();
  }

  /** Validates what was typed, and goes to Review only when it is all right. */
  review(): void {
    const draft = this.record?.draft;
    if (this.phase !== 'ready' || !draft) return;
    const checked = validateEventForm(draft);
    this.errors = checked.ok ? [] : checked.errors;
    if (checked.ok) this.step = 'review';
    this.ports.changed();
  }

  /** Back to the form. A retained request stays on Review: it can only be sent again. */
  change(): void {
    if (this.saving || this.pending) return;
    this.step = 'entry';
    this.ports.changed();
  }

  async save(): Promise<void> {
    if (this.saving || this.phase !== 'ready' || !this.scope || !this.record?.draft) return;
    if (this.step !== 'review' && !this.pending) return;
    if (!this.ports.online()) {
      this.offline = true;
      return this.ports.changed();
    }
    this.offline = false;
    let record = this.record;
    if (!record.submitted) {
      const frozen = freezeEventEntry(record.draft!);
      if (!frozen) {
        this.step = 'entry';
        return this.review();
      }
      const next = { ...record, submitted: frozen };
      // Nothing is sent until the device has it: a reload must find the very request that went out.
      if (!this.store(next)) return this.ports.changed();
      this.record = next;
      record = next;
    }
    const body = record.submitted!;
    const generation = this.generation;
    this.saving = true;
    this.unconfirmed = false;
    this.ports.changed();
    const confirmed = await this.ports.send(body).catch(() => false);
    if (generation !== this.generation) return;
    this.saving = false;
    if (confirmed) this.resolve(body.p_event.id);
    else this.unconfirmed = true;
    this.ports.changed();
  }

  private resolve(id: string): void {
    this.saved = { id };
    this.open = false;
    this.step = 'entry';
    this.errors = [];
    this.unconfirmed = false;
    const next = { ...this.record!, draft: null, submitted: null };
    this.record = next;
    this.resolving = id;
    if (this.store(next, id)) this.resolving = null;
  }

  /** Leaves the page. What was typed stays. */
  leave(): void {
    if (this.saving) return;
    this.open = false;
    this.ports.changed();
  }

  /** Throws the draft away. A request that may have reached the server cannot be thrown away here. */
  discard(): void {
    const record = this.record;
    if (this.phase !== 'ready' || !record || this.saving || this.pending) return;
    const next = { ...record, draft: null };
    this.record = next;
    this.open = false;
    this.step = 'entry';
    this.errors = [];
    this.store(next);
    this.ports.changed();
  }

  /** Tries again after the device refused: the same copy, or the same read. */
  async retryStorage(): Promise<void> {
    if (!this.scope) return;
    if (this.phase === 'locked') return this.bind(this.scope);
    if (this.phase !== 'unavailable') return;
    if (!this.record) {
      this.loadRecord(this.scope);
    } else if (this.ports.write(this.scope, this.record, this.resolving ?? undefined)) {
      this.resolving = null;
      this.phase = 'ready';
    }
    this.ports.changed();
  }

  /** Moves an unreadable copy aside and starts clean. The owner asked; the bytes are kept. */
  setAside(): void {
    if (this.phase !== 'invalid' || !this.scope || !this.ports.keepInvalid) return;
    if (this.ports.keepInvalid(this.scope)) this.loadRecord(this.scope);
    this.ports.changed();
  }

  /** Lets go of an unconfirmed request, only after a read shows the server does not have it. */
  async abandon(): Promise<void> {
    const body = this.record?.submitted;
    if (!body || this.saving || !this.ports.listed) return;
    const generation = this.generation;
    this.saving = true;
    this.ports.changed();
    const listed = await this.ports.listed(body.p_event.id).catch(() => null);
    if (generation !== this.generation) return;
    this.saving = false;
    if (listed === true) this.resolve(body.p_event.id);
    else if (listed === false) {
      const next = { ...this.record!, submitted: null };
      this.record = next;
      this.step = 'entry';
      this.unconfirmed = false;
      this.store(next, body.p_event.id);
    } else this.unconfirmed = true;
    this.ports.changed();
  }

  acknowledgeSaved(): void {
    this.saved = null;
    this.ports.changed();
  }

  view(): EventEntryView {
    return {
      phase: this.phase,
      open: this.open,
      step: this.step,
      draft: this.record?.draft ?? null,
      errors: this.errors,
      pending: this.pending,
      saving: this.saving,
      unconfirmed: this.unconfirmed,
      offline: this.offline,
      saved: this.saved
    };
  }

  vals(): EventEntryVals {
    return {
      ...this.view(),
      begin: () => this.begin(),
      set: (field, value) => this.set(field, value),
      review: () => this.review(),
      change: () => this.change(),
      save: () => this.save(),
      leave: () => this.leave(),
      discard: () => this.discard(),
      retryStorage: () => this.retryStorage(),
      setAside: () => this.setAside(),
      abandon: () => this.abandon(),
      acknowledgeSaved: () => this.acknowledgeSaved()
    };
  }
}
