# Bazaar run sheet — rehearsal by 22 October, selling 24 to 25 October 2026

Rewritten 14 October for the bazaar days flow (slices S1 to S3, [bazaar-days.md](bazaar-days.md)) and updated 16 October for
Bazaar v2 (U1 to U7, U9; [bazaar-v2.md](bazaar-v2.md)). It replaces the
one-event sheet of 13 October: no bake is recorded for bazaar cookies any more (Ethan, 14 October), a day is planned,
started, reviewed and closed, and the event is closed once at the end. The address:
<https://happy-cookie-owner-trial.admin-kethai.workers.dev/bazaar>. "Trial" is only the name: it is the one hosted copy
of the app, and what is rung up there is the real record.

## Go / no-go for 24 October

**Today: no-go until the rehearsal passes.** Bazaar v2 is on the trial (16 October): migration 70
(`20260101006900_flavour_cost_closing_reversal.sql`) applied, 70 of 70, function bodies equal local; build head `ea0ba7f`,
Cloudflare version `7d7d8414` (the version to rehearse). Every CI job is green except the known red "Performance budget".
Next: the rehearsal on the selling iPhone (row 7, steps below).

| #   | What                                                                                                                                                                                                                                                                              | Owner       | State on 14 October                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------- |
| 1   | **Migration 68 on the trial**, rehearsed first from a scratch folder, the schema fingerprint equal to local.                                                                                                                                                                      | Ethan       | Done 14 October; 69 of 69 since S3.1 (row 2a)                   |
| 2   | **The S3 build is live**: free the Actions artifact storage, merge, let CI deploy, open the app and see the event list under Sell › Bazaar.                                                                                                                                       | Ethan       | Done 14 October; replaced by the S3.1 build `2eda3738` (row 2a) |
| 2a  | **Migration 69 and its build ship together** (S3.1). The deployed `1b6c876c` close and finalise are refused by 69 (a close lacks the till figures; finalise has a new argument), and the S3.1 build is refused by 68. Apply 69 from a scratch folder, then deploy, then rehearse. | Ethan       | Done 14 October: 69 of 69, fingerprint equal, `2eda3738` live   |
| 3   | **The booking.** The 24 to 25 October event exists under Bazaar events with its rent. Each day needs a plan (flavours, how many, price, float) before it can start.                                                                                                               | Cine, Ethan | 4 bookings on the trial; no day planned                         |
| 4   | **A cost per cookie for each flavour.** A recipe counts only when every line has a cost; almost none does yet. Type one on the event page or in the recipe book (Make › Recipes), or profit reads "Cost pending" (selling and closing still work).                                | Cine        | Not typed                                                       |
| 5   | **Who signs in.** Planning, starting, reviewing and closing are the owner's. The server takes a sale from an owner sign-in only.                                                                                                                                                  | Ethan       | Done 14 October: Cine's two sign-ins are active owners          |
| 6   | Cine's two addresses in Cloudflare Access and the digest variable, one sitting; Access session set to one week.                                                                                                                                                                   | Ethan       | Done 14 October: 4 emails; app and policy 1 week (168h)         |
| 7   | The phone rehearsal below passes, every step, on the selling iPhone.                                                                                                                                                                                                              | Ethan       | Not run: due by 22 October                                      |
| 8   | `RELEASE_HOLD=true` from the day the rehearsal passes to 26 October. No database writes and no merges in between.                                                                                                                                                                 | Ethan       | Not set                                                         |
| 9   | Backups are off. Download the CSV each evening and keep the paper tally, or decide custody and switch the jobs on.                                                                                                                                                                | Ethan       | Off                                                             |
| 10  | Display name on each owner profile (it is the name under "Rung up by").                                                                                                                                                                                                           | Ethan       | Done 14 October: "Cine" on hers, "Ethan" on the admin one       |
| 11  | Open the app with signal on 23 October (the keep-alive job is off) and plan both days then.                                                                                                                                                                                       | Cine        | —                                                               |
| 12  | The earlier test event's reversal (`reverse_bazaar_test`) and the cost cutover (after Cine's opening count): each needs Ethan's separate yes. Not part of the rehearsal.                                                                                                          | Ethan       | Not done                                                        |

## How an event runs

1. **Plan.** Sell › Bazaar events, **Add an event** if it is not there, tap the event, tap a date under "Plan a day". For each flavour: how many were made, the
   price for that day, and the drawer float. The plan can be changed until the day starts.
2. **Start this day**, with signal, on the phone that will sell. The till opens with that day's cookies and prices.
3. **Sell.** No signal is needed. Sales save on the phone and send when there is signal.
4. **⋯** › **Review and close the day** (on the till) opens the day's review. It needs signal, and every sale on the phone must have been
   sent first (**Sync now**). A sale the server refused is not "unsent": the review lists it instead (rule 6). The
   close sends the till's own count of sales and cash, and the server refuses it until it holds the same. The review shows what should be left, the losses, the takings, the cash expected and the
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
6. **A sale the server refused** ("Send again" on its row) stays on the phone, never deleted, and the review lists it.
   Sending it again cannot help: the server refuses the same body again. It no longer blocks the close, but the close
   sends the till's own count of sales and cash, which still include it, and the server refuses a close that does not
   match what it holds ("the day changed… tap Sync now"). If the sale was a mistake, void it on the till and close; if it
   was real money, write it on the paper tally, void it, close, and tell Ethan. A phone that holds a closed day lets go
   of it once only refused sales are left. If a close's answer is lost, selling pauses until the day is read again with
   signal (**⋯** › **Review and close the day**). A fee or a loss recorded by mistake can be removed (**Remove** on its row): a fee until
   the event is closed, a loss while its day is selling.
7. **Cookies sent to the shop need a recipe** for that flavour; without one, write them off instead, or closing the
   event is refused.
8. **If the app hangs on opening** (weak signal), switch to aeroplane mode: it opens from the copy on the phone and
   sales save on the phone. Switch back and tap **Sync now** when it is quiet.
9. **The iPhone sends only while the app is open.** Each evening open it on Wi-Fi and wait for "Synced".
10. **Paper tally all day**, one line per sale: flavours, total, how paid.

## What is new on the phone (19 October): the consolidated till

- **One screen to sell from.** Tap a cookie's photo to add one; a **−** on the photo takes one off. The bar at the bottom
  holds the sale, **Freebie** and **Charge**, and stays on screen while you scroll. The sync line and **Sync now** sit at the top.
- **The ⋯ button** (top right of the till) holds the rest: **Add cookies**, **Fees and expenses**, **Review and close the
  day**, **Back to Home** and **Use the classic till**. Home and Add cookies show only for the owner, with signal.
- **Void a sale:** tap the sale in "Sales today", then **Void this sale**. **Keep it** changes nothing. A sale that could
  not be sent keeps **Send again** on its row.
- **The classic till is one tap away:** **⋯** › **Use the classic till** brings back the till from before (16 October),
  with its own buttons; **Use the new till** at its top returns. Both sell the same way and keep the same sales. The choice
  is per app: the Home Screen app and Safari each remember their own. If the new till ever fails to draw, the classic
  one appears by itself.

**Also new (20 October), the planning screens:**

- **Event page:** one summary card (status, place and dates, the four figures and the one main button), the days side by
  side, then one **Costs** card: **Fees**, **Target profit** and **Cost per cookie**, each showing its figure. Tap a row to
  open its form; **Done** closes it.
- **Day plan:** each flavour's **Made**, **Carried over** and price sit inside its tile; the drawer float is one row.
- **Events list:** **Edit or switch off events** sits beside **Add an event**; each event card says **Open →**.

## What was new on the phone (Bazaar v2, 16 October)

- **Leave and return to the till.** On the till, **⋯** › **Back to Home** leaves it without closing the day.
  Home then shows a **Bazaar** card with the day's takings and **Back to the till →**; every other screen shows a banner
  "(event) is selling" with **Back to the till**. Nothing is lost by leaving.
- **Sold-out cookies hide.** A flavour that reaches 0 slides off the till. **Show sold out (n)** brings it back; a void
  brings it back by itself. When everything is gone the till says so.
- **Add cookies** (owner, **⋯** on the till): add cookies to a flavour mid-day without leaving the till.
- **Events hub.** Sell › Bazaar events: **Add an event** (top right), **Active** pinned on top, **Upcoming** and **Past** under
  chips, a status pill on each row (Planned, Selling, Today, Closed, Cost pending).
- **Event page.** One main button for the state (review a selling day, start the first planned day, plan the next date, or
  close the event), figures, a days timeline, fees, a target and a cost per cookie for each flavour.
- **Day plan.** Photo tiles with + and - buttons for how many were made and carried, the menu's flavours first, the day's
  price, a drawer float in steps of 100, and a footer with the total. A wrong entry turns red with a line saying why.
- **Review and close.** Tiles for revenue, cash, fees, sold, left and lost, each opens to show its parts. The close form is
  filled in for you: what is left goes to the next day (or to the shop, or is written off on the last day), and **Cash
  counted** starts at the cash expected, so check the drawer and change it if it differs. **It matches** puts the expected
  figure back. A difference of more than 100 pesos (or a tenth of the expected cash) asks **Count again** or **Keep**.
- **Closing the event** asks where cookies carried over to a day that never started go (to the shop where the flavour has a
  recipe, otherwise written off), and asks for a cost per cookie for any flavour that has none (or **Close without cost**).
- **Recipe book** (Make › Recipes): photo tiles with search and **On the menu** / **All**; a flavour's page shows price,
  cost, margin, **Your cost per cookie** (saved with **Save the cost**; blank goes back to the recipe's cost) and the **Cost
  receipt**. A cost typed there is the flavour's for every bazaar. Editing a recipe is still the older screen, and saving
  there is on hold.
- Money on the till stays in whole pesos (Ethan kept it so); the new screens show centavos.

## The rehearsal

Do this on the selling iPhone, in the Home Screen app (the icon, never the Safari tab), signed in as the owner who will
sell, with signal and at least half a battery. Keep a pen and paper for the tally. Nothing is deployed from now on, and
the app is the version live on the trial. **Rehearsal sales are real rows:** void each one before closing its day.
Closing the Rehearsal event (the last tap of step 22) leaves its records in the books' tables: the voided sales with their
reversed lines, and the stock use of the planned cookies (as shortfalls where stock has no count yet). To leave none, do
step 22 up to, but not including, **Close the event**, and tell Ethan: the event stays open and its lines stay out of the
books. If a step does not show what is written under "You should see", stop, take a screenshot, and tell Ethan which step it
was.

**Part A: add the event and plan day 1**

1. Tap the app icon on the Home Screen. **You should see:** Home, with five tabs along the bottom (Home, Sell, Make, Stock,
   Money). If it asks for an email code, enter it.
2. Tap **Sell**, then **Bazaar events**. **You should see:** a "Bazaar" heading, a dark **Add an event** button at the top
   right, and lists named Active, Upcoming and Past.
3. Tap **Add an event**. A sheet rises from the bottom. Type the name `Rehearsal`, choose today as the first day and
   tomorrow as the last day, and type `0` for the rent. Tap the save button at the bottom of the sheet. **You should see:**
   the sheet closes and "Rehearsal" is in the list with a brief highlight. (If a line turns red, fix what it says.)
4. Tap **Rehearsal**. **You should see:** its page with a status pill, one main button, and a **Plan a day** list showing
   today's and tomorrow's dates.
5. Tap today's date. **You should see:** the plan, a grid of cookie tiles with photos. Without changing anything, tap
   **Start this day**. **You should see:** a red message saying to add cookies, and the screen jumps to the first + button.
   That is correct: nothing starts.
6. Tap + on two flavours until each shows 5 made. Check the prices. Tap + on the drawer float until it reads 500. **You
   should see:** the footer at the bottom reads "10 cookies" with a peso total, and it is not hidden behind the bottom
   tabs. Tap **Start this day**. (If it asks "Start anyway", the date is not today: tap it only if you chose another date on
   purpose.)
7. **You should see:** the consolidated till: two photo tiles at 5 each with your prices, a **⋯** button top right, and
   the sale bar with **Charge** at the bottom. If you see the older till instead (separate **Close out** and **Void**
   buttons), the phone has the old version: close the app, open it once with signal, and check again.

**Part B: leave the till and come back**

8. On the till, tap **⋯**, then **Back to Home**. **You should see:** Home, with a "Bazaar" card at the top showing "Rehearsal"
   with a **Selling** pill and a **Back to the till →** button.
9. Tap **Sell**. **You should see:** a banner "Rehearsal is selling" with **Back to the till**. Tap **Back to the till**.
   **You should see:** the till again, as you left it.

**Part C: sell, sold out, add cookies, offline**

10. Tap one flavour's tile 5 times, tap **Charge**, then **Cash**, type an amount in "Cash handed over", and confirm. Write
    the sale on the paper tally. **You should see:** the sale in the list, and that flavour's tile slides away (it is sold
    out) with a button **Show sold out (1)**. Tap it: the tile comes back marked sold out; tap **Hide sold out**.
11. Tap **⋯** › **Add cookies**, add 3 to that flavour, and confirm. **You should see:** the tile is back with 3.
12. Swipe down from the top right corner of the screen to open the Control Centre and tap the aeroplane. Close the Control
    Centre. Ring up 4 sales of mixed flavours, then tap **Freebie** for one more, and void one of the sales (tap it in "Sales today", then **Void this sale**). **You should
    see:** "Offline · sales are being saved on this device"; the list matches your tally; the voided cookies are back on
    their tile.
13. Still in aeroplane mode: swipe up from the bottom edge and hold to see the open apps, and flick the app up to close it.
    Tap its icon on the Home Screen. **You should see:** it opens on Bazaar Mode, the same day, the same sales, and no
    sign-in page. Tap **Charge** and read the last line: it says "Rung up by" with the signed-in person's own name. Close
    the payment sheet without charging.
14. Tap **⋯** › **Review and close the day**. **You should see:** "Closing the day needs signal. Keep selling…" and the till stays. Nothing is closed.
15. Open the Control Centre and tap the aeroplane off. Tap **Sync now** and wait. **You should see:** "Synced".

**Part D: review and close day 1**

16. Tap **⋯** › **Review and close the day**. **You should see:** the day's review with tiles Revenue, Cash, Fees, Sold, Left and Lost. Tap
    **Revenue**: it opens to show how it was worked out. Compare Revenue, Cash and Sold with your paper tally. **They
    should equal it.**
17. Scroll to the loss form (**Record a loss**) and record a loss of 1 cookie with a reason. **You should see:** a Lost
    count of 1.
18. Go back to the till (**Back to the till**) and void the remaining sales, one at a time. Tap **Sync now**, wait for
    "Synced", then **⋯** › **Review and close the day** again. **You should see:** Revenue 0.00.
19. Scroll to the close form. **You should see:** it is already filled in: the cookies left are going to the next day, and
    **Cash counted** shows the cash expected. In **Cash counted** type `99999`. **You should see:** "That is ₱… over. Count
    the drawer again?" with **Count again** and **Keep**. Tap **Count again**, then tap **It matches**. Then write off 1 of
    one flavour's leftover cookies (the carried-over number drops by 1).
20. Tap **Close the day**. **You should see:** "Day closed." and the review marked **Closed**. (The message may sit over
    the bottom of the screen for a moment: note it if it hides a button.) Go back to the Rehearsal event page. **You should
    see:** day 1 marked Closed, with sold, revenue, left, carried and the drawer.

**Part E: day 2**

21. On the event page tap tomorrow's date. **You should see:** the plan, with the carried-over cookies already filled in.
    Tap + to add 3 more of one flavour. Tap **Start this day**. Turn aeroplane mode on, close the app and open it again as in
    step 13, and ring up 2 sales. **You should see:** the till with day 2's cookies, no sign-in page, the sales in the list.
    Turn aeroplane mode off and tap **Sync now**. Void the sales. Tap **⋯** › **Review and close the day**. **You should see:** no "carried over"
    field (it is the last day). Send 1 cookie to the shop for a flavour with a recipe, write off the rest, and tap **Close
    the day**. **You should see:** "Day closed."

**Part F: the event, the money, the recipe book**

22. On the event page, under **Costs**: tap **Cost per cookie**, type a cost for one flavour (use `5`), save it and tap
    **Done**; tap **Fees**, add a fee (name, amount) and tap **Done**; tap **Target profit** and set a target. **You should see:** Profit with its parts, and the fee in the fees table with a **Remove**
    button. Tap **Remove** on the fee. (To leave the books untouched, stop here.) Tap **Close the event**. **You should
    see:** a sheet; if cookies were carried to a day that never started it asks where they go (choose), and if a flavour
    has no cost it offers a cost field or **Close without cost**. Tap the final button. **You should see:** "This event is
    closed." and Money › Expenses no longer says "Bazaar in progress" for Rehearsal.
23. Tap **Make**, then **Recipes**. **You should see:** the recipe book, photo tiles, a search box and **On the menu** and
    **All** chips. Tap a flavour. **You should see:** its page with price, cost, margin, **Your cost per cookie** and the
    **Cost receipt**. Type a cost, tap **Save the cost**, and see it kept. Then clear the field and tap **Save the cost**
    again: the cost goes back to the recipe's. (A cost saved there is the flavour's for every bazaar, so end with it
    cleared.) Tap **Back to the recipe book**.

**Part G: overnight and sign-out**

24. On the first evening of a real day (not the rehearsal event), leave the phone in aeroplane mode overnight after steps 12
    and 13. Open it in the morning, then go online. **You should see:** Bazaar Mode and every sale, then "Back online ·
    syncing N sales", then "Synced". Note whether an email code was asked for.
25. With something unsent: leave Bazaar and tap the **Sign out** pill. **You should see:** "Sales are still on this
    phone", **Send now**, **Sign out anyway** and **Keep selling**. Tap **Keep selling**.

A sale: tap a flavour tile (or "One more"), **Charge**, then **Cash** (type "Cash handed over" for the change), or type
"Last 4 of their reference" and tap **GCash**, **Maya** or **GoTyme**. A sample: tiles, then **Freebie**.

Anything that fails is fixed and the whole list is run again before 23 October.

## Stall-day checklist

**The night before (23 October, with signal)**

- [ ] Open the app from the Home Screen icon; the sign-in holds, and Sell › Bazaar events shows the event.
- [ ] Both days are planned (flavours, how many, price, float) and a cost per cookie is typed for each flavour that has none.
- [ ] The phone is charged; the charger and a power bank are in the bag; the paper tally, a pen and the change are packed.
- [ ] Do not delete the Home Screen icon or clear website data. Nothing is backed up yet.

**Each morning (with signal)**

- [ ] Open the app from the icon; **Start this day** on the phone that will sell; the till shows today's cookies and prices.
- [ ] Count the float into the drawer: it must equal the plan's float.

**During the day**

- [ ] Paper tally, one line per sale. No signal is fine: sales save on the phone.
- [ ] More cookies than planned: **Add cookies** (a flavour cannot be left with more than was made).
- [ ] A mistake in a sale: tap it in "Sales today" and **Void this sale**. A dropped cookie: record the loss in the review.

**Each evening (with good signal)**

- [ ] **Sync now**, wait for "Synced", then **⋯** › **Review and close the day**; compare Revenue, Cash and Sold with the tally.
- [ ] Count the drawer and type it in **Cash counted** (tap **It matches** only if it truly matches); **Close the day**.
- [ ] Plan the next day before leaving the signal. Download the CSV and keep the paper tally.
- [ ] Open the app on Wi-Fi once more so nothing waits unsent.

**After the last day**

- [ ] **Close the event** on its page (it cannot be undone): choose where leftover cookies go, type any missing cost.
- [ ] Read Profit. Tell Ethan the date and any sale the server refused. He then sets or lifts the release hold as planned,
      and runs the earlier test event's reversal if he has said yes.

## What proves each step without the phone

| Step         | Tests                                                                                                                                                                                                                          | Only the phone proves                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| 3 to 7       | `bazaar-live`, `bazaar-plan`, `ops-runtime-bazaar` (start), role suite `bazaar-days`, the live smoke suite                                                                                                                     | The plan form on a small screen             |
| 12 to 14, 24 | `offline-queue`, `live-gate-offline`, `ops-runtime-bazaar`, e2e OFFLINE-01 (Chromium), `ops-runtime-names`                                                                                                                     | Safari selling and reopening with radio off |
| 15 to 20     | `bazaar-close`, `bazaar-review`, `bazaar-store`, `ops-runtime-bazaar-close`, `bazaar-screens`, `offline-queue-event` (S3.1); role suite `bazaar-days` (the till check, removing a fee or a loss); the smoke suite closes day 1 | The figures against paper                   |
| 21           | `bazaar-store` (carry-in), `ops-runtime-bazaar-close` (the float after a reload); the smoke suite sells day 2 through a reload                                                                                                 | iOS keeping its storage                     |
| 22           | Role suite `bazaar-days` (the hand-worked example, finalise and its till check, no sale or void after it, the books' hold), `bazaar-close`; the smoke suite reads the books                                                    | The books on the trial                      |
| 25           | `sign-out-guard`, `sign-out-control`, `live-gate-signout-control`                                                                                                                                                              | —                                           |
| 8 to 11, 23  | The live smoke suite (17 steps: leaving and returning to the till, hidden sold-out tiles, Add cookies, the events hub, the plan's red fields, the pre-filled close, the recipe book) and the unit suites for each              | The layout and touch targets on the phone   |
