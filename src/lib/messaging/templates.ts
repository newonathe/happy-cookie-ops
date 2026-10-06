import { yourOrder } from '@/lib/orders/identity';
import type { MessageKind } from './types';

/**
 * The message bodies.
 *
 * Written to be read on a lock screen: who it is from, what to do, where. Under 160
 * characters because that is one SMS segment and two segments is twice the cost for the
 * same information.
 *
 * This is customer-facing copy. It reads like the app, and changing it needs the owner's
 * agreement the same as any other copy — she is the one whose business it sounds like.
 */
const TEMPLATES: Record<MessageKind, (vars: Record<string, string>) => string> = {
  pickup_ready: (v) =>
    `Hi ${v.name}! ${yourOrder()} ${v.orderId} is ready. ` +
    `Pick up ${v.window} at ${v.place}. Reply here if you need another time.`
};

export function renderMessage(kind: MessageKind, vars: Record<string, string>): string {
  const body = TEMPLATES[kind](vars);
  if (body.length > 160) {
    // Not an error — it still sends, as two segments. Worth knowing about, because it
    // doubles the cost of every message of this kind.
    console.warn('[messaging] body is ' + body.length + ' characters: two SMS segments', { kind });
  }
  return body;
}
