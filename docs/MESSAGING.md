# Messaging

One template: **your box is ready**.

That message is worth building because no-shows are the expensive failure — a baked box
nobody collects is ingredients, oven time, and a slot another customer wanted. Every other
notification she can send herself, and does.

## Why SMS and not email

A Philippine customer reads a text. An email from a home baker goes to the promotions tab.
This is not a preference about channels; it is about whether the message is read before
the pickup window closes.

## Why Semaphore

| | Semaphore | Twilio |
| --- | --- | --- |
| Philippine local numbers | Priced for the market | International rates |
| Sender name | Registered alphanumeric sender | Available, more setup |
| Account | Local, no international billing | Card in USD |

The business has exactly one market. Twilio is the better product and the wrong tool here.
The provider sits behind `MessageProvider` in `src/lib/messaging/types.ts`, so this
decision is one class, not an integration.

## The state it ships in

**Switched off.** With no `SEMAPHORE_API_KEY`, `messageProvider()` returns a stub that
logs at warn level with the recipient redacted and reports `sent: false`.

That is deliberate on two counts. Every code path around messaging can be built and tested
before the owner has agreed to pay for a single text — and the stub is *honest* about being
a stub, so nobody mistakes a full log for a working integration.

To switch it on:

```bash
SEMAPHORE_API_KEY=...
SEMAPHORE_SENDER_NAME=HAPPYCOOKIE   # must be registered with the provider first
```

## What she has to agree to first

Per-message cost, and the volume. Roughly 40 orders a week means roughly 40 messages a
week — a small monthly figure, but it is her money and it is a recurring bill. **Do not
switch this on without asking her.** Nobody wants to discover a subscription they did not
authorise.

## Rules

**A failed send must be visible.** If a customer was not told their box is ready, the owner
needs to know so she can message them herself. `sendMessage()` takes a `record` callback
for exactly this reason, and the failure belongs on the order — not only in a log.

**Never send from the client.** The API key is server-only, and a client that can send
messages can be made to send them to anyone.

**One message per order state change, at most.** Idempotency here is not about money, it is
about not texting a customer four times because a sync retried.

**The copy is the owner's.** `src/lib/messaging/templates.ts` is customer-facing copy and
it reads like the app. Changing it needs her agreement, same as any other copy — it is her
business it sounds like. Bodies are kept under 160 characters because that is one SMS
segment, and two segments is twice the cost for the same information.

## What is not built

- No marketing or broadcast sends. That is a different product with different consent
  requirements under RA 10173, and she has Messenger.
- No inbound handling. The template says "reply here if you need another time" and the
  reply goes to her phone, which is correct — rescheduling is a conversation.
- No delivery-receipt reconciliation. Worth adding if messages start going missing; not
  before.
