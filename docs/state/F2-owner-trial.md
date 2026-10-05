# F2 owner trial — one real week

Status: closed-shop test preparation (2026-10-04); no real-week run or Cine feedback is recorded here. Ethan approved the existing empty trial database, owner setup and fresh free-plan private hosting. The database and automated owner checks pass; the fresh Worker is deliberately unreachable pending the private Access gate. The old reachable preview remains demo-only. Before real records, agree customer/data/payment scope, shop opening, backup custody/recovery and seven dates. This checklist alone does not authorize those later actions.

Keep customer/staff names, contact details, account numbers, screenshots, raw CSVs, recipes, and private feedback outside Git. Use app record IDs without names and sanitized evidence references here; retain the evidence privately.

## Scope approved on 5 October 2026: closed-shop week

Ethan approved running the week closed-shop. Cine uses menu and flavours, prices, recipes,
stock and Weekly count, production, waste, expenses, books/P&L/CSV and health every day on
the private link. The order, payment, packing and collection rows below are filled from a
few agreed **test orders** placed by Ethan or Cine through that same link, marked as test
in the log, with no real customer and no real money. Real customer ordering, allergen
publication and shop opening wait for launch and are not part of this week. Where a line
below says "real order", read "agreed test order". The destination is the existing private
trial; no new resource is needed.

Needed to start (about an hour): Cine signs in on her iPhone and MacBook, changes the
temporary password, and the seven dates are written below. During the week: opening count
on day 1, and each of the six recipes weighed when it is next baked.

## Before the week starts

- Ethan's approved real-data destination and approval date: _____________________
- Real-data scope Cine will use (and any exclusions): ___________________________
- Cine's account/role and sign-in confirmed: ___________________________________
- Seven consecutive calendar dates (include no-sale days honestly): ______________
- Private feedback/evidence location and Ethan's contact route: __________________
- For the agreed real-week scope, the app is the operating record; the old form/sheet is held only as archive/fallback. Confirm fallback and export location privately. If fallback is needed, record the interruption and affected scenario as incomplete; a parallel sheet-run week does not satisfy F2. This trial is not a production cutover.
- Cine checks the menu, prices, allergens, photos/badges, published items, shop dates, pickup times and customer-facing text. Use **All tools** to reach the relevant owner forms where available. Record what she sees and any correction needed.
- Confirm pay-now and pay-later choices. For an agreed real order, Cine checks the receiving account through her usual private channel, confirms the actual payment, then marks it paid once. Do not store account details or proof images here.
- Follow an order through packing and collection. Record statuses/quantities and any problem; leave unpaid orders unpaid until funds are confirmed.
- Count opening stock; agree units and recipe versions. Record each purchase/restock, production, packaging use, count correction and waste with its reason.
- Record expenses on their actual dates. Keep helper wages as expenses and owner draws separate. Record the cost basis and effective date already approved for the trial; do not change a default just to make totals match. Compare P&L dates, detail and CSV totals with the app records.
- Review health and alerts; record the displayed status and its source. Check schedule/configuration separately to confirm hosted F1 jobs and the automatic runner are not activated; a missing/red UI status is not proof that a job is inactive.
- October bazaar choice: use 24–25 Oct 2026 only if OFFLINE-01 and the physical-phone rehearsal both PASS by 20 Oct. Otherwise use the 12–13 Dec 2026 fallback. A phone-sized computer test is separate evidence.

## Seven-day operating log

Cine records actual actions, app record IDs without personal details, result, private evidence reference, and her feedback. Enter “no sale/no activity” on quiet dates; do not omit a day. Leave unknowns blank and explain them.

| Day/date   | Orders/payment/packing/collection IDs + result | Stock/production/waste/expense IDs + result | Health/alerts and config check | Private proof ref | Cine feedback/issue ref |
| ---------- | ---------------------------------------------- | ------------------------------------------- | ------------------------------ | ----------------- | ----------------------- |
| 1 / ______ |                                                |                                             |                                |                   |                         |
| 2 / ______ |                                                |                                             |                                |                   |                         |
| 3 / ______ |                                                |                                             |                                |                   |                         |
| 4 / ______ |                                                |                                             |                                |                   |                         |
| 5 / ______ |                                                |                                             |                                |                   |                         |
| 6 / ______ |                                                |                                             |                                |                   |                         |
| 7 / ______ |                                                |                                             |                                |                   |                         |

## Scenario record and end-week reconciliation

| Scenario                                                                  | Record IDs; expected vs observed; result; private proof ref; Cine feedback |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Menu edit/publish; shop window; customer-facing dates/prices              |                                                                            |
| Pay now/pay later; receiving account verified privately; paid marked once |                                                                            |
| Pack and collect; status and quantities reconcile                         |                                                                            |
| Stock count/restock/variance/low-stock alert                              |                                                                            |
| Recipe/version, production deductions, packaging and waste                |                                                                            |
| Expense/wage vs owner draw; P&L dates, existing cost basis and detail     |                                                                            |
| CSV rows/totals compared to displayed range and source records            |                                                                            |
| Health/alerts; separate check that hosted jobs remain inactive            |                                                                            |

End-week date range: ______________ Orders placed/paid/unpaid/cancelled/collected (counts): __________
Opening stock + receipts − use − waste ± adjustments = closing count; explain variances: ______________
Expenses by category/wages; owner draws separately: ______________________________________________
P&L cost basis + effective date; displayed totals vs CSV totals: ____________________________________
Open alerts, errors, blocked scenarios and fix-list IDs: ____________________________________________
Cine's overall feedback / remaining concerns (private reference only): ______________________________

## Physical-phone rehearsal — complete before the 20 October gate

Since 5 October the automated WebKit run of OFFLINE-01 no longer exercises offline
behaviour (Playwright emulator defect, upstream issue 42775). This rehearsal is the only
proof for Safari. It must show, on the actual phone: a sale made with no connection, the
app reopened with no connection and the sale still there, reconnection sending it once,
and no duplicate at close-out.

Run this on the designated actual phone early enough to fix and repeat failures before 20 Oct. A synthetic or headless run cannot fill this record. Use reserved test stock and an agreed test sale; keep customer data out of the evidence copy.

Use one designated offline selling device. Reserve its allocation and do not simultaneously sell those units through another device/channel. Keep pending commands and the stable sale identity intact during recovery.

| Step                                                                                               | Date/result (pass/fail/blocked) | What happened / record ID | Private proof ref |
| -------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------- | ----------------- |
| Device custodian, model, OS, browser, installed PWA/app version recorded                           |                                 |                           |                   |
| Start online; open app, sign in, confirm event/menu and reserved stock                             |                                 |                           |                   |
| Install/open PWA if this is the intended event setup; record setup                                 |                                 |                           |                   |
| Enable airplane mode and separately confirm Wi-Fi is off                                           |                                 |                           |                   |
| Make an agreed positive sale; verify success appears only after durable local save                 |                                 |                           |                   |
| Kill/close app, reopen/reload while offline; confirm sale remains pending                          |                                 |                           |                   |
| Void an agreed offline sale; confirm visible outcome and pending records                           |                                 |                           |                   |
| Reconnect; replay/sync safely; confirm matching `clientId` acknowledgement                         |                                 |                           |                   |
| Repeat/reload after acknowledgement; confirm no duplicate sale                                     |                                 |                           |                   |
| Reconcile units sold, cash/payment allocation, expense, leftover stock, waste and close-out totals |                                 |                           |                   |
| Reconcile paper tally/backup against app; document recovery steps and any difference               |                                 |                           |                   |

Phone rehearsal summary/result and private evidence reference: ______________________________________
By 20 Oct: OFFLINE-01 current result/run ref: __________ Physical-phone result above: __________
If either is not PASS, do not use the app for 24–25 Oct sales; use paper/current process and plan for Dec. Never remove a queued sale until the server acknowledges that same `clientId`.

## Sign-off

Ethan records approved real-data target/date: __________________ Cine's seven-day log/feedback complete/date: __________________
Ethan review, acceptance status, and remaining blockers: __________________________________________
F2: [ ] complete with required real-week evidence [ ] incomplete/blocked
