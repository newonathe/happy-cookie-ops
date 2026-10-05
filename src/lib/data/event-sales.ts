import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/types/database';
import { centavosFromDb, centavosToPesos, pesosToCentavos } from '@/lib/money';

/**
 * Bazaar events and sales ↔ the D1 RPCs (migration 20260101003200).
 *
 * The phone queues each sale under a client-generated id and re-sends it until the server
 * names that id in its reply. `record_event_sale` is idempotent on the id plus a hash of the
 * body, so this file must send the SAME body on every retry: nothing here depends on the
 * clock or on state that changes between attempts.
 */
export type EventSalesClient = Pick<SupabaseClient<Database>, 'rpc'>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isEventUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/** The id starts with the device that made it (`<device>:<sale>:<time>`); the RPC checks this. */
export function deviceOf(clientId: string): string {
  return clientId.split(':')[0] ?? '';
}

export interface SaleToSend {
  clientId: string;
  eventId: string | null;
  items: Record<string, number>;
  discount: number;
  total: number;
  pay: string;
  ref: string;
  clerk: string;
  at: number;
  tendered: number;
  change: number;
}

/** Pesos in, whole centavos out — the only conversion on the sale path. */
export function salePayload(sale: SaleToSend): Json {
  const items: Record<string, number> = {};
  for (const [id, qty] of Object.entries(sale.items)) if (qty > 0) items[id] = qty;
  return {
    clientId: sale.clientId,
    deviceId: deviceOf(sale.clientId),
    eventId: sale.eventId,
    items,
    discountCents: pesosToCentavos(sale.discount),
    totalCents: pesosToCentavos(sale.total),
    pay: sale.pay,
    ref: sale.ref.slice(0, 32),
    clerk: sale.clerk.slice(0, 40),
    at: sale.at,
    tenderedCents: pesosToCentavos(sale.tendered),
    changeCents: pesosToCentavos(sale.change)
  };
}

/** `permanent`: the server understood and refused, so retrying the same body cannot help. */
export type SendOutcome =
  { ok: true; duplicate: boolean } | { ok: false; error: string; permanent: boolean };

const REFUSED = new Set(['22023', '23505', '42501', '55000', 'P0002']);
const refused = (error: { code?: string; message?: string }): SendOutcome => ({
  ok: false,
  error: message(error),
  permanent: REFUSED.has(error.code ?? '')
});
const unreachable = (error: unknown): SendOutcome => ({
  ok: false,
  error: error instanceof Error ? error.message.slice(0, 160) : 'network',
  permanent: false
});

const message = (error: { code?: string; message?: string }) =>
  ((error.code ? error.code + ' ' : '') + (error.message ?? 'rpc failed')).slice(0, 160);

/** True only when the reply names this client id: anything else leaves the sale queued. */
export async function sendSale(client: EventSalesClient, sale: SaleToSend): Promise<SendOutcome> {
  try {
    const { data, error } = await client.rpc('record_event_sale', { p_sale: salePayload(sale) });
    if (error) return refused(error);
    const row = (data ?? []).find((r) => r.client_id === sale.clientId);
    return row
      ? { ok: true, duplicate: row.duplicate }
      : { ok: false, error: 'not acknowledged', permanent: false };
  } catch (error) {
    return unreachable(error);
  }
}

export async function sendVoid(
  client: EventSalesClient,
  saleClientId: string,
  at: number
): Promise<SendOutcome> {
  try {
    const { data, error } = await client.rpc('void_event_sale', {
      p_void: { clientId: saleClientId, deviceId: deviceOf(saleClientId), at }
    });
    if (error) return refused(error);
    const row = (data ?? []).find((r) => r.client_id === saleClientId);
    return row
      ? { ok: true, duplicate: row.duplicate }
      : { ok: false, error: 'not acknowledged', permanent: false };
  } catch (error) {
    return unreachable(error);
  }
}

export type StartEventOutcome =
  { ok: true; eventId: string; prices: Record<string, number> } | { ok: false; error: string };

/** Opens the event on the server and returns its price snapshot in pesos (DP-20). */
export async function startEventOnServer(
  client: EventSalesClient,
  args: { name: string; deviceId: string; eventId: string }
): Promise<StartEventOutcome> {
  try {
    const { data, error } = await client.rpc('start_event', {
      p_name: args.name,
      p_device: args.deviceId,
      p_float_cents: 0,
      p_event_id: args.eventId
    });
    if (error) return { ok: false, error: message(error) };
    const row = (data ?? [])[0];
    if (
      !row ||
      row.event_id !== args.eventId ||
      !row.prices ||
      typeof row.prices !== 'object' ||
      Array.isArray(row.prices)
    ) {
      return { ok: false, error: 'not acknowledged' };
    }
    const prices: Record<string, number> = {};
    for (const [id, cents] of Object.entries(row.prices)) {
      prices[id] = centavosToPesos(centavosFromDb(cents as string | number));
    }
    return { ok: true, eventId: row.event_id, prices };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message.slice(0, 160) : 'network' };
  }
}

export type CommandToSend = {
  kind: 'open' | 'expense' | 'close';
  eventId: string;
  payload: Record<string, unknown>;
};

/**
 * Stock loaded, an expense, the close. Each is acknowledged only when the reply names what
 * was sent: the event for `open` and `close` (a close also has to come back closed), the
 * client id for an expense.
 */
export async function sendCommand(
  client: EventSalesClient,
  command: CommandToSend
): Promise<SendOutcome> {
  const { kind, eventId, payload } = command;
  const p = payload as Record<string, Json | undefined>;
  try {
    if (kind === 'expense') {
      const { data, error } = await client.rpc('add_event_expense', { p_expense: payload as Json });
      if (error) return refused(error);
      const row = (data ?? []).find((r) => r.client_id === p.clientId);
      return row
        ? { ok: true, duplicate: row.duplicate }
        : { ok: false, error: 'not acknowledged', permanent: false };
    }
    if (kind === 'open') {
      const { data, error } = await client.rpc('load_event_stock', {
        p_event: eventId,
        p_loaded: p.loaded as Json,
        p_float_cents: Number(p.floatCents)
      });
      if (error) return refused(error);
      const row = (data ?? []).find((r) => r.event_id === eventId);
      return row
        ? { ok: true, duplicate: false }
        : { ok: false, error: 'not acknowledged', permanent: false };
    }
    const { data, error } = await client.rpc('close_event', { p_close: payload as Json });
    if (error) return refused(error);
    const row = (data ?? []).find((r) => r.event_id === eventId);
    return row?.closed
      ? { ok: true, duplicate: false }
      : { ok: false, error: 'not acknowledged', permanent: false };
  } catch (error) {
    return unreachable(error);
  }
}
