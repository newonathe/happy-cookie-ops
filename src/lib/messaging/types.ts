/**
 * Outbound messaging.
 *
 * One template, deliberately: "your box is ready". That is the message that reduces
 * no-shows, and no-shows are the expensive failure — a baked box nobody collects is
 * ingredients, oven time and a slot another customer wanted.
 *
 * SMS, not email. A Philippine customer reads a text; an email from a home baker goes to
 * promotions. The provider is behind this interface because the choice is commercial
 * rather than technical — see docs/MESSAGING.md for why Semaphore over Twilio, and what
 * it costs per message, which the owner has to agree to before this is switched on.
 */

export type MessageKind = 'pickup_ready';

export interface OutboundMessage {
  kind: MessageKind;
  /** Normalised by normalisePhone() before it gets here. */
  to: string;
  /** Rendered body. Providers charge per 160 characters, so length is a cost. */
  body: string;
  /** Ties the send to what caused it, for the audit trail. */
  orderId: string;
}

export interface SendResult {
  sent: boolean;
  /** The provider's id, for reconciling against their dashboard. */
  providerId: string | null;
  error: string | null;
}

export interface MessageProvider {
  readonly name: string;
  send(message: OutboundMessage): Promise<SendResult>;
}
