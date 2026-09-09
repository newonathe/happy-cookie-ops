/**
 * Idempotency keys for writes that move money.
 *
 * Two paths need this and for the same reason: a request that has already succeeded must
 * not succeed twice.
 *
 *   Bazaar sales  a phone with no signal retries until the server answers. Without a key,
 *                 a retry after a timeout that actually succeeded double-counts the day.
 *   Orders        a customer on Philippine mobile data taps "place order", sees nothing
 *                 happen, and taps again. Without a key she gets two boxes, and the owner
 *                 finds out when she bakes them.
 *
 * The rule is that the CLIENT generates the key and the SERVER treats it as the unique
 * identity of the intent. A server-generated key cannot work: by the time the server has
 * one, it has already decided this is a new request.
 */

import { deviceId } from '@/lib/device';

/**
 * A sale's key.
 *
 * The engine numbers sales per device (S1, S2 …), so the sale id alone is not unique
 * across two phones at one bazaar. Pairing it with the device and the timestamp gives a
 * key that is stable across retries and distinct across devices — both properties are
 * required, and losing either one loses money in a different direction.
 */
export function saleKey(sale: { saleId: string; at: number }): string {
  return `${deviceId()}:${sale.saleId}:${sale.at}`;
}

/**
 * An order's key.
 *
 * Derived from the basket rather than random, so the same intent produces the same key
 * across a reload: a customer who fills the form, loses signal, refreshes and submits the
 * same basket again is making one order, not two. A random key would make the retry look
 * like a new customer.
 *
 * Deliberately NOT including the timestamp: two identical baskets a minute apart from the
 * same person are almost always a double-tap, and the one honest exception — she really
 * did want a second box — is a phone call, not a silent duplicate.
 */
export function orderKey(input: {
  phone: string;
  dropId: string;
  items: Record<string, number>;
}): string {
  const basket = Object.keys(input.items)
    .sort()
    .map((id) => `${id}x${input.items[id]}`)
    .join(',');
  return `${normalisePhone(input.phone)}:${input.dropId}:${basket}`;
}

/**
 * Normalises a Philippine mobile number to a comparable form.
 *
 * The same person types 0917 123 4567, +639171234567 and 09171234567 on three different
 * days. Comparing them raw means her order lookup fails and her idempotency key changes,
 * so this must match the normalisation in the `lookup_order()` SQL function exactly.
 */
export function normalisePhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.startsWith('63')) return '0' + digits.slice(2);
  if (digits.startsWith('9') && digits.length === 10) return '0' + digits;
  return digits;
}
