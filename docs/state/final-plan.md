# Final plan, version 2 — bazaar safety first, then one screen at a time (5 October 2026)

Status: **approved by Ethan on 5 October 2026**, with the five answers in section 1.
This is the forward plan. It replaces the first version of this page (commits `331dde1`,
`846acea`) and, from here on, [finish-plan.md](finish-plan.md), whose sections 8 (how we
build) and 12 (sources) stay as reference. Nothing was built, imported or deployed in
writing it. The hosted trial was read twice, read-only, for counts and settings.

It rests on four pages that remain the record of what was found:
[sot-consolidation.md](sot-consolidation.md) (her data),
[product-research.md](product-research.md) (first research pass),
[system-audit.md](system-audit.md) (defects) and [ux-audit.md](ux-audit.md) (interface).
Counts and decisions only: recipes, customer rows and email addresses stay outside Git.

Why a second version the same day: Ethan asked for a re-audit, a real debate, wider
research and a full replan, with this bar: fast to finish; complete, functional, secure,
easy to reach and navigate, organised and targeted, efficient, precise, accurate, fast
and scalable.

## 1. What Ethan decided on 5 October

1. **Cine starts after everything is built**, not on a partial app. The order of work
   in section 9 therefore optimises for the earliest finish of the whole, and the trial
   database may change at any time before her week.
2. **Bazaar: build the bounded offline-open fix (A2)** with a security review, and
   lengthen the trial's access session from 8 hours to 7 days.
3. **Pace: two tracks and unattended runs** for interface-only slices. Database, money,
   sign-in and offline slices stay attended and independently reviewed.
4. **New screens are drawn through one guarded slot in the locked frame file**, live
   mode only, modelled on the form slot approved on 28 September
   (`src/components/shell/app-frame.tsx:553`). The demo build stays pixel-identical. It is
   recorded as a protected exception, reversed in the validator and independently
   audited. **Approving this plan approves that one protected edit.**
5. **The hosted trial may be read, read-only.** Done twice, counts and settings only:

| Read from the trial               | Finding                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Migrations applied                | All 53, including the newest. No drift from the repository.                                                                                                                                                                                                                                                                                |
| Cost basis                        | **"When bought"**, though "when used" was decided (DP-04). Changed in B3 with a cutover rule, not before: with no costed delivery, "when used" would cost every use at zero.                                                                                                                                                               |
| Prices the cost function can read | **8 of 72 items** have a supplier quote; **0** costed deliveries; **0** measured recipe versions. Today almost every cost per cookie is unknown. Confirms B3 and B4 come first.                                                                                                                                                            |
| Orders, events, book lines        | 0 orders, 804 book lines, and **1 event left open since 5 October with no sales**: close it before the rehearsal.                                                                                                                                                                                                                          |
| Security advisor                  | Two public views run with the owner's rights (deliberate: `20260101002200`); 21 tables with rules on and no policy (deliberate: reached only through functions); a provider helper `rls_auto_enable()` that is an event trigger and so cannot be called through the API (informational); leaked-password protection off (security gate 1). |

## 2. The plan in short

- **The old plan was too slow, in the wrong order, and missed the most dangerous
  defect.** The October bazaar is not safe as built (section 3).
- **New strategy:** make the bazaar safe; put five visible tabs on the existing frame
  through data, with one guarded slot for new screens and no second frame; make every
  number true; then replace screens one at a time, her two top areas (Stock, Recipes
  with cost) first. No big switch at the end.
- **Cine starts once everything is built** (Ethan's answer). With two tracks and
  unattended interface slices, that is mid-November at the earliest and early December
  more likely.
- **Each quality Ethan named gets a measurable bar** (section 10), so "complete" is tested.

## 3. The debate

Three voices: my re-reading, an opposing reviewer (a separate model told to attack both
plans), and the advisor. Rulings only; evidence in brackets.

### 3.1 Against the first version of this plan

| Objection                                                                                                                                                                                                                                                                       | Ruling                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Bazaar lock-out.** In live mode, opening or reloading with no signal fails the first identity check and signs her out; she cannot sign in offline. Sixty idle minutes does the same. [`src/components/app/live-gate.tsx:116-121, 140-142`; `src/lib/auth/idle-signout.ts:19`] | **Accepted; the plan missed it.** Queued sales and the running event survive, so it costs selling, not data. Slice A2. |
| Nothing tests the live app: browser and visual suites build without the database, where the sign-in gate is off. [`live-gate.tsx:65`; `tests/e2e/bazaar-offline.spec.ts:11-16`]                                                                                                 | **Accepted.** Live-mode smoke suite in B1.                                                                             |
| Cine sees nothing for 50 sessions; her top ask, "Inventory tracking and P&L", sits in the middle. [`product-research.md:51`]                                                                                                                                                    | **Accepted for the order.** The trial stays after everything (Ethan).                                                  |
| One switch at the end; a new frame as a late, undersized unknown. New screens have no route key. [`tests/unit/screens.test.ts:9-11`; `route-sync.tsx:28-37`]                                                                                                                    | **Accepted.** No big switch. Replaced screens reuse existing keys.                                                     |
| The accuracy check would fail on missing prices: purchases are in the books only, about 8 quotes exist, a stock item has no price field. [`20260101000000_init.sql:79-89`]                                                                                                      | **Accepted.** Her price list gets a home and loads first.                                                              |
| "Last delivery price" is not how the trade costs stock.                                                                                                                                                                                                                         | **Accepted.** Weighted average cost (section 7).                                                                       |
| Every page, the shop included, loads the whole staff app. [`src/app/shop/page.tsx`]                                                                                                                                                                                             | **Accepted**, scheduled before the shop opens.                                                                         |
| 17 decisions, heavy ceremony per slice.                                                                                                                                                                                                                                         | **Accepted.** Four decisions; baselines batched per stage.                                                             |

### 3.2 Against the first re-strategy

| Objection                                                                                                                                    | Ruling                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A new frame cannot cheaply host old screens: the old frame owns 29 sheets, the toast, Quick add. [`app-frame.tsx:290-307, 349-552, 601-672`] | **Accepted.** Regroup the existing dock and sidebar through data, as the live layer already does [`ops-runtime.tsx:3977-4001`].                              |
| Per-slice database changes collide with a trial database migrated by hand while she uses it. [`F2-trial-setup.md:104-107`]                   | **Accepted.** One database window before her week; none during it.                                                                                           |
| Light customer pages early do nothing for a closed shop.                                                                                     | **Accepted.** Before the shop opens.                                                                                                                         |
| Cut the packaging rules.                                                                                                                     | **Rejected.** Packaging names sit inside two database functions; "nothing hard-coded" is Ethan's rule.                                                       |
| Build multi-business support now, for scale.                                                                                                 | **Rejected.** With nothing hard-coded, a second business is a second database and deployment: stronger isolation, no code. Tables are single-business today. |

## 4. Research

Read from each product's own pages or the named study unless marked "summary".

### 4.1 How the most-used tools are built

| Tool (its own claim of scale)                                               | What it does that matters here                                                                                                                                                                         | Adopt                                                                                              |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| **Odoo** (ERP)                                                              | "Every stock operation is a move from one location to another." Costing: standard price, average cost or FIFO (summary). A bill of materials lists components per quantity produced.                   | Stock changes are moves between places: supplier, pantry, baked, stall, customer, waste.           |
| **ERPNext** (ERP)                                                           | Immutable ledger: a cancellation "adds opposite rows"; silent edits "make the audit trail impossible to trust".                                                                                        | Already the app's rule; keep it for everything new. Stamp the cost on each movement when written.  |
| **Craftybase** (makers)                                                     | Weighted average cost for all stock and cost of goods, "the most commonly used in manufacturing" (summary of its help page). Packaging is a recipe line; order-level packaging is spread, not tracked. | Weighted average cost. Packaging rules per container are our own design.                           |
| **Katana** (small manufacturers)                                            | Stock shown as "in stock", "committed" and "arriving"; make-to-order and make-to-stock; reorder points.                                                                                                | Stock rows read Have, Needed this week, To buy.                                                    |
| **Cybake** (bakery ERP)                                                     | "Pulls your ingredient costs directly from your purchasing data straight into your recipe costings"; allergens worked out from the recipe's ingredients.                                               | Cost follows purchases. Allergens roll up from ingredients, before the shop opens.                 |
| **meez** (recipes)                                                          | Shows "Cost not set yet" or a dash for a recipe it cannot cost.                                                                                                                                        | Unknown is never shown as zero.                                                                    |
| **Loyverse** (point of sale; "350,000+ active merchants", "170+ countries") | A shift opens with cash and closes with a count and a difference. "Production" raises the product's stock and lowers the ingredients'; a sale lowers only the product. Records sales offline.          | A bazaar day is a cash session. Baked cookies are one stock count the stall sells from.            |
| **Square**                                                                  | Offline payments expire after 72 hours; signing out or deleting the app loses pending ones.                                                                                                            | Warn before sign-out with sales queued; rehearse it.                                               |
| **Shopify POS**                                                             | A register session is the float, cash added or removed, and the final count. Version 10: more cart lines in view, a prominent checkout button with the total, key tools "one tap away" (summary).      | Selling screen: tiles, running sale always visible, one large payment button.                      |
| **Hotplate** (pre-order drops)                                              | "Choose when orders open, set pickup windows, control inventory"; items reserve in-cart; waitlist; prep lists per drop.                                                                                | "This week's orders" framing; all built already.                                                   |
| **Peddlr** (Philippines; about 1 million merchants, summary)                | Free, phone-first, sales, stock and expenses, works with no signal.                                                                                                                                    | The local bar: offline by default, plain, quick.                                                   |
| **Bakesy** (home bakers, summary)                                           | Order forms, orders with paid or balance, invoices, availability.                                                                                                                                      | Nothing found covers drops, stock, costed recipes, stall selling and books together. Build stands. |

### 4.2 UI/UX research and case studies

| Finding                                                                                                                                                                                                       | Source                             | What it decides                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------- |
| Hidden navigation, 179 participants, 6 sites: "more than 20% drop in discoverability"; 15% slower on phones, at least 39% slower on desktop; rated 21% harder.                                                | Nielsen Norman Group               | All tools as a catch-all goes. Five visible tabs.                                        |
| Tab bars suit "relatively few navigation options"; more than 5 will not fit at a good touch size. Material: "three to five destinations", every item labelled, 1 to 2 words. Apple: tabs navigate, never act. | NN/g; Material Design 3; Apple HIG | Five labelled tabs; actions live on screens.                                             |
| Progressive disclosure improves learnability, efficiency and error rate; beyond 2 levels "users often get lost".                                                                                              | NN/g                               | Tab, then sub-tab, then the record. No third level of menus.                             |
| Complex applications: "reduce clutter without reducing capability"; show secondary information "without leaving the primary screen"; make critical things stand out.                                          | NN/g, 8 guidelines                 | List beside detail on wide screens; status on the row.                                   |
| "Speak the users' language"; users "should not have to wonder whether different words… mean the same thing".                                                                                                  | NN/g heuristics                    | Wording pass with Cine; one name per thing.                                              |
| 1,333 observations: 49% one-handed, 36% cradled, 15% two-handed.                                                                                                                                              | Hoober, UXmatters                  | Tabs and the main button at the bottom, in thumb reach.                                  |
| Bigger and nearer targets are faster with fewer errors. Apple: 44 by 44 points by default. WCAG 2.2 AA: at least 24 by 24; contrast 4.5:1; colour never the only signal.                                      | NN/g on Fitts's law; Apple; W3C    | 44-point targets for tabs, tiles and main buttons; status as a word plus colour.         |
| Response limits: 0.1 s feels instant, 1 s keeps the flow of thought, 10 s loses attention.                                                                                                                    | NN/g                               | A sale tile responds at once from the phone; a screen change inside a second.            |
| Vodafone test: "A 31% improvement in LCP led to 8% more sales". Good: largest paint 2.5 s, tap response 200 ms, layout shift 0.1.                                                                             | web.dev                            | The customer shop gets a speed budget and its own light pages.                           |
| Checkout: 18% abandon when an account is required, 17% when it is too long, 12% when they cannot see the total up front. Ideal: 12 to 14 form elements; average 23.                                           | Baymard Institute                  | No account; total always visible (fixes audit C8); field count checked against her form. |
| SAP Fiori: role-based, adaptive, simple, coherent, delightful (summary).                                                                                                                                      | SAP                                | Owner and helper views; one list, one page, one form.                                    |

### 4.3 Engineering, speed and scale

| Finding                                                                                                                                                                                                                                                                                                                                                                    | Source                                  | What it decides                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------- |
| Replace gradually; one-cut replacements "go down in flames most of the time".                                                                                                                                                                                                                                                                                              | Fowler                                  | No big switch.                                                                           |
| Security-rule helpers wrapped in a `select` run once per statement, not per row; index every column a rule filters on; name the role.                                                                                                                                                                                                                                      | Supabase docs                           | One small migration: all 23 rules call the helper unwrapped today.                       |
| Lazy loading cuts "the amount of JavaScript needed to render a route".                                                                                                                                                                                                                                                                                                     | Next.js docs                            | Customer routes without the staff app; a tab's code loads when opened.                   |
| "Requests to static assets are free and unlimited."                                                                                                                                                                                                                                                                                                                        | Cloudflare docs                         | Customer traffic costs nothing at the edge; the database is the only limit.              |
| A free database project pauses after a week without enough activity; restorable for a year.                                                                                                                                                                                                                                                                                | Supabase docs                           | The keep-alive job matters (A4).                                                         |
| iPhone storage can be cleared for a site left unused; a Home Screen web app has its own counter and can be granted persistent storage.                                                                                                                                                                                                                                     | WebKit                                  | The selling phone installs the app; the app asks for persistent storage.                 |
| A seller on its own site publishes name, address, phone and email, shows prices, issues an invoice or receipt per sale. No exemption found in the text read.                                                                                                                                                                                                               | RA 11967 (lawphil)                      | Shop settings before opening; a question for Cine's adviser.                             |
| Square's default customer groups: Regulars are "customers who've visited your business three times in the last six months"; Lapsed are regulars who "haven't visited in the last six weeks"; both editable. Her own form data agrees: of 43 customers, 10 ordered more than once and 3 ordered three times or more; the median gap between a customer's orders is 22 days. | Square help; her workbook (counts only) | The label defaults in section 7.                                                         |
| "Reorder Point = (Average Daily Usage x Average Lead Time in Days) + Safety Stock"; review at least quarterly.                                                                                                                                                                                                                                                             | QuickBooks                              | Low is worked out from use and days of cover, not typed per item.                        |
| Onboarding costs attention and should be kept short; ask only for what is needed, "explain why you want that data", give a visible skip and a progress indicator; "people usually stick with defaults", so choose them well.                                                                                                                                               | Nielsen Norman Group                    | The set-up screen is pre-filled from her data, skippable, resumable, and shows progress. |
| Privacy registration: mandatory only at 250 staff, 1,000 sensitive records, risky processing or a government body; otherwise register or file a sworn declaration.                                                                                                                                                                                                         | Privacy commission's site               | Cine's question.                                                                         |

Where the code stands on scale (read): orders read is capped at 500 rows and 60 days, books at 400 days; the catalogue, recipes and flavours reads are whole-table; uploads are not resized; no polling beyond a 4-minute health check.

Not done: no comparator was operated hands-on. Cine using her own screens is the better
instrument, and this plan brings it forward.

### 4.4 Customer records and privacy in the Philippines

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

### 4.5 Not verified, and not relied on

- **No comparator was operated hands-on**, in any round.
- "Summary" in the tables above means a search result's summary of the primary page was
  read, not the page: Odoo's costing methods, Craftybase's weighted average cost, Shopify
  POS version 10, SAP Fiori's principles, Peddlr and Bakesy.
- The privacy commission's circular itself (a PDF) could not be read; its FAQ and
  exemption pages were.
- Castiron's closure rests on secondary pages; it stays dropped.
- No claim is made about market share. Figures of scale are each product's own.
- The exact value Cloudflare's API uses for a one-week session was not found in its
  documentation; slice A1 reads it from the policy.

## 5. What the code says

Read, not run, unless a line says otherwise.

### 5.1 The audit's open questions

| #   | Question                                          | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Evidence                                                                                                                                         |
| --- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| C3  | Can cost per cookie use prototype prices or zero? | **Partly wrong as written, and a different defect is real.** In live mode the engine's price tables are emptied and refilled from her suppliers, so prototype prices cannot reach the figure, and her supplier prices do feed it. The real defects: (a) the "best buy" is the lowest **pack** price, not the lowest price per gram, so a small pack beats a cheaper large one, and that pack price is then divided by the item's one pack size; (b) the completeness check and the figure use different matching rules; (c) only the Products rows show "Cost pending": the recipe screen, the bazaar profit and the waste figures still use a zero for an unknown ingredient. Not run, read only. | `ops-engine.js:1548-1555`, `:1845-1852`; `engine-catalogue.ts:63-70`; `stock-catalogue.ts:412-420`; `ops-runtime.tsx:788`, `:2478`, `:4011-4054` |
| C5  | Is a stock shortfall during production costed?    | **No. Confirmed.** Production takes what is on hand and writes a stock movement only for that; the rest is kept as a "short" note. The books, on the "when used" basis, cost only stock movements. So the shortfall is never costed. Two more found: a use dated before any costed delivery is costed at zero; and the cost basis defaults to "when bought" in the database although "when used" was the decision (DP-04). What the trial is set to was not read.                                                                                                                                                                                                                                  | `20260101004700_production.sql:49-76`, `:278-282`; `20260101004900_books.sql:45`, `:82-94`, `:457-460`                                           |
| C9  | Does binned dough reduce the dough balance?       | **Yes.** Both the discard check and the redefined production function subtract binned dough.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `20260101004800_production_discard.sql:105-107`, `:141-142` of the redefinition                                                                  |
| C9  | Is only one bazaar-sale booking path reachable?   | **Yes.** The first function had its permission removed from every browser role and never regranted; the second was replaced under the same name by the third, which is the only one the app calls. The old `/api/sync` route appears only in archived test scripts.                                                                                                                                                                                                                                                                                                                                                                                                                                | `20260101001500_legacy_mutation_authority.sql:3`; `20260101004700_production.sql:449`, `:626-627`; `src/lib/data/event-sales.ts:82`              |
| C10 | Which live paths use the device's own midnight?   | The owner's drop window (opens, closes, "closing tonight") and relative dates still come from the engine, which uses the device's local midnight; nothing in the live layer replaces it. Customers' pickup dates and the server use Manila time. On a phone set to Manila time the two agree; on any other time zone the owner's screens shift. "Today in Manila" is defined twice.                                                                                                                                                                                                                                                                                                                | `ops-engine.js:35`, `:52-66`, `:3932`; no override in `ops-runtime.tsx`; `src/lib/orders/pickup.ts:90`; `src/lib/data/staff-orders.ts:248`       |

### 5.2 Hard-coded values the first sweep missed

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
runtime; the two tests in section 6 exist because a sweep cannot prove absence.

### 5.3 Found in the second round

| #   | Finding                                                                                                                                                                                                                                                                                                       | Where                                                                                                                       | Goes to       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------- |
| N1  | **Offline open signs her out.** The first identity check of a page load fails closed when it cannot reach the server, and the lock-out path signs out and sends her to a sign-in page she cannot use offline. Idle sign-out after 60 minutes takes the same path. Deliberate when written; wrong for a stall. | `src/components/app/live-gate.tsx:116-121, 140-142`; `src/lib/auth/live-gate.ts:115-123`; `src/lib/auth/idle-signout.ts:19` | A2            |
| N2  | Queued sales and the running event survive that lock-out: the queue is in the phone's database and the event has its own saved copy.                                                                                                                                                                          | `live-gate.ts:101-104`; `src/lib/offline/bazaar-state.ts`                                                                   | —             |
| N3  | Nothing checks for queued sales before sign-out.                                                                                                                                                                                                                                                              | `live-gate.ts:115-123`                                                                                                      | A3            |
| N4  | No test runs the live app: the browser suites build without the database, where the gate is off.                                                                                                                                                                                                              | `live-gate.tsx:65`; `tests/e2e/bazaar-offline.spec.ts:11-16`                                                                | B1            |
| N5  | The frame picks each screen by key and owns 29 sheets, the toast and Quick add; the screen list must equal the engine's.                                                                                                                                                                                      | `src/components/shell/app-frame.tsx:308-331, 349-552`; `tests/unit/screens.test.ts:9-11`                                    | B1 (the slot) |
| N6  | Every route, the shop included, renders the whole staff app.                                                                                                                                                                                                                                                  | `src/app/shop/page.tsx`; `src/components/app/ops-app.tsx:53-62`                                                             | Stage C       |
| N7  | A stock item has no price field. On the trial: 8 of 72 items have a quote, no costed delivery, no measured recipe version.                                                                                                                                                                                    | `supabase/migrations/20260101000000_init.sql:79-89`; trial read                                                             | B3, B4        |
| N8  | The service worker has no update handling.                                                                                                                                                                                                                                                                    | `public/sw.js:8, 41-51`; `src/components/app/offline-bridge.tsx:43`                                                         | Stage C       |
| N9  | All 23 security rules call their helper unwrapped. Located by a search pass, not re-read.                                                                                                                                                                                                                     | for example `20260101000000_init.sql:287, 311`                                                                              | B3            |
| N10 | Reads without a limit: the stock catalogue, recipes and flavours. Orders are capped at 500 rows and 60 days. Located by a search pass, not re-read.                                                                                                                                                           | `20260101004300_stock_catalogue.sql:37`; `20260101004400_recipes.sql:39`; `20260101003700_staff_orders.sql:97`              | Stage C       |
| N11 | More business values as settings defaults: tax rate, float, two discounts, grocery budget, packaging fee, flat box price, an order window of Monday to Thursday, most cookies per order, expense categories, and a fourth statement of the retention period. Located by a search pass, not re-read.           | `20260101002900_settings_preferences.sql:52-80, 160-161`                                                                    | B2 (marker)   |
| N12 | Uploaded pictures are stored as chosen, with no resizing.                                                                                                                                                                                                                                                     | `src/lib/media/resolve-image.ts`                                                                                            | Stage C       |

## 6. Rules for everything built from here

### 6.1 Nothing hard-coded

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

### 6.2 One record of each thing

A screen never keeps its own copy of a name or a price. It shows the record. A request
for a new feature is answered by adding a field or a filter to the record it is about,
not a screen.

### 6.3 One list, one page, one form

Every list: title and actions, a search box, filter chips, rows with a status in words
and colour. Every record opens the same kind of page. Every edit uses the same sheet.

### 6.4 Accessibility floor (WCAG 2.2 AA where it applies)

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

### 6.5 Her words

No label ships to her trial before the wording pass (R4). The 14 things she did not
understand in July are the first list.

### 6.6 What does not change

The ported screens, sheets, shell and engine stay locked as the demo build. Applied
migrations are never edited. Capacity stays one rule in two runtimes. Money is centavos
in the database. Every write carries a client id. Every SQL, money, sign-in or offline
change gets one independent review by a different model.

One approved exception to the locked files: a guarded, live-only screen slot in the
frame (decision 4 in section 1). It is recorded in
[protected-exception.md](protected-exception.md) and built in slice B1.

### 6.7 Everything that can change is hers to change

Ethan, 5 October: "Everything that you think is a variable and might change must be
editable and configurable", and on sale or off sale is Cine's switch. This is the
inventory the build is checked against. "Today" means a form or setting for it exists in
the live app now; each is re-checked in slice B2, and anything found fixed in code is
moved to a setting there.

| Thing                       | What she can change                                                                                                                                                             | Today                                           | Arrives in                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------- |
| Flavours                    | Add, rename, describe, picture, allergens, price, permanent or rotating, **on sale or off sale**, retire.                                                                       | Yes (flavour editor and publish).               | B6 moves it into the flavour page as one switch and a filter. |
| Recipes                     | Ingredient lines, quantities, units, yield, versions, the flavour's own packaging lines.                                                                                        | Yes, except packaging lines.                    | B3, B6                                                        |
| Ingredients and packaging   | Name, unit, pack, **usual price**, supplier, shelf life, a level that overrides the Low rule, "I do not buy this", switch off.                                                  | Yes, except usual price and the two switches.   | B3, B5                                                        |
| Suppliers and their prices  | Add, edit, switch off; each price with its own pack.                                                                                                                            | Yes.                                            | B3 (pack per price)                                           |
| Boxes, samplers, add-ons    | Box sizes and charges; **each sampler size, its price, on or off**; add-ons with prices and options; the same-day charge.                                                       | Yes; samplers as a list is new.                 | B3, B4                                                        |
| Order rules                 | When orders open and close, pickup days and hours, the campus slot, lead days, the weekly limit, how long an unpaid order is held, the limit per phone, most cookies per order. | Yes.                                            | —                                                             |
| Payment methods, shop texts | Each method, its details and picture, on or off; every sentence the shop shows.                                                                                                 | Yes.                                            | —                                                             |
| Shop details                | Business name, address, phone, email, how customers should reach her, the privacy text, how long customer details are kept, the time zone.                                      | No: written into code in several places.        | B2, set-up                                                    |
| Money                       | Expense categories, cost basis, **monthly and weekly target, lowest acceptable margin**, tax set-aside, discounts, float, grocery budget.                                       | Stored as settings; targets and margin are new. | B2, B7                                                        |
| Stock and customer rules    | Days of stock cover; when a customer is Returning, Regular, Not seen lately.                                                                                                    | No.                                             | B5, stage C                                                   |
| Bazaars                     | Bookings and their details; stock, prices and float for a day; expenses.                                                                                                        | Yes; days are new.                              | Stage C                                                       |
| People and access           | Whether helpers see sale totals; minutes before sign-out per role; shop open or closed now.                                                                                     | Yes.                                            | —                                                             |

**Deliberately fixed, and why:** the steps an order moves through (awaiting payment, paid,
ready, collected, and the three endings), because the database's safety rules are built
on them; the allowed range of each setting (a hold of 1 to 168 hours), so a typing slip
cannot break ordering; who may do what (owner, helper, support); and the app's own name.
If Cine needs one of these changed, that is a change request, not a setting.

## 7. Architecture and data model

1. **Stock is moves between places**, append-only, corrected by an opposite entry.
   Baked cookies and dough are counts moved by bake, pack, bin, load to stall, return.
2. **Weighted average cost**, updated at each costed delivery, with her usual price as
   the fallback, then the best quote per unit, else **unknown**. The cost is stamped on
   each use when written, so a later delivery never changes a past month.
3. **One cost function, one clock, packaging as records** (lines on each recipe, plus a
   rule per order container); nothing named in code.
4. **Lists are paged and filtered in the database**; totals are worked out there too.
5. **One business per database.** No multi-business columns.
6. **Customer pages are their own light routes**; staff tabs load on demand.
7. **Ported screens stay locked as the demo.** One guarded, live-only slot in the frame
   draws a new screen in place of the old one, and carries Customers and Sales as views
   under existing keys, so the engine's screen list is untouched. A redesigned screen replaces the old one
   under the same key, live mode only.
8. **Stock states are worked out, not typed in.** Needed is what this week's orders
   require, from the recipes; with no orders yet, her usual week's use; before any
   history, one batch of each flavour on sale. Out is none left. Low is some left but
   less than needed for the days of cover she sets. Good is the rest. A level she types
   for an item overrides the rule.
9. **Customer labels are counted from orders:** Returning is two or more orders; Regular
   is three in six months; Not seen lately is a returning customer with none in six
   weeks. All three numbers are her settings.
10. **One set-up screen** confirms every default (section 9, stage C).

### 7.1 One record of each thing

"Today" is what the migrations define. Exact columns are settled in each slice after
reading the table; this is the shape.

| Record              | Today                                                                                                                      | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Flavour**         | `products`, with publishing, picture, allergens, price. 26 in the trial, two duplicate pairs.                              | No new table. Duplicates are merged by switching one off and pointing its history at the other; nothing is deleted. An order line keeps the flavour's name as it was when ordered (L4).                                                                                                                                                                                                                                                                                              |
| **Recipe**          | `recipes`, `recipe_versions`, `recipe_drafts`. A line names its ingredient as text (L1).                                   | Each line points at a stock item. Saving refuses a name that is not an item and offers to create it. A line may carry a section label ("dough", "filling"); no nested recipes. Her packaging lines are kept as the recipe's packaging section (this reverses S3's "without their packaging lines"). A production record points at the recipe version it used (L5).                                                                                                                   |
| **Ingredient**      | `inventory_items` (ingredients and packaging), `stock_movements`, `stock_cost_corrections`.                                | One spelling of each unit. A switch for things she does not buy (her eggs and oats), so they are neither costed nor counted. Her reorder level drives Out, Low, Good. Her usual price and pack for each item, dated (her Ingredient Master), because an item has no price field today.                                                                                                                                                                                               |
| **Supplier price**  | `suppliers`, `supplier_prices`. A price names its item as text (L2); a delivery's supplier is free text.                   | A price points at its item and carries its own pack size. The best buy is the lowest price **per unit**. A delivery points at a supplier when one is chosen.                                                                                                                                                                                                                                                                                                                         |
| **Ingredient cost** | Worked out in the engine and again in SQL, with different fallbacks.                                                       | One database function: the weighted average cost of what is on hand, updated at each costed delivery; if none, her usual price for the item; if none, the best supplier price per unit; if none, **unknown**, never zero. The cost is stamped on each use when it is written. A recipe's cost answers with the amount, whether it is complete, and what is missing. Production costs what the recipe needed, including any shortfall, and flags the shortfall.                       |
| **Packaging rule**  | Names and quantities written into two database functions (H12).                                                            | Two parts, both her records, as her workbook already has them. **Per cookie:** each recipe keeps its own packaging lines (her sheet gives every flavour one or two: a pouch or its own box, and a sticker), so a cookie's cost is its ingredients plus its own packaging. **Per order:** a rule for each container (each box size, a bag, a bazaar sale) listing the items it uses. Packing an order and recording a bazaar sale read both. There is no "costing container" setting. |
| **Customer**        | None. An order holds a name, a phone number and an Instagram handle (L3).                                                  | New record, keyed by the normalised mobile number: name, handle, email, notes, tags. An order points at its customer; placing an order finds or creates one and shows nothing back to the person ordering. Labels (new, returning, regular, not seen lately) are counted, with her thresholds as settings.                                                                                                                                                                           |
| **Order**           | `orders`, `order_items`, `order_add_ons`, `order_boxes`, `order_swaps`, `order_rules`, `order_extras`, `waitlist_entries`. | Gains the link to its customer. Otherwise unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Sale**            | Three places: paid orders, bazaar sales (`event_sales`), and the 804 imported lines (`ledger_entries`).                    | No new table. One read function returns every sale in one shape (date, source, customer, order number, payment method, flavour, amount) with filters. Money › Sales and the P&L drill-down both read it.                                                                                                                                                                                                                                                                             |
| **Bazaar**          | `scheduled_events` (the booking), `events` (the running event), `event_sales`, `event_expenses`.                           | The booking gains organiser, contact, status and notes, and is added from the Bazaar screen.                                                                                                                                                                                                                                                                                                                                                                                         |
| **Bazaar day**      | None. An event is one sitting; its stock is typed in (L6).                                                                 | New record per day of an event: a cash session opened with a float and closed with a count. The stall sells from one stock count per event, loaded from baked stock; leftovers return to it at the end. Each sale belongs to a day. A cash difference is its own line in the books. **After 25 October.**                                                                                                                                                                            |
| **Settings**        | `settings`, `order_rules`, `order_extras`, `shop_texts`, `shop_state`, `payment_methods`, `books_settings`.                | Adds: her monthly target and week target; her margin floor; the shop's name and how customers should reach her (for every sentence that now says "Cine"); one retention period used by the notice, the job and the database; the privacy text; the customer-label thresholds; the days of stock cover; whether each of these has been confirmed in set-up.                                                                                                                           |
| **Clock**           | Manila time in five files; device time in the engine.                                                                      | One module and one database function. New screens use only those.                                                                                                                                                                                                                                                                                                                                                                                                                    |

## 8. The interface

Five tabs, labelled, at the bottom on a phone and as a sidebar on wider screens: Home,
Sell (Orders, Bazaar, Customers, Shop), Make (Bake plan, Recipes), Stock (Inventory,
Grocery, Suppliers), Money (P&L, Sales, Expenses). Account and alerts at the top right.
Rules: everything within two taps
of a tab; one main action per screen, at the bottom; status in words and colour on every
row; one list, one page, one form; her words.

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

Leaving the live app (see 8.1 for the only two functions not carried over): All tools, the Form queue entry, the prototype's helper names, and
the "Your business" grid on Home.

### 8.1 One home for everything that exists today

Ethan, 5 October: the software is feature-heavy and every feature stays, but it must
feel consolidated, organised, complete, easy to navigate and not redundant. So nothing
is removed; each function gets **exactly one home**, and the same thing is never offered
under two names. The live app has 33 All tools entries, 25 routes and 29 sheets today.
They become 13 places under five tabs, plus Account and the bell.

| Home              | Holds, from today's All tools entries                                                                                                                                                         | What stops being duplicated                                                    |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Home              | (the Home screen; this week's orders, from Drops)                                                                                                                                             | The "Your business" grid that repeated the menu.                               |
| Sell › Orders     | Orders & payments; **Payments** (a "to check" filter, not a second screen); **Customer messages** (on the order's page)                                                                       | Two places to tick an order paid.                                              |
| Sell › Bazaar     | Bazaar Mode; **Bazaar events**                                                                                                                                                                | Bookings edited away from the bazaar.                                          |
| Sell › Customers  | Customers & waitlist (the waiting list is a filter)                                                                                                                                           | —                                                                              |
| Sell › Shop       | Shop status; **Order rules**; **Boxes & add-ons**; **Payment methods**; **Shop texts**; Drops (open, close, sold out); Preview shop, Preview checkout and Preview order status as one Preview | Three preview entries; shop set-up spread over two groups.                     |
| Make › Bake plan  | Bake & dough (with production)                                                                                                                                                                | —                                                                              |
| Make › Recipes    | **Recipes; Recipe drafts; Products; Menu & flavours**                                                                                                                                         | Four entries for one thing. On sale or off sale is switched in one place only. |
| Stock › Inventory | Inventory; **Stock items** (edited on the item's page); the weekly count                                                                                                                      | A separate form to edit what the list already shows.                           |
| Stock › Grocery   | Grocery                                                                                                                                                                                       | —                                                                              |
| Stock › Suppliers | **Suppliers; Suppliers & prices**                                                                                                                                                             | Two entries for one thing.                                                     |
| Money › P&L       | Profit & loss                                                                                                                                                                                 | —                                                                              |
| Money › Sales     | Sales log                                                                                                                                                                                     | A sales list and a P&L drill-down that read different sources: both read one.  |
| Money › Expenses  | Books & costs                                                                                                                                                                                 | —                                                                              |
| Account           | Settings; **System health; Backups & export** as one "System and backups"                                                                                                                     | Two entries for one thing.                                                     |
| The bell          | Notifications                                                                                                                                                                                 | —                                                                              |

Routes follow their function: the Order detail, Payments, Production, Stock count and
Products addresses open the home above and keep working. The 29 sheets stay as the
actions of the record they belong to (receive, count, waste, refund, swap, close-out and
the rest).

**Two things are not carried over, and only these:** All tools itself, which the tabs
replace; and **Form queue**, the entry for the Google Form bridge that was cut on
28 September and never built, so it has nothing behind it.

How "not redundant" is kept true:

- A thing can be **shown** in a second place but is **changed** in one. The Shop page
  lists what is on sale and links to the flavour; the switch lives on the flavour.
- A number shown in two places reads from one source (the cost function, the sales read).
- One name per thing, settled in the wording pass.
- Slice B1 carries this table as a test: every one of the 33 entries and 25 routes has
  a home, and none has two.

## 9. Order of work

S under half a session, M one, L two to three.

**Stage A — bazaar safety and access (to the 20 October rehearsal)**

| #   | Slice                                                                                                                                                                                                                                                                                                    | Size | Proof                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------- |
| A1  | Release check accepts two to six approved addresses and the access session length Ethan chooses.                                                                                                                                                                                                         | S    | Unit tests; deploy green.                                                                   |
| A2  | Offline open on a trusted phone. Bounds: Bazaar Mode only; only while this phone holds an event the server opened; only within a set number of hours of a successful online check; re-checked on reconnect; idle sign-out does not fire offline with an event open; no loop to an uncached sign-in page. | M    | A live-mode test that fails first: sell, offline, reload, sell, reconnect. Security review. |
| A3  | Sign-out warns when sales are queued. Release hold switch. Framework patch. Persistent-storage request.                                                                                                                                                                                                  | S    | Tests; hold on means no deploy.                                                             |
| A4  | Backup, restore-drill, retention and keep-alive schedule, written and off.                                                                                                                                                                                                                               | M    | Local dry run.                                                                              |

Fallback if A2 slips: owner idle sign-out at 480 minutes (an existing setting), app
opened online at the stall and never closed, installed on the Home Screen, paper tally.

**Stage B — foundations and her two top areas** (database track attended; B1, B2, B5,
B6 on the interface track)

| #   | Slice                                                                                                                                                                                                                                                                                                    | Size | Proof                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------ |
| B1  | The permanent pieces only: the guarded screen slot (protected exception, port audit); five labelled tabs in the dock and sidebar through data, with all 33 All tools entries and 25 routes mapped to one; a live-mode smoke suite run locally against the local database (CI has none), evidence pasted. | M    | The function map of section 8.1 as a test, with nothing unmapped and nothing mapped twice; demo build and baselines unchanged. |
| B2  | Nothing fake on screen (H1 to H6, H14, C1), one Manila clock (C10, C2); empty-shop and two-shops tests.                                                                                                                                                                                                  | M    | Two-shops test.                                                                                                                |
| B3  | Database window: links by identity; her usual price per item; weighted average cost stamped on each use; shortfall costed; packaging rules; security rules wrapped and indexed.                                                                                                                          | L    | SQL role suite; money tests; independent review.                                                                               |
| B4  | Her data, each import previewed and approved: prices, recipes, flavours, photos, newer sales, bookings, packaging costs.                                                                                                                                                                                 | L    | Counts and hashes; **her 23 costing rows reproduced**, ingredients against ingredients.                                        |
| B5  | New Stock: Inventory and Grocery (Have, Needed, To buy; Out, Low, Good).                                                                                                                                                                                                                                 | L    | Same movements as today; accessibility scan.                                                                                   |
| B6  | New Recipes: picture grid and flavour page with cost, margin, stock state, versions.                                                                                                                                                                                                                     | L    | An incomplete cost names what is missing.                                                                                      |
| B7  | Targets and margin floor as settings; target bar on Home. Wording pass with Cine. Security gate 1.                                                                                                                                                                                                       | M    | Her word list; findings fixed or recorded.                                                                                     |

**Stage C — the rest, all before her week** (the last line, gate 2's adviser items, can
finish before the shop opens)

New Money and Home; Orders; light customer pages with the speed budget, total always
visible; customers and privacy text; sales in one paged list; bazaar tiles and day
sessions on baked stock; cash over or short; allergens from ingredients; offline update
prompt; uploads resized; account pages; scale test; security gate 2 (fake-order limit,
RA 11967 details, privacy filing answered).

**The set-up screen and handover** (stage C, last, size L). After the owner signs in for
the first time she sees one set-up screen. Everything Ethan supplied is already loaded,
so each item is shown filled in, marked "from your workbook", "default" or "needs you",
and she confirms or edits it: shop details and contact (name, address, phone, email),
privacy text and how long customer details are kept, order window and pickup rules,
boxes, samplers and add-ons, payment methods, packaging and its costs, her price list,
targets and margin floor, days of stock cover, customer labels, sign-out time. It shows
progress, can be left and resumed, stays reachable under Account, and nothing she must
set blocks using the app; only opening the shop waits for the items the law needs.
Confirming an item is what removes its "default, not confirmed" mark. Before handover,
one action resets every confirmation and lists Ethan's test records (orders, events,
expenses) for removal after a preview, so Cine meets it fresh.

## 10. The bar for each quality

| Quality            | Measured by                                                                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Complete           | The function checklist: every old entry and route mapped; the 14 launch capabilities of `finish-plan.md` section 1 each exercised by the live smoke suite. |
| Functional         | `pnpm verify`; SQL role suite; browser suite; live smoke suite; Cine's week.                                                                               |
| Accurate, precise  | Her 23 costing rows; P&L equals the books equals the sales list; money as whole centavos; cost stamped at write.                                           |
| Secure             | Independent review of every database, money, sign-in and offline change; gate 1 before her week; gate 2 before opening; no secret in the browser.          |
| Easy to reach      | Installs to the Home Screen; one sign-in; stays signed in within her own setting; bazaar opens offline.                                                    |
| Easy to navigate   | Five visible labelled tabs; any function within two taps of a tab; no hidden catch-all.                                                                    |
| Fast               | Customer shop: largest paint within 2.5 s, tap response within 200 ms on the CI phone profile. Sale tile responds at once. Staff screen change within 1 s. |
| Scalable           | Seeded with ten times five years of her volume: lists still open within 1 s, pages of 50, every list query on an index.                                    |
| Accessible         | The WCAG 2.2 AA items in section 6.4, scanned per new screen.                                                                                              |
| Nothing hard-coded | Empty-shop and two-shops tests in `pnpm verify`.                                                                                                           |

## 11. Critical path and dates

A1 → Ethan adds Cine → A2 → rehearsal 17 to 19 October → gate 20 October → bazaar 24 to
25 October. Releases held from the rehearsal to 26 October; stages B and C build locally
and ship after.

Two tracks. The **database track** is serial and attended: B3, B4, then customers, sales,
bazaar days, cash over or short, allergens (about 14 sessions); it waits only on
Ethan's preview approvals, since the questions for Cine were answered on 5 October. The **interface track** runs beside it, unattended
where a slice touches no database, money, sign-in or offline code (about 24 sessions).

Rules for the two tracks. An unattended slice commits to its own worktree branch and
never pushes to the working branch, because every green push there redeploys the trial;
an attended session reviews and merges it. `src/store/ops-runtime.tsx` and
`src/lib/types/database.ts` belong to the database track: interface slices add new files
only, or queue their runtime change behind it.

B3 carries a cutover rule for cost: stock bought before the opening count is already an
expense in the 804 historical lines, so "when used" starts from a cutover date, with
opening stock valued from her price list but not expensed a second time.

| Stage | Sessions | Likely done                                            |
| ----- | -------- | ------------------------------------------------------ |
| A     | 4 to 5   | 16 October                                             |
| B     | 14 to 18 | First half of November                                 |
| C     | about 20 | Mid-November at the earliest; early December likely    |
| Trial | —        | The week after the wording pass. **Cine starts then.** |

The 12 to 13 December bazaar uses the new bazaar screens only if they are rehearsed on
the phone by 8 December; otherwise today's Bazaar Mode with A2.

### 11.1 The phone rehearsal: what it must prove

On the iPhone that will sell, signed in as her, **with the app added to the Home
Screen** and the leftover test event on the trial closed first:

1. Open Bazaar Mode with signal, start the event, then switch to aeroplane mode. Sell 20
   mixed sales, a free sample and a void.
2. **Close the app fully and reopen it offline.** With A2 it opens into Bazaar Mode and
   the sales are there. Without A2 this step signs her out: that is the failure A2 fixes.
3. Leave the phone untouched for more than an hour, offline, then sell again.
4. Leave it offline overnight. Reopen: the app opens and the sales are there.
5. Reconnect. Every sale arrives once; the totals match a paper tally. The identity
   check runs again by itself.
6. **The sign-in clock.** Note what she sees on the second morning, offline and then
   online, and whether she can receive an email code at the stall if asked.
7. Try to sign out with sales queued: it must warn.
8. Run the close-out and compare with the tally.
9. Confirm the taps needed to reach Bazaar Mode from the phone's tabs are acceptable.

Anything that fails is fixed and the whole list is run again before 20 October.

## 12. What only Ethan can do

Add Cine's two addresses to Cloudflare Access and the approved list, and invite her
(after A1). Decide backup custody and switch the jobs on. Run the phone rehearsal by
20 October. Set and lift the release hold. Approve each import preview. The questions for Cine are
answered (below), so B3 and B4 no longer wait on her.

Also his: change the trial's access session to one week in the Cloudflare dashboard when
A1 is released; close the test event left open on the trial since 5 October before the
rehearsal; switch on leaked-password protection if the hosting plan allows it.

Carried over because it is new: the October bazaar's sales go into the trial database
(no early production project).

### The questions for Cine: answered by Ethan on 5 October

Ethan answered on her behalf and said to build fast. **Every answer is a starting value
she can change**, and she confirms each one in the set-up screen. Packaging costs were
given and are kept privately, not here.

| #   | Question                                       | Answer                                                                                                                                                                     | What the build does                                                                                                                                                                     |
| --- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Is the Ingredient Master price list current?   | Yes.                                                                                                                                                                       | Its 72 priced rows load as each item's usual price and pack.                                                                                                                            |
| Q2  | Flavours on sale.                              | Seven, with prices: Double Chocolate Fudge 130, Happy Camper 140, White Chocolate Biscoff 145, PB & Miso 80, Ube Coconut Crinkle 110, Espresso Brownie 110, Apple Pie 155. | Those seven are on the menu; the other flavours stay in the library, off sale.                                                                                                          |
| Q3  | Sampler sizes.                                 | "Assume all. Make editable."                                                                                                                                               | Samplers of 6, 7 and 10 are loaded with the prices her sheets give, each switchable and editable. The sheet has two prices for the box of 6; the newer loads and is marked "needs you". |
| Q4  | Packaging.                                     | A list of six packaging items with unit costs.                                                                                                                             | Those costs replace the workbook's where they differ (the newest statement wins). Which flavour uses which pouch or box comes from her recipe sheet, which already says.                |
| Q5  | Which container "cost per cookie" assumes.     | Not understood.                                                                                                                                                            | The question is dropped: a cookie's cost is its ingredients plus its own packaging, as in her sheet. Order boxes are costed per order.                                                  |
| Q6  | Target and margin floor.                       | Editable.                                                                                                                                                                  | Both are settings, confirmed in set-up; 65% loads as the starting floor because she said it in July. No target bar until she enters a target.                                           |
| Q7  | Reorder levels.                                | Work it out from recipes and ingredients; Low means some left but not enough.                                                                                              | The rule in section 7, decision 8.                                                                                                                                                      |
| Q8  | When a customer is "regular".                  | Research it.                                                                                                                                                               | The rule in section 7, decision 9, from Square's published defaults and her own order history.                                                                                          |
| Q9  | Photos and everything else.                    | The photo folder for pictures; the workbook for the rest; the recipe document for recipes and prices.                                                                      | As planned in B4. Two flavours on the list have no finished photo and show none.                                                                                                        |
| Q10 | Privacy and the shop's published details.      | Configurable, set by Cine in a one-time set-up.                                                                                                                            | Fields in set-up; the shop cannot open until they are filled. Ethan's own test entries are cleared at handover.                                                                         |
| Q11 | An hour with Cine on sketches and words first. | No: "just do everything fast".                                                                                                                                             | The screens are built from the approved sketches. The wording pass with Cine still happens before her week.                                                                             |

Still open, none blocking the build: whether "Cornflake" is Cereal Milk; allergens;
her adviser's view on the privacy filing and on receipts.

## 13. What stays out

Paid texting, loyalty points, cards on file, wholesale and consignment, the Google Form
bridge, nested recipes, owner-entered orders, payment-proof upload, email alerts, a
labour-cost view, a second selling device, scoring or ranking of customers beyond counted
labels, historical stock reconciliation, support for more than one business in one
database, a reskin, and the automatic runner. Unattended runs are allowed for
interface-only slices and nothing else. The shop stays closed, with no real customers, no
production project and no merge to `main`, until Ethan says so.

## 14. Risks

| Risk                                                              | What limits it                                                                                                                        |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| A2 changes sign-in a fortnight before the bazaar.                 | Tight bounds, a test that fails first, an independent security review, and the no-code fallback in section 9.                         |
| A release reaches the selling phone between rehearsal and bazaar. | The release hold (A3), on from the day the rehearsal passes.                                                                          |
| An unattended slice redeploys the trial.                          | It commits to its own branch; only an attended session merges into the working branch.                                                |
| Two tracks edit the same file.                                    | The runtime and the database types belong to the database track.                                                                      |
| The slot is a protected edit.                                     | One guarded block, live mode only; exception record, validator reversal, port audit, unchanged baselines.                             |
| Cine gives no feedback until the end.                             | Ethan chose speed over an early session. The set-up screen makes her confirm every value, and the wording pass comes before her week. |
| Costs double-count stock already expensed.                        | The cutover rule in B3.                                                                                                               |
| The estimate slips.                                               | Nothing is promised to Cine until the wording pass. The December bazaar can run on today's Bazaar Mode with A2.                       |
| A value slips in hard-coded.                                      | The empty-shop and two-shops tests in `pnpm verify`.                                                                                  |
| The trial holds real bazaar sales with no backup.                 | Backups on before 24 October (A4); a CSV download each evening either way; the paper tally.                                           |

## 15. Actual gaps

- **No comparator was operated hands-on.**
- **The code findings were read, not run.** N1 and the cost defects have no failing test
  yet: A2 and B3 write them first.
- **Three findings were located by a search pass and not re-read** (N9, N10, N11).
- **The guarded slot is designed, not built.** B1 proves it against the port gates.
- **The session and date estimates are estimates.** The interface slices are larger than
  any slice built so far.
- **No real iPhone has run the app.** The rehearsal is the first time.
- **The pointer lines in `AGENTS.md` and `CLAUDE.md` still name finish-plan.md.** They are
  rule files checked by the validator; changing them is Ethan's call.
- **Migrations reach the trial by hand.** This plan does not automate that.
- **Cine has not seen the sketches and will not before the build** (Ethan, 5 October).
- **The answers to her questions are Ethan's, on her behalf.** She confirms them in
  set-up; until then they are starting values.

## 16. First build goals

A1, then A2, in [next-goal.md](next-goal.md). A1 unblocks Cine's access. A2 is the
bazaar's safety and carries an independent security review.

## 17. Sources

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
- Code and SQL: the file and line references in section 5.
- Cine's sources and her 115 comments: private, as listed in [sot-consolidation.md](sot-consolidation.md).

Added in version 2, fetched and read on 5 October 2026 unless marked:

- [Nielsen Norman Group: hamburger menus and hidden navigation](https://www.nngroup.com/articles/hamburger-menus/), [mobile navigation patterns](https://www.nngroup.com/articles/mobile-navigation-patterns/), [progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/), [8 guidelines for complex applications](https://www.nngroup.com/articles/complex-application-design/), [response-time limits](https://www.nngroup.com/articles/response-times-3-important-limits/), [Fitts's law](https://www.nngroup.com/articles/fitts-law/)
- [Baymard Institute: cart abandonment statistics](https://baymard.com/lists/cart-abandonment-rate)
- [UXmatters: how do users really hold mobile devices](https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php)
- [web.dev: Vodafone case study](https://web.dev/case-studies/vodafone) and [Web Vitals](https://web.dev/articles/vitals)
- [Material Design 3: navigation bar](https://m3.material.io/components/navigation-bar/guidelines), [Apple: tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars) and [accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) (read in the browser)
- [Odoo: inventory management](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/warehouses_storage/inventory_management.html) and [bills of materials](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/manufacturing/basic_setup/bill_configuration.html); [inventory valuation](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/product_management/inventory_valuation/using_inventory_valuation.html) (summary)
- [ERPNext: immutable ledger](https://docs.frappe.io/erpnext/user/manual/en/immutable-ledger-in-erpnext)
- [Craftybase: which costing method it uses](https://help.craftybase.com/article/812-does-craftybase-use-lifo-fifo-or-weighted-average-cost) (summary)
- [Katana: features](https://katanamrp.com/features/)
- [Cybake: recipe management and costing](https://cybake.com/bakery-software/production/recipe-management-costing/)
- [Loyverse: how to work with production](https://help.loyverse.com/help/how-work-production) and [home page](https://loyverse.com/)
- [Peddlr](https://www.peddlr.io/) and [Bakesy](https://www.bakesy.app/) (summaries)
- [Shopify: POS design update](https://www.shopify.com/blog/shopify-pos-design-update) (summary); [SAP Fiori design principles](https://www.sap.com/design-system/fiori-design-ios/discover/sap-design-system/vision-and-mission/sap-fiori-design-principles) (summary)
- [Martin Fowler: Strangler Fig](https://martinfowler.com/bliki/StranglerFigApplication.html)
- [Supabase: row level security](https://supabase.com/docs/guides/database/postgres/row-level-security) and [free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing)
- [Cloudflare: static assets billing and limitations](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) and [Access session management](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/)
- [Next.js: lazy loading](https://nextjs.org/docs/app/guides/lazy-loading)
- [WebKit: updates to storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/)
- [Republic Act No. 11967, Internet Transactions Act](https://www.lawphil.net/statutes/repacts/ra2023/ra_11967_2023.html)
- [Square: create customer groups and filters](https://squareup.com/help/us/en/article/6245-manage-customer-groups-and-filters), [QuickBooks: reorder point formula](https://quickbooks.intuit.com/r/midsize-business/reorder-point-formula/), [Nielsen Norman Group: mobile-app onboarding](https://www.nngroup.com/articles/mobile-app-onboarding/)
- The hosted trial, read-only, counts and settings only (5 October 2026).
