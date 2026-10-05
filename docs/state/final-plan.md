# Final plan — data first, then the five-tab interface (5 October 2026)

Status: **proposed. Nothing is built, imported or deployed by this document.** It becomes
the single forward plan, replacing [finish-plan.md](finish-plan.md) from here on, when
Ethan says yes to decision 1 in section 12. Until then no build goal runs.

Ethan asked for this on 5 October after approving the rework ("yes to all, do what u
recommend") and adding "nothing must be hardcoded". It rests on four pages that stay as
the record of what was found: [sot-consolidation.md](sot-consolidation.md) (her data),
[product-research.md](product-research.md) (first research pass),
[system-audit.md](system-audit.md) (defects) and [ux-audit.md](ux-audit.md) (interface).
This page holds counts and decisions only. Recipes, customer rows and email addresses
stay outside Git.

## 1. The plan in short

- **Three stages.** Before the bazaar: only what Cine's access, the phone rehearsal and
  safe data need. Then the data layer, with no new screen. Then the new interface, tab by
  tab, with Bazaar selling rebuilt last.
- **The 24 to 25 October bazaar runs on today's Bazaar Mode.** Nothing in its selling or
  close-out path changes before it. Releases to the trial site are held from the day the
  rehearsal passes until 26 October.
- **One record of each thing.** Recipes and supplier prices point at stock items by
  identity, not by typed name. Customers, bazaar days and packaging rules become records.
  One function works out what an ingredient costs, and it never answers zero for
  "unknown".
- **Nothing hard-coded** is a rule with two tests behind it (section 4), not a promise.
- **About 37 slices.** At the pace so far (one to two a day when attended) that is 19 to
  37 working days; plan on about 28. Cine's trial would then start in the second half of
  November. This is an estimate, not a commitment.
- **Research changed four things** (section 2): leading tools do not carry stall stock
  from day to day, so that design is ours; they have no per-order packaging, so that is
  ours too; a cash difference is recorded as a difference, never as sales; and the
  privacy commission expects a small filing even from a business that need not register.

## 2. Research, second pass

Method: each claim was fetched in this session from the product's own help centre,
documentation or standard. "Summary" means a search result's summary of the primary page
was read but the page itself was not opened. Nothing was signed into; no demo was
operated. **No hands-on use happened in either pass**: the public demos found need an
account or cookie consent.

### 2.1 What was verified

| Topic                     | Finding                                                                                                                                                                                                                                                                                                                         | Source (class)                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Selling by day            | Loyverse: a shift opens with "the opening cash amount"; the expected cash is "calculated from cash sales, refunds, and pay in/pay out operations"; closing takes the counted amount and shows the difference. The page does not mention stock at all.                                                                           | Loyverse help (fetched)                                       |
| Selling by day            | Shopify POS: a register session is "a record of all cash activity and payments during specified intervals, including the starting float, any cash added or removed, and the final count". No inventory, no multi-day guidance.                                                                                                  | Shopify help (fetched)                                        |
| Selling by day            | Square: a cash drawer session shows starting cash, cash sales, refunds, paid in and out, and the expected amount; ending records the actual amount. Odoo: opening and closing control with a counted amount, and a session can be kept open.                                                                                    | Square help, Odoo docs (summary)                              |
| Offline sales             | Square: pending offline payments "will expire after 72 hours"; signing out of or deleting the app with payments pending means they "will be permanently lost".                                                                                                                                                                  | Square help (fetched)                                         |
| Offline storage on iPhone | Safari deletes a site's script-writable storage "after seven days of Safari use without user interaction on the site". "Web applications added to the home screen are not part of Safari and thus have their own counter".                                                                                                      | WebKit blog, 2020 (fetched)                                   |
| Offline app updates       | A service worker counts as updated when it is "byte-different"; a new one waits "until the existing service worker is no longer controlling clients"; `skipWaiting()` means the new worker "is likely controlling pages that were loaded with an older version". Recommended: versioned caches, old ones deleted on activation. | web.dev (fetched)                                             |
| Offline app updates       | Tell the user a new version is ready and reload when they accept; "you may want to auto-save or persist transient state before triggering the reload".                                                                                                                                                                          | Chrome Workbox docs (fetched)                                 |
| Recipe cost and packaging | Craftybase: "add each packaging item as an ingredient… Set the quantity to the amount you use per unit". For packaging shared by an order, "divide it across your average order size"; its "model connects materials to manufacture runs, not to individual sales orders".                                                      | Craftybase blog (fetched)                                     |
| Incomplete cost           | meez shows "Cost not set yet" or a dash when an ingredient has no purchase cost, a duplicate name, no quantity or no unit conversion. It never shows a number for a recipe it cannot cost.                                                                                                                                      | meez help centre (fetched)                                    |
| Pre-order drops           | Hotplate: "Choose when orders open, set pickup windows, control inventory"; "Items reserve in-cart with a timer and customers can join a waitlist"; "Auto generated prep lists and order tickets for every drop". It charges a fee per order and texts customers.                                                               | Hotplate product page (fetched)                               |
| Customer records          | Square: a profile is created by hand, or automatically when a card payment carries a name and no profile matches. The page does not list the fields or how duplicates merge.                                                                                                                                                    | Square help (fetched)                                         |
| Plain words               | "The design should speak the users' language. Use words, phrases, and concepts familiar to the user, rather than internal jargon." Also: users "should not have to wonder whether different words, situations, or actions mean the same thing."                                                                                 | Nielsen Norman Group (fetched; replaces the secondary source) |
| Accessibility             | WCAG 2.2, level AA: text contrast 4.5:1; controls and graphics 3:1; colour never the only signal; targets at least 24 by 24 CSS pixels; anything done by dragging can be done another way; content reflows without two-way scrolling; text resizes to 200%; a focused control is never fully hidden.                            | W3C WCAG 2.2 (fetched)                                        |
| Privacy registration      | See 2.3.                                                                                                                                                                                                                                                                                                                        | National Privacy Commission (read in the browser)             |

### 2.2 What it changes

| First pass said                                                                 | Second pass                                                                                                                                           | Effect on the plan                                                                                                                                                                                       |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "A bazaar has days; each day is opened with its stock and closed with a count." | The leaders open and close a day by **cash** only. None of the four documents carries leftover stock to the next day.                                 | Keep the open, sell, close shape for cash. Day stock is our own design, taken from how she works: what is left at close is counted and becomes the next day's opening stock, plus anything newly loaded. |
| Close-out books extra cash as a sale (audit C7).                                | Every tool reports a difference between expected and counted cash, as its own figure.                                                                 | Book it as "Cash over or short", its own line, not revenue. After the October bazaar.                                                                                                                    |
| Packaging: "one box rule".                                                      | Craftybase has no per-order packaging; it spreads shared packaging over an average order. Her own sheet prices packaging per box.                     | Packaging rules per container (each box size, bag, pouch, bazaar sale) as her records. Stock is deducted by the real order; the cost per cookie shown uses the container she chooses.                    |
| A cost figure with a "complete" check.                                          | meez refuses to show a number for an incomplete recipe and names what is missing.                                                                     | The cost function answers "unknown" with the missing ingredients, never zero.                                                                                                                            |
| The app's offline queue "follows the same store-and-forward idea".              | True, and so do its hazards: signing out or clearing the app loses pending sales; Safari can clear storage for a site that is not on the home screen. | Rehearsal checklist items; sign-out is refused while sales are queued (check, then fix if missing).                                                                                                      |
| "Use three to five tabs" (Apple).                                               | Not re-fetched: Apple's pages need a script-running browser. The 44-point target figure is likewise **unverified this session**.                      | The plan uses WCAG's 24-pixel floor as the rule and 44 pixels as the target for selling tiles and the tab bar, stated as our choice.                                                                     |
| Castiron dropped as closed.                                                     | Only secondary pages (competitors' blogs) say so. **Unverified**; it stays dropped.                                                                   | None.                                                                                                                                                                                                    |
| meez claims taken from a listing.                                               | Costing behaviour verified in meez's help centre. Version history, allergens and pictures were **not** re-verified.                                   | Those features are built because Cine asked for them (comments 52, 82), not because meez has them.                                                                                                       |

### 2.3 Customer records and privacy in the Philippines

Read on the National Privacy Commission's own site on 5 October 2026 (its FAQ and its
exemption guidelines; the circular's PDF could not be read by the tools here, so the
wording below is the Commission's summary of Section 5 of NPC Circular No. 2022-04, the
latest registration circular in its list):

- Registration is mandatory when **any** of these holds: the business employs 250 or more
  people; it processes sensitive personal information of 1,000 or more individuals; its
  processing is likely to pose a risk to people's rights and freedoms; or it is a
  government body. The risk test names, among others, minors and "automated
  decision-making or profiling".
- A business under none of those "may register voluntarily".
- "A PIC or PIP who will not elect voluntary registration is required to file a duly
  notarized sworn declaration and undertaking", Annex 1 of the circular, through the
  Commission's registration system.
- Filing it "does not exempt" the business from the Data Privacy Act itself.

What this means for the app, as engineering, not legal advice:

- On the facts known here (one owner, a few hundred customers, names, phone numbers and
  Instagram handles, no health or government data) the mandatory conditions do not look
  met. **Cine or her adviser decides that**, and whether she files the sworn declaration
  or registers voluntarily. It is a question for her in section 12.
- Two design choices keep her on the safe side of the risk test: customer labels are
  simple counts she can see and change (no scoring, no automatic decision about a
  person), and the app never asks a customer's age.
- The duties that apply at any size stay in the plan: say what is kept and why, keep it
  only as long as needed, correct or delete on request.

### 2.4 Not verified, and not relied on

- Apple's tab bar and touch target figures (not re-fetched).
- Shopify POS's definitions of opening and closing discrepancy and its plan requirement;
  Square's cash drawer steps; Odoo's "keep session open" (summaries only).
- Castiron's closure (secondary sources).
- Any claim about how many businesses use any tool.

## 3. The audit's open questions, closed by reading code

| #   | Question                                          | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Evidence                                                                                                                                         |
| --- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| C3  | Can cost per cookie use prototype prices or zero? | **Partly wrong as written, and a different defect is real.** In live mode the engine's price tables are emptied and refilled from her suppliers, so prototype prices cannot reach the figure, and her supplier prices do feed it. The real defects: (a) the "best buy" is the lowest **pack** price, not the lowest price per gram, so a small pack beats a cheaper large one, and that pack price is then divided by the item's one pack size; (b) the completeness check and the figure use different matching rules; (c) only the Products rows show "Cost pending": the recipe screen, the bazaar profit and the waste figures still use a zero for an unknown ingredient. Not run, read only. | `ops-engine.js:1548-1555`, `:1845-1852`; `engine-catalogue.ts:63-70`; `stock-catalogue.ts:412-420`; `ops-runtime.tsx:788`, `:2478`, `:4011-4054` |
| C5  | Is a stock shortfall during production costed?    | **No. Confirmed.** Production takes what is on hand and writes a stock movement only for that; the rest is kept as a "short" note. The books, on the "when used" basis, cost only stock movements. So the shortfall is never costed. Two more found: a use dated before any costed delivery is costed at zero; and the cost basis defaults to "when bought" in the database although "when used" was the decision (DP-04). What the trial is set to was not read.                                                                                                                                                                                                                                  | `20260101004700_production.sql:49-76`, `:278-282`; `20260101004900_books.sql:45`, `:82-94`, `:457-460`                                           |
| C9  | Does binned dough reduce the dough balance?       | **Yes.** Both the discard check and the redefined production function subtract binned dough.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `20260101004800_production_discard.sql:105-107`, `:141-142` of the redefinition                                                                  |
| C9  | Is only one bazaar-sale booking path reachable?   | **Yes.** The first function had its permission removed from every browser role and never regranted; the second was replaced under the same name by the third, which is the only one the app calls. The old `/api/sync` route appears only in archived test scripts.                                                                                                                                                                                                                                                                                                                                                                                                                                | `20260101001500_legacy_mutation_authority.sql:3`; `20260101004700_production.sql:449`, `:626-627`; `src/lib/data/event-sales.ts:82`              |
| C10 | Which live paths use the device's own midnight?   | The owner's drop window (opens, closes, "closing tonight") and relative dates still come from the engine, which uses the device's local midnight; nothing in the live layer replaces it. Customers' pickup dates and the server use Manila time. On a phone set to Manila time the two agree; on any other time zone the owner's screens shift. "Today in Manila" is defined twice.                                                                                                                                                                                                                                                                                                                | `ops-engine.js:35`, `:52-66`, `:3932`; no override in `ops-runtime.tsx`; `src/lib/orders/pickup.ts:90`; `src/lib/data/staff-orders.ts:248`       |

### 3.1 Hard-coded values the first sweep missed

| #   | What is fixed                                                                                                                                                                        | Where                                                                                               | Class                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ---------------------- |
| H12 | The packaging rule inside the database: four item names, one box size, "one pouch per cookie and one paper bag" for every bazaar sale.                                               | `20260101004700_production.sql:341-344`, `:388-394`                                                 | Fix (data layer)       |
| H13 | The same three packaging names inside the completeness check.                                                                                                                        | `ops-runtime.tsx:4052`                                                                              | Fix (data layer)       |
| H14 | The owner's and the shop's names inside customer and staff sentences ("Message Cine on Instagram", "Your Happy Cookie order", "Only Cine can change stock", "Sign Cine out after").  | `src/lib/orders/copy.ts`, `status-view.ts`, `staff-copy.ts`; `src/lib/messaging/templates.ts:15`    | Fix (settings)         |
| H15 | How long customer details are kept, in three places with two values: the shop's notice says one year, the job passes 365 days, the database default is 730.                          | `live-shop-footer.tsx:60-65`; `scripts/f1-operations.mjs:84`; `20260101004000_order_extras.sql:928` | Fix (one setting)      |
| H16 | The privacy paragraph itself, including who hosts the data.                                                                                                                          | `live-shop-footer.tsx:60-65`                                                                        | Fix (her text)         |
| H17 | Business values as database defaults: four add-ons with prices, three box sizes, 40% same-day, pickup on days 1 and 4, the campus slot, a 24-hour hold, two unpaid orders per phone. | `20260101003500_place_order.sql:44-55`; `20260101004000_order_extras.sql:45-51`                     | Allowed, with a marker |
| H18 | "Product pictures never change": pictures on the app's own address are cached for good.                                                                                              | `public/sw.js:60-68`                                                                                | Fix (offline update)   |
| H19 | The time zone name, written in five files.                                                                                                                                           | `pickup.ts`, `staff-orders.ts`, `status-view.ts`, `operations-health.ts`, `ops-runtime.tsx`         | Fix (one clock)        |
| H20 | The app's own name in page titles.                                                                                                                                                   | `src/app/**/page.tsx`, `layout.tsx:26-30`                                                           | Allowed (product name) |

This sweep covered the live layer, the data files, the service worker, the release check
and the SQL named above. It did not read every line of the 53 migrations or the 4,786-line
runtime; the two tests in section 4 exist because a sweep cannot prove absence.

## 4. Rules for everything built from here

### 4.1 Nothing hard-coded

**The rule.** No file of the new interface and no new SQL contains a fact about her
business: a price, quantity, percentage, day, time or limit; the name of a person,
supplier, flavour, ingredient or packaging item; or a sentence that states her policy.
Those come from her records or her settings.

**Allowed, and listed so it is a decision, not a leak:**

- Interface words (button and heading labels), kept in one file per tab so Cine can sign
  them off in the wording pass.
- The product's name in page titles.
- Bounds in database checks (a hold of 1 to 168 hours).
- A default in a migration, only when the value is an editable setting **and** the app
  shows it as "default, not confirmed yet" until she saves it once.

**Enforced by two tests, run in `pnpm verify`:**

1. **Empty shop.** Every new screen renders against an empty database and shows only
   empty states: no flavour, no price, no person's name, no number that is not zero.
2. **Two shops.** Every new screen renders against two made-up shops whose names, prices,
   schedules and settings share nothing. No text from shop A may appear when shop B is
   loaded.

Plus one static check: files of the new interface may not import the engine's constants
or read the view fields listed as hard-coded in the audit (H1 to H9).

### 4.2 One record of each thing

A screen never keeps its own copy of a name or a price. It shows the record. A request
for a new feature is answered by adding a field or a filter to the record it is about,
not a screen.

### 4.3 One list, one page, one form

Every list: title and actions, a search box, filter chips, rows with a status in words
and colour. Every record opens the same kind of page. Every edit uses the same sheet.

### 4.4 Accessibility floor (WCAG 2.2 AA where it applies)

- Text contrast at least 4.5:1, controls and status colours 3:1, checked against the
  theme's existing tokens. No new colour values.
- Status is always a word as well as a colour (Out, Low, Good).
- Every target at least 24 by 24 pixels; selling tiles, the tab bar and primary buttons
  at least 44 (our choice).
- Dropping a picture always has a "choose a file" button beside it.
- Every screen works at 320 pixels wide and at 200% text size without sideways scrolling.
- Reduced motion is respected, as today.
- Checked by an automated accessibility scan in the browser tests for each new screen,
  plus a keyboard pass on desktop.

### 4.5 Her words

No label ships to her trial before the wording pass (R4). The 14 things she did not
understand in July are the first list.

### 4.6 What does not change

The ported screens, sheets, shell and engine stay locked as the demo build. Applied
migrations are never edited. Capacity stays one rule in two runtimes. Money is centavos
in the database. Every write carries a client id. Every SQL, money, sign-in or offline
change gets one independent review by a different model.

## 5. Data model: one record of each thing

"Today" is what the migrations define. Exact columns are settled in each slice after
reading the table; this is the shape.

| Record              | Today                                                                                                                      | Change                                                                                                                                                                                                                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Flavour**         | `products`, with publishing, picture, allergens, price. 26 in the trial, two duplicate pairs.                              | No new table. Duplicates are merged by switching one off and pointing its history at the other; nothing is deleted. An order line keeps the flavour's name as it was when ordered (L4).                                                                                                                        |
| **Recipe**          | `recipes`, `recipe_versions`, `recipe_drafts`. A line names its ingredient as text (L1).                                   | Each line points at a stock item. Saving refuses a name that is not an item and offers to create it. A line may carry a section label ("dough", "filling"); no nested recipes. No packaging lines. A production record points at the recipe version it used (L5).                                              |
| **Ingredient**      | `inventory_items` (ingredients and packaging), `stock_movements`, `stock_cost_corrections`.                                | One spelling of each unit. A switch for things she does not buy (her eggs and oats), so they are neither costed nor counted. Her reorder level drives Out, Low, Good.                                                                                                                                          |
| **Supplier price**  | `suppliers`, `supplier_prices`. A price names its item as text (L2); a delivery's supplier is free text.                   | A price points at its item and carries its own pack size. The best buy is the lowest price **per unit**. A delivery points at a supplier when one is chosen.                                                                                                                                                   |
| **Ingredient cost** | Worked out in the engine and again in SQL, with different fallbacks.                                                       | One database function: the last costed delivery; if none, the best supplier price per unit; if none, **unknown**, never zero. A recipe's cost answers with the amount, whether it is complete, and what is missing. Production costs what the recipe needed, including any shortfall, and flags the shortfall. |
| **Packaging rule**  | Names and quantities written into two database functions (H12).                                                            | New record: for each container (each box size, a bag, a pouch, a bazaar sale) the stock items and quantities it uses. Packing an order and recording a bazaar sale read it. The cost per cookie uses the container she picks; until she picks, it shows ingredients only and says so.                          |
| **Customer**        | None. An order holds a name, a phone number and an Instagram handle (L3).                                                  | New record, keyed by the normalised mobile number: name, handle, email, notes, tags. An order points at its customer; placing an order finds or creates one and shows nothing back to the person ordering. Labels (new, returning, regular, not seen lately) are counted, with her thresholds as settings.     |
| **Order**           | `orders`, `order_items`, `order_add_ons`, `order_boxes`, `order_swaps`, `order_rules`, `order_extras`, `waitlist_entries`. | Gains the link to its customer. Otherwise unchanged.                                                                                                                                                                                                                                                           |
| **Sale**            | Three places: paid orders, bazaar sales (`event_sales`), and the 804 imported lines (`ledger_entries`).                    | No new table. One read function returns every sale in one shape (date, source, customer, order number, payment method, flavour, amount) with filters. Money › Sales and the P&L drill-down both read it.                                                                                                       |
| **Bazaar**          | `scheduled_events` (the booking), `events` (the running event), `event_sales`, `event_expenses`.                           | The booking gains organiser, contact, status and notes, and is added from the Bazaar screen.                                                                                                                                                                                                                   |
| **Bazaar day**      | None. An event is one sitting; its stock is typed in (L6).                                                                 | New record per day of an event: opened with a float and a stock load taken from baked stock; closed with a cash count and a leftover count. Leftovers open the next day or return to baked stock. Each sale belongs to a day. A cash difference is its own line in the books. **After 25 October.**            |
| **Settings**        | `settings`, `order_rules`, `order_extras`, `shop_texts`, `shop_state`, `payment_methods`, `books_settings`.                | Adds: her monthly target and week target; her margin floor; the shop's name and how customers should reach her (for every sentence that now says "Cine"); one retention period used by the notice, the job and the database; the privacy text; the label thresholds; the costing container.                    |
| **Clock**           | Manila time in five files; device time in the engine.                                                                      | One module and one database function. New screens use only those.                                                                                                                                                                                                                                              |

## 6. Before any new screen: the data layer

These are fixed first because every new screen would otherwise inherit them. None adds a
screen. Slices D10 and D11 touch bazaar close-out and wait until after 25 October.

| #   | Slice                       | What it fixes                                                                                                                                                                                                                               | Size | Tests and evidence                                                                                                                         |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | One business clock          | C10, C2 (the CSV prints Manila dates), H19. One "today" definition.                                                                                                                                                                         | S    | Unit tests at 23:59 and 00:01 Manila with the device in another zone; CSV date test.                                                       |
| D2  | Links by identity           | L1, L2. Recipe lines and supplier prices point at items; unknown names are refused; existing rows are matched by exact name and the unmatched are reported, not guessed.                                                                    | M    | SQL role suite; a test that a misspelt ingredient cannot be saved; a count of unmatched rows printed. Review.                              |
| D3  | One cost function           | C3, C5, H8. Per-unit best buy; "unknown" never zero; shortfall costed and flagged. C4 decided with it: cost follows what the recipe needed, deduction stays rounded.                                                                        | L    | Money tests: small pack against large pack; unknown ingredient; use before any delivery; half batch; shortfall. SQL role suite. Review.    |
| D4  | Packaging rules             | H7, H12, H13. The rule table; packing and bazaar sales read it; nothing named in code.                                                                                                                                                      | M    | SQL role suite; tests for each box size, loose cookies and a bazaar sale; the empty-shop test (no rule, no deduction, a visible warning).  |
| D5  | Settings she is missing     | Targets, margin floor, shop name and contact line (H14), one retention period (H15), privacy text (H16), label thresholds, the "default, not confirmed" marker (H17).                                                                       | M    | SQL role suite; a test that each sentence takes its names from settings; the two-shops test on customer copy.                              |
| D6  | Customers                   | L3. The record, the order link, find-or-create on ordering, existing orders linked by phone, retention and erasure covering the customer.                                                                                                   | L    | SQL role suite; a test that ordering reveals nothing about an existing customer; retention and erasure tests. Security and privacy review. |
| D7  | Sales in one shape          | The read function with filters.                                                                                                                                                                                                             | M    | Totals reconcile to the books for the same period; filter tests.                                                                           |
| D8  | Home's numbers              | H1, H2, C1. Pickups, month to date against "last 30 days", target progress and the "needs you" list, all from records.                                                                                                                      | M    | Unit and SQL tests; the empty-shop test.                                                                                                   |
| D9  | Her data, loaded            | S3 to S7, S9 to S11: 23 recipes as version 1 "to confirm" without packaging lines; the flavour list; 15 photos resized; 31 newer sales; two bookings; name mapping; packaging costs; 43 customers. Each is a private script with a preview. | L    | Each import prints counts before and after and a hash of its input; **each runs on the trial only after Ethan approves its preview.**      |
| D10 | Bazaar days and baked stock | L6 and the days record. After 25 October.                                                                                                                                                                                                   | L    | SQL role suite; offline tests across a day boundary; phone test. Review.                                                                   |
| D11 | Cash over or short          | C7. After 25 October.                                                                                                                                                                                                                       | S    | Close-out tests for exact, over and short.                                                                                                 |

Not in this list, on purpose: C6 (the 200 limit's wording) and C8 (a same-day total shown
before ordering) are interface items; C11 (decimal sums) has no failing case and is left.

## 7. The interface: five tabs, every screen

Built new, in a folder named by business area (`src/features/home`, `sell`, `make`,
`stock`, `money`, `account`, `customer`, and `shell`), chosen in live mode by
`src/components/app/ops-app.tsx`, which is not a protected file. No ported file is
edited. The ported app stays the demo build and keeps its gates.

How the new screens get their data is the one real unknown. Today the live data sits
inside `OpsRuntime`, wired to the engine's state. Slice U0 proves the route out of it: a
small live store that the new frame reads directly, starting with read-only data. If U0
shows this needs more than a session, the plan pauses there for a decision.

Phone: a bottom bar with the five tabs. Tablet and desktop: the same five as a sidebar
with sub-tabs listed, and list beside detail. The account button (top right) holds
settings, people, system health, backups and sign-out; the bell holds alerts.

| Tab       | Sub-tab   | Screens                                                                                                                                                                                                                                           | Kind                 |
| --------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| **Home**  | This week | Target bar (month and week, "cookies still to sell"); this week's orders: open or closed, sold against the limit; "Needs you" (payments to check, items low, bazaar soon); what to bake next.                                                     | New                  |
| **Sell**  | Orders    | Orders list (search; chips for status, payment, date, flavour). Order page: paid tick, pack, collect, swap, cancel, messages, its customer.                                                                                                       | Redesign, same logic |
|           | Bazaar    | Bookings list and "Add a bazaar". Set up a day: stock from baked stock, prices, float. Selling: large tiles, the running sale, free sample, offline state always visible. Close the day: cash and leftovers. Event summary.                       | Redesign and new     |
|           | Customers | Customers list (search; chips for label, last order, flavour). Customer page: orders, flavours, spend, notes, tags.                                                                                                                               | New                  |
|           | Shop      | What customers see, in one place: menu on sale, open or closed, order rules, boxes and add-ons, payment methods, shop texts, waitlist, preview.                                                                                                   | Regroup              |
| **Make**  | Bake plan | What to mix and bake for this week's orders; record dough, a bake, binned dough; shortfalls.                                                                                                                                                      | Same logic           |
|           | Recipes   | Picture grid (on sale, all, cannot make now). Flavour page: picture (drop or choose), price, cost, margin against her floor, allergens, ingredients each marked Good, Low or Out, versions, her original recipe text. Edit recipe. Add a flavour. | New                  |
| **Stock** | Inventory | Items list with Out, Low, Good; item page with movements; receive a delivery; weekly count; waste.                                                                                                                                                | Redesign             |
|           | Grocery   | The same list filtered to Out and Low, with pack, best price per unit, supplier and a running total against her budget; "I bought these".                                                                                                         | Redesign             |
|           | Suppliers | Suppliers list; supplier page with prices and links.                                                                                                                                                                                              | Same logic           |
| **Money** | P&L       | Period picker; revenue, cost, expenses, profit; tap a number to see its records; CSV.                                                                                                                                                             | Same logic           |
|           | Sales     | Every sale, one list (chips for source, payment, date, flavour, customer).                                                                                                                                                                        | New                  |
|           | Expenses  | Record an expense or a draw; her categories; correct a delivery's cost.                                                                                                                                                                           | Same logic           |
| Account   |           | Settings (targets, margin floor, shop name, retention, sign-out timer); people and what each can see; system health; backups and export; alerts.                                                                                                  | Regroup              |
| Customer  |           | Shop, checkout, order status, find my order, waitlist, on a phone, a tablet and a desktop.                                                                                                                                                        | Redesign             |

Leaving the live app: All tools, the Form queue entry, the prototype's helper names, and
the "Your business" grid on Home.

## 8. Order of slices

Sizes: **S** under half a session, **M** one session (at most about 400 changed lines),
**L** two or three sessions, split before starting. Every slice ends with `pnpm verify`
pasted, a commit and a push. SQL, money, sign-in and offline slices add the SQL role
suite and one independent review. Interface slices add the empty-shop and two-shops
tests, an accessibility scan, new visual baselines made in Docker, and a look in the
browser at 360, 768 and 1,440 wide.

### Stage 0: before the rehearsal (now to 19 October)

| #   | Slice                                                                                                                                         | Size | Evidence                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------- |
| A1  | The release check accepts two to six approved addresses instead of exactly two (H11, S3). **First build goal.**                               | S    | Unit tests for 2, 3, 4, a mismatch, a duplicate and 7; the deploy job green.            |
| A2  | Framework patch release (D1).                                                                                                                 | S    | `pnpm audit` before and after; browser tests; visual suite in Docker unchanged.         |
| A3  | The backup, restore-drill, retention and keep-alive schedule, written and switched off (S1). Ethan switches it on after the custody decision. | M    | A dry run against the local database; the first real run seen in System health (Ethan). |
| A4  | A release hold: one repository setting that makes the trial deploy job skip.                                                                  | S    | A push with the hold on does not deploy; with it off it does.                           |
| A5  | Sign-out is refused while sales are queued, if it is not already. Read first; fix only if missing.                                            | S    | Offline test: queue a sale, try to sign out.                                            |

D1 and D2 may run in this window. They do not touch selling.

### Stage 1: the data layer (to about 30 October, around the bazaar)

D1, D2, D3, D4, D5, D6, D7, D8 in that order, then D9's imports one at a time as Ethan
approves each preview. D10 and D11 follow the bazaar.

### Stage 2: the interface (from about 26 October)

| #   | Slice                                                                                                                                                                      | Size      | Depends on  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ----------- |
| U0a | The new frame behind a build setting: five tabs, sub-tabs, account, bell; the small live store; empty screens.                                                             | M         | —           |
| U0b | The shared pieces: list, record page, edit sheet, status badge, money text; the two tests; the accessibility scan.                                                         | M         | U0a         |
| U1  | Home.                                                                                                                                                                      | M         | D8          |
| U2  | Sell › Orders: list, then order page.                                                                                                                                      | M + S     | U0b         |
| U3  | Sell › Customers: list and page.                                                                                                                                           | M         | D6          |
| U4  | Sell › Shop: the existing forms in one place.                                                                                                                              | M         | U0b         |
| U5  | Make › Bake plan.                                                                                                                                                          | M         | D3          |
| U6  | Make › Recipes: grid; flavour page; edit and versions; picture drop with resizing.                                                                                         | L (4)     | D2, D3, D4  |
| U7  | Stock › Inventory: list and item page; receive, count, waste.                                                                                                              | M + M     | D2          |
| U8  | Stock › Grocery.                                                                                                                                                           | M         | D3          |
| U9  | Stock › Suppliers.                                                                                                                                                         | S         | D2          |
| U10 | Money: P&L; Sales; Expenses.                                                                                                                                               | M + M + S | D7          |
| U11 | Account: settings, people, health, backups, alerts.                                                                                                                        | M         | D5          |
| U12 | Customer pages on every screen size.                                                                                                                                       | M + M     | D5          |
| U13 | Sell › Bazaar: bookings; day set-up; selling tiles; close the day.                                                                                                         | L (4)     | D10, D11    |
| U14 | Offline update: a version stamped at build, the whole app stored for offline, old copies removed, "update ready" asked for and never applied during a sale (S2, H10, H18). | M         | U13         |
| U15 | Measure the live shop page and resize the two logo files (performance P1, P3).                                                                                             | S         | U12         |
| U16 | Wording pass with Cine on every label.                                                                                                                                     | S         | all screens |
| U17 | Switch: the new frame is the live app; the ported one remains the demo.                                                                                                    | S         | all         |

Count: 5 before the rehearsal, 11 data, about 21 interface slices that split into about
30 sessions.

## 9. Dates

| When                               | What                                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 6 to 9 October                     | A1, A2, A4, A5; A3 written. D1 and D2 start.                                                                                                                             |
| By 12 October                      | Ethan adds Cine's two addresses to Cloudflare Access and invites her; she signs in on her iPhone and her MacBook. Ethan decides backup custody and switches the jobs on. |
| 13 to 19 October                   | The phone rehearsal (section 9.1), on the phone that will sell. Aim for 17 October to leave room for one fix and a repeat.                                               |
| **20 October**                     | The gate. Passed: the release hold goes on and the bazaar uses the app. Not passed: she sells as she does today and 12 to 13 December becomes the pilot.                 |
| 24 to 25 October                   | The bazaar, on today's Bazaar Mode, with a paper tally as backup. A CSV download at the end of each day.                                                                 |
| 26 October                         | Hold off. Review what happened; D10 and D11 are shaped by it.                                                                                                            |
| To mid-November                    | Stage 2.                                                                                                                                                                 |
| Second half of November (estimate) | Wording pass, then Cine's trial week.                                                                                                                                    |
| 12 to 13 December                  | The second bazaar: the first on bazaar days, if D10 and U13 are done and rehearsed.                                                                                      |

### 9.1 The phone rehearsal: what it must prove

On the iPhone that will sell, with the app added to the home screen, signed in as her:

1. Open Bazaar Mode with signal, then switch to aeroplane mode. Sell 20 mixed sales, a
   free sample and a void. Close the app fully and reopen it offline: the sales are
   still there.
2. Leave the phone offline overnight. Reopen: the app opens and the sales are there.
3. Reconnect. Every sale arrives once; the totals match the paper tally.
4. **The sign-in clock.** The trial's access gate lasts 8 hours and the app has its own
   idle sign-out. Find out what she sees on the second morning, offline and then
   online, and whether she can get an email code at the stall. If the gate asks for a
   code while sales are queued, confirm nothing is lost.
5. Try to sign out with sales queued: it must refuse or warn.
6. Run the close-out and compare with the tally.
7. Check the extra tap to reach Bazaar Mode from the phone dock is acceptable.

Anything that fails is fixed and the whole list is run again before 20 October.

## 10. What stays out

Paid texting, loyalty points, cards on file, wholesale and consignment, the Google Form
bridge, nested recipes, owner-entered orders, payment-proof upload, email alerts, a
labour-cost view, a second selling device, scoring or ranking of customers beyond the
counted labels, historical stock reconciliation, splitting the customer pages' script
(performance P5), a reskin, and the automatic runner. The shop stays closed, with no
real customers, no production project and no merge to `main`, until Ethan says so.

## 11. Risks

| Risk                                                              | What limits it                                                                                                             |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| A release reaches her phone between the rehearsal and the bazaar. | The release hold (A4), on from the day the rehearsal passes.                                                               |
| The access gate or idle sign-out locks her out at the stall.      | Rehearsal step 4, before the gate date.                                                                                    |
| The trial database holds real bazaar sales with no backup.        | Backups on before 24 October (A3); a CSV download each evening either way; the paper tally.                                |
| The new frame cannot read live data without the engine.           | U0a proves it first and stops for a decision if it cannot.                                                                 |
| The estimate slips.                                               | Nothing is promised to Cine until U17 is done. The December bazaar can run on today's Bazaar Mode again.                   |
| A value slips in hard-coded.                                      | The empty-shop and two-shops tests in `pnpm verify`.                                                                       |
| Imports guess at names or units.                                  | Every import previews; unmatched rows are reported; she corrects in the app.                                               |
| The customer record raises her privacy duties.                    | A small record, counted labels, one retention period, erasure, her own notice text; the registration question goes to her. |
| Two interfaces to keep alive.                                     | The ported one is frozen as the demo; only the new one changes.                                                            |

## 12. Decisions for Ethan

Each has one recommendation. **"Yes" approves it.**

| #   | Decision                | Recommendation                                                                                                                                                                                  |
| --- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The plan                | Adopt this page as the single forward plan in place of finish-plan.md, and let the pointer lines in AGENTS.md and CLAUDE.md that name finish-plan.md name this page instead.                    |
| 2   | Nothing hard-coded      | Adopt the rule, the short allowed list and the two tests in section 4.1.                                                                                                                        |
| 3   | The data model          | Section 5 as written: links by identity, one cost function that never answers zero, packaging rules as records, customers, bazaar days.                                                         |
| 4   | Cost                    | A shortfall is costed as if the stock had been there, and flagged. Cost follows what the recipe needed; deduction stays rounded.                                                                |
| 5   | Cash over or short      | After the October bazaar, a cash difference at close-out is its own line in the books, not a sale.                                                                                              |
| 6   | Customers               | Build the record of section 5 with counted labels whose thresholds Cine sets, and one retention period she sets (starting at the 24 months already approved).                                   |
| 7   | The interface           | The five tabs and screens of section 7, in a new folder named by business area, with All tools retired from the live app.                                                                       |
| 8   | Accessibility           | The floor in section 4.4.                                                                                                                                                                       |
| 9   | Before the bazaar       | Do A1 to A5 now. Do **not** change the service worker or Bazaar Mode before 25 October. Hold releases to the trial from the day the rehearsal passes until 26 October.                          |
| 10  | Bazaar records          | The October bazaar's sales are recorded in the trial database as real figures. Backups are on before 24 October; if they are not, she downloads the CSV each evening and keeps the paper tally. |
| 11  | Offline update          | Fix it after the bazaar and before the trial (U14), with an "update ready" prompt that never interrupts a sale.                                                                                 |
| 12  | Her data                | Each import in D9 runs on the trial only after you approve its preview.                                                                                                                         |
| 13  | Order and dates         | Sections 8 and 9. Cine's trial follows the switch (U17) and the wording pass; second half of November is the estimate.                                                                          |
| 14  | What stays out          | Section 10.                                                                                                                                                                                     |
| 15  | Framework patch         | Apply the patch release now (A2).                                                                                                                                                               |
| 16  | Error reporting, uptime | Leave both off for the trial and decide them before the shop opens: each needs a hosted setting.                                                                                                |

### What only you can do

1. **Cine's access.** After A1 is released: add her two addresses to the Cloudflare
   Access policy, add their digests to the release check's approved list, and invite her
   as owner. Agents do not create accounts.
2. **Backups.** Decide where the encrypted copy lives and who can restore it; add the
   secrets; switch the jobs on; check the first run appears in System health.
3. **The phone rehearsal**, by 20 October, with the list in section 9.1.
4. **The release hold:** on when the rehearsal passes, off on 26 October.
5. **Look at the trial yourself** after each release; nobody has yet looked at the
   5 October changes there.
6. **Carry the questions to Cine** (below), opening with a recap of the last
   conversation.

### Questions for Cine, in one message

| #   | Question                                                                                                                           | Until she answers                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Q1  | Which of the 13 flavours are on sale now, and is "Cornflake" Cereal Milk?                                                          | The seven on the October menu.                                        |
| Q2  | Which sampler sizes and prices are current: 6, 7 or 10?                                                                            | None is offered.                                                      |
| Q3  | For each box size, the bag and the pouch: what packaging goes in, and what does each piece cost?                                   | No packaging is deducted or costed, and the screen says so.           |
| Q4  | Which container should "cost per cookie" assume?                                                                                   | Ingredients only, labelled as such.                                   |
| Q5  | Your monthly sales target, and is 65% still the lowest margin you accept?                                                          | No target bar; no margin warning.                                     |
| Q6  | When is a customer "regular", and after how long "not seen lately"?                                                                | Labels are not shown.                                                 |
| Q7  | The reorder level for each ingredient, and the day of the opening count.                                                           | No Low state; Out only.                                               |
| Q8  | The Gooey Nutella photo and an exported Red Velvet Cheesecake photo; allergens per flavour.                                        | No picture; allergens blank (needed before the shop opens).           |
| Q9  | With your adviser: will you file the privacy commission's sworn declaration (Annex 1 of Circular 2022-04) or register voluntarily? | Nothing changes in the app; it must be settled before real customers. |
| Q10 | An hour to go through every label together, and seven dates for the trial week.                                                    | The trial does not start.                                             |

## 13. Actual gaps in this plan

- **No hands-on use of any comparator.** Both research passes are desk research.
- **The registration circular's own text was not read**, only the Commission's summary
  of it on its FAQ and exemption pages. Apple's guidelines were not re-fetched.
- **The code findings were read, not run.** C3's three defects and C5 have no failing
  test yet; D3 writes them first.
- **The hosted trial was not read**: its cost basis, its settings and its data are
  unknown here. The hard-coded sweep did not cover every line of the migrations or the
  runtime.
- **How the new frame reads live data is unproven** until U0a.
- **Who applies migrations to the trial database**, and when, was not traced. The release
  job deploys the site only, as far as the workflow files show.
- **The day-two sign-in behaviour at the stall is unknown** until the rehearsal.
- **No real iPhone has run the app.**
- **The sizes are estimates** from the pace of earlier slices, which were smaller in
  interface terms than these.
- **Cine has not seen the wireframes.** Ethan approved the shape; her wording pass is
  the first time she reacts to it.

## 14. First build goal

A1, in [next-goal.md](next-goal.md). It is first because Cine's access, and so the
rehearsal on her phone, waits on it.

## 15. Sources

Fetched and read on 5 October 2026 unless marked.

- [Loyverse: shift management](https://help.loyverse.com/help/shift-management-loyverse-pos)
- [Shopify: cash tracking](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/cash-register-management/cash-tracking)
- [Square: start and end a cash drawer session](https://squareup.com/help/us/en/article/8344-start-and-end-a-cash-drawer-session) (summary only)
- [Odoo 19: point of sale workflow](https://www.odoo.com/documentation/19.0/applications/sales/point_of_sale/use.html) (opening cash read; the rest summary only)
- [Square: process offline payments](https://squareup.com/help/us/en/article/7777-process-offline-payments)
- [Square: Customer Directory](https://squareup.com/help/us/en/article/5498-customer-directory)
- [WebKit: full third-party cookie blocking and more](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/) (the seven-day storage rule)
- [web.dev: the service worker lifecycle](https://web.dev/articles/service-worker-lifecycle)
- [Chrome for Developers: handling service worker updates](https://developer.chrome.com/docs/workbox/handling-service-worker-updates)
- [Craftybase: how to track packaging materials](https://craftybase.com/blog/how-to-track-packaging-materials-in-craftybase)
- [meez help: top 4 reasons why your recipes aren't costing](https://intercom.help/getmeez/en/articles/7204464-top-4-reasons-why-your-recipes-aren-t-costing)
- [Hotplate: product](https://hotplate.com/product)
- [Nielsen Norman Group: 10 usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)
- [W3C: Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/)
- [National Privacy Commission: FAQs on registration](https://privacy.gov.ph/pips-and-pics/faqs/), [guidelines on exemption from registration](https://privacy.gov.ph/pips-and-pics/exemption/) and [advisories and circulars](https://privacy.gov.ph/pips-and-pics/advisories-circulars/) (read in the browser; the site refuses plain fetches)
- Code and SQL: the file and line references in section 3.
- Cine's sources and her 115 comments: private, as listed in [sot-consolidation.md](sot-consolidation.md).
