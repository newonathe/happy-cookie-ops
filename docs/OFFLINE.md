# Bazaar mode: money with no signal

## The requirement

At a bazaar there is no reliable data connection and there is a queue of people holding
cash. A sale must be recordable in under three seconds, must never be lost, and must
never be counted twice when the phone finds signal again. That is the entire brief.

## How it works

```
till button ─► engine.recordSale()            in memory, instantly
                     │
        OfflineBridge│ mirrors the sale
                     ▼
              IndexedDB  hc-ops / sale-queue   survives tab close, reload, dead battery
                     │
              flushQueue() when online
                     ▼
              POST /api/sync  { sales: [ … ] }
                     │
              sync_event_sale(jsonb)  ×N        one row per clientId, idempotent
                     ▼
              { accepted: [clientId…], rejected: [{clientId, error}…] }
                     │
              markSent(accepted) only
```

## The rules that must not be broken

1. **A row leaves the queue only when the server names its `clientId`.** Not on a 200, not
   on an empty error — on an explicit acknowledgement. A duplicate request is free; a
   lost sale is a hole in the books.
2. **The idempotency key comes from the device.** `deviceId + saleId + timestamp`. The
   prototype numbers sales per device (`S1`, `S2`…), so the sale id alone collides between
   two phones at the same stall. The server must never generate this key.
3. **One request carries everything pending.** Per-sale requests on a bad connection
   produce partial states that are hard to reason about; one batch with a per-row reply
   does not. Cap is 200 sales per request, which is more than a stall does in a day.
4. **A bad row fails alone.** `/api/sync` validates each sale and reports failures per
   `clientId`, so one malformed row cannot block a day's takings.
5. **The UI never lies about state.** `syncState` is `syncing`, `partial` or `synced`, and
   `partial` says out loud how many went and that nothing was lost. Those sentences came
   from the prototype and were approved; do not reword them.

## Retries

- Coming back online: the `online` listener in `OfflineBridge` flushes immediately.
- Tab closed: `requestBackgroundSync()` registers the `hc-sale-sync` tag and `public/sw.js`
  flushes from the service worker, then messages any open client.
- Neither available (older iOS): the next open of the app flushes. The queue is patient.

## Testing it

```bash
pnpm test                     # the key's stability, and that a rejected row stays queued
pnpm test:e2e -g bazaar       # a real offline sale, a real reload, IndexedDB inspected
```

Manually: open `/bazaar`, DevTools → Network → Offline, take three sales, close the tab,
reopen it, go back online. The queue count must go to zero and the sales log must show
three sales, once each.

## Deliberate limits

- Sent rows are kept for 24 hours (`pruneSent`) so a helper can still see what went out.
- The queue is per device. Two phones at one stall produce two queues and two sets of
  sale numbers; the server merges them by `clientId`. There is no device-to-device sync,
  and there does not need to be.
- `toggleOnline()` from the prototype still works and still wins over the browser's
  signal. It is how the owner demonstrates the failure case.
