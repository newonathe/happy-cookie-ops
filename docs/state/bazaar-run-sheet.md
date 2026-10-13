# Bazaar run sheet — rehearsal by 20 October, selling 24 to 25 October 2026

Written 13 October from the code on `48b701f` (the build on the trial) and a counts-only read of the trial.
The address: <https://happy-cookie-owner-trial.admin-kethai.workers.dev/bazaar>. "Trial" is only the name: it
is the one hosted copy of the app, and what is rung up there is the real record.

## Go / no-go for 24 October

**Today: no-go.** Bazaar Mode is built and deployed, the database is at 67 of 67 and her recipes and prices are in
(13 October), but the trial cannot open a table until a bake is recorded (row 1). The rehearsal runs on this state:
after it passes, no more database writes and no merges until 26 October.

| #   | What                                                                                                                                                                                                                                            | Owner       | State on 13 October                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | **Baked stock.** The table loads only from baked stock, and a bake needs a recipe for that flavour (the database accepts one with only a yield; whether the Recipes screen does was not run). Each flavour to be sold needs both, each morning. | Ethan, Cine | 23 recipes since 13 October, one for every flavour on the menu; 0 bakes: "Nothing is baked yet" until one is recorded |
| 2   | **The menu.** An event sells the flavours on the menu at the moment it starts, at those prices, fixed for the event.                                                                                                                            | Cine        | 7 of 26 flavours on the menu: confirm the 7 and their prices                                                          |
| 3   | **Who signs in.** The server takes a bazaar sale from an owner sign-in only. A helper sign-in's sales wait on the phone until an owner signs in on it.                                                                                          | Ethan       | 1 active owner (whose was not read), no helper. If it is not Cine's, she needs an owner account and Access            |
| 4   | Cine's two addresses in Cloudflare Access and the digest variable, one sitting; Access session set to one week.                                                                                                                                 | Ethan       | Variable holds two digests; session not confirmed                                                                     |
| 5   | The phone rehearsal below passes, every step, on the selling iPhone.                                                                                                                                                                            | Ethan       | Not run. No sale has ever reached the trial                                                                           |
| 6   | `RELEASE_HOLD=true` from the day the rehearsal passes to 26 October. Merge nothing into `agent/codex/MP-04-g1-feasibility` in between (PR #14 especially).                                                                                      | Ethan       | Not set                                                                                                               |
| 7   | Backups are off. Download the CSV each evening and keep the paper tally, or decide custody and switch the jobs on.                                                                                                                              | Ethan       | Off                                                                                                                   |
| 8   | Display name on each owner profile (it is the name under "Rung up by").                                                                                                                                                                         | Ethan       | The one owner has a name                                                                                              |
| 9   | Rehearsal sales are real rows. Void each one (Void, on the sale) before closing the rehearsal event: the server reverses its book line. The packaging it used and the rehearsal bakes stay as records.                                          | Ethan       | —                                                                                                                     |
| 10  | Open the app with signal on 23 October (the keep-alive job is off).                                                                                                                                                                             | Ethan       | —                                                                                                                     |
| —   | Code                                                                                                                                                                                                                                            | —           | Nothing blocking. Two tests added (`offline-queue.test.ts`)                                                           |

Row 1 has a second way out, which is a decision and not built: let the bazaar table take any count without a
recorded bake. It changes a rule of the business, needs a live-only override, a review, a merge, a release and
a fresh rehearsal, all before 20 October.

## Rules for the stall

1. **One phone sells.** Only the phone that started the event can sell it; no screen moves it to another phone.
2. **Home Screen app only.** Sign in and start the event inside the app opened from the Home Screen icon.
   Safari keeps separate storage: an event started there does not exist in the app. Never delete the icon or
   clear website data during the bazaar: unsent sales live on the phone only.
3. **Owner sign-in all day.** Do not sign in as a helper on the selling phone.
4. **One event per day.** A closed event stays closed and starting one needs signal: close day 1 with the
   count where the signal is good, and start day 2's event before leaving it.
5. **Count before you load.** The table cannot be topped up once it is open, and a tile reads "Sold out" at
   the loaded number. Record the bake and load the true count.
6. **If the app hangs on opening** (weak signal), switch to aeroplane mode: it opens at once from the copy on
   the phone, and sales save on the phone first either way. Switch back and tap **Sync now** when it is quiet.
7. **The iPhone sends only while the app is open.** Each evening open it on Wi-Fi and wait for "Synced".
8. **Paper tally all day**, one line per sale: flavours, total, how paid.

## The rehearsal

On the selling iPhone, in the Home Screen app, signed in as the owner who will sell, with signal.

| #   | Do                                                                                                                                                                                                                                            | Read                                                                                                                               | Pass                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 0   | **Make**: check two flavours have a recipe (Recipes), then record a bake of each (Bake plan), 15 cookies each.                                                                                                                                | Baked stock for both                                                                                                               | Both show baked cookies. If a bake is refused, stop: row 1 above is not met                   |
| 1   | **Sell**, then **Bazaar**. Under "Start an event" tap the booking, or today's row. Tap **More** to load both flavours, then **Open the table · N cookies**. Aeroplane mode on. Ring up 20 mixed sales (below), one **Freebie**, one **Void**. | Banner: "Offline · sales are being saved on this device". Each sale: "Saved on this phone. It will sync when you are back online." | 20 sales in the list after the void; the voided cookies are back on their tile                |
| 2   | Swipe the app away. Open it from the Home Screen, still in aeroplane mode.                                                                                                                                                                    | Bazaar Mode, the same event, the same sales                                                                                        | It opens into Bazaar Mode without a sign-in page, and nothing is missing                      |
| 3   | Leave the phone untouched for 70 minutes, aeroplane mode on. Ring up one sale.                                                                                                                                                                | The sale in the list                                                                                                               | It sells. (Owner idle time is 480 minutes on the trial; at 60 it would narrow to Bazaar Mode) |
| 4   | Leave it in aeroplane mode overnight. Open it in the morning.                                                                                                                                                                                 | Bazaar Mode and every sale                                                                                                         | Opens, nothing missing                                                                        |
| 5   | Aeroplane mode off. Wait, or tap **Sync now**.                                                                                                                                                                                                | "Back online · syncing N sales", then "Synced"                                                                                     | Count and total equal the paper tally. Ethan reads the event's totals on the server: same     |
| 6   | Note what happened on opening that second morning, offline and then online: was an email code asked for, and did it arrive on this phone?                                                                                                     | Any Cloudflare page                                                                                                                | No code asked for, or it arrived and the app came back with every sale                        |
| 7   | Aeroplane mode on, ring up one sale, aeroplane mode off but stay off Wi-Fi if you can. Leave Bazaar (any other tab), tap the **Sign out** pill above the dock, bottom left.                                                                   | "Sales are still on this phone", a count, **Send now**, **Sign out anyway**, **Keep selling**                                      | The warning shows whenever something is unsent. Tap **Keep selling**                          |
| 8   | Void every rehearsal sale. Bazaar, **Close out**, "Count the cash box": type the float, **Close the event**.                                                                                                                                  | Revenue, "N cookies returned", the drawer line                                                                                     | Figures match the tally; "Reopen the table" answers that a closed event stays closed          |
| 9   | Count the taps from opening the app to the first tile.                                                                                                                                                                                        | —                                                                                                                                  | Acceptable to the person selling                                                              |
| 10  | During step 1, with aeroplane mode on: tap **Charge** and read the last line of the payment sheet.                                                                                                                                            | "Rung up by" and a name                                                                                                            | The signed-in person's own name, the same as with signal                                      |

A sale: tap a flavour tile (or "One more"), **Charge**, then **Cash** (type "Cash handed over" for the
change), or type "Last 4 of their reference" and tap **GCash**, **Maya** or **GoTyme**. A sample: tiles,
then **Freebie**. Mix them: at least five cash with change, five wallet, two with a quick discount.

Anything that fails is fixed and the whole list is run again before 20 October.

## What proves each step without the phone

| Step  | Tests                                                                                                                          | Only the phone proves                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| 1     | `ops-runtime-bazaar`, `offline-queue`, e2e OFFLINE-01 (Chromium), role suite `bazaar-events`                                   | Safari selling with the radio off           |
| 2     | `live-gate-offline` (fresh load offline, each sale arrives once), `ops-runtime-bazaar` (same event comes back)                 | Safari serving the app from the Home Screen |
| 3     | `live-gate-offline` idle cases, `idle-signout`                                                                                 | A phone that really slept                   |
| 4     | `offline-trust`, `offline-queue` (an unsent row is never dropped)                                                              | iOS keeping its storage overnight           |
| 5     | `offline-queue` (cleared only when named; repeats; a refused sale goes up later, unchanged; a pruned sale re-sent is a repeat) | Totals against paper                        |
| 6     | None                                                                                                                           | All of it                                   |
| 7     | `sign-out-guard`, `sign-out-control`, `live-gate-signout-control`                                                              | —                                           |
| 8     | `ops-runtime-bazaar` (close body, refusals), role suite `bazaar-closeout`                                                      | The figures on screen                       |
| 0, 10 | Role suite `production`; `ops-runtime-names`                                                                                   | A bake on the trial; the name on screen     |
