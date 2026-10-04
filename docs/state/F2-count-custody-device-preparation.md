# F2 count, custody and device preparation — 5 October 2026

Use the existing [trial checklist](F2-owner-trial.md) for the seven actual dates
and Cine's acceptance. This adds precise missing inputs; no trial is marked passed.
The private target and 804 imported financial lines already exist. Do not repeat
setup/imports or use the excluded dummy workbook. Keep shop opening separately gated.

## Opening count and historical reconciliation

Cine uses Inventory -> Weekly count on the actual count date. For each item,
record its app ID, exact unit, counted quantity and count time privately. Zero
means physically counted zero; leave uncounted items unresolved. Review before
saving through the existing controls. A current count cannot establish historical
opening stock. Historical receipts need exact item/unit/quantity and an opening
balance dated at or before the receipt, with stock use/variance explained.
Reuse existing receipt-cost links so the 82 booked purchases are not expensed twice.
28 sales without valid amounts and eight incomplete receipts remain held.
Do not replace missing operating expenses with zero or date an undated count.

## Six recipe mappings

Keep all seven original texts editable in All tools -> Recipe drafts. Enter
verified ingredient quantities/yields through the existing Recipes editor only
after measurement. Six current yields remain provisional. Weigh solids measured
in teaspoons/pinches and piece-based additions; confirm vanilla/extract volume
and units, exact ingredient brands/aliases and compatible supplier pack costs.
Preserve optional cinnamon, stuffing/toppings and both component recipes; record
PB & Miso's extra sugar instead of assuming it is included. Confirm allergens
before publishing. No estimated weights or final margins are supplied here.

## Credential and backup custody

Record Cine's successful sign-in, chosen password custodian, secure storage and
password-change confirmation privately; keep credentials out of Git/chat.
Choose an existing encrypted off-device destination and key custodian, an agreed
manual export time and a recovery operator. Use F1's accepted backup/restore
procedure, then record target-specific restore evidence and who can recover it.
Local DPAPI snapshots alone do not establish off-device custody. Hosted schedules,
business jobs and the automatic runner remain inactive. Do not create storage or
activate a schedule without explicit approval.

## Actual devices and trial dates

Record device model, OS/browser versions, release, date, operator and private
proof references separately for iPhone Safari, iPhone Chrome and MacBook's actual
browser. Check sign-in, owner menu/price/recipe edits, reload persistence, Weekly
count, books/P&L and exported CSV against the same displayed date range. Use an
agreed reversible test value, restore it, and record cleanup. Any operational
order/payment test requires its separately approved scope and shop state.

Run the existing physical-phone offline rehearsal on the designated selling
device with reserved allocation and an approved test sale. Keep its stable
`clientId` until matching server acknowledgement; verify offline reopen, reconnect,
no duplicates and close-out reconciliation. Headless phone-sized tests cannot
fill these actual-device records. Record seven consecutive actual trial dates,
including quiet days, and Cine's feedback/acceptance in the existing log.

Original OFFLINE-01 and actual-phone rehearsal must both PASS by **20 October**
for the 24–25 October pilot; otherwise use the current process/December fallback.
F2 remains incomplete and F3 closed until the required real-week acceptance.
