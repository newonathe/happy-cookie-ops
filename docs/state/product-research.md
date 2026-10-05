# Product research and rework proposal (5 October 2026)

Status: **research and proposal only. No code changed. Waiting for Ethan's yes on
section 11.** On 5 October Ethan said the interface, the experience and "everything" need
rework, not only the data, and asked for a deep, methodical research pass on the most
widely used software of this kind: their interface, their features, how they are built,
and how they fold every business need into one product. This page is that research and
what it means for this app. The data audit and its decisions are in
[sot-consolidation.md](sot-consolidation.md).

## 1. The answer in short

- **The app's problem is its shape, not its features.** It was ported screen for screen
  from a review prototype, then features were added to an "All tools" list one at a time.
  Almost everything the leading tools do already exists here somewhere; it is hard to find
  and named in words Cine did not choose.
- **Leading tools are organised around the owner's jobs, with a handful of destinations**,
  one way to list things, one way to open a thing, and plain words.
- **Proposal:** a new live interface with five tabs (Home, Sell, Make, Stock, Money) built
  beside the ported screens, not inside them. The ported screens stay as the demo, so the
  fidelity gates keep working and no ported file is edited.
- **Cost:** about four to five weeks of slices. The 24 to 25 October bazaar should run on
  today's Bazaar Mode, and Cine's trial moves after the rework.

## 2. Method

Socratic, job by job. For each job in Cine's week, four questions:

1. What does she do today, and what did she say about it? (Her workbook and her 115
   comments on the prototype walkthrough, 22 to 25 July.)
2. How do the most used tools handle the same job?
3. What is the evidence that their way works, and does it hold for a one-person bakery?
4. What is the smallest version that serves her?

Each job ends in adopt, adapt or reject. A finding that changes no decision was left out.

Source rule: claims about a product come from its own site, help centre, documentation or
engineering blog. Market-share claims are not made. Things not verified are marked.

Limits: no tool was signed into or used hands-on; this is desk research from public pages.
Castiron, a storefront for home bakers, is reported closed in late 2025 by a secondary
source and was dropped as a comparator.

## 3. What Cine told us (the primary evidence)

Her comments, by number in the walkthrough copy:

| Theme                         | Her words (comment)                                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What she wants most           | "Inventory tracking and P&L" (41). "So I can actually see my business health" (63).                                                                           |
| Why she is leaving the sheet  | "I spend so much of my day worrying abt the accuracy of the spreadsheet" (8). "the spreadsheet is too much work" (83).                                        |
| Tedious entry                 | She writes a date once for 17 orders "cos its tedious" (12). She uses one button for inventory-out (44). She records purchases at home, not in the shop (95). |
| Her week                      | Orders open Monday 9 am and close Thursday 9 pm; she bakes Friday and Saturday to what was ordered (14, 62, 96).                                              |
| Recipes are R&D               | "I change the quantities of ingredients in each of my recipes a lot" and wants version history (52, 82).                                                      |
| Targets                       | "How many cookies should I sell to reach my target goal this month" (67, 81). A weekly progress bar at the top, "the week rather than the day" (70).          |
| Customers                     | Remembering who they are: "love this" (28). Tracking "how frequently my old customers become repeat buyers" (30).                                             |
| Margin rule                   | "If any cookie is below 65% lets not do it" (71).                                                                                                             |
| Expenses                      | Wants categories such as salaries, pop-up rent, paid ads (74).                                                                                                |
| Visibility                    | "Pls don't make it a long press. I want to see it" (11).                                                                                                      |
| **She did not understand it** | At least 14 of the 115 comments are "what does this mean", "wdym", "unclear" or a bare "?" (3, 20, 31, 32, 35, 38, 48, 57, 59, 89, 94, 103, 113, 115).        |

The last row is the strongest usability finding available: one comment in eight says the
prototype's words or screens were not understood by the person it was designed for.

## 4. Findings by job

### Open a drop and take orders

| Question | Finding                                                                                                                                                                                                                                                                                                          |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Today    | A Google Form opened Monday and closed Thursday; 60 responses; customers choose pickup or book their own courier.                                                                                                                                                                                                |
| Leaders  | Hotplate, built for pre-order "drops": the seller chooses when orders open, sets pickup windows and controls quantity; items "reserve in-cart with a timer and customers can join a waitlist"; it produces "auto generated prep lists and order tickets for every drop" and texts subscribers when a drop opens. |
| Evidence | Its whole product is this one job for food makers, and its limits (never oversell, waitlist) match her rules.                                                                                                                                                                                                    |
| For her  | The app already has the window, capacity, holds, waitlist and status link.                                                                                                                                                                                                                                       |
| Verdict  | **Adopt the framing:** one "This week's drop" place showing open or closed, sold against capacity, and the prep list. **Reject** paid texting; her messages stay copy and paste (16, 107).                                                                                                                       |

### Check payments and move orders along

| Question | Finding                                                                                                                                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Today    | She checks her wallet, then ticks paid. Statuses exist in the app with tabs and a text search.                                                                                                                     |
| Leaders  | Shopify's admin pattern for any list ("resource index"): page title and page actions at the top; then "filters, sorting, and multi-select actions"; then the rows. One pattern for orders, products and customers. |
| Evidence | It is Shopify's published standard for every list in its admin and its apps.                                                                                                                                       |
| Verdict  | **Adopt** one list pattern everywhere: search, a row of filter chips (status, payment method, date, flavour), then rows with a status badge. Use it for Orders, Sales, Customers, Stock and Grocery.               |

### Know the customers

| Question | Finding                                                                                                                                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Today    | First names in a sales sheet; she liked the idea of repeat-buyer tracking (28, 30).                                                                                                                                                  |
| Leaders  | Square's Customer Directory: a profile with contact details, groups, timestamped notes and a purchase history that grows when a customer is attached to a sale. Ranking by recency, frequency and spend is the common simple method. |
| Verdict  | **Adapt, small:** the design in [sot-consolidation.md](sot-consolidation.md) section 6. Reject cards on file, marketing email and loyalty points for now.                                                                            |

### Plan the bake, bake, and deduct ingredients

| Question | Finding                                                                                                                                                                                                                                  |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Today    | She bakes only what was ordered, keeps spare dough balls, and logs usage with one button.                                                                                                                                                |
| Leaders  | Craftybase, for small-batch makers: a recipe is a bill of materials; "when you record a manufacture, your material stock goes down"; cost per unit updates "the moment a supplier price changes". Hotplate gives the prep list per drop. |
| Evidence | The same loop she built by hand in her workbook (Recipes, Inventory-Out, Costing).                                                                                                                                                       |
| For her  | The app already deducts on confirm. Missing: the recipes themselves (only one is entered) and seeing stock per recipe.                                                                                                                   |
| Verdict  | **Adopt** recipe-as-bill-of-materials as the centre of Make. No new mechanism; load the data and show it.                                                                                                                                |

### Recipes, costing and pricing

| Question | Finding                                                                                                                                                                                                                                                                                 |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Today    | 23 recipes in grams with yields; a costing sheet; a 65% margin floor; frequent changes.                                                                                                                                                                                                 |
| Leaders  | meez: version-controlled recipes, unit conversions, automatic allergens, pictures per recipe, real-time costing that follows ingredient prices. Craftybase: multi-level recipes with cost roll-up.                                                                                      |
| Verdict  | **Adopt** one recipe workbook: a picture grid; a flavour page with price, cost, margin against her 65% floor, ingredients each marked enough, low or out, versions, allergens. **Adapt** components (her "cookie dough" plus "stuffing") as sections of one recipe, not nested recipes. |

### Stock and groceries

| Question | Finding                                                                                                                                                                                                          |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Today    | 73 ingredients; a stock sheet that cannot give stock on hand; no reorder levels.                                                                                                                                 |
| Leaders  | Square: a per-item alert amount; low items are flagged in the item list. Craftybase: stock falls automatically with production.                                                                                  |
| Verdict  | **Adopt** three plain states on every item (Out, Low, Good) driven by her reorder level, and the same filter chips. Grocery becomes the Stock list filtered to Out and Low with pack, price and a running total. |

### Sell at a bazaar

| Question | Finding                                                                                                                                                                                                                                                                                                                                                                                             |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Today    | Bazaar Mode sells offline with stock, prices, expenses and close-out, as one sitting. Her events run two to six days.                                                                                                                                                                                                                                                                               |
| Leaders  | Shopify POS: a home screen of large configurable tiles. Loyverse (free, common for small sellers; a Philippine comparison is cited below): a "shift" is opened with the starting cash, sales are recorded, and closing shows expected against counted cash with the difference; it keeps selling offline and syncs later. Square stores offline payments on the device and sends them on reconnect. |
| Evidence | The open-sell-close shift is the standard way to split selling into days and reconcile each one.                                                                                                                                                                                                                                                                                                    |
| Verdict  | **Adopt** "a bazaar has days; each day is opened with its stock and closed with a count." **Adopt** the tile grid for selling. **Keep** the app's offline queue, which already follows the same store-and-forward idea with a unique id per sale.                                                                                                                                                   |

### See the money

| Question | Finding                                                                                                               |
| -------- | --------------------------------------------------------------------------------------------------------------------- |
| Today    | A P&L sheet with broken formulas; she wants categories and a target (67, 70, 74).                                     |
| Leaders  | Dashboards lead with a few numbers for a period and let the owner tap into the records behind them.                   |
| For her  | The app's P&L has drill-down and CSV. Missing: her monthly target, which was her most wanted screen and was deferred. |
| Verdict  | **Adopt** a weekly target bar at the top of Home and "cookies still to sell" for the month. Small, and hers.          |

## 5. How the leaders are built, and how they fit everything into one product

| Product          | What they publish                                                                                                                                                                                                                                                                                              | What it means here                                                                                                                                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shopify          | One codebase kept on purpose (a "modular monolith"): "one test and deployment pipeline", data in "a single shared database", and code reorganised from technical layers to business areas such as orders, shipping, inventory and billing, each behind its own interface, with a tool checking the boundaries. | The app already has one database and one deployable. The lesson is the organising rule: **folders, screens and navigation named after business areas**, not after the prototype's screens.                                 |
| Odoo             | Every app is a set of modules over one shared database; modules extend each other, so sales, stock and accounting read the same records.                                                                                                                                                                       | "Interconnected" comes from **one record of each thing** (one flavour, one ingredient, one customer, one sale) that every screen reads. The audit shows where that is missing: customers, and baked stock to bazaar stock. |
| Frappe / ERPNext | Everything is a "DocType": one description of a record generates its form, its list and its permissions.                                                                                                                                                                                                       | **One list pattern and one form pattern**, reused. Today each added feature brought its own form.                                                                                                                          |
| Stripe           | Every write carries a unique key so a retry cannot happen twice.                                                                                                                                                                                                                                               | Already done here: each sale and order carries a client id. Keep it for everything new.                                                                                                                                    |
| Square, Loyverse | Sales are stored on the device offline and sent on reconnect.                                                                                                                                                                                                                                                  | Already done here for bazaar sales.                                                                                                                                                                                        |

How they consolidate requirements, as far as their public material shows: they do not add a
screen per request. They find the record a request is about, add the field or the filter to
that record's page, and let the navigation stay small.

## 6. Interface patterns to adopt and to avoid

| Adopt                                                                        | Source                                                                                         | Avoid                                                       | Why                                                  |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| Three to five tabs on a phone, each a place, not an action                   | Apple's guidelines: "use three to five tabs in iOS"; each extra tab "increases the complexity" | A nine-icon dock, or a catch-all list of 33 tools           | Both exist today                                     |
| One list layout: title and actions, then filters, then rows                  | Shopify's resource index pattern                                                               | A different layout per list                                 | Sales log, Orders, Inventory and Grocery each differ |
| The user's own words                                                         | Nielsen's second heuristic: "speak the user's language … rather than internal jargon"          | Words she asked about: "split", "review queue", "drop full" | 14 of her 115 comments                               |
| A visible state on every row (Out, Low, Good; Awaiting payment, Paid, Ready) | Square's low-stock flag; order badges                                                          | State only inside a detail page                             | Her "I want to see it" (11)                          |
| Big tiles for selling                                                        | Shopify POS smart grid                                                                         | Small list rows at a stall                                  | Speed with one hand                                  |
| Sub-tabs inside a place                                                      | Common to all of the above                                                                     | A separate entry per sub-task                               | The four flavour and recipe entries                  |

## 7. Why the app feels the way it does

- It began as a **review prototype** with a device picker and a role switcher; the screens
  were reproduced exactly, including a home page that repeats the whole menu.
- Every later feature (payment methods, shop texts, order rules, bookings, books, stock
  items, suppliers, add-ons, messages, recipe drafts) could not change a ported screen, so
  it became **a form opened from All tools**: 33 entries.
- The same thing appears under several names: Products, Menu & flavours, Recipes, Recipe
  drafts; Suppliers and Suppliers & prices; System health and Backups & export.
- Labels came from the prototype's author, not from Cine.

None of this is a defect in a single screen. It is the cost of the rule that the prototype
is the specification, applied past the point where the prototype stopped matching her
business.

## 8. Proposed shape

Five tabs, named for what she does. On a phone they are the bottom bar; on a tablet or
desktop the same five are a sidebar with their sub-tabs listed.

| Tab       | Sub-tabs                        | Replaces                                                                                                                                                                                                      |
| --------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Home**  | This week                       | Home. Leads with the weekly target bar, this week's drop, and what needs her.                                                                                                                                 |
| **Sell**  | Orders, Bazaar, Customers, Shop | Orders, order detail, payments, Bazaar Mode, bookings, customers and waitlist, messages; Shop holds what customers see: menu on sale, order rules, boxes and add-ons, payment methods, texts, open or closed. |
| **Make**  | Bake plan, Recipes              | Bake, production, and one recipe workbook in place of Products, Menu & flavours, Recipes and Recipe drafts.                                                                                                   |
| **Stock** | Inventory, Grocery, Suppliers   | Inventory, weekly count, stock items, grocery, suppliers and prices.                                                                                                                                          |
| **Money** | P&L, Sales, Expenses            | Profit & loss, sales log, books and costs, expense categories, CSV.                                                                                                                                           |

Settings, system health, backups and sign-out sit behind the round account button at the
top right; alerts stay behind the bell. All tools is no longer needed; it can remain as a
search-style index if wanted.

Design principles:

1. **Keep the brand:** the colours already in the theme, the Onest typeface, the warm,
   rounded look and the glass bar. This is a reorganisation, not a new skin.
2. **One list, one page, one form.** Every list uses the same filter row; every record
   opens the same kind of page; every edit uses the same sheet.
3. **Her words.** A wording pass with Cine on every label before her trial.
4. **State is visible** on the row, in words and colour together.
5. **Fits the screen:** one column on a phone, list beside detail on a tablet and desktop,
   for the customer pages too.

## 9. Every screen: keep, redesign or new

| Area     | Screen                                                     | Verdict                    | Size   |
| -------- | ---------------------------------------------------------- | -------------------------- | ------ |
| Shell    | Tabs, sub-tabs, header, account menu                       | New                        | Medium |
| Home     | This week, with target bar                                 | Redesign                   | Medium |
| Sell     | Orders list with filters                                   | Redesign                   | Medium |
| Sell     | Order page                                                 | Keep the logic, new layout | Small  |
| Sell     | Bazaar: bookings, add a bazaar                             | Redesign                   | Small  |
| Sell     | Bazaar: set up stock and prices                            | Redesign                   | Medium |
| Sell     | Bazaar: selling screen as tiles                            | Redesign                   | Medium |
| Sell     | Bazaar: days within an event, baked stock                  | New                        | Large  |
| Sell     | Bazaar: close-out                                          | Keep                       | Small  |
| Sell     | Customers list and profile                                 | New                        | Medium |
| Sell     | Shop set-up (the six existing forms in one place)          | Regroup                    | Small  |
| Make     | Bake plan and production                                   | Keep, new layout           | Small  |
| Make     | Recipe workbook                                            | New                        | Large  |
| Stock    | Inventory with Out, Low, Good                              | Redesign                   | Medium |
| Stock    | Grocery by status with totals                              | Redesign                   | Medium |
| Stock    | Suppliers, weekly count                                    | Keep                       | Small  |
| Money    | P&L, expenses, books                                       | Keep, new layout           | Small  |
| Money    | Sales with filters                                         | New                        | Medium |
| Account  | Settings, health, backups, alerts                          | Keep                       | Small  |
| Customer | Shop, checkout, status, find my order on every screen size | Redesign                   | Medium |

## 10. How to build it without breaking what protects the app

- `src/components/app/ops-app.tsx`, which is **not** a protected file, chooses the frame
  that is drawn. In live mode it can draw a new frame and new screens from a new,
  unprotected folder. **No ported screen, sheet, shell file or engine line is edited.**
- The ported screens remain the demo build, so the port-integrity check, the validator and
  the visual baselines keep passing unchanged. The two exceptions shipped on 5 October stay
  as they are until the new frame replaces them.
- The engine and the live runtime keep doing the work (orders, stock, production, books,
  offline queue). The new screens read the same data; where the engine's view of a screen
  no longer fits, the new screen reads the runtime's data directly.
- New screens get their own tests and their own visual baselines, generated in Docker.
- Order of work: shell and Home first, so every later slice lands in its final place; then
  Sell, Make, Stock, Money; customer pages; bazaar days last.

At one to two slices per attended day this is about 20 to 25 working days, with the data
slices of [sot-consolidation.md](sot-consolidation.md) first because they need no
interface.

## 11. Decisions for Ethan

Each has one recommendation. "Yes" approves it. These replace S1, S2 and S12 in
[sot-consolidation.md](sot-consolidation.md); its data decisions (S3 to S11, S13, S14)
stand as written.

| #   | Decision                       | Recommendation                                                                                                                                                                                   |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | A new interface beside the old | Build the live app's frame and screens new, in an unprotected folder, chosen in live mode. The ported screens stay as the demo. This ends "the prototype is the specification" for the live app. |
| R2  | The five tabs                  | Home, Sell, Make, Stock, Money, with the sub-tabs in section 8. Ethan reacts to the wireframes first.                                                                                            |
| R3  | Look                           | Keep the brand colours, Onest and the rounded, warm style. Reorganise; do not reskin.                                                                                                            |
| R4  | Words                          | A wording pass with Cine on every label before her trial.                                                                                                                                        |
| R5  | Scope and order                | Section 9, in the order of section 10.                                                                                                                                                           |
| R6  | Dates                          | The 24 to 25 October bazaar runs on today's Bazaar Mode, with the phone rehearsal by 20 October unchanged. Cine's trial starts when the rework is done, about five weeks.                        |
| R7  | Her target                     | Bring the weekly target bar and "cookies still to sell" into Home. It was her most wanted screen and was deferred.                                                                               |
| R8  | What stays out                 | Paid texting, loyalty points, cards on file, wholesale, the Google Form bridge, and nested recipes.                                                                                              |

## 12. Sources

- [Hotplate: product](https://hotplate.com/product) and [Hotplate](https://hotplate.com/)
- [Craftybase: bill of materials software](https://craftybase.com/c/bill-of-materials-software) and [Craftybase: inventory management](https://craftybase.com/blog/best-inventory-management-software-for-small-business)
- [meez on GetApp](https://www.getapp.com/hospitality-travel-software/a/meez/) (a listing, not meez's own documentation)
- [Square: Customer Directory](https://squareup.com/help/us/en/article/5498-customer-directory), [Square: offline payments](https://squareup.com/help/us/en/article/7777-process-offline-payments), [Square: basic inventory management](https://square.com/help/us/en/article/5228)
- [Shopify: changing the POS smart grid](https://help.shopify.com/en/manual/sell-in-person/getting-started/smart-grid)
- [Shopify Polaris: resource index layout](https://polaris-react.shopify.com/patterns/resource-index-layout)
- [Shopify Engineering: deconstructing the monolith](https://shopify.engineering/deconstructing-monolith-designing-software-maximizes-developer-productivity)
- [Odoo: architecture overview](https://www.odoo.com/documentation/master/developer/tutorials/server_framework_101/01_architecture.html)
- [Frappe: DocType](https://docs.frappe.io/erpnext/user/manual/en/doctype)
- [Stripe: idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- [Loyverse: shift management](https://help.loyverse.com/help/shift-management-loyverse-pos) and [StoreHub: StoreHub vs Loyverse for a Filipino business](https://www.storehub.com/ph/blog/storehub-vs-loyverse) (a competitor's comparison)
- [Apple Human Interface Guidelines: tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)
- [Nielsen's usability heuristics, number 2](https://uxplanet.org/all-about-usability-heuristic-2-match-between-the-system-and-the-real-world-693328620894) (a secondary write-up of the heuristic)
- Cine's 115 comments: the private walkthrough copy in the business files folder.
