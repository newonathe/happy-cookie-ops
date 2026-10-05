# Contracts

> **Superseded target contract (2026-09-08):** [06 Domain contracts](master-plan/06-domain-contracts.md) defines the planned versioned centavo wire format, command responses and per-row sync acknowledgments. The older interfaces below describe historical assumptions; the replacement is planned, not implemented. Start at [MASTER-PLAN.md](../MASTER-PLAN.md).

The interfaces two agents can build against **at the same time** without either guessing
what the other will produce. A contract written down before the code is the cheapest thing
in this repository; a contract inferred afterwards is the most expensive.

Rules: every request body is parsed with Zod at the boundary. Money crosses the wire in
**pesos with two decimals** (what the engine speaks) and is stored in **centavos**
(`bigint`). Errors are `{ error: string }` with a real HTTP status — never `200` with a
failure inside.

---

## `POST /api/sync` — offline sale intake · **implemented**

The device sends everything it holds. The reply names exactly which rows are now safe.

```ts
// request
{ sales: Array<{
    clientId: string        // deviceId:saleId:timestamp — the idempotency key. Device-generated.
    saleId: string          // the device's own number (S1, S2…). Not unique across devices.
    eventId: string | null
    items: Record<string, number>   // productId → qty, 1..999
    gross: number; discount: number; total: number   // pesos
    pay: string; ref: string; clerk: string
    at: number              // epoch ms
    tendered: number; change: number
  }> }                      // 1..200 per request

// 200
{ accepted: string[]                                  // clientIds now durably stored
  rejected: Array<{ clientId: string; error: string }> }
```

**Invariants.** Idempotent on `clientId` — a repeated post writes no second sale, ledger
entry or audit row. A malformed row is rejected alone and never fails the batch. The device
clears **only** ids named in `accepted`. `401` if not signed in; `400` on a malformed
body; `502` only when nothing at all was accepted.

## `GET /api/sync/status` — queue reconciliation · **T-05**

```ts
// 200
{
  deviceId: string;
  serverHas: number;
  lastReceivedAt: number | null;
}
```

Lets the phone tell the person holding it whether the server really has the day's takings.
Never returns sale contents.

## `GET /api/health` · **implemented**

```ts
{
  status: 'ok' | 'degraded';
  database: 'ok' | 'unreachable' | 'not-configured';
  ms: number;
}
```

`503` when the database is unreachable. Used by the container health check.

## `POST /api/orders` — place an order · **T-11**

Public. The one endpoint an anonymous customer can write through.

```ts
// request
{
  customerName: string; // 1..80
  phone: string; // 7..20, normalised server-side
  dropId: string; // uuid
  items: Record<string, number>;
  notes: string; // 0..280
  payMethod: string | null;
}

// 201
{
  orderId: string;
  totalPesos: number;
  pickupAt: string;
} // orderId is HC-1042
// 409
{
  error: string;
  remaining: number;
}
```

**Invariants.** Prices come from `products`, never from the request — a client-sent price
is ignored, not validated. Capacity is checked with `drop_remaining()` inside the same
transaction as the insert, so two simultaneous checkouts cannot both take the last box.
The `409` body uses `DROP_CLOSED_MESSAGE` from `src/lib/rules/capacity.ts` when the drop
is closed or sold out — the prototype's own string, verbatim. When the drop merely has
fewer boxes left than asked for, there **is no prototype wording**: its shop clamps the
quantity picker, so a customer never reaches that refusal. `capacityRefusal()` returns a
marked placeholder. Get the real sentence from the owner rather than writing one.

## `POST /api/orders/lookup` — customer order status · **T-11**

```ts
// request  { orderId: string; phone: string }
// 200      { id, customerName, state, payState, totalPesos, pickupAt, placedAt }
// 404      { error: 'No order matches that number and phone.' }
```

**Invariants.** Both factors required — this calls `lookup_order(id, phone)`, which
normalises both numbers before comparing. Order ids must not be enumerable: a wrong phone
returns the same `404` as a nonexistent order, and the endpoint is rate-limited per IP.

## `PATCH /api/orders/:id` — staff state change · **T-11**

```ts
// request  { state?: OrderState; payState?: PayState; payRef?: string }
// 200      { id, state, payState, updatedAt }
```

**Invariants.** Staff only. Legal transitions are the prototype's state machine
(`docs/reference/spec/03-business-rules.md`); an illegal transition is `422`, not a silent
no-op. Every payment-state change writes an `audit_log` row.

## `POST /api/staff/invite` · **T-04**

```ts
// request  { email: string; role: 'helper' | 'support' | 'owner'; displayName: string }
// 201      { userId: string; role: string }
```

**Invariants.** Owner only, checked against `profiles` via `auth.uid()` — never against a
role in the request or in engine state. Uses the service-role key, so this handler must
never be imported from a `'use client'` module. Writes an `audit_log` row.

## `POST /api/import/books` · **T-14**

One-time migration of the owner's `localStorage` payload into Postgres.

```ts
// request  { exportedAt: number; version: string; payload: unknown }
// 200      { imported: { orders: number; ledger: number; inventory: number }; skipped: string[] }
```

**Invariants.** Owner only. Idempotent — running it twice must not double the books.
Refuses to run if the target tables already hold rows for the same period, and returns
what it skipped and why. **A dry-run mode is mandatory**, and must be used first.

---

## Realtime channels · **T-16**

| Channel      | Table                           | Who   |
| ------------ | ------------------------------- | ----- |
| `orders`     | `orders` (insert, update)       | staff |
| `production` | `bake_batches` (insert, update) | staff |

Nothing else is broadcast. The ledger is not realtime — money reads on demand, so a
subscription cannot leak it to a helper's open socket.
