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
    if (!this.attempt) {
      const errors = orderFieldErrors(fields);
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
    } else if (outcome.kind === 'refused') {
      // A refusal a field can carry is shown on that field as well as in the banner.
      if (outcome.code === 'ZC004') this.errors = { date: outcome.message };
      if (outcome.code === 'ZC005') this.errors = { pay: outcome.message };
      this.banner = {
        tone: 'error',
        text: outcome.message,
        canWaitlist: outcome.code === 'ZC001' || outcome.code === 'ZC002'
      };
    } else {
      this.banner = { tone: 'notice', text: ORDER_COPY.unknown, canWaitlist: false };
    }
    this.hooks.changed();
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
