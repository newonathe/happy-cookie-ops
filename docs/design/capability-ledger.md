# Capability ledger — lossless redesign record

Ethan, 3 November 2026: the redesign must be lossless. Consolidating or moving a capability is
allowed; removing one needs a reason (useless, redundant or owner-rejected). One table per rebuilt
page: what the old page could do → where it lives now → evidence. Update in the same commit as the page.

## Feedback status (Ethan's walkthrough list, checked against source 3 November)

| Feedback                                                          | Status                                                                                              |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Bazaar in left/phone navigation                                   | Done                                                                                                |
| Bazaar Back and purpose                                           | Partial: Events-first and compact Back are an uncommitted Codex draft                               |
| Customers → Customers/Waitlist                                    | Label done; still opens the ported sheet                                                            |
| Shop child pages have Back                                        | Order rules, Boxes & add-ons done (page + Back). Status/methods/texts pending                       |
| Remove "Unpaid orders allowed per mobile number"                  | Done; saved value sent unchanged                                                                    |
| Info control on ambiguous toggles                                 | Done on Boxes & add-ons and Order rules (hover, focus, tap)                                         |
| "Sampler box" name, no max-sampler field                          | Done                                                                                                |
| Sampler flavour toggles                                           | Done locally: migration 71 `sampler_flavours` (Ethan approved 4 Nov); hosted apply pending approval |
| No new-box-size free text; fixed sizes                            | Done                                                                                                |
| Several add-ons; optional choice rows; no max-per-order; no comma | Done                                                                                                |
| Start production works                                            | Done (earlier slice)                                                                                |
| Recipe opens that cookie's recipe; no Recipes tab                 | Done (earlier slice)                                                                                |
| Badge explained; Edit product                                     | Done (earlier slice)                                                                                |
| See how many cookies were made                                    | Local counts/history/receipts + stock retry; scoped durable recovery under verification; positive-use detail pending |
| Stock: Add to inventory, item Count, Back keeps frame, suppliers  | Done (earlier slices)                                                                               |
| Money red/green                                                   | Done (live Money page)                                                                              |
| Books & costs in Money settings; Settings in each section         | Money done; other sections still use the tools disclosure                                           |

## Codex follow-up, 4 November

Ethan authorized fixing the four review findings while Claude is limited. Working-tree fixes:
negative Money bars, retained message-label edits, direct Home receiving/count entry, choice limit20.
Full172files /2828tests +2todo,8browser flows and live28-page build pass. Read [Claude UI handoff](claude-ui-handoff.md)
before continuing: it contains the visible behavior, source/tests, remaining scope and complete
front-facing continuation instructions. No hosted mutation or independent acceptance inferred.

## Home (`today`) — `src/components/live/home/home-live.tsx`

| Old capability                                 | New home                                                                       | Evidence                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------- |
| Greeting and date                              | Title                                                                          | screenshot 390/1240              |
| Drop open/closed and closing time              | Title action "Shop open · Closes …" → Shop                                     | screenshot                       |
| Cookies to bake + Start baking                 | "Start production" tile shows the count → Make                                 | screenshot                       |
| Low stock / item short                         | Stock panel: status bar + Out/Low/Not counted rows with Open item / Count      | `ops-runtime-home-live.test.tsx` |
| System health warning + Review                 | "Needs attention" row → health                                                 | screenshot                       |
| Profit this month, revenue, expenses           | "This month" panel, signed and coloured → Money                                | test (null before books load)    |
| Orders / To review / Pickups strip             | Three counts: Payments to check, Orders to prepare, Ready for pickup           | test                             |
| "Orders" action tile (5 Nov redesign)          | Merged: the Orders panel's "Open orders" and its three counts open the same page | browser check at 1240            |
| "Buy: item, item" on Shopping list             | Count on the row ("2 items short"); the items are listed in the Stock panel     | screenshot                       |
| Grocery to buy                                 | "Shopping list" tile shows what to buy                                         | screenshot                       |
| Live till / next bazaar cards                  | Unchanged (frame host)                                                         | —                                |
| "Your business" directory of every tool        | Removed as redundant: every entry is in its section or the header Account/bell | function-map                     |
| "Drop full %" and "x / 200 confirmed" capacity | Not shown on Home (predetermined capacity, not today's work); still on Shop    | —                                |
| This week / Account tab row                    | Removed duplicate: Account is the header button                                | —                                |
| Form queue tile                                | Retired integration (28 Sept); address still opens                             | function-map `retired`           |

## Money (`pnl`) — `src/components/live/money/money-live.tsx`

| Old capability                             | New home                                                                         | Evidence                          |
| ------------------------------------------ | -------------------------------------------------------------------------------- | --------------------------------- |
| Profit, revenue, expenses (30 days)        | Income / Expenses / Profit-or-Loss, signed and coloured; period 7d / 30d / month | `ops-runtime-money-live.test.tsx` |
| Drops vs Bazaar revenue split              | Transactions list categories + Income filter                                     | test                              |
| Revenue / expense drill-down sheets        | On-page filters (All / Income / Expenses / one category)                         | screenshot                        |
| Tax set-aside and rate                     | Hero detail line; rate edited in Money settings → Tax set-aside                  | test                              |
| Taken out by you, Take money out           | Hero detail; footer button (same `draw` sheet)                                   | —                                 |
| Refunded                                   | Hero detail (red, signed)                                                        | —                                 |
| Where the money went (categories)          | Panel with bars; tap filters transactions                                        | screenshot                        |
| Profit, last four months (one real bar)    | Income-and-expenses bars per day/week of the period, exact amounts in a table    | test: bars sum to totals          |
| Record expense, Categories                 | Title primary action; Money settings → Expense categories                        | —                                 |
| What each flavour earns (cost pending)     | Same rows, at the bottom                                                         | —                                 |
| Books & costs (was the "Expenses" tab)     | Money settings → Books & costs                                                   | test                              |
| Books CSV (13 months)                      | Money settings → Download all books; footer exports the selected period          | —                                 |
| Uncosted stock uses caption                | Warning line for the period                                                      | test                              |
| Open bazaar not in books (new, real field) | Status line per held event                                                       | test                              |

## Shop → Order rules, Boxes & add-ons

| Old capability                                 | New home                                                     | Evidence                    |
| ---------------------------------------------- | ------------------------------------------------------------ | --------------------------- |
| All rule fields except per-number unpaid limit | Same fields, grouped; pickup days as chips                   | `order-rules-form.test.tsx` |
| Unpaid orders per mobile number                | Removed from UI (owner request); saved value kept on save    | test                        |
| Same-day pickup on/percent/extras              | Same, with explanations                                      | `order-extras.test.tsx`     |
| Sampler item choice                            | "Offer sampler box" switch; item picker only if several sets | test                        |
| Most sampler boxes per order                   | Removed from UI (owner request); saved value kept            | test                        |
| Box sizes: on/off and charge                   | Same per saved size                                          | test                        |
| New box size free text                         | Removed (owner: ineffective)                                 | test                        |
| Add-ons: name, price, on/off                   | Same; add several; only unsaved rows can be removed          | test + headless save check  |
| Add-on choices (comma text)                    | "Customer chooses an option" switch + editable rows          | test                        |
| Add-on message label                           | "Customer writes a message" switch + label; length kept      | test                        |
| Most per order / message length                | Removed from UI (owner request); saved values kept           | test                        |
| Sheet with Close                               | Page with header Back, Cancel and Save; saves unchanged      | headless 320/390/768/1240   |

## Settings forms shown as pages (`pageFormOf`, `owner-workspace.tsx`)

Payment methods, Shop details & messages, Customer messages, Bazaar events, Books & costs, Stock items,
Suppliers & prices and Recipe drafts now open as a page with a header Back instead of a sheet. Their
fields, saves and inner Back/Close buttons are unchanged; the header Back calls the same close. Their
inner styling is still the older plain form (re-skin pending).

Reachability after removing Home's tool directory (clicked on the 4186 preview, 4 November):
Notifications → header bell; Settings → header Account; System health and Backups & export →
Account page rows (both open `health`); Shop status, Order rules, Boxes & add-ons, Payment methods,
Shop texts and the three customer previews → Sell › Shop › "Shop settings & tools". Escape no longer
closes the forms that became pages (use Back or Cancel). The page underneath stays mounted while a
settings page is open, so its selection survives a save.

## Sampler flavours (migration `20260101007000_sampler_flavours.sql`, Ethan approved 4 November)

`order_extras.sampler_flavours` holds the cookie ids in the sampler box. The owner ticks them on Boxes &
add-ons (every cookie listed, switched-off ones marked); the customer shop's sampler card adds
"Includes …" from the published ones. `save_order_extras` takes the list as an optional eighth key, so the
deployed app keeps saving unchanged before an update; the app sends the key only when the database
returned it, and hides the toggles otherwise. place_order and historical orders are untouched. Applied to
the local database only; applying it to the hosted database needs Ethan's separate approval.

## Sell, Shop and Account (`src/components/live/sell/`, `src/components/live/account/`)

| Today's capability | New home | Evidence |
|---|---|---|
| Orders: review banner, filters with counts, search, split preview, flavour tally, quick next action, Customer messages | `OrdersLive`; groups follow the reference, each row keeps its status word | test, screenshot |
| Order detail: payment check, proof, clearer proof, reject, lines, progress, contact, status changes, refund, no-show, swap | `OrderLive`, same engine `od` actions | screenshot |
| Payments list | `PaymentsLive`; the Payments tab stays, because several payments can wait at once | screenshot |
| Customers sheet and waitlist action | `CustomersLive` as a page | test |
| Shop status options and close-and-roll-over | `ShopStatusLive` as a page | test |
| Capacity, ordering open or closed, sold-out switches, past drops | One step down, on Opening schedule & drop | test |
| Every Shop entry | Rows and previews on `ShopLive`; an unknown entry still gets a row | test |
| Every Account setting row | `SettingsAreaPage`; an unknown group lands in Other settings | test |
| Notifications, Health, records, export, report a problem | `NotificationsLive`, `HealthLive` | screenshot |

Dropped: nothing. Still drawn by a ported sheet: refund, no-show, swap, users, rules, retention, pricing. See [coverage](reference-v4/coverage.md).

## Make and Stock (`live/recipes/`, `live/production/`, `live/stock/`, `store/make-desk.ts`, `store/stock-entries.ts`)

| Today's capability | New home | Evidence |
|---|---|---|
| Product definition, recipe link, order-form switch, cost, sold-out and rotating words | Products cards. "About product labels" moved to the Shop label hint in Edit product | test |
| Start production, its guards, entry and focus | Unchanged on Production; Products' button opens the same entry | test, browser |
| Receive sheet: quantity, paid, supplier, engine bookkeeping | Receive delivery page, several lines; same `record_stock_movement`, same engine `confirmReceive` for each line | test |
| Waste sheet; add or subtract sheet | Waste / correction page with Review; same movements, and a note is now required | test |
| Item page facts, last counted, cost, last paid, prices, history | Unchanged. Last counted and cost left the list rows; they stay on the item page | test |
| Grocery rows, I bought these, totals, budget | Shopping grouped by supplier, with Compare prices and Count before buying | test, browser |
| Manage inventory items | Stock settings | browser |
| Dough and baked counts | Inventory categories, read only; changed by production and waste | browser |

Dropped: "Set to" in the old quantity sheet, which is redundant with Count on the same page and records the same count movement.

## Money and sheets as pages (`live/money/`, `live/settings-pages.tsx`, `store/money-desk.ts`, `store/money-entry.ts`)

| Today's capability | New home | Evidence |
|---|---|---|
| Expense sheet: category, amount, what for | Record expense page with Review and a date; same `record_expense` | test |
| Expense sheet: item and quantity that also receives stock | Dropped: Receive delivery does this with its own review; the page says where to go | test |
| Draw sheet | Record owner draw page with Review; same `record_draw` | test |
| Rules, categories, people, retention, statuses, pricing, payment rule | Pages in the owner frame; same engine values | test, browser |
| Refund, no-show, swap | Pages, opened from the order; same handlers | test |
| Till: every tile, minus, Charge, Freebie, close, fees, add cookies, void, classic till | Same handlers. Close day is on the title; the rest is under Settings. Current sale panel on a wide screen, pinned bar on a phone | test, browser |


## Customers and the product form (`store/customer-desk.ts`, `live/sell/customers-live.tsx`)

| Today's capability | New home | Evidence |
|---|---|---|
| "Ordering now" list on the customers sheet | Customers list: everyone who has ordered, with counts and last order | test |
| Waitlist and its action | Unchanged, on the same page | test |
| `anonymise_customer` (no screen before) | Remove contact details, behind a tick, reporting what the server and the read back say | test |
| Product form | A page in the owner frame, in place of a modal; same form and close | test |

Known limits, for Ethan: `anonymise_customer` does not remove payment proofs or references, and it matches only orders whose stored number is already in the normal form. The page says both. Changing either needs a new migration.

## Till pages (`live/bazaar/till.tsx`, `till-bar.tsx`, `close-event-sheet.tsx`)

| Today's capability | New home | Evidence |
|---|---|---|
| Till menu: add cookies, fees, close, Home, classic till | Selling settings page; Close day also on the title | test |
| A sale's sheet: its figures and void | Receipt page, then a Void page with Keep sale | test |
| Fees and add-cookies forms | Pages of the new till; the classic till keeps the sheet | test |
| Close the event: split, costs, close without cost | A page; same form and checks | test |
| Unsent count and Sync now | On the status strip, and on Selling device | test |

Dropped: nothing.

## Recipe editor and planned bake (`live/recipes/recipe-editor.tsx`, `store/bake-plan.ts`)

| Today's capability | New home | Evidence |
|---|---|---|
| Ported Recipes screen for the owner: yield, lines, add, remove, save, versions, batches | Edit recipe page with Review; same engine handlers | test |
| Flavour tabs on that screen | Each product opens its own recipe from Products | browser |
| Warning "do not save yet" | Removed: lines keep their kind on save, and the page sets it. Independently reviewed | test |
| (new) Planned bake | Shopping: cookies by product against recipes and recorded stock. A note on this device; records nothing | test |

Dropped: nothing. Not built: creating a first recipe for a product with none outside this form was never offered, and still is not.


## Supplier price editor (`stock-suppliers-form.tsx`, `stock/item-prices.tsx`)

An item's price page can now add or change a supplier's price for that item, through the existing supplier form. It refuses to save if the item, the supplier or its prices changed since it opened; what the same save already wrote does not count as a change. Dropped: nothing.
