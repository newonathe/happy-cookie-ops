# F2 owner trial — one real week

Status: preparation only (2026-10-03); no real-week run or Cine feedback is recorded here. Technical choice is delegated to Ethan/Codex. The currently reachable preview URL is for demo checks: its Workers site connects to a synthetic Supabase project with fake catalogue data. It is not an approved real-data trial target. Do not enter real business/customer data there. No new target, deployment, hosted write, or resource is authorized by this checklist. Ethan must identify and approve a suitable real-data destination before Cine uses it.

Keep customer/staff names, contact details, account numbers, screenshots, raw CSVs, recipes, and private feedback outside Git. Use app record IDs without names and sanitized evidence references here; retain the evidence privately.

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
