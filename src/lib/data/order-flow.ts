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
  type OrderStatusView,
  type PlacedOrder,
  type WaitlistFields
} from '@/lib/data/orders';
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
}

export class OrderFlow {
  rules: ShopOrderRules | null = null;
  rulesState: RulesState = 'loading';
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

  status: OrderStatusView | null = null;
  statusToken: string | null = null;
  statusState: StatusState = 'idle';
  private statusSeq = 0;

  lookupState: LookupState = 'idle';

  waitlistAttempt: { id: string; body: ReturnType<typeof buildWaitlistBody> } | null = null;
  waitlistState: WaitlistState = 'idle';
  waitlistMessage = '';
  waitlistErrors: FieldErrors = {};

  constructor(
    private readonly client: OrderClient,
    private readonly hooks: OrderFlowHooks
  ) {}

  /** The pickup rules, read fresh on every live page. A failed read leaves no dates to pick. */
  async loadRules(): Promise<boolean> {
    try {
      this.rules = await fetchShopOrderRules(this.client);
    } catch {
      this.rules = null;
    }
    this.rulesState = this.rules ? 'ready' : 'failed';
    this.hooks.changed();
    return this.rules !== null;
  }

  /** The owner's extras, read fresh on every live page. A failed read offers no extras; cookies still order. */
  async loadExtras(): Promise<boolean> {
    try {
      this.extras = await fetchShopExtras(this.client);
    } catch {
      this.extras = null;
    }
    this.extrasState = this.extras ? 'ready' : 'failed';
    this.pruneSelection();
    this.hooks.changed();
    return this.extras !== null;
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
    return this.attempt !== null;
  }

  /**
   * The order is being sent, is unsettled, or has been placed: the form and the box are locked, so what
   * "Try again" sends is always what the customer sees.
   */
  get locked(): boolean {
    return this.sending || this.attempt !== null || this.placed !== null;
  }

  async submit(fields: OrderFields): Promise<void> {
    if (this.sending || this.placed) return;
    const picked = this.selection();
    fields = { ...fields, addOns: picked.addOns, boxes: picked.boxes };
    if (!this.attempt) {
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
    this.sending = true;
    this.hooks.changed();
    const attempt = attemptFor(this.attempt, fields, this.hooks.mintId);
    const outcome = await placeOrder(this.client, attempt.body);
    this.attempt = settleAttempt(attempt, outcome);
    this.sending = false;
    if (outcome.kind === 'placed') {
      this.placed = outcome.order;
      this.placedLines = this.describeLines(picked);
    } else if (outcome.kind === 'refused') {
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
  changeOrder(): void {
    this.attempt = null;
    this.banner = { tone: 'notice', text: ORDER_COPY.changeWarning, canWaitlist: false };
    this.hooks.changed();
  }

  /** After "See my order" or "Order again": the next order starts clean. */
  resetCheckout(): void {
    this.attempt = null;
    this.sending = false;
    this.banner = null;
    this.errors = {};
    this.placed = null;
    this.boxQty = {};
    this.lines = {};
    this.placedLines = [];
    this.hooks.changed();
  }

  /** The order for a status token. A later call wins over an earlier one still in flight. */
  async loadStatus(token: string): Promise<void> {
    const seq = ++this.statusSeq;
    // A different link never shows the last order under its own address.
    if (this.statusToken !== token) this.status = null;
    this.statusToken = token;
    this.statusState = 'loading';
    this.hooks.changed();
    let next: OrderStatusView | null = null;
    let outcome: StatusState;
    try {
      next = await fetchOrderStatus(this.client, token);
      outcome = next ? 'loaded' : 'missing';
    } catch {
      outcome = 'error';
    }
    if (seq !== this.statusSeq) return;
    this.status = next;
    this.statusState = outcome;
    this.hooks.changed();
  }

  /** Find my order: the token for an order number and phone, then the order itself. */
  async lookup(orderNo: string, mobile: string): Promise<'found' | 'missed' | 'error'> {
    if (this.lookupState === 'busy') return 'error';
    this.lookupState = 'busy';
    this.hooks.changed();
    const found = await findOrder(this.client, orderNo, mobile);
    if (found.kind === 'found') {
      this.lookupState = 'idle';
      await this.loadStatus(found.token);
      return 'found';
    }
    this.lookupState = found.kind === 'missed' ? 'missed' : 'error';
    this.hooks.changed();
    return found.kind === 'missed' ? 'missed' : 'error';
  }

  clearLookup(): void {
    this.lookupState = 'idle';
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
