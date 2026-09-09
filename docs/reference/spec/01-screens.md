# Screens

25 screens in one app. Navigation is a bottom dock on phone and a left rail on desktop,
holding the same nine destinations: **Home, Sales log, Orders, Bake, Inventory, Grocery,
Bazaar, P&L, All tools**. Everything else is reached from those or from All tools.

Screen keys below are the prototype's internal ids — search them in
`reference/prototype.dc.html` (`<sc-if value="{{ screens.<key> }}">`) to find the exact
markup for any screen.

The app renders inside a phone frame on desktop. Real width is 390–430 px. Design for
that first; the desktop rail is a convenience, not a separate layout.

## Owner screens

| key | title | what it is for |
|---|---|---|
| `today` | Home | The one screen she opens in the morning. Drop countdown, capacity used, what needs review, what needs mixing or baking, quick-add actions. |
| `orders` | Orders | Every order in the current drop, grouped by status. Payment review sits at the top with a badge. |
| `order` | Order detail | One order: customer, items, total, invoice number, payment reference, proof screenshot, and the actions — confirm, reject, reopen, refund, pack, mark collected, mark no-show. |
| `reconcile` | Payments | Match typed payment references against what actually landed in the wallet. |
| `bake` | Bake plan | Per flavour: how many are ordered, how much dough exists, what to mix, what to bake. Recording dough and recording a bake both start here. |
| `batch` | Production focus | A single flavour's batch, step by step: mix → rest → bake → confirm yield. Deducts recipe ingredients on confirm. Full-screen focus mode, no nav. |
| `inventory` | Inventory | Four tabs: Ingredients, Packaging, Dough, Baked. Quantity, reorder level, supplier, last updated, use-by. Adjust, receive, write off. |
| `stocktake` | Stock count | A counting layer over Inventory. Enter counted quantities, see variance, commit. Logged with a name and time. |
| `grocery` | Grocery list | What to buy for this drop, derived from the bake plan minus stock, priced at the cheapest recent supplier, against a weekly budget. Receipt photo attaches to the run. |
| `pnl` | Profit & loss | Revenue, cost of goods, expenses, profit for the month, drillable into the journal. Owner only. |
| `sales` | Sales log | Every recorded sale, newest first. Visible to helpers. |
| `bazaar` | Bazaar Mode | Event selling: load stock onto the table, sell, take cash or card, work offline, close the drawer. Three stages — setup, selling, closed. Full-screen while selling. |
| `products` | Products | The six flavours: price, permanent or rotating, on or off this drop, sold out toggle. |
| `recipes` | Recipes | Ingredients and yield per flavour. Editing creates a new version; old versions stay. |
| `suppliers` | Suppliers | Where each ingredient is bought, pack size, price paid, previous prices. The lowest recent price is suggested. |
| `drops` | Drops | The current drop: schedule, capacity, extend ordering, close the drop early, shop state override. |
| `settings` | Settings | Everything she can change herself: schedule, capacity, pricing rule, rest hours, budgets, data retention, reset. |
| `more` | All tools | Grouped index of every screen, with badges. |
| `formqueue` | Form queue | Temporary bridge: orders that arrived as messages, parsed into a guess she confirms. Marked in the UI as a one-to-two-week measure. |
| `health` | System health | Sync state, backup state, error log. Support role's home. |
| `notifications` | Notifications | Everything that needs attention, oldest first. |

## Customer screens

Public, no login. Reached from a link.

| key | title | what it is for |
|---|---|---|
| `shop` | Shop | Six flavours with photography, description, per-cookie price, plus/minus steppers. Running order summary with a chip per flavour — tap a chip to remove one. Drop state banner: open, closing soon, closed, sold out. |
| `checkout` | Checkout | Name, mobile, email, Instagram, pickup window, payment method (GCash / Maya / GoTyme), QR to scan, reference number, amount sent, payment screenshot upload. All validated inline. |
| `status` | Order status | A four-step tracker — received, baking, ready for pickup, collected. Shows reference number and amount only, never the account name. |
| `lookup` | Find my order | Look an order up by reference, mobile or order number. |

## Cross-cutting UI

- **Bottom sheets** — 32 kinds, all in one `sheet` slot in state. Every destructive or
  numeric action happens in a sheet, never inline. Search `this.sheet('` in the source
  for the full list.
- **Toasts** — one at a time, 3.4 s, or 6.2 s with an Undo action. Every posted ledger
  line is undoable this way. Tone is `ok` or `warn`.
- **Focus mode** — production, stocktake and bazaar-selling hide the nav entirely.
- **Role banner** — helper and support views show a persistent note explaining what is hidden.
- **Guided flows** — `FLOWS` in the source defines five scripted walkthroughs used for
  training. Optional in the real build; ask before dropping it.
