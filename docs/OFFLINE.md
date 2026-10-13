# Bazaar mode: money with no signal

> **Historical context (T-task era, before the 2026-09-08 master plan):** where this page conflicts with [MASTER-PLAN.md](../MASTER-PLAN.md), [docs/state/current.md](../docs/state/current.md) or the [decision register](../docs/state/decision-register.md), those win. Its protection rules still apply unless they say otherwise.

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

## Opening and reloading with no signal (slice A2, 6 October 2026)

This section is current. It describes the live app, where the owner is signed in.

Before A2, opening or reloading the live app with no signal signed her out and sent her to a
sign-in page the phone could not load. The queue and the event survived; her ability to sell
did not. Now:

- **Bazaar Mode alone opens.** When the identity check gets no answer from the server, the
  app opens Bazaar Mode and nothing else. Any other screen or sheet is replaced by a notice
  with one button, "Back to Bazaar Mode". "No answer" means the check failed to reach the
  server or took longer than eight seconds; a stall's dead Wi-Fi counts, whatever the phone
  says about being online.
- **Only inside three bounds** (`src/lib/auth/offline-trust.ts`): the phone holds an event
  the server opened that is not closed; a session is still stored on the phone; and the last
  check the server passed on this phone is within the owner's hours. The hours are her
  setting `offlineOpenHours` (Settings, "Bazaar Mode opens offline for"), 1 to 72, 48 until
  she changes it. Outside the bounds the app shows a "No signal" notice and opens by itself
  when the server answers.
- **What the phone remembers** of that check is a role and a time (`hc-live-check`). Never a
  token or a password. It also keeps a copy of the flavour list and five settings
  (`hc-live-stall`: the two quick discounts, the cash float, the helper-totals switch and
  the hours), because the live app otherwise has neither after a reload.
- **Who rang a sale up** (slice B2, 6 October 2026). Each sale carries the signed-in person's
  own name, from their profile, in place of the prototype's "Cine" and "Kristian". The phone
  remembers that name and its role under one more key (`hc-live-staff-name`), so a stall that
  reopens with no signal still records it; the two keys above keep their shape. Until a name
  is known the role word is used ("Owner", "Helper"). The name is cleaned to what
  `record_event_sale` accepts (plain text, 40 characters at most), so it can never make the
  server refuse a sale. A sale already queued keeps the name it was made with. The next
  person on the phone never sells under the last one's name: signing out removes it, with
  the remembered check; so does every sign-in, because people also leave by closing the tab;
  only the reopen with no signal puts it back, and an online load waits for the profile
  (asked again at each check until it answers); a profile read that lands after a sign-out
  is dropped.
- **Reconnecting.** The full check runs when the phone comes back online, when the app comes
  back to the front, and once a minute while the server has not answered. A pass reopens the
  whole app and sends the queue. A definite denial signs out as before. No lock-out touches
  the sale queue or the running event.
- **Signal back mid-sale** (fixed 6 October 2026). When that pass confirms the role Bazaar
  Mode was opened offline as, an event is still open and the selling screen is what is on
  screen, nothing moves: the same screen, the same sheet (a payment half taken stays open),
  the cart as it was. Before the fix the app went to Home and closed the sheet. In every
  other case the app opens from the role's home as before: a different role than the phone
  remembered, the "Only Bazaar Mode works without signal" notice on screen, or the "No
  signal" notice. The put-off idle sign-out below is unchanged.
- **Idle time is still charged.** With an event open and no server, the idle sign-out is put
  off, not cancelled. When the idle time runs out the app narrows to Bazaar Mode, and that
  is marked on the phone so a tap or a reload does not undo it. The first check the server
  answers sends the queued sales and then signs out. For a bazaar day, set the owner's idle
  time to 480 minutes so a quiet hour does not end in a sign-in at the first bar of signal.
- **No redirect loop.** A signed-out phone with no network shows "Sign in when you have
  signal" in place. The sign-in page is also stored by the service worker.
- **Storage.** When the selling phone starts an event the app asks the browser to keep its
  storage. The browser may say no; nothing depends on the answer.

### Signing out on purpose (slice A3, 6 October 2026)

The live app has one deliberate sign-out: a small "Sign out" pill above the dock, bottom left.
It always asks first. If the phone still holds sales or event changes the server has not
acknowledged, the question becomes "Sales are still on this phone" with the count and three
buttons: **Send now** (the app's own send; signs out when nothing is left), **Sign out
anyway** (never blocked; the rows stay on the phone and go up after the next sign-in) and
**Keep selling**. It never touches the queue. The count is the queue's unsent rows plus any
sale on screen that never reached the queue; if it cannot be read the question says so
without a number.

It is not shown on the Bazaar screen, over any sheet or the Quick add layer, on customer
pages, or when no session is stored. With no signal it says she cannot sign back in until
the signal is back. The sign-out is the live gate's own lock-out, so the app is hidden at
once; a logout call that never answers is given five seconds and then the session is cleared
by hand. Automatic sign-outs (a denial, idle time) are unchanged apart from that bound.

Not proven by tests on a computer, and left to the phone rehearsal: Safari serving the app
after a full close from the Home Screen, an overnight gap, and the radio actually off.

## Testing it

```bash
pnpm test                     # the key's stability, and that a rejected row stays queued
pnpm test:e2e -g bazaar       # a real offline sale, a real reload, IndexedDB inspected
```

Manually: open `/bazaar`, DevTools → Network → Offline, take three sales, close the tab,
reopen it, go back online. The queue count must go to zero and the sales log must show
three sales, once each.

## Deliberate limits

- Only an owner's sign-in records a sale (`record_event_sale`). One rung up under a helper's sign-in is refused,
  stays queued, and goes up unchanged when an owner signs in on that phone.
- On an iPhone the Home Screen app and Safari keep separate storage: the device id, the event and the queue
  exist only where the event was started. Deleting the icon deletes unsent sales.
- A closed event stays closed, starting one needs signal, and Bazaar Mode opens offline only while the phone
  holds an open event: a second day is started where there is signal.
- Sent rows are kept for 24 hours (`pruneSent`) so a helper can still see what went out.
- The queue is per device. Two phones at one stall produce two queues and two sets of
  sale numbers; the server merges them by `clientId`. There is no device-to-device sync,
  and there does not need to be.
- `toggleOnline()` from the prototype still works and still wins over the browser's
  signal. It is how the owner demonstrates the failure case.
