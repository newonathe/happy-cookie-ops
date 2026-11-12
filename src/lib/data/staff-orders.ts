import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { centavosFromDb, centavosToPesos } from '@/lib/money';
import { STAFF_COPY } from '@/lib/orders/staff-copy';
import { ordersRead } from '@/lib/orders/orders-read-state';
import { manilaToday, weekStart } from '@/lib/time/business-clock';

export { manilaToday } from '@/lib/time/business-clock';

/**
 * The owner's side of an order (B3, migration 20260101003700). `get_staff_orders()` is the one
 * read; every change is a `staff_*` RPC that is owner-only, idempotent (a retry after a lost reply
 * returns the current row) and checks the `updated_at` stamp this file carries from the read.
 * The database's `state` values are the engine's `status` values, so the ported orders, order,
 * bake and pack screens are fed by mapping rows into `state.orders` — no markup changes.
 */
export type StaffOrderClient = Pick<SupabaseClient<Database>, 'rpc'>;

export const STAFF_STATES = [
  'Payment review',
  'Confirmed',
  'Preparing',
  'Ready',
  'Completed',
  'Cancelled',
  'No-show'
] as const;
export type StaffState = (typeof STAFF_STATES)[number];
const PAY_STATES = ['unpaid', 'claimed', 'confirmed', 'refunded'] as const;
export type StaffPayState = (typeof PAY_STATES)[number];

export interface StaffOrderItem {
  productId: string;
  qty: number;
  unitCents: number;
  unavailable: boolean;
}
/** An add-on the order carries (B4): frozen at order time. `note` is the customer's own message. */
export interface StaffAddOn {
  name: string;
  qty: number;
  unitCents: number;
  variant: string;
  note: string;
}
export interface StaffBox {
  size: number;
  qty: number;
  chargeCents: number;
}
export interface StaffOrderSwap {
  from: string;
  to: string;
  qty: number;
  deltaCents: number;
  at: number;
}
export interface StaffOrder {
  id: string;
  name: string;
  phone: string;
  ig: string;
  state: StaffState;
  payState: StaffPayState;
  payMethod: string;
  payRef: string;
  totalCents: number;
  paidCents: number | null;
  refundRef: string;
  pickupDate: string | null;
  pickupWindow: string | null;
  placedAt: number;
  updatedAt: string;
  statusToken: string | null;
  /** Whether the order still holds slots in its pickup week (the D1 rule, computed by the database). */
  holds: boolean;
  items: StaffOrderItem[];
  swaps: StaffOrderSwap[];
  /** B4: what the total carries beyond the items. `totalCents` already includes all of it. */
  surchargeCents: number;
  sameDay: boolean;
  addOns: StaffAddOn[];
  boxes: StaffBox[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string';
const whole = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);

/** The database's order state / pay state as the app's, or undefined: one mapping for a read and an acknowledgement. */
const stateOf = (v: unknown): StaffState | undefined => STAFF_STATES.find((s) => s === v);
const payStateOf = (v: unknown): StaffPayState | undefined => PAY_STATES.find((s) => s === v);
const paidOf = (v: unknown): number | null => (whole(v) ? centavosFromDb(v) : null);

function parseItem(raw: unknown): StaffOrderItem | null {
  if (!isObj(raw) || !text(raw.product_id) || !whole(raw.qty) || raw.qty < 1) return null;
  if (!whole(raw.unit_price_cents) || raw.unit_price_cents < 0) return null;
  return {
    productId: raw.product_id,
    qty: raw.qty,
    unitCents: centavosFromDb(raw.unit_price_cents),
    unavailable: raw.unavailable === true
  };
}

function parseAddOn(raw: unknown): StaffAddOn | null {
  if (!isObj(raw) || !text(raw.name) || !whole(raw.qty) || raw.qty < 1) return null;
  if (!whole(raw.unit_price_cents) || raw.unit_price_cents < 0) return null;
  return {
    name: raw.name,
    qty: raw.qty,
    unitCents: centavosFromDb(raw.unit_price_cents),
    variant: text(raw.variant) ? raw.variant : '',
    note: text(raw.note) ? raw.note : ''
  };
}

function parseBox(raw: unknown): StaffBox | null {
  if (!isObj(raw) || !whole(raw.size) || !whole(raw.qty) || raw.qty < 1) return null;
  if (!whole(raw.charge_cents) || raw.charge_cents < 0) return null;
  return { size: raw.size, qty: raw.qty, chargeCents: centavosFromDb(raw.charge_cents) };
}

function parseSwap(raw: unknown): StaffOrderSwap | null {
  if (!isObj(raw) || !text(raw.from) || !text(raw.to) || !whole(raw.qty) || !whole(raw.delta_cents))
    return null;
  const at = text(raw.at) ? Date.parse(raw.at) : NaN;
  return {
    from: raw.from,
    to: raw.to,
    qty: raw.qty,
    deltaCents: raw.delta_cents,
    at: Number.isFinite(at) ? at : 0
  };
}

/**
 * Reads the list strictly: a row with a missing or wrong-typed field, or with no items, is dropped
 * (the screens would otherwise crash on it), so the owner sees fewer orders, never a broken one.
 */
export function parseStaffOrders(json: unknown): StaffOrder[] {
  return readStaffOrders(json)?.orders ?? [];
}

/**
 * The same strict reading, saying what happened (HCB-002a, the Orders slice of HCB-004): null for
 * an answer that is not a list at all, which is a failed read and never "no orders", and the
 * number of rows that had to be dropped, so a partly unreadable list is not shown as complete.
 */
export function readStaffOrders(json: unknown): { orders: StaffOrder[]; dropped: number } | null {
  if (!Array.isArray(json)) return null;
  const out: StaffOrder[] = [];
  for (const raw of json) {
    if (!isObj(raw)) continue;
    const state = stateOf(raw.state);
    const payState = payStateOf(raw.pay_state);
    const placed = text(raw.placed_at) ? Date.parse(raw.placed_at) : NaN;
    if (
      !text(raw.id) ||
      !text(raw.name) ||
      !text(raw.phone) ||
      !state ||
      !payState ||
      !whole(raw.total_cents) ||
      !text(raw.updated_at) ||
      !Number.isFinite(placed) ||
      !Array.isArray(raw.items)
    )
      continue;
    const items = raw.items.map(parseItem);
    if (!items.length || items.some((i) => i === null)) continue;
    out.push({
      id: raw.id,
      name: raw.name,
      phone: raw.phone,
      ig: text(raw.ig) ? raw.ig : '',
      state,
      payState,
      payMethod: text(raw.pay_method) ? raw.pay_method : '',
      payRef: text(raw.pay_ref) ? raw.pay_ref : '',
      totalCents: centavosFromDb(raw.total_cents),
      paidCents: paidOf(raw.paid_cents),
      refundRef: text(raw.refund_ref) ? raw.refund_ref : '',
      pickupDate: text(raw.pickup_date) ? raw.pickup_date : null,
      pickupWindow: text(raw.pickup_window) ? raw.pickup_window : null,
      placedAt: placed,
      updatedAt: raw.updated_at,
      statusToken: text(raw.status_token) ? raw.status_token : null,
      holds: raw.holds === true,
      items: items as StaffOrderItem[],
      swaps: (Array.isArray(raw.swaps) ? raw.swaps : [])
        .map(parseSwap)
        .filter((s): s is StaffOrderSwap => s !== null),
      // A malformed extras line is left out of the detail; the total is the server's and stays right.
      surchargeCents:
        whole(raw.surcharge_cents) && raw.surcharge_cents > 0
          ? centavosFromDb(raw.surcharge_cents)
          : 0,
      sameDay: raw.same_day === true,
      addOns: (Array.isArray(raw.add_ons) ? raw.add_ons : [])
        .map(parseAddOn)
        .filter((a): a is StaffAddOn => a !== null),
      boxes: (Array.isArray(raw.boxes) ? raw.boxes : [])
        .map(parseBox)
        .filter((b): b is StaffBox => b !== null)
    });
  }
  return { orders: out, dropped: json.length - out.length };
}

/** The engine's order, as far as the ported screens read it. */
export interface EngineOrder {
  id: string;
  name: string;
  ig: string;
  email: string;
  mobile: string;
  items: Record<string, number>;
  priced: Record<string, number>;
  status: StaffState;
  pay: string;
  ref: string;
  day: 'sat' | 'sun';
  placedAt: number;
  warn: string | null;
  paidAmount?: number;
  balance: number | null;
  unavailable: string[];
  needsContact: boolean;
  swaps: Array<{ from: string; to: string; qty: number; at: number }>;
  replaced: boolean;
  /** -1 for an order outside the current pickup week, so the engine's per-drop sums leave it out. */
  drop?: number;
  refunded?: boolean;
  refundRef?: string;
  rejected?: boolean;
}

const ISO_DOW = (date: string): number => {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
};

/**
 * The ported bake and orders screens know two pickup days, `sat` and `sun`. The owner's real days
 * (Monday and Thursday) map by rank: the first pickup day of the week is `sat`, any later one
 * `sun`. The screens still say Saturday and Sunday; that ported label is recorded, not edited.
 */
export function dayKey(pickupDate: string | null, pickupDays: readonly number[]): 'sat' | 'sun' {
  if (!pickupDate) return 'sat';
  const sorted = [...pickupDays].sort((a, b) => a - b);
  return sorted.indexOf(ISO_DOW(pickupDate)) > 0 ? 'sun' : 'sat';
}

/** The Monday of the week a pickup date falls in, as YYYY-MM-DD: the business clock's week. */
export const weekKey = weekStart;

const OPEN_STATES: readonly StaffState[] = ['Payment review', 'Confirmed', 'Preparing', 'Ready'];

/**
 * The pickup week the owner is working on: the earliest week that has an open order to pick up
 * today or later, else this week. Anchored on today so that an order nobody closed (a lapsed unpaid
 * one, a packed one never tapped collected) cannot make a past week the current one. The engine's
 * "this drop" sums (sold out, close-out, the bake list) then mean this week, not 60 days.
 */
export function currentWeek(orders: readonly StaffOrder[], today: string): string {
  const weeks = orders
    .filter((o) => o.pickupDate && o.pickupDate >= today && OPEN_STATES.includes(o.state))
    .map((o) => weekKey(o.pickupDate as string))
    .sort();
  return weeks[0] ?? weekKey(today);
}

/**
 * The reserved key of `EngineOrder.priced` that carries the part of an order's total that is not a
 * flavour: add-ons, box charges and the same-day extra, in pesos. The live `boxTotal` adds it, so every
 * ported screen shows the server's total. It is never a product id.
 */
export const EXTRAS_KEY = '__extras';

/** The part of the total that the items do not explain (add-ons, box charges, the same-day extra), in centavos. */
export function extrasCents(o: StaffOrder): number {
  const itemsCents = o.items.reduce((n, i) => n + i.qty * i.unitCents, 0);
  return Math.max(0, o.totalCents - itemsCents);
}

export function toEngineOrder(
  o: StaffOrder,
  pickupDays: readonly number[],
  week: string | null = null
): EngineOrder {
  const items: Record<string, number> = {};
  const priced: Record<string, number> = {};
  const unavailable: string[] = [];
  for (const i of o.items) {
    items[i.productId] = (items[i.productId] ?? 0) + i.qty;
    priced[i.productId] ??= centavosToPesos(i.unitCents);
    if (i.unavailable && !unavailable.includes(i.productId)) unavailable.push(i.productId);
  }
  const extras = extrasCents(o);
  if (extras > 0) priced[EXTRAS_KEY] = centavosToPesos(extras);
  const balanceCents =
    o.paidCents !== null && o.payState === 'confirmed' ? o.totalCents - o.paidCents : 0;
  return {
    id: o.id,
    name: o.name,
    ig: o.ig,
    email: '',
    mobile: o.phone,
    items,
    priced,
    status: o.state,
    pay: o.payMethod,
    ref: o.payRef,
    day: dayKey(o.pickupDate, pickupDays),
    placedAt: o.placedAt,
    warn: null,
    ...(o.paidCents !== null && o.payState === 'confirmed'
      ? { paidAmount: centavosToPesos(o.paidCents) }
      : {}),
    balance: balanceCents > 0 ? centavosToPesos(balanceCents) : null,
    unavailable,
    needsContact: unavailable.length > 0,
    swaps: o.swaps.map((s) => ({ from: s.from, to: s.to, qty: s.qty, at: s.at })),
    replaced: o.swaps.length > 0,
    ...(week && o.pickupDate && weekKey(o.pickupDate) !== week ? { drop: -1 } : {}),
    ...(o.payState === 'refunded' ? { refunded: true, refundRef: o.refundRef } : {})
  };
}

/**
 * The row every `staff_*` RPC answers with, as far as the app uses it (HCB-006): what the database
 * says the order is now. Used only to show the saved change when the read that follows it fails.
 */
export interface StaffSavedRow {
  orderId: string;
  state: StaffState;
  payState: StaffPayState;
  paidCents: number | null;
  totalCents: number;
  updatedAt: string;
}

/**
 * `refreshed` is false when the change was acknowledged but the list read that followed it failed:
 * the list then shows the acknowledged row (if it parsed), not the database's current state.
 */
export type StaffOutcome =
  | { kind: 'ok'; replayed: boolean; refreshed: boolean }
  | { kind: 'conflict' }
  | { kind: 'capacity'; left: number }
  | { kind: 'gone' }
  | { kind: 'refused'; code: string }
  | { kind: 'offline' };

interface RpcResult {
  data?: unknown;
  error?: { code?: string; details?: string | null } | null;
}

/** The acknowledged row, or undefined when it is not the shape the RPCs answer with. */
function parseSaved(row: unknown): StaffSavedRow | undefined {
  if (!isObj(row)) return undefined;
  const state = stateOf(row.state);
  const payState = payStateOf(row.pay_state);
  if (
    !text(row.order_id) ||
    !row.order_id ||
    !state ||
    !payState ||
    !whole(row.total_cents) ||
    !text(row.updated_at) ||
    !row.updated_at
  )
    return undefined;
  return {
    orderId: row.order_id,
    state,
    payState,
    paidCents: paidOf(row.paid_cents),
    totalCents: centavosFromDb(row.total_cents),
    updatedAt: row.updated_at
  };
}

/** The server's answer, before the refresh that follows a success. */
export type StaffAnswer =
  { kind: 'ok'; replayed: boolean; saved?: StaffSavedRow } | Exclude<StaffOutcome, { kind: 'ok' }>;

/** The server's answer as one outcome. An error with no SQLSTATE is a network failure. */
export function classify(result: RpcResult): StaffAnswer {
  const code = result.error?.code;
  if (!result.error) {
    const row: unknown = Array.isArray(result.data) ? result.data[0] : undefined;
    const saved = parseSaved(row);
    return {
      kind: 'ok',
      replayed: isObj(row) && row.replayed === true,
      ...(saved ? { saved } : {})
    };
  }
  if (code === 'P0002') return { kind: 'conflict' };
  if (code === 'ZC002') {
    const left = Number.parseInt(result.error.details ?? '', 10);
    return { kind: 'capacity', left: Number.isFinite(left) ? Math.max(0, left) : 0 };
  }
  if (code === '02000') return { kind: 'gone' };
  if (code && /^(55000|22023|23505|42501)$/.test(code)) return { kind: 'refused', code };
  return { kind: 'offline' };
}

export async function fetchStaffOrders(client: StaffOrderClient): Promise<StaffOrder[]> {
  return (await fetchStaffOrdersRead(client)).orders;
}

/** The read with its dropped-row count. An error or an answer that is not a list throws. */
async function fetchStaffOrdersRead(
  client: StaffOrderClient
): Promise<{ orders: StaffOrder[]; dropped: number }> {
  const { data, error } = await client.rpc('get_staff_orders');
  if (error) throw new Error(error.code ?? 'get_staff_orders failed');
  const read = readStaffOrders(data);
  if (!read) throw new Error('get_staff_orders answered something other than a list');
  return read;
}

export interface StaffOrderHooks {
  /** Replaces the engine's order list. */
  apply: (orders: EngineOrder[]) => void;
  online: () => boolean;
  toast: (message: string, tone?: 'warn') => void;
  /** The owner's pickup days as ISO weekdays; the bake screen's two columns follow their rank. */
  pickupDays: () => readonly number[];
  /** Today on the business clock; a test may fix it. */
  today?: () => string;
  /** Runtime account, role and client scope; checked before requests and after answers. */
  current?: () => boolean;
}

type Call = (stamp: string) => PromiseLike<RpcResult>;

/**
 * The owner's orders for the live app. The list is read again after every change (and when the
 * tab comes back), because customers place orders all day: whatever the database says wins.
 */
export class StaffOrderSync {
  private list: StaffOrder[] = [];
  /** False until a read has succeeded: an empty list before that is "not loaded", not "no orders". */
  loaded = false;
  /**
   * HCB-002a: every read gets a number. The list only ever moves to a newer read's answer, so an
   * older answer that arrives late cannot overwrite it; the reported state follows the newest
   * settled read (`orders-read-state.ts`).
   */
  private started = 0;
  private shownRead = 0;
  private failedRead = 0;
  private readAt: number | null = null;
  private dropped = 0;
  private retired = false;
  /** The order whose change was acknowledged but whose list refresh failed; cleared by the next good read. */
  private savedNotRefreshed: string | null = null;
  /**
   * HCB-006: the newest read started when a saved change was kept locally. Only a read started after it may replace the
   * list: an older one (a tab-visible refresh still out during the change) holds the order as it was before.
   */
  private savedFloor = 0;
  private readonly retry = (): void => void this.load();

  constructor(
    private readonly client: StaffOrderClient,
    private readonly hooks: StaffOrderHooks
  ) {
    ordersRead.claim(this);
  }

  current(): StaffOrder[] {
    return this.list;
  }

  isCurrent(): boolean {
    return !this.retired && ordersRead.owns(this) && (this.hooks.current?.() ?? true);
  }

  retire(): void {
    this.retired = true;
    this.list = [];
    this.loaded = false;
    this.savedNotRefreshed = null;
    ordersRead.release(this);
  }

  find(id: string): StaffOrder | undefined {
    return this.list.find((o) => o.id === id);
  }

  async load(): Promise<boolean> {
    if (!this.isCurrent()) return false;
    const read = ++this.started;
    const askedAt = Date.now();
    this.report();
    let answer: { orders: StaffOrder[]; dropped: number };
    try {
      answer = await fetchStaffOrdersRead(this.client);
    } catch {
      if (!this.isCurrent()) return false;
      this.failedRead = Math.max(this.failedRead, read);
      this.report();
      return false;
    }
    // A newer reader (a new owner session, a re-run of the live gate) has taken over: this
    // answer may be older than what it shows, so it changes nothing.
    if (!this.isCurrent()) return false;
    if (read > this.shownRead && read > this.savedFloor) {
      this.shownRead = read;
      this.readAt = askedAt;
      this.dropped = answer.dropped;
      this.savedNotRefreshed = null;
      this.list = answer.orders;
      this.loaded = true;
      this.applyList();
    }
    this.report();
    return true;
  }

  /** The read state for the Orders page, from the newest read that has an answer. */
  private report(): void {
    if (!this.isCurrent()) return;
    const everRead = this.shownRead > 0;
    ordersRead.publish(this, {
      phase: this.failedRead > this.shownRead ? 'failed' : everRead ? 'read' : 'loading',
      everRead,
      readAt: this.readAt,
      dropped: this.dropped,
      savedNotRefreshed: this.savedNotRefreshed,
      retry: this.retry
    });
  }

  /**
   * One change: offline is refused before anything is sent; the stamp is the one the owner is
   * looking at (from the last read), so a change made elsewhere meanwhile is a conflict, not a
   * silent overwrite. Success and conflict both reload; the caller words the rest. A success whose
   * reload failed says `refreshed: false` (HCB-006).
   */
  private async run(id: string, call: Call): Promise<StaffOutcome> {
    if (!this.isCurrent()) return { kind: 'offline' };
    if (!this.hooks.online()) {
      this.hooks.toast(STAFF_COPY.offline, 'warn');
      return { kind: 'offline' };
    }
    const order = this.find(id);
    if (!order) {
      this.hooks.toast(STAFF_COPY.notLoaded, 'warn');
      return { kind: 'gone' };
    }
    let answer: StaffAnswer;
    try {
      answer = classify(await call(order.updatedAt));
    } catch {
      answer = { kind: 'offline' };
    }
    // Preserve the actual outcome of an already-sent request, without touching a new session.
    if (answer.kind !== 'ok') return this.afterRefusal(answer);
    if (!this.isCurrent()) return { kind: 'ok', replayed: answer.replayed, refreshed: false };
    const refreshed = await this.load();
    if (!refreshed && this.isCurrent()) this.keepSaved(id, answer.saved);
    return { kind: 'ok', replayed: answer.replayed, refreshed };
  }

  /**
   * HCB-006: the change was acknowledged but the read after it failed, so the list still holds the
   * order as it was before. Show the acknowledged state (never a guess: only a row that parsed for
   * this order is used) and record the order, so the page says the list could not be refreshed.
   */
  private keepSaved(id: string, saved: StaffSavedRow | undefined): void {
    this.savedNotRefreshed = id;
    this.savedFloor = this.started;
    if (saved && saved.orderId === id) {
      this.list = this.list.map((o) =>
        o.id === id
          ? {
              ...o,
              state: saved.state,
              payState: saved.payState,
              paidCents: saved.paidCents,
              totalCents: saved.totalCents,
              updatedAt: saved.updatedAt
            }
          : o
      );
      this.applyList();
    }
    this.report();
  }

  private applyList(): void {
    const week = currentWeek(this.list, this.hooks.today?.() ?? manilaToday());
    this.hooks.apply(this.list.map((o) => toEngineOrder(o, this.hooks.pickupDays(), week)));
  }

  /** What follows an answer that is not a success: tell the owner, and read what the database holds. */
  private async afterRefusal(
    outcome: Exclude<StaffOutcome, { kind: 'ok' }>
  ): Promise<StaffOutcome> {
    if (!this.isCurrent()) return outcome;
    if (outcome.kind === 'conflict') {
      this.hooks.toast(STAFF_COPY.conflict, 'warn');
      await this.load();
    } else if (outcome.kind === 'gone') {
      this.hooks.toast(STAFF_COPY.gone, 'warn');
      await this.load();
    } else if (outcome.kind === 'refused') {
      this.hooks.toast(STAFF_COPY.refused, 'warn');
      await this.load();
    } else if (outcome.kind === 'offline') {
      // A lost reply may have landed: show what the database holds rather than a guess.
      this.hooks.toast(STAFF_COPY.unknown, 'warn');
      await this.load();
    }
    return outcome;
  }

  confirm(id: string, force = false): Promise<StaffOutcome> {
    return this.run(id, (at) =>
      this.client.rpc('staff_confirm_payment', {
        p_order_id: id,
        p_expected_updated_at: at,
        p_force: force
      })
    );
  }
  reject(id: string): Promise<StaffOutcome> {
    return this.run(id, (at) =>
      this.client.rpc('staff_reject_payment', { p_order_id: id, p_expected_updated_at: at })
    );
  }
  reopen(id: string): Promise<StaffOutcome> {
    return this.run(id, (at) =>
      this.client.rpc('staff_reopen_order', { p_order_id: id, p_expected_updated_at: at })
    );
  }
  setStatus(id: string, to: StaffState): Promise<StaffOutcome> {
    return this.run(id, (at) =>
      this.client.rpc('staff_set_status', { p_order_id: id, p_to: to, p_expected_updated_at: at })
    );
  }
  flag(id: string, productId: string, flagged: boolean): Promise<StaffOutcome> {
    return this.run(id, (at) =>
      this.client.rpc('staff_flag_item', {
        p_order_id: id,
        p_product_id: productId,
        p_flagged: flagged,
        p_expected_updated_at: at
      })
    );
  }
  swap(id: string, from: string, to: string, clientId: string): Promise<StaffOutcome> {
    return this.run(id, (at) =>
      this.client.rpc('staff_swap_item', {
        p_order_id: id,
        p_from_product: from,
        p_to_product: to,
        p_client_id: clientId,
        p_expected_updated_at: at
      })
    );
  }
  refund(id: string, ref: string): Promise<StaffOutcome> {
    return this.run(id, (at) =>
      this.client.rpc('staff_refund', { p_order_id: id, p_ref: ref, p_expected_updated_at: at })
    );
  }
  settle(id: string): Promise<StaffOutcome> {
    return this.run(id, (at) =>
      this.client.rpc('staff_settle_balance', { p_order_id: id, p_expected_updated_at: at })
    );
  }
}
