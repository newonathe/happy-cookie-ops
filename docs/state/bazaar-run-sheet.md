# Bazaar run sheet — rehearsal by 20 October, selling 24 to 25 October 2026

Rewritten 14 October for the bazaar days flow (slices S1 to S3, [bazaar-days.md](bazaar-days.md)). It replaces the
one-event sheet of 13 October: no bake is recorded for bazaar cookies any more (Ethan, 14 October), a day is planned,
started, reviewed and closed, and the event is closed once at the end. The address:
<https://happy-cookie-owner-trial.admin-kethai.workers.dev/bazaar>. "Trial" is only the name: it is the one hosted copy
of the app, and what is rung up there is the real record.

## Go / no-go for 24 October

**Today: no-go.** The flow is built and passes on the local database, but the trial does not have it: its database is at
67 of 68 migrations and it runs the 8 October build. Rows 1 and 2 are Ethan's word.

| #   | What                                                                                                                                                                                                        | Owner       | State on 14 October                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------- |
| 1   | **Migration 68 on the trial**, rehearsed first from a scratch folder, the schema fingerprint equal to local.                                                                                                | Ethan       | Not applied: waits for his word                                |
| 2   | **The S3 build is live**: free the Actions artifact storage, merge, let CI deploy, open the app and see the event list under Sell › Bazaar.                                                                 | Ethan       | Blocked: artifact storage full, branch not merged              |
| 3   | **The booking.** The 24 to 25 October event exists under Bazaar events with its rent. Each day needs a plan (flavours, how many, price, float) before it can start.                                         | Cine, Ethan | 4 bookings on the trial; no day planned                        |
| 4   | **A cost per cookie for each flavour.** A recipe counts only when every line has a cost; almost none does yet. Type one on the event page, or profit reads "Cost pending" (selling and closing still work). | Cine        | Not typed                                                      |
| 5   | **Who signs in.** Planning, starting, reviewing and closing are the owner's. The server takes a sale from an owner sign-in only.                                                                            | Ethan       | 1 active owner. If it is not Cine's, she needs one, and Access |
| 6   | Cine's two addresses in Cloudflare Access and the digest variable, one sitting; Access session set to one week.                                                                                             | Ethan       | Variable holds two digests; session not confirmed              |
| 7   | The phone rehearsal below passes, every step, on the selling iPhone.                                                                                                                                        | Ethan       | Not run                                                        |
| 8   | `RELEASE_HOLD=true` from the day the rehearsal passes to 26 October. No database writes and no merges in between.                                                                                           | Ethan       | Not set                                                        |
| 9   | Backups are off. Download the CSV each evening and keep the paper tally, or decide custody and switch the jobs on.                                                                                          | Ethan       | Off                                                            |
| 10  | Display name on each owner profile (it is the name under "Rung up by").                                                                                                                                     | Ethan       | The one owner has a name                                       |
| 11  | Open the app with signal on 23 October (the keep-alive job is off) and plan both days then.                                                                                                                 | Cine        | —                                                              |

## How an event runs

1. **Plan.** Sell › Bazaar, tap the event, tap a date under "Plan a day". For each flavour: how many were made, the
   price for that day, and the drawer float. The plan can be changed until the day starts.
2. **Start this day**, with signal, on the phone that will sell. The till opens with that day's cookies and prices.
3. **Sell.** No signal is needed. Sales save on the phone and send when there is signal.
4. **Close out** (on the till) opens the day's review. It needs signal, and every sale on the phone must have been
   sent first (**Sync now**). The review shows what should be left, the losses, the takings, the cash expected and the
   event so far; each figure opens to show how it was worked out. Record a loss or add stock there.
5. **Close the day.** Count each flavour and split what is left: carried over, to the shop, written off. Count the cash
   (or leave it blank). If a sale arrived while you were counting, it says so and shows the day again: check and close.
6. **The next day.** Its plan starts from what was carried over. Nothing carries over from the last day.
7. **Close the event**, on the event's page, once every started day is closed. Only now do the sales, the rent, the
   fees, the drawer differences and the stock used count in the books. It cannot be undone.

## Rules for the stall

1. **One phone sells a day.** Only the phone that started the day can sell it. Another owner phone can still review and
   close it from the event's page (if the selling phone is lost or broken): it warns that sales still on the selling
   phone are not in the figures, and anything that phone sends later shows as "Changed after it was closed".
2. **Home Screen app only.** Sign in and start the day inside the app opened from the Home Screen icon. Never delete
   the icon or clear website data during the bazaar: unsent sales live on the phone only.
3. **Owner sign-in all day** on the selling phone.
4. **Close each day where the signal is good**, and start the next day's plan before leaving it: planning, starting,
   reviewing and closing all need signal.
5. **Count what was made.** A flavour cannot be left with more than was put on the table. If more was made than the
   plan says, add it under "Add stock" in the review first.
6. **A sale the server refused** ("Send again" on its row) blocks the close on that phone. Send it again, or void it.
7. **Cookies sent to the shop need a recipe** for that flavour; without one, write them off instead, or closing the
   event is refused.
8. **If the app hangs on opening** (weak signal), switch to aeroplane mode: it opens from the copy on the phone and
   sales save on the phone. Switch back and tap **Sync now** when it is quiet.
9. **The iPhone sends only while the app is open.** Each evening open it on Wi-Fi and wait for "Synced".
10. **Paper tally all day**, one line per sale: flavours, total, how paid.

## The rehearsal

On the selling iPhone, in the Home Screen app, signed in as the owner who will sell, with signal. Rows 1 and 2 above
must be done first, and nothing is deployed afterwards. Use a booking of its own: under Bazaar events add
"Rehearsal", two days, rent 0. **Rehearsal sales are real rows:** void each one before closing its day. Closing the
rehearsal event (step 9) leaves its records in the books' tables: the voided sales with their reversed lines, and the
stock use of the planned cookies (as shortfalls where stock has no count yet). To leave none, stop after step 8 and
tell Ethan: the event then stays open and its lines stay out of the books.

| #   | Do                                                                                                                                                     | Read                                                                                 | Pass                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| 1   | Sell › Bazaar, the Rehearsal event, plan day 1: two flavours, 5 each, your prices, float 500. **Start this day**.                                      | The till, with those flavours and prices                                             | No old "Start an event" list; the tiles show 5 each                    |
| 2   | Aeroplane mode on. Ring up 6 mixed sales (below), one **Freebie**, one **Void**.                                                                       | "Offline · sales are being saved on this device"                                     | The list matches the tally; the voided cookies are back on their tile  |
| 3   | Swipe the app away. Open it from the Home Screen, still in aeroplane mode. Tap **Charge** and read the last line.                                      | Bazaar Mode, the same day, the same sales; "Rung up by" and a name                   | Nothing missing; the signed-in person's own name                       |
| 4   | Tap **Close out** while still in aeroplane mode.                                                                                                       | "Closing the day needs signal. Keep selling…"                                        | The till stays; nothing is closed                                      |
| 5   | Aeroplane mode off, **Sync now**, wait for "Synced". **Close out**. Open Revenue and Cash. Record a loss of 1. Void the remaining sales from the till. | The review: what should be left, the loss, revenue by how paid, cash expected        | Figures equal the tally; after the voids revenue is 0                  |
| 6   | **Close out** again. Type what is left; carry some over, write the rest off; type the cash. **Close the day**.                                         | "Day closed.", then the review marked Closed                                         | The event page shows day 1 Closed                                      |
| 7   | Plan day 2: the carried cookies are already filled in. Add 3 more of one flavour. **Start this day**. Aeroplane mode on, reload, ring up 2 sales.      | The till with day 2's cookies; the sales in the list                                 | It opens with no sign-in page and sells                                |
| 8   | Aeroplane mode off, **Sync now**. Void the sales. **Close out**, count, send one cookie to the shop (a flavour with a recipe), write off the rest.     | No "Carried over" field on the last day                                              | Day 2 closes                                                           |
| 9   | On the event page: type a cost per cookie, add a fee, set a target. Read Profit and open it. **Close the event**, **Yes, close the event**.            | Profit with its parts; "This event is closed."                                       | Money › Expenses no longer says "Bazaar in progress" for the Rehearsal |
| 10  | Leave the phone in aeroplane mode overnight during a real day's selling (steps 2 and 3, on the first evening). Open it in the morning, then go online. | Bazaar Mode and every sale; "Back online · syncing N sales", then "Synced"           | Nothing missing; note whether an email code was asked for              |
| 11  | With something unsent: leave Bazaar, tap the **Sign out** pill.                                                                                        | "Sales are still on this phone", **Send now**, **Sign out anyway**, **Keep selling** | The warning shows. Tap **Keep selling**                                |

A sale: tap a flavour tile (or "One more"), **Charge**, then **Cash** (type "Cash handed over" for the change), or
type "Last 4 of their reference" and tap **GCash**, **Maya** or **GoTyme**. A sample: tiles, then **Freebie**.

Anything that fails is fixed and the whole list is run again before 20 October.

## What proves each step without the phone

| Step     | Tests                                                                                                                          | Only the phone proves                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| 1        | `bazaar-live`, `bazaar-plan`, `ops-runtime-bazaar` (start), role suite `bazaar-days`, the live smoke suite                     | The plan form on a small screen             |
| 2, 3, 10 | `offline-queue`, `live-gate-offline`, `ops-runtime-bazaar`, e2e OFFLINE-01 (Chromium), `ops-runtime-names`                     | Safari selling and reopening with radio off |
| 4 to 6   | `bazaar-close`, `bazaar-review`, `bazaar-store`, `ops-runtime-bazaar-close`, `bazaar-screens`; the smoke suite closes day 1    | The figures against paper                   |
| 7, 8     | `bazaar-store` (carry-in), `ops-runtime-bazaar-close` (the float after a reload); the smoke suite sells day 2 through a reload | iOS keeping its storage                     |
| 9        | Role suite `bazaar-days` (the hand-worked example, finalise, the books' hold), `bazaar-close`; the smoke suite reads the books | The books on the trial                      |
| 11       | `sign-out-guard`, `sign-out-control`, `live-gate-signout-control`                                                              | —                                           |
