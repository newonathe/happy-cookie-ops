import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/types/database';
import { normalisePhone } from '@/lib/idempotency';
import { ORDER_COPY } from '@/lib/orders/copy';
import { parseShopOrderRules, type ShopOrderRules } from '@/lib/orders/pickup';
import type { AddOnLine, BoxLine } from '@/lib/data/order-extras';

/**
 * The customer side of the order command (B2, migrations 20260101003500 and 20260101003600).
 * Everything is anonymous RPCs; the browser sends only what the customer typed and never a
 * price, total, state or role: `place_order` refuses a body that carries one.
 */
export type OrderClient = Pick<SupabaseClient<Database>, 'rpc'>;

export const ORDER_NO = /^HC-[0-9]{4,9}$/;
export const STATUS_TOKEN = /^[0-9a-f]{64}$/;
const IG = /^[A-Za-z0-9._]{1,30}$/;

/**
 * The refusals a customer can act on (each has its own SQLSTATE, or is a malformed request or a
 * reused id). Anything else, including a thrown fetch or a timeout, means the outcome is unknown:
 * the order may or may not exist.
 */
export const DEFINITE_CODES = [
  'ZC001',
  'ZC002',
  'ZC003',
  'ZC004',
  'ZC005',
  'ZC006',
  'ZC007',
  '22023',
  '23505',
  '42501',
  '55000'
] as const;

export function isDefiniteCode(code: string | undefined | null): boolean {
  return !!code && (DEFINITE_CODES as readonly string[]).includes(code);
}

/** The slots left the server reports in a ZC002 DETAIL; null when it is not a plain count. */
export function slotsLeft(details: string | null | undefined): number | null {
  return typeof details === 'string' && /^[0-9]{1,6}$/.test(details.trim())
    ? Number(details.trim())
    : null;
}

export function refusalMessage(code: string, details?: string | null): string {
  switch (code) {
    case 'ZC001':
      return ORDER_COPY.closed;
    case 'ZC002':
      return ORDER_COPY.room(slotsLeft(details));
    case 'ZC003':
      return ORDER_COPY.tooManyUnpaid;
    case 'ZC004':
      return ORDER_COPY.pickup;
    case 'ZC005':
      return ORDER_COPY.method;
    case 'ZC006':
      return ORDER_COPY.waitlistLimit;
    case 'ZC007':
      return ORDER_COPY.extras.notOffered;
    case '22023':
      return ORDER_COPY.malformed;
    case '23505':
      return ORDER_COPY.idReused;
    default:
      return ORDER_COPY.unavailable;
  }
}

// ---------------------------------------------------------------- the order body

export interface OrderFields {
  name: string;
  ig: string;
  mobile: string;
  method: string;
  /** YYYY-MM-DD. */
  pickupDate: string;
  /** HH:MM or `campus`. */
  pickupWindow: string;
  ref: string;
  /** Product id to quantity. */
  items: Record<string, number>;
  /** B4: add-on lines and box lines; both optional, and left out of the body when empty. */
  addOns?: AddOnLine[];
  boxes?: BoxLine[];
}

/** Exactly the keys `place_order` accepts. No price, total, state or role. */
export type OrderBody = {
  client_id: string;
  items: Array<{ product_id: string; qty: number }>;
  name: string;
  ig: string;
  mobile: string;
  pay_method: string;
  pickup_date: string;
  pickup_window: string;
  pay_ref?: string;
  add_ons?: Array<{ id: string; qty: number; variant?: string; text?: string }>;
  boxes?: Array<{ size: number; qty: number }>;
};

export function buildOrderBody(clientId: string, f: OrderFields): OrderBody {
  const body: OrderBody = {
    client_id: clientId,
    items: Object.entries(f.items)
      .filter(([, qty]) => qty > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([product_id, qty]) => ({ product_id, qty })),
    name: f.name.trim(),
    ig: f.ig.trim(),
    mobile: f.mobile.trim(),
    pay_method: f.method,
    pickup_date: f.pickupDate,
    pickup_window: f.pickupWindow
  };
  const ref = f.ref.trim();
  if (ref) body.pay_ref = ref;
  const addOns = (f.addOns ?? []).filter((l) => l.qty > 0);
  if (addOns.length)
    body.add_ons = addOns.map((l) => {
      const line: { id: string; qty: number; variant?: string; text?: string } = {
        id: l.id,
        qty: l.qty
      };
      if (l.variant) line.variant = l.variant;
      const text = l.text.trim();
      if (text) line.text = text;
      return line;
    });
  const boxes = (f.boxes ?? []).filter((b) => b.qty > 0);
  if (boxes.length)
    body.boxes = boxes.map((b) => ({ size: b.size, qty: b.qty })).sort((a, b) => a.size - b.size);
  return body;
}

export type FieldErrors = Partial<
  Record<'name' | 'ig' | 'mobile' | 'date' | 'time' | 'pay' | 'items' | 'extras', string>
>;

/** Mirrors the shape checks `place_order` makes, so a sure refusal is never sent. */
export function orderFieldErrors(f: OrderFields): FieldErrors {
  const e: FieldErrors = {};
  const name = f.name.trim();
  if (name.length < 1 || name.length > 80) e.name = ORDER_COPY.needName;
  const ig = f.ig.trim().replace(/^@+/, '');
  if (!ig) e.ig = ORDER_COPY.needIg;
  else if (!IG.test(ig)) e.ig = ORDER_COPY.badIg;
  if (!/^09[0-9]{9}$/.test(normalisePhone(f.mobile.trim()))) e.mobile = ORDER_COPY.needMobile;
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(f.pickupDate)) e.date = ORDER_COPY.needDate;
  if (f.pickupWindow !== 'campus' && !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(f.pickupWindow))
    e.time = ORDER_COPY.needTime;
  if (!f.method.trim()) e.pay = ORDER_COPY.needMethod;
  if (!Object.values(f.items).some((qty) => qty > 0)) e.items = ORDER_COPY.needItems;
  return e;
}

// ---------------------------------------------------------------- placing an order

export interface PlacedOrder {
  orderNo: string;
  token: string;
  totalCents: number;
  pickupDate: string;
  pickupWindow: string;
  replayed: boolean;
}
export type PlaceOutcome =
  | { kind: 'placed'; order: PlacedOrder }
  | { kind: 'refused'; code: string; message: string; slotsLeft: number | null }
  | { kind: 'unknown' };

function parsePlaced(data: unknown): PlacedOrder | null {
  const row = Array.isArray(data) ? data[0] : null;
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (
    typeof r.order_no !== 'string' ||
    !ORDER_NO.test(r.order_no) ||
    typeof r.status_token !== 'string' ||
    !STATUS_TOKEN.test(r.status_token) ||
    typeof r.total_cents !== 'number' ||
    !Number.isInteger(r.total_cents) ||
    r.total_cents < 0 ||
    typeof r.pickup_date !== 'string' ||
    typeof r.pickup_window !== 'string' ||
    typeof r.replayed !== 'boolean'
  )
    return null;
  return {
    orderNo: r.order_no,
    token: r.status_token,
    totalCents: r.total_cents,
    pickupDate: r.pickup_date,
    pickupWindow: r.pickup_window,
    replayed: r.replayed
  };
}

/**
 * One call to `place_order`. A retry of the same body and id is answered with the same order
 * (`replayed`), which is a success. A definite refusal is worded; anything else is unknown, and
 * the caller resends the identical body.
 */
export async function placeOrder(client: OrderClient, body: OrderBody): Promise<PlaceOutcome> {
  try {
    const { data, error } = await client.rpc('place_order', { p_order: body as unknown as Json });
    if (error) {
      if (isDefiniteCode(error.code))
        return {
          kind: 'refused',
          code: error.code,
          message: refusalMessage(error.code, error.details),
          slotsLeft: slotsLeft(error.details)
        };
      return { kind: 'unknown' };
    }
    const order = parsePlaced(data);
    return order ? { kind: 'placed', order } : { kind: 'unknown' };
  } catch {
    return { kind: 'unknown' };
  }
}

/** One customer attempt: an id and the body frozen with it. */
export interface Attempt {
  id: string;
  body: OrderBody;
}

/** The attempt to send: the unresolved one if there is one, otherwise a new one with a new id. */
export function attemptFor(
  current: Attempt | null,
  fields: OrderFields,
  mintId: () => string
): Attempt {
  if (current) return current;
  const id = mintId();
  return { id, body: buildOrderBody(id, fields) };
}

/** What to keep after an outcome: the same attempt only when the outcome is unknown. */
export function settleAttempt(current: Attempt, outcome: PlaceOutcome): Attempt | null {
  return outcome.kind === 'unknown' ? current : null;
}

// ---------------------------------------------------------------- the order rules

export async function fetchShopOrderRules(client: OrderClient): Promise<ShopOrderRules | null> {
  const { data, error } = await client.rpc('get_shop_order_rules');
  if (error) throw new Error('order rules load failed: ' + (error.code || error.message));
  return parseShopOrderRules(data);
}

// ---------------------------------------------------------------- the status page

export interface StatusItem {
  productId: string;
  name: string;
  qty: number;
  unitPriceCents: number;
}
export interface OrderStatusView {
  orderNo: string;
  state: string;
  payState: string;
  payMethod: string;
  totalCents: number;
  pickupDate: string | null;
  pickupWindow: string | null;
  placedAt: string;
  holdExpiresAt: string | null;
  items: StatusItem[];
}

const STATES = [
  'Payment review',
  'Confirmed',
  'Preparing',
  'Ready',
  'Completed',
  'Cancelled',
  'No-show'
];

/** Strict: a malformed answer is treated as no order, never as a half-shown one. */
export function parseOrderStatus(json: unknown): OrderStatusView | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  if (
    typeof o.order_no !== 'string' ||
    !ORDER_NO.test(o.order_no) ||
    typeof o.state !== 'string' ||
    !STATES.includes(o.state) ||
    typeof o.pay_state !== 'string' ||
    typeof o.pay_method !== 'string' ||
    typeof o.total_cents !== 'number' ||
    !Number.isInteger(o.total_cents) ||
    typeof o.placed_at !== 'string' ||
    !Array.isArray(o.items)
  )
    return null;
  const items: StatusItem[] = [];
  for (const raw of o.items) {
    const i = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    if (
      typeof i.product_id !== 'string' ||
      typeof i.name !== 'string' ||
      typeof i.qty !== 'number' ||
      !Number.isInteger(i.qty) ||
      typeof i.unit_price_cents !== 'number' ||
      !Number.isInteger(i.unit_price_cents)
    )
      return null;
    items.push({
      productId: i.product_id,
      name: i.name,
      qty: i.qty,
      unitPriceCents: i.unit_price_cents
    });
  }
  return {
    orderNo: o.order_no,
    state: o.state,
    payState: o.pay_state,
    payMethod: o.pay_method,
    totalCents: o.total_cents,
    pickupDate: typeof o.pickup_date === 'string' ? o.pickup_date : null,
    pickupWindow: typeof o.pickup_window === 'string' ? o.pickup_window : null,
    placedAt: o.placed_at,
    holdExpiresAt: typeof o.hold_expires_at === 'string' ? o.hold_expires_at : null,
    items
  };
}

/** The order for a status token: null for an unknown or malformed token; throws on a failed read. */
export async function fetchOrderStatus(
  client: OrderClient,
  token: string
): Promise<OrderStatusView | null> {
  if (!STATUS_TOKEN.test(token)) return null;
  const { data, error } = await client.rpc('order_status', { p_token: token });
  if (error) throw new Error('order status load failed: ' + (error.code || error.message));
  return parseOrderStatus(data);
}

/** The status token in a URL fragment (`#t=…`); null unless it is exactly 64 lowercase hex. */
export function tokenFromHash(hash: string): string | null {
  const match = /^#t=([0-9a-f]{64})$/.exec(hash);
  return match ? (match[1] as string) : null;
}

// ---------------------------------------------------------------- find my order

export type FindOutcome = { kind: 'found'; token: string } | { kind: 'missed' } | { kind: 'error' };

export async function findOrder(
  client: OrderClient,
  orderNo: string,
  mobile: string
): Promise<FindOutcome> {
  const no = orderNo.trim().toUpperCase();
  if (!ORDER_NO.test(no) || !/^09[0-9]{9}$/.test(normalisePhone(mobile.trim())))
    return { kind: 'missed' };
  try {
    const { data, error } = await client.rpc('find_order', {
      p_order_no: no,
      p_phone: mobile.trim()
    });
    if (error) return { kind: 'error' };
    return typeof data === 'string' && STATUS_TOKEN.test(data)
      ? { kind: 'found', token: data }
      : { kind: 'missed' };
  } catch {
    return { kind: 'error' };
  }
}

// ---------------------------------------------------------------- the waitlist

export interface WaitlistFields {
  name: string;
  ig: string;
  mobile: string;
  /** YYYY-MM-DD. */
  wantedDate: string;
}
export type WaitlistBody = {
  client_id: string;
  name: string;
  ig: string;
  mobile: string;
  wanted_date: string;
};
export type WaitlistOutcome =
  | { kind: 'joined'; replayed: boolean }
  | { kind: 'refused'; code: string; message: string }
  | { kind: 'unknown' };

export function buildWaitlistBody(clientId: string, f: WaitlistFields): WaitlistBody {
  return {
    client_id: clientId,
    name: f.name.trim(),
    ig: f.ig.trim(),
    mobile: f.mobile.trim(),
    wanted_date: f.wantedDate
  };
}

export function waitlistFieldErrors(f: WaitlistFields): FieldErrors & { date?: string } {
  const e: FieldErrors = {};
  const name = f.name.trim();
  if (name.length < 1 || name.length > 80) e.name = ORDER_COPY.needName;
  const ig = f.ig.trim().replace(/^@+/, '');
  if (ig && !IG.test(ig)) e.ig = ORDER_COPY.badIg;
  if (!/^09[0-9]{9}$/.test(normalisePhone(f.mobile.trim()))) e.mobile = ORDER_COPY.needMobile;
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(f.wantedDate)) e.date = ORDER_COPY.needDate;
  return e;
}

export async function joinWaitlist(
  client: OrderClient,
  body: WaitlistBody
): Promise<WaitlistOutcome> {
  try {
    const { data, error } = await client.rpc('join_waitlist', { p_entry: body as unknown as Json });
    if (error) {
      return isDefiniteCode(error.code)
        ? { kind: 'refused', code: error.code, message: refusalMessage(error.code, error.details) }
        : { kind: 'unknown' };
    }
    const row = Array.isArray(data) ? data[0] : null;
    return row &&
      typeof row === 'object' &&
      typeof (row as { replayed?: unknown }).replayed === 'boolean'
      ? { kind: 'joined', replayed: (row as { replayed: boolean }).replayed }
      : { kind: 'unknown' };
  } catch {
    return { kind: 'unknown' };
  }
}
