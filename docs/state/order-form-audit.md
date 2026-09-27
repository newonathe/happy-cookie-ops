# Order form audit — what the app must take over from the Google Form (2026-09-28)

Cine's answers of 2026-09-28 (second round, relayed by Ethan) make the app the full replacement for her
order form: **every form feature is needed at launch, and every applicable field is owner-configurable**.
This document lists everything the form does, what the app already has, the gap, and how each piece
becomes a setting. It ends with the decisions Ethan still has to make and a proposed slice order. It is a
plan, not an approval: nothing here changes a protected file or the lean plan by itself.

## Sources and limits

- **Analysed:** the September order form (PDF, 7 pages, rendered and read page by page, including the menu
  and sticker images); the workbook's `Sales (GForm)` sheet (56 responses, 2026-05-10 to 2026-09-26, from
  several form versions; only counts and option labels are used here); the workbook's costing, box costing,
  P&L and waitlist sheet headers; the protected engine's checkout (`cust` state, `custSet`, `PAY_ACCOUNTS`,
  `PRODUCTS`, `ALLERGENS`, `windowsFor`, `dropCycle`).
- **Not seen:** the live October form, the Apps Script, and the waitlist form itself (only its response
  headers: name, Instagram handle, date of order, phone). Ethan to send an export of the live form and the
  script text as files. The form bridge is **not** designed around a script nobody has read.
- Customer names, phones, addresses and order text from the workbook are not reproduced anywhere.

## Cine's second-round answers (2026-09-28)

| Question                       | Answer                                         | Effect                                                                                                 |
| ------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Laptops                        | "sure"                                         | Confirmed: any browser for online work; one offline bazaar device                                      |
| Nightly Sheets copy            | "sure"                                         | Confirmed: download button anytime plus a weekly backup (DP-10)                                        |
| Google Form                    | Redo the forms                                 | Redone form(s) feed the app (DP-11). Plural: the waitlist form counts too                              |
| Do unpaid orders use capacity? | Yes                                            | Unpaid orders hold slots. **Changes the capacity rule in both runtimes** (see decision D1)             |
| 8- and 12-box prices           | Make them configurable                         | Box sizes and their prices are owner settings; no numbers needed from Cine                             |
| Form features at launch        | Everything, and applicable fields configurable | This document                                                                                          |
| Allergens                      | Configurable, per flavour                      | Part of the flavour record (MP-09 c). The approved engine exception must name `ALLERGENS` explicitly   |
| Opening stock                  | Configurable (she enters it)                   | The owner types the first count in the app (MP-16 stock take); the workbook's manual count is not used |

## What the data shows (counts only)

- **Delivery dominates:** Lalamove 26, Grab Express 17, personal pickup (campus) 13 of 56. The September
  form has **no delivery address** question; an earlier version asked "Where should we deliver your
  cookies to?" (10 answers). The app must collect an address when a courier is chosen.
- **Singles dominate:** only 6 of 48 order texts mention a box, and most orders are a few cookies (a rough
  count gives a median of about 3). The
  prototype is built around boxes of 6. Box logic is secondary; per-cookie ordering with bags is the norm.
- **Pickup days have changed over time:** pickups fell on Monday 20, Thursday 8, Friday 7, Saturday 3,
  Wednesday 3. The form never enforced its own "Monday and Thursday" rule.
- **Lead time** from response to pickup: 1 to 9 days, median 4. No same-day date was picked; the same-day
  question got 1 "Yes" of 48.
- **Pickup time was free text:** 46 different spellings for 56 responses ("Pm", "11:00 a.m.", "Between
  9-11AM!"). It must become fixed slots.
- **Payment choices:** GCash 40, Maya 7, GoTyme 5, "COD (for in-person only)" 4 in an earlier version.
  Bank transfer and cash are on Cine's current payment sheet.
- **Sampler boxes:** a box of 6 (₱1,065) and, in an earlier version, a box of 10 (₱1,440). Cine's costing
  sheet lists two sampler boxes of 6: one at ₱860 (the engine's flat box price) and the September one at
  ₱1,065.
- **Add-ons were rarely used** (4 responses), and the single-choice "which sticker number" question could
  not express two stickers or two designs.

## Element inventory

"Now" is what the ported app has. "UI" says whether the change needs protected markup (a locked-UI
exception, not yet approved except for settings edit forms) or can live in `OpsRuntime`/new components.

| Form element (page)                                                                  | Now in the app                                             | Gap and configurable setting                                                                                                              | UI                                                                | Slice          |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------- |
| Monthly title "The Happy Cookie September Order Form" and "the happy september menu" | Fixed shop header copy                                     | Shop title / menu name text                                                                                                               | Protected copy (D4)                                               | MP-09 c        |
| Intro and thank-you line                                                             | Fixed copy                                                 | Shop intro text                                                                                                                           | Protected copy (D4)                                               | MP-09 c        |
| "Open for pick-ups every Monday and Thursday", "Cut-off time for pick-up is 5 pm"    | One Monday window 9 AM–5 PM (`windowsFor`)                 | Pickup days (any weekdays), pickup hours, cut-off, lead time min/max days, one-off closed dates                                           | Window list is view-model data; the notice is copy (D4)           | MP-10 a        |
| Full name, required                                                                  | `cust.name`                                                | Field on/off, required, label and help text                                                                                               | Existing field; toggles need markup (D4)                          | MP-10 a        |
| Instagram username, required, "e.g. @thehappycookie_ph"                              | `cust.ig`                                                  | Same; normalise the leading @                                                                                                             | Same                                                              | MP-10 a        |
| Contact number, required, "e.g. 09XX XXX XXXX"                                       | `cust.mobile`                                              | Same; validate a PH mobile format                                                                                                         | Same                                                              | MP-10 a        |
| Email (collected by Google in earlier versions)                                      | `cust.email`                                               | Optional field, off by default                                                                                                            | Same                                                              | MP-10 a        |
| "Cookies per piece" section                                                          | Per-flavour steppers                                       | None                                                                                                                                      | —                                                                 | —              |
| Flavour-substitution notice (contact via IG or mobile)                               | The swap flow (`needsContact`, swap sheet) exists          | Notice text; substitution consent                                                                                                         | Copy (D4)                                                         | MP-10 a        |
| "5 pieces and below in individual bags"                                              | Pouches for loose cookies (`Single cookie pouch`)          | Box sizes list (6, 8, 12 now), each with a customer charge and a packaging item; below the smallest box, bags; D6 for other quantities    | Packing is engine logic; a box-size editor is a new settings form | MP-09 c, MP-13 |
| Menu image: photo, name, description, price per flavour                              | `PRODUCTS` (protected constant)                            | Flavour record: name, short name, description, photo, price, allergens, badge, on menu / off, sort order                                  | Covered by the approved MP-09 c engine exception (+ `ALLERGENS`)  | MP-09 c        |
| Badges "best seller!", "new!"                                                        | `tag` ("Best seller")                                      | Badge text per flavour (free text, optional)                                                                                              | Existing tag slot                                                 | MP-09 c        |
| Nutella cookie fries (a set with a dip, ₱260)                                        | Every item is one cookie                                   | Item kind: cookie or set; "counts as N toward capacity" (D9)                                                                              | Engine logic                                                      | MP-09 c        |
| "We also offer boxes of 6. We will send your total through DM"                       | The app shows the live total                               | Box pricing uses the price mode (sum of prices is the default) plus the box charge                                                        | —                                                                 | MP-10 a        |
| Order-format examples ("1 PB & Miso", "1 Cookie Box of 6 (…)")                       | Not needed: steppers replace free text                     | None                                                                                                                                      | —                                                                 | —              |
| Sampler box: grid, quantity 1–3, "contains all flavours", allergen notice            | No bundles                                                 | Bundle: name, fixed price, size, contents (all current flavours or a chosen set, D10), quantity limit, notice text, on/off                | New markup (D4)                                                   | MP-10 b        |
| Add-ons: note card ₱10, cream ribbon ₱10, sticker ₱15 each, sticker pack of 4 ₱50    | None                                                       | Add-on: name, price, image, on/off, variants (sticker designs 1–4) with a quantity each, and an optional text input                       | New markup (D4)                                                   | MP-10 b        |
| Sticker pack image (4 designs)                                                       | None                                                       | Variant images                                                                                                                            | Needs image storage (MP-11 bucket)                                | MP-10 b        |
| Message on note card (shown only with the note card)                                 | None                                                       | Text input tied to an add-on, max length setting (default 150)                                                                            | New markup (D4)                                                   | MP-10 b        |
| Pick-up date, required, free date                                                    | Window picker with slots left                              | Date picker limited to allowed days, lead time and capacity per date or week (D2)                                                         | View-model data plus new markup                                   | MP-10 a        |
| Pick-up time, required, free text                                                    | Fixed window text                                          | Time slots per pickup day (list of start–end), chosen from a list                                                                         | New markup (D4)                                                   | MP-10 a        |
| Campus pickup "ADMU, 2–3:30 pm Mon/Thu at JSEC"                                      | None                                                       | A fulfilment method with its own place, days and slot                                                                                     | Part of fulfilment methods                                        | MP-10 a        |
| Same-day pickup, +40% of the order total                                             | None                                                       | Same-day on/off, surcharge percent (default 40), which items it applies to (D7); computed in the checkout RPC, rounded once in `money.ts` | New markup (D4)                                                   | MP-10 b        |
| Flavour suggestions (optional)                                                       | None                                                       | Optional free text, on/off, max length; owner sees a list                                                                                 | New markup (D4)                                                   | MP-10 b        |
| Mode of transport: Lalamove, Grab Express, personal pickup (campus only)             | None                                                       | Fulfilment methods list: name, type (pickup or courier), place, days, slots, whether an address is required, fee handling (D8)            | New markup (D4)                                                   | MP-10 a        |
| Delivery address (earlier version)                                                   | None                                                       | Address field, required for courier methods. New personal data: retention and `prune_personal_data` cover it; `scrub.ts` is not widened   | New markup (D4)                                                   | MP-10 a        |
| "DM us your full order … we'll send payment channels then"                           | Pay-first checkout with proof upload                       | Pay now (proof) or pay later (unpaid, owner ticks "paid"), per Cine's pay-first reversal                                                  | Checkout flow change (D1, D4)                                     | MP-10, MP-12   |
| Mode of payment: GCash, Maya, GoTyme (+ COD earlier, bank transfer and cash now)     | `PAY_ACCOUNTS`: 3 accounts (protected constant)            | Payment methods list: name, account name, number, QR image, "in person only" flag, on/off                                                 | Covered by the MP-09 c engine exception                           | MP-09 c        |
| Confirmation text with the IG and TikTok handles                                     | Fixed order-confirmed copy                                 | Confirmation text; social links                                                                                                           | Protected copy (D4)                                               | MP-09 c        |
| Required markers "\*"                                                                | Fixed                                                      | Follows each field's required flag                                                                                                        | Markup (D4)                                                       | MP-10 a        |
| Waitlist form (name, IG, date of order, phone)                                       | Waitlist list and "contacted" action in the engine (local) | Redone waitlist capture feeding the app, fields configurable like the order form                                                          | Existing waitlist UI; capture is new                              | MP-10 c        |

## Configuration model (sketch)

Owner-editable, stored in the database, validated by owner RPCs like `save_setting`. Names are placeholders.

- **Flavours:** name, short name, description, photo, price, allergens, badge, kind (cookie / set),
  capacity weight, on menu, sort order.
- **Bundles:** name, price, size, contents rule, max per order, notice, on/off.
- **Add-ons:** name, price, image, on/off, optional variants (name, image), optional text input (label,
  max length).
- **Box sizes:** size, customer charge (default 0), packaging stock item.
- **Fulfilment methods:** name, type (pickup / courier), place, days, time slots, address required, fee
  note.
- **Pickup calendar:** allowed weekdays, lead time min and max days, same-day on/off and surcharge
  percent, one-off closed dates, capacity per date or per week (D2).
- **Checkout fields:** for each field, on/off, required, label, help text.
- **Payment methods:** name, account name, number, QR image, in-person only, pay-later allowed.
- **Shop text:** title, intro, pickup notice, substitution notice, confirmation text, social links.

## Decisions for Ethan

Each has a recommended default so the build can proceed if he agrees.

- **D1 · Unpaid orders now hold capacity, and anyone can place them.** Before, proof of payment was the
  barrier to filling a week. Now an unpaid order holds slots, and the anonymous checkout still has no
  trusted rate-limit caller key (open in the decision register). Someone could fill a week with fake
  orders. Options: (a) an unpaid order releases its slots after N hours (setting, default 24) unless Cine
  marks it paid; (b) at most N open unpaid orders per phone number (default 2); (c) Cine accepts each
  unpaid order before it counts. **Recommended: (a) plus (b)**, both owner-configurable. The capacity rule
  changes in `src/lib/rules/capacity.ts`, `capacity_allows()` and `tests/fixtures/capacity-cases.json`
  together.
- **D2 · Weekly drops or continuous ordering.** The prototype sells in weekly drops with one Monday
  window. The business takes orders continuously and the customer picks a pickup date. `cycle` and
  `windows` are instance fields, so `OpsRuntime` can replace them; the drop screens (open, closing soon,
  extend, close drop) would then describe the week of the chosen date. **Recommended:** keep the weekly
  capacity and the drop screens as the owner's week view, and let customers pick any allowed date inside
  the lead time. A per-date capacity is a later option.
- **D3 · How the redone form connects.** Two order channels means two copies of the menu and options.
  **Recommended:** the app is the only source of configuration; a small Apps Script rebuilds the form's
  choices from the app's public menu and sends each response to one ingest RPC (secret checked in the
  function, rate-limited). Unclear responses land in the existing form queue. Designed only after the
  live form and its script are in hand.
- **D4 · Locked UI.** Every new checkout field and every configurable text changes protected markup, and
  the port gate hashes copy. The approved exception covers settings edit forms only. **Proposed:** in live
  mode the checkout text and field list come from the view model (as `bareFrame` does), and demo mode keeps
  the ported copy, so the visual baselines stay valid; the new checkout parts (add-ons, bundles, pickup
  slots, fulfilment, address) are new components built from the existing tokens. Needs Ethan's approval
  and a record in `protected-exception.md`.
- **D5 · What a "box price" is.** It could be what the customer pays for the box or what the box costs
  Cine. **Recommended:** model both: a customer charge (default 0) and a packaging stock item with its own
  cost.
- **D6 · Quantities that match no box.** 7, 9, 10, 11 or more than 12 cookies. **Recommended:** the app
  suggests the largest boxes first and bags the rest, and Cine changes it when packing (the packing
  default already approved in the configurability audit).
- **D7 · What the same-day fee applies to.** Cookies only, or add-ons and boxes too. **Recommended:**
  cookies and bundles only, owner-configurable.
- **D8 · Who books and pays for delivery.** The form suggests the customer books Lalamove or Grab; the P&L
  has a delivery-fee line. **Recommended:** the customer books and pays the courier; the app only records
  the method and address. A business-paid delivery is recorded as an expense (the category exists).
- **D9 · How a set counts toward capacity.** **Recommended:** a capacity weight per item (default 1;
  cookie fries could be set to their piece count).
- **D10 · Sampler contents.** October has 7 flavours, so a box of 6 cannot hold "all flavours".
  **Recommended:** contents are "one of each flavour on the menu" or a chosen list, and the size follows
  the contents.
- **D11 · Personal data added.** Delivery address and the note-card message are new customer data. Both
  follow the retention setting and `prune_personal_data`; no new analytics or error-report fields.

## Proposed slice order (goal blocks written one at a time)

"Everything at launch" makes MP-09 c and MP-10 much larger than planned. Proposed split, each under about
400 lines:

1. **MP-09 b3** (next): preferences, half steps, helper totals switch (already drafted).
2. **MP-09 c1:** flavours from the database (the approved engine exception, extended to `ALLERGENS`),
   badges, kind and capacity weight, prices, publishing.
3. **MP-09 c2:** payment methods, shop text and social links; box sizes.
4. **MP-09 d:** recipes and suppliers (unchanged).
5. **MP-16:** stock, including the owner's opening count.
6. **MP-07 finish:** durable offline queue (unchanged).
7. **MP-10 a:** checkout core: configurable fields, fulfilment methods, address, pickup calendar and slots,
   pay now or later, capacity with D1.
8. **MP-10 b:** add-ons with variants and text, bundles, same-day fee, flavour suggestions.
9. **MP-10 c:** the redone order and waitlist forms connected (D3).
10. MP-11 onward as in [G2-plan.md](G2-plan.md).

D1, D2 and D4 block MP-10 a; D3 blocks MP-10 c; the rest have safe defaults.
