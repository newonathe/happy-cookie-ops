import {
  attemptFor,
  buildWaitlistBody,
  fetchOrderStatus,
  fetchShopOrderRules,
  findOrder,
  joinWaitlist,
  orderFieldErrors,
  placeOrder,
  settleAttempt,
  waitlistFieldErrors,
  type Attempt,
  type FieldErrors,
  type OrderClient,
  type OrderFields,
  type OrderBody,
  type OrderStatusView,
  type PlacedOrder,
  type WaitlistFields
} from '@/lib/data/orders';
import type { OrderRecovery } from '@/lib/orders/order-recovery';
import { manilaToday } from '@/lib/time/business-clock';
import { ORDER_COPY } from '@/lib/orders/copy';
import type { ShopOrderRules } from '@/lib/orders/pickup';
import {
  LINE_SEP,
  extrasSelectionError,
  fetchShopExtras,
  type AddOnLine,
  type BoxLine,
  type ShopExtras
} from '@/lib/data/order-extras';

/**
 * The customer's checkout, lookup and waitlist state (B2). One instance per live page, held by
 * `OpsRuntime` like `PaymentSync`. It owns everything that is not a form field (those live in the
 * engine's `cust`): the pickup rules, the unresolved attempt, the refusal banner, the placed
 * order, the order shown on the status page and the waitlist form.
 *
 * The one rule that matters: an order is placed under one client id per attempt. A definite
 * refusal or a success ends the attempt; an unknown outcome (the reply was lost, the order may
 * exist) keeps it, and the next tap sends the identical frozen body under the same id. The form is
 * read-only meanwhile, so a changed order can never ride an old id.
 */
export type Banner = { tone: 'error' | 'notice'; text: string; canWaitlist: boolean };
export type RulesState = 'loading' | 'ready' | 'failed';
export type ExtrasState = 'loading' | 'ready' | 'failed';
export type StatusState = 'idle' | 'loading' | 'loaded' | 'missing' | 'error';
export type LookupState = 'idle' | 'busy' | 'missed' | 'error';
export type WaitlistState = 'idle' | 'sending' | 'done' | 'refused' | 'unknown';

export interface OrderFlowHooks {
  /** Re-render the customer page. */
  changed: () => void;
  mintId: () => string;
  current?: () => boolean;
}

export class OrderFlow {
  rules: ShopOrderRules | null = null;
  rulesState: RulesState = 'loading';
  private rulesSeq = 0;
  private extrasSeq = 0;
  /** B4b: the owner's boxes, add-ons, sampler and same-day rule, and what this customer picked from them. */
  extras: ShopExtras | null = null;
  extrasState: ExtrasState = 'loading';
  boxQty: Record<number, number> = {};
  /** Add-on lines by `id|variant`: how many, and the message where the add-on has one. */
  lines: Record<string, { qty: number; text: string }> = {};
  /** What the placed order carried beyond flavours, as lines to show the customer. */
  placedLines: string[] = [];
  /** The same-day date the last render showed as same-day (with its percent); null when none was. */
  renderedSameDay: string | null = null;
  attempt: Attempt | null = null;
  sending = false;
  banner: Banner | null = null;
  errors: FieldErrors = {};
  placed: PlacedOrder | null = null;
  private acknowledgedAttempt: Attempt | null = null;
  recoveryState: ReturnType<OrderRecovery['read']>['phase'] = 'unscoped';

  status: OrderStatusView | null = null;
  statusToken: string | null = null;
  statusState: StatusState = 'idle';
  private statusSeq = 0;

  lookupState: LookupState = 'idle';
  private lookupSeq = 0;

  waitlistAttempt: { id: string; body: ReturnType<typeof buildWaitlistBody> } | null = null;
  waitlistState: WaitlistState = 'idle';
  waitlistMessage = '';
  waitlistErrors: FieldErrors = {};

  constructor(
    private readonly client: OrderClient,
    private readonly hooks: OrderFlowHooks,
    private readonly recovery?: OrderRecovery
  ) {}

  get hasRecovery(): boolean {
    return !!this.recovery;
  }
  get recoveryReady(): boolean {
    return !this.recovery || this.recoveryState === 'empty' || this.recoveryState === 'ready';
  }
  /** Explicit post-hydration restoration never sends a request. */
  restoreRecovery(): OrderBody | null {
    if (!this.recovery || this.hooks.current?.() === false) return null;
    const read = this.recovery.read(),
      saved = read.value;
    const known = this.attempt ?? this.acknowledgedAttempt;
    this.recoveryState = read.phase;
    if (saved && known && JSON.stringify(saved.attempt) !== JSON.stringify(known)) {
      this.recoveryState = 'invalid';
      this.hooks.changed();
      return null;
    }
    if (this.placed && this.acknowledgedAttempt) {
      if (
        saved?.placed &&
        (saved.placed.orderNo !== this.placed.orderNo || saved.placed.token !== this.placed.token)
      ) {
        this.recoveryState = 'invalid';
        this.hooks.changed();
        return null;
      }
      if (!saved?.placed) this.recoveryState = 'unavailable';
      this.hooks.changed();
      return this.acknowledgedAttempt.body;
    }
    if (!saved) {
      if (known) this.recoveryState = 'unavailable';
      this.hooks.changed();
      return null;
    }
    this.attempt = saved.placed ? null : saved.attempt;
    this.placed = saved.placed ?? null;
    this.acknowledgedAttempt = saved.placed ? saved.attempt : null;
    this.boxQty = Object.fromEntries(
      (saved.attempt.body.boxes ?? []).map((row) => [row.size, row.qty])
    );
    this.lines = Object.fromEntries(
      (saved.attempt.body.add_ons ?? []).map((row) => [
        row.id + LINE_SEP + (row.variant ?? ''),
        { qty: row.qty, text: row.text ?? '' }
      ])
    );
    this.placedLines = this.describeLines(this.selection());
    this.banner = saved.placed
      ? null
      : { tone: 'notice', text: ORDER_COPY.unknown, canWaitlist: false };
    this.hooks.changed();
    return saved.attempt.body;
  }
  retryRecovery(): OrderBody | null {
    if (!this.recovery || this.sending || this.hooks.current?.() === false) return null;
    if (this.placed && this.acknowledgedAttempt) {
      this.recoveryState = this.recovery.write({
        attempt: this.acknowledgedAttempt,
        placed: this.placed
      })
        ? 'ready'
        : 'unavailable';
      this.hooks.changed();
      return null;
    }
    const restored = this.restoreRecovery();
    if (restored || !this.attempt) return restored;
    this.recoveryState = this.recovery.write({ attempt: this.attempt }) ? 'ready' : 'unavailable';
    this.hooks.changed();
    return this.recoveryReady ? this.attempt.body : null;
  }
  private clearRecovery(): boolean {
    if (!this.recovery) return true;
    const expected = this.attempt ?? this.acknowledgedAttempt;
    const cleared = expected
      ? this.recovery.clear(expected)
      : this.recovery.read().phase === 'empty';
    this.recoveryState = cleared ? 'empty' : 'unavailable';
    if (!cleared) this.hooks.changed();
    return cleared;
  }

  /** Keep previous choices as unchecked context; only the latest active read may publish. */
  async loadRules(): Promise<boolean> {
    if (this.hooks.current?.() === false) return false;
    const sequence = ++this.rulesSeq;
    this.rulesState = 'loading';
    this.hooks.changed();
    let rules: ShopOrderRules | null = null;
    try {
      rules = await fetchShopOrderRules(this.client);
    } catch {
      /* retain the previous read */
    }
    if (sequence !== this.rulesSeq || this.hooks.current?.() === false) return false;
    if (rules) this.rules = rules;
    this.rulesState = rules ? 'ready' : 'failed';
    this.hooks.changed();
    return rules !== null;
  }

  /** An unavailable read must not erase selected boxes or add-on text. */
  async loadExtras(): Promise<boolean> {
    if (this.hooks.current?.() === false) return false;
    const sequence = ++this.extrasSeq;
    this.extrasState = 'loading';
    this.hooks.changed();
    let extras: ShopExtras | null = null;
    try {
      extras = await fetchShopExtras(this.client);
    } catch {
      /* retain choices and the previous read */
    }
    if (sequence !== this.extrasSeq || this.hooks.current?.() === false) return false;
    if (extras) {
      this.extras = extras;
      if (!this.locked) this.pruneSelection();
    }
    this.extrasState = extras ? 'ready' : 'failed';
    this.hooks.changed();
    return extras !== null;
  }

  /** What was picked stays only while the owner still offers it. */
  private pruneSelection(): void {
    const x = this.extras;
    this.boxQty = Object.fromEntries(
      Object.entries(this.boxQty).filter(([size]) => x?.boxes.some((b) => b.size === Number(size)))
    );
    this.lines = Object.fromEntries(
      Object.entries(this.lines).filter(([key]) => {
        const [id, variant = ''] = key.split(LINE_SEP);
        const cfg = x?.addOns.find((a) => a.id === id);
        return (
          !!cfg && (variant === '' ? cfg.variants.length === 0 : cfg.variants.includes(variant))
        );
      })
    );
  }

  setBox(size: number, qty: number): void {
    if (this.locked) return;
    const next = { ...this.boxQty };
    if (qty > 0) next[size] = Math.min(qty, 50);
    else delete next[size];
    this.boxQty = next;
    this.clearError('extras');
    this.hooks.changed();
  }

  setLine(key: string, patch: { qty?: number; text?: string }): void {
    if (this.locked) return;
    const cur = this.lines[key] ?? { qty: 0, text: '' };
    const qty = Math.max(0, Math.min(patch.qty ?? cur.qty, 50));
    const next = { ...this.lines };
    const line = { qty, text: patch.text ?? cur.text };
    if (qty > 0 || line.text !== '') next[key] = line;
    else delete next[key];
    this.lines = next;
    this.clearError('extras');
    this.hooks.changed();
  }

  /** The picked lines in the shape `place_order` takes; add-on lines with nothing picked are left out. */
  selection(): { addOns: AddOnLine[]; boxes: BoxLine[] } {
    const addOns: AddOnLine[] = Object.entries(this.lines)
      .filter(([, l]) => l.qty > 0)
      .map(([key, l]) => {
        const [id = '', variant = ''] = key.split(LINE_SEP);
        return { id, variant, qty: l.qty, text: l.text };
      })
      .sort((a, b) => (a.id + a.variant).localeCompare(b.id + b.variant));
    const boxes: BoxLine[] = Object.entries(this.boxQty)
      .filter(([, qty]) => qty > 0)
      .map(([size, qty]) => ({ size: Number(size), qty }))
      .sort((a, b) => a.size - b.size);
    return { addOns, boxes };
  }

  /**
   * The picked date has become today since the customer picked it (midnight passed), so the server would add the
   * same-day extra to an order that never showed one. Nothing is sent: the date says so, and the next tap places it.
   */
  holdSameDay(message: string): void {
    this.errors = { date: message };
    this.banner = null;
    this.hooks.changed();
  }

  /** A field was edited: its refusal no longer applies. */
  clearError(key: keyof FieldErrors): void {
    if (!(key in this.errors)) return;
    const rest = { ...this.errors };
    delete rest[key];
    this.errors = rest;
    this.hooks.changed();
  }

  /** True while an earlier attempt's outcome is unknown: the fields are frozen with it. */
  get unresolved(): boolean {
    return !this.sending && this.attempt !== null;
  }

  /**
   * The order is being sent, is unsettled, or has been placed: the form and the box are locked, so what
   * "Try again" sends is always what the customer sees.
   */
  get locked(): boolean {
    return this.sending || this.attempt !== null || this.placed !== null;
  }

  async submit(fields: OrderFields): Promise<void> {
    if (this.sending || this.placed || this.hooks.current?.() === false) return;
    if (!this.attempt && !this.recoveryReady) {
      this.banner = {
        tone: 'error',
        text: 'This tab could not read its saved order. Retry checkout recovery before sending.',
        canWaitlist: false
      };
      this.hooks.changed();
      return;
    }
    const picked = this.selection();
    fields = { ...fields, addOns: picked.addOns, boxes: picked.boxes };
    if (!this.attempt) {
      const needsExtras =
        fields.pickupDate === manilaToday() ||
        picked.boxes.length > 0 ||
        picked.addOns.length > 0 ||
        (!!this.extras?.sampler.productId &&
          (fields.items[this.extras.sampler.productId] ?? 0) > 0);
      if (this.rulesState !== 'ready' || (needsExtras && this.extrasState !== 'ready')) {
        this.banner = {
          tone: 'error',
          text:
            this.rulesState !== 'ready'
              ? ORDER_COPY.rulesUnavailable
              : ORDER_COPY.optionsUnavailable,
          canWaitlist: false
        };
        this.hooks.changed();
        return;
      }
      const errors = orderFieldErrors(fields);
      const x = this.extras;
      const samplerId = x?.sampler.productId ?? null;
      const cart = {
        cookieQty: Object.entries(fields.items)
          .filter(([id]) => id !== samplerId)
          .reduce((n, [, qty]) => n + Math.max(0, qty), 0),
        samplerQty: samplerId ? Math.max(0, fields.items[samplerId] ?? 0) : 0
      };
      const extrasError =
        x && (picked.addOns.length || picked.boxes.length || cart.samplerQty)
          ? extrasSelectionError(x, picked, cart, {
              box: ORDER_COPY.extras.box,
              addOn: ORDER_COPY.extras.addOn,
              variant: ORDER_COPY.extras.variant,
              text: ORDER_COPY.extras.text,
              textLong: ORDER_COPY.extras.textLong,
              qty: ORDER_COPY.extras.qty,
              sampler: ORDER_COPY.extras.sampler
            })
          : null;
      if (extrasError) errors.extras = extrasError;
      if (Object.keys(errors).length) {
        this.errors = errors;
        this.banner = null;
        this.hooks.changed();
        return;
      }
    }
    this.errors = {};
    this.banner = null;
    const attempt = attemptFor(this.attempt, fields, this.hooks.mintId);
    this.attempt = attempt;
    if (this.recovery && !this.recovery.write({ attempt })) {
      this.recoveryState = 'unavailable';
      this.banner = {
        tone: 'error',
        text: 'This tab could not keep your request safely. Nothing was sent this time. Keep this page open and retry checkout recovery.',
        canWaitlist: false
      };
      this.hooks.changed();
      return;
    }
    this.recoveryState = this.recovery ? 'ready' : 'unscoped';
    this.sending = true;
    this.hooks.changed();
    const outcome = await placeOrder(this.client, attempt.body);
    this.attempt = settleAttempt(attempt, outcome);
    this.sending = false;
    if (outcome.kind === 'placed') {
      this.placed = outcome.order;
      this.acknowledgedAttempt = attempt;
      if (this.recovery && !this.recovery.write({ attempt, placed: outcome.order }))
        this.recoveryState = 'unavailable';
      this.placedLines = this.describeLines(picked);
    } else if (outcome.kind === 'refused') {
      if (this.recovery)
        this.recoveryState = this.recovery.clear(attempt) ? 'empty' : 'unavailable';
      if (outcome.code === 'ZC007') void this.loadExtras();
      // A refusal a field can carry is shown on that field as well as in the banner.
      if (outcome.code === 'ZC004') this.errors = { date: outcome.message };
      if (outcome.code === 'ZC005') this.errors = { pay: outcome.message };
      this.banner = {
        tone: 'error',
        text:
          outcome.code === '22023' && attempt.body.boxes ? ORDER_COPY.extras.box : outcome.message,
        canWaitlist: outcome.code === 'ZC001' || outcome.code === 'ZC002'
      };
    } else {
      this.banner = { tone: 'notice', text: ORDER_COPY.unknown, canWaitlist: false };
    }
    this.hooks.changed();
  }

  /** The picked extras as lines the placed card shows ("Sticker 2 x1", "Box of 6 x1"). */
  private describeLines(picked: { addOns: AddOnLine[]; boxes: BoxLine[] }): string[] {
    const out: string[] = [];
    for (const l of picked.addOns) {
      const name = this.extras?.addOns.find((a) => a.id === l.id)?.name ?? l.id;
      out.push(`${name}${l.variant ? ' ' + l.variant : ''} × ${l.qty}`);
    }
    for (const b of picked.boxes) out.push(`Box of ${b.size} × ${b.qty}`);
    return out;
  }

  /** Drops the frozen attempt. The customer is told to check whether the last try went through. */
  changeOrder(): boolean {
    if (this.sending || this.placed || this.hooks.current?.() === false) return false;
    if (this.recovery?.read().value?.placed) {
      this.restoreRecovery();
      if (this.placed) return false;
    }
    if (!this.clearRecovery()) return false;
    this.attempt = null;
    this.banner = { tone: 'notice', text: ORDER_COPY.changeWarning, canWaitlist: false };
    this.hooks.changed();
    return true;
  }

  /** Starts another order only after the caller explicitly requests it. */
  resetCheckout(): boolean {
    if (
      this.sending ||
      this.hooks.current?.() === false ||
      (this.recovery && this.attempt && !this.placed)
    )
      return false;
    if (!this.clearRecovery()) return false;
    this.attempt = null;
    this.sending = false;
    this.banner = null;
    this.errors = {};
    this.placed = null;
    this.acknowledgedAttempt = null;
    this.boxQty = {};
    this.lines = {};
    this.placedLines = [];
    this.hooks.changed();
    return true;
  }

  /** The order for a status token. A later call wins over an earlier one still in flight. */
  async loadStatus(token: string): Promise<void> {
    const seq = ++this.statusSeq;
    // A different link never shows the last order under its own address.
    if (this.statusToken !== token) this.status = null;
    this.statusToken = token;
    this.statusState = 'loading';
    this.hooks.changed();
    const next = await this.statusSnapshot(token);
    if (seq !== this.statusSeq) return;
    this.status = next.status;
    this.statusState = next.state;
    this.hooks.changed();
  }

  private async statusSnapshot(
    token: string
  ): Promise<{ status: OrderStatusView | null; state: StatusState }> {
    try {
      const status = await fetchOrderStatus(this.client, token);
      return { status, state: status ? 'loaded' : 'missing' };
    } catch {
      return { status: null, state: 'error' };
    }
  }

  /** Publish a lookup only after both reads finish under its original view and status intent. */
  async lookup(
    orderNo: string,
    mobile: string,
    current: () => boolean = () => this.hooks.current?.() !== false
  ): Promise<'found' | 'missed' | 'error'> {
    if (this.lookupState === 'busy' || !current() || this.hooks.current?.() === false)
      return 'error';
    const seq = ++this.lookupSeq,
      statusSeq = this.statusSeq;
    const active = () =>
      seq === this.lookupSeq &&
      statusSeq === this.statusSeq &&
      current() &&
      this.hooks.current?.() !== false;
    this.lookupState = 'busy';
    this.hooks.changed();
    try {
      const found = await findOrder(this.client, orderNo, mobile);
      if (!active()) return 'error';
      if (found.kind === 'found') {
        const next = await this.statusSnapshot(found.token);
        if (!active()) return 'error';
        ++this.statusSeq;
        this.statusToken = found.token;
        this.status = next.status;
        this.statusState = next.state;
        this.lookupState = 'idle';
        this.hooks.changed();
        return 'found';
      }
      this.lookupState = found.kind === 'missed' ? 'missed' : 'error';
      this.hooks.changed();
      return found.kind === 'missed' ? 'missed' : 'error';
    } finally {
      if (seq === this.lookupSeq && this.lookupState === 'busy') {
        this.lookupState = 'idle';
        this.hooks.changed();
      }
    }
  }

  clearLookup(): void {
    ++this.lookupSeq;
    this.lookupState = 'idle';
    this.hooks.changed();
  }

  async joinWaitlist(fields: WaitlistFields): Promise<void> {
    if (this.waitlistState === 'sending') return;
    if (!this.waitlistAttempt) {
      const errors = waitlistFieldErrors(fields);
      if (Object.keys(errors).length) {
        this.waitlistErrors = errors;
        this.hooks.changed();
        return;
      }
    }
    this.waitlistErrors = {};
    this.waitlistState = 'sending';
    this.hooks.changed();
    const attempt =
      this.waitlistAttempt ??
      (() => {
        const id = this.hooks.mintId();
        return { id, body: buildWaitlistBody(id, fields) };
      })();
    const outcome = await joinWaitlist(this.client, attempt.body);
    if (outcome.kind === 'unknown') {
      this.waitlistAttempt = attempt;
      this.waitlistState = 'unknown';
      this.waitlistMessage = ORDER_COPY.waitlistUnknown;
    } else {
      this.waitlistAttempt = null;
      if (outcome.kind === 'joined') {
        this.waitlistState = 'done';
        this.waitlistMessage = ORDER_COPY.waitlistDone;
      } else {
        this.waitlistState = 'refused';
        this.waitlistMessage = outcome.message;
      }
    }
    this.hooks.changed();
  }

  resetWaitlist(): void {
    this.waitlistAttempt = null;
    this.waitlistState = 'idle';
    this.waitlistMessage = '';
    this.waitlistErrors = {};
  }
}
