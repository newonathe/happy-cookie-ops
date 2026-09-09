import 'server-only';

import type { MessageProvider, OutboundMessage, SendResult } from './types';

/**
 * Resolves the provider from configuration.
 *
 * The default is a provider that writes to the log and reports success, so every code
 * path around messaging can be built and tested before the owner has agreed to pay for a
 * single text. Switching it on is one environment variable, not a refactor.
 *
 * The stub is honest about being a stub: it logs at warn level with the recipient
 * redacted, so nobody mistakes a full log for a working integration.
 */

class LoggingProvider implements MessageProvider {
  readonly name = 'logging-stub';

  async send(message: OutboundMessage): Promise<SendResult> {
    console.warn('[messaging] NOT SENT — no provider configured', {
      kind: message.kind,
      orderId: message.orderId,
      to: message.to.slice(0, 4) + '…' + message.to.slice(-2),
      length: message.body.length
    });
    return { sent: false, providerId: null, error: 'no provider configured' };
  }
}

/**
 * Semaphore (semaphore.co). Chosen over Twilio on price for Philippine numbers, which is
 * the only market this business has. See docs/MESSAGING.md.
 */
class SemaphoreProvider implements MessageProvider {
  readonly name = 'semaphore';

  constructor(
    private readonly apiKey: string,
    private readonly senderName: string
  ) {}

  async send(message: OutboundMessage): Promise<SendResult> {
    try {
      const response = await fetch('https://api.semaphore.co/api/v4/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          apikey: this.apiKey,
          number: message.to,
          message: message.body,
          sendername: this.senderName
        })
      });
      if (!response.ok) {
        return { sent: false, providerId: null, error: 'provider returned ' + response.status };
      }
      const body = (await response.json()) as Array<{ message_id?: number }>;
      return { sent: true, providerId: String(body?.[0]?.message_id ?? ''), error: null };
    } catch (cause) {
      return {
        sent: false,
        providerId: null,
        error: cause instanceof Error ? cause.message : 'network'
      };
    }
  }
}

export function messageProvider(): MessageProvider {
  const key = process.env.SEMAPHORE_API_KEY;
  const sender = process.env.SEMAPHORE_SENDER_NAME;
  if (key && sender) return new SemaphoreProvider(key, sender);
  return new LoggingProvider();
}

/**
 * Sends, and records the attempt whether or not it worked.
 *
 * A failed send must be visible: the owner needs to know that a customer was NOT told
 * their box is ready, so she can message them herself. Silently swallowing the failure
 * is how a box goes uncollected.
 */
export async function sendMessage(
  message: OutboundMessage,
  record: (result: SendResult) => Promise<void>
): Promise<SendResult> {
  const result = await messageProvider().send(message);
  await record(result);
  return result;
}
