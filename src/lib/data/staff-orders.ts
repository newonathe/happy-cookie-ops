import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { centavosFromDb, centavosToPesos } from '@/lib/money';
import { STAFF_COPY } from '@/lib/orders/staff-copy';

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
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string';
const whole = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);

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
  if (!Array.isArray(json)) return [];
  const out: StaffOrder[] = [];
  for (const raw of json) {
    if (!isObj(raw)) continue;
    const state = STAFF_STATES.find((s) => s === raw.state);
    const payState = PAY_STATES.find((s) => s === raw.pay_state);
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
      paidCents: whole(raw.paid_cents) ? centavosFromDb(raw.paid_cents) : null,
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
        .filter((s): s is StaffOrderSwap => s !== null)
    });
  }
  return out;
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

export function toEngineOrder(o: StaffOrder, pickupDays: readonly number[]): EngineOrder {
  const items: Record<string, number> = {};
  const priced: Record<string, number> = {};
  const unavailable: string[] = [];
  for (const i of o.items) {
    items[i.productId] = (items[i.productId] ?? 0) + i.qty;
    priced[i.productId] ??= centavosToPesos(i.unitCents);
    if (i.unavailable && !unavailable.includes(i.productId)) unavailable.push(i.productId);
  }
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
    ...(o.payState === 'refunded' ? { refunded: true, refundRef: o.refundRef } : {})
  };
}

export type StaffOutcome =
  | { kind: 'ok'; replayed: boolean }
  | { kind: 'conflict' }
  | { kind: 'capacity'; left: number }
  | { kind: 'gone' }
  | { kind: 'refused'; code: string }
  | { kind: 'offline' };

interface RpcResult {
  data?: unknown;
  error?: { code?: string; details?: string | null } | null;
}

/** The server's answer as one outcome. An error with no SQLSTATE is a network failure. */
export function classify(result: RpcResult): StaffOutcome {
  const code = result.error?.code;
  if (!result.error) {
    const row = Array.isArray(result.data)
      ? (result.data[0] as { replayed?: boolean } | undefined)
      : undefined;
    return { kind: 'ok', replayed: row?.replayed === true };
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
  const { data, error } = await client.rpc('get_staff_orders');
  if (error) throw new Error(error.code ?? 'get_staff_orders failed');
  return parseStaffOrders(data);
}

export interface StaffOrderHooks {
  /** Replaces the engine's order list. */
  apply: (orders: EngineOrder[]) => void;
  online: () => boolean;
  toast: (message: string, tone?: 'warn') => void;
  /** The owner's pickup days as ISO weekdays; the bake screen's two columns follow their rank. */
  pickupDays: () => readonly number[];
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

  constructor(
    private readonly client: StaffOrderClient,
    private readonly hooks: StaffOrderHooks
  ) {}

  current(): StaffOrder[] {
    return this.list;
  }

  find(id: string): StaffOrder | undefined {
    return this.list.find((o) => o.id === id);
  }

  async load(): Promise<boolean> {
    try {
      this.list = await fetchStaffOrders(this.client);
    } catch {
      return false;
    }
    this.loaded = true;
    this.hooks.apply(this.list.map((o) => toEngineOrder(o, this.hooks.pickupDays())));
    return true;
  }

  /**
   * One change: offline is refused before anything is sent; the stamp is the one the owner is
   * looking at (from the last read), so a change made elsewhere meanwhile is a conflict, not a
   * silent overwrite. Success and conflict both reload; the caller words the rest.
   */
  private async run(id: string, call: Call): Promise<StaffOutcome> {
    if (!this.hooks.online()) {
      this.hooks.toast(STAFF_COPY.offline, 'warn');
      return { kind: 'offline' };
    }
    const order = this.find(id);
    if (!order) {
      this.hooks.toast(STAFF_COPY.notLoaded, 'warn');
      return { kind: 'gone' };
    }
    let outcome: StaffOutcome;
    try {
      outcome = classify(await call(order.updatedAt));
    } catch {
      outcome = { kind: 'offline' };
    }
    if (outcome.kind === 'ok') await this.load();
    else if (outcome.kind === 'conflict') {
      this.hooks.toast(STAFF_COPY.conflict, 'warn');
      await this.load();
    } else if (outcome.kind === 'gone') {
      this.hooks.toast(STAFF_COPY.gone, 'warn');
      await this.load();
    } else if (outcome.kind === 'refused') {
      this.hooks.toast(STAFF_COPY.refused, 'warn');
      await this.load();
    } else if (outcome.kind === 'offline') this.hooks.toast(STAFF_COPY.unknown, 'warn');
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
