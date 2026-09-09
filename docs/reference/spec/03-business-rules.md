# Business rules

This is the part you cannot infer from the screens. Every rule here is implemented in
`reference/prototype.dc.html`; the method name in `(parentheses)` is where to read the
real code.

## The drop cycle `(dropCycle)`

Everything is derived from the clock and the config. There is no stored "current drop"
that can drift.

- Ordering **opens** on `openDow` at `openH:openM` — Monday 9:00 AM.
- Ordering **closes** on `closeDow` at `closeH:closeM`, plus `extendH` — Thursday 9:00 PM.
- **Pickup** is the **first Monday strictly after** ordering closes, **9 AM – 5 PM**.
  One window. Not a choice.
- If `now` is before this week's open, the cycle in effect is the previous week's.

Shop state shown to customers `(shopState)`: `open` while ordering is live,
`soon` in the last stretch before close, `closed` after, `soldout` when confirmed
cookies reach capacity. The owner can override the state manually; the override sticks
until she clears it.

## Capacity `(capacityOf, confirmedCookies, confirmPayment)`

`capacity` is **cookies per drop**, default 200. It is consumed by orders in a
recognised status, not by orders merely placed.

Confirming a payment that would push the drop past capacity does **not** silently
fail — it opens the overage sheet showing how many over and how many are left, and she
can confirm anyway. When capacity is reached the shop flips to Sold out and a toast says so.

## Pricing `(priceOf, boxTotal, priceMode)`

Cookies are sold **per cookie**. Any quantity from 1 up. There is no minimum, no
required box.

`prices[product_id]` is the live menu price, seeded from the product's `price`.
Current prices: DCF ₱130, HC ₱140, WCB ₱145, PBM ₱80, RVC ₱150, NCH ₱200.

An order stores a `priced` snapshot at checkout. **Changing a menu price never changes
a placed order's total.** New prices apply to new orders only.

Four pricing rules exist; the default and the one in use is **Sum of menu prices**:

| rule | total |
|---|---|
| Sum of menu prices *(default)* | Σ price × qty |
| Menu prices + packaging fee | Σ + `packagingFee` × ceil(n / 6) |
| Flat price per box | `flatBoxPrice` × ceil(n / 6) |
| Cookie cost × multiplier + packaging | unit cost × `cogsMultiple`, plus packaging |

The three non-default rules still count in sixes because packaging comes in boxes of 6.
**Confirm with the owner whether the three alternative rules are still wanted at all** —
they predate the decision to sell per cookie. If they are not, drop them and keep the sum.

A per-order cap of `maxPerOrder` cookies (24) applies in the customer shop.

## Order state machine `(confirmPayment, rejectPayment, packOrder, refundOrder)`

```
                 ┌──────────────► Cancelled (rejected)
                 │
Payment review ──┼──► Confirmed ──► Preparing ──► Ready ──► Completed
                 │        │                         │
                 │        └──► Cancelled ──► refund │──► No-show
                 └──◄── reopen (new proof)
```

- **Payment review** — placed, proof uploaded, nothing reserved. Does not consume capacity.
- **Confirmed** — payment verified by eye. An invoice number `INV-nnnn` is issued from a
  sequence. If the amount sent was short, the order is confirmed **as a part payment**
  and carries a `balance`; settling it later clears the balance.
- **Ready** — packed. Packing deducts packaging from inventory and baked cookies from stock.
- **Completed** — collected. **No-show** — not collected.
- **Rejected proof** → Cancelled with `rejected = true`; the customer's status link then
  asks them to send payment again. Nothing was reserved, nothing was charged.
- **Refund** — returns unsold cookies to baked stock if the order was Ready. A refund
  posts a ledger line **only if the drop's revenue was already booked**; refunding
  before the drop closes just removes the order from the total, and posting a line as
  well would double-count it.

Two status groups drive the maths — read `this.PLANNED` and `this.RECOGNISED` in the
source and reproduce them exactly. Planned statuses drive what to bake; recognised
statuses drive capacity and revenue.

## Packing `(packOrder)`

Full sixes go in a **Box of 6**, the remainder in **Single cookie pouches**. Every
cookie gets a **Brand sticker**; each order gets at least one **Thank-you card**. All
four are inventory items and are deducted on pack. If any is short, the shortfall is
logged rather than silently ignored.

## Bake plan `(demand, toBake, toMix)`

```
demand(flavour)  = Σ qty across orders in a PLANNED status
to bake(flavour) = max(0, demand − baked_in_stock)
to mix(flavour)  = max(0, to_bake − dough_on_hand)
```
The bake plan shows only those three numbers per flavour. Dough and ingredient
recording live here, not in Inventory — deliberately, so there is one place to record
production.

## Dough and rest `(restMs, doughRested, doughAging)`

- Mixing a batch records `dough[flavour] += yield` and `doughAt[flavour] = now`, and
  **deducts every recipe ingredient from inventory**.
- Dough is bakeable `restHours` (24 h) after mixing. Before that the UI shows time
  remaining and blocks baking.
- Dough older than `doughWarnDays` (14 days) is flagged as aging.
- Confirming a bake moves cookies from `dough` to `baked`, and records planned vs
  actual with any rejects as a **yield variance**.

## Cost per cookie `(costPerUnit, ingCost, packCostPerCookie, unitCost)`

```
cost per unit of ingredient = latest amount actually paid ÷ quantity received
                              (falls back to supplier list price ÷ pack size)
ingredient cost per cookie  = Σ (recipe qty × cost per unit) ÷ recipe yield
packaging cost per cookie   = (Box of 6 + Brand sticker + Thank-you card) ÷ 6
unit cost                   = ingredient cost + packaging cost, rounded to 2 dp
```

**Never average prices.** The latest paid price is the cost basis. When a recorded
purchase moves the unit price more than 2 %, the toast says so explicitly — "was ₱438"
— because margins have just moved.

Note: packaging cost divides by 6 on the assumption cookies ship six to a box. That is
still true of *packaging*, but if the owner starts pouching most orders singly this
number understates cost. Flag it if order sizes are mostly below 6.

## The journal `(entry, postEntry, addExpense, unpost)`

One append-only list. Every peso in the P&L is one line. Nothing is entered twice and
nothing is derived twice.

- **Recording a purchase** posts one expense line, increases the inventory quantity,
  resets the use-by date, and sets the new cost basis — one action, four consequences.
- **A plain expense** posts a line and moves nothing else.
- **Drop revenue** is booked as a single line when the drop closes `(closeDrop)`, not
  per order. This is why refund handling depends on whether the drop has closed.
- **A short cash drawer** at a bazaar posts an expense under `Cash variance` with the
  helper's name on it. An over posts as extra bazaar takings.
- Categories are owner-editable. Renaming a category rewrites the label on past lines
  but keeps their history. Deactivating hides it from the picker without touching history.
- Every posted line is undoable for 6.2 s from its toast. After that, reverse it.

Prior months' profit is stored as history and never recalculated (`PRIOR_MONTHS`).

## Grocery list `(groceryPlan)`

Derived, not typed. For each ingredient: what the bake plan needs, minus what is in
stock, rounded up to whole purchasable packs, priced at the **lowest recent price**
across suppliers, compared against `groceryBudget`. Packaging needs are computed the
same way from unpacked orders.

## Bazaar and offline `(recordSale, syncNow, closeEvent, resetEvent)`

The one genuinely hard requirement.

- Stock is **loaded onto the table** from baked stock at setup; it leaves `baked` and
  enters `eventStock`.
- Selling works with **no connection**. Each sale is committed locally with an
  `unsynced` counter visible on screen.
- `syncNow` flushes the queue when back online. Sync must be **idempotent** — a sale
  must never post twice. Give each sale a client-generated id and upsert on it.
- **Closing** counts the drawer: expected = float + cash takings; the difference is
  logged as above. Unsold cookies go **back into baked stock**. Nothing disappears.
- Reopening an event restores stock and sales exactly as they were.

In the prototype this is simulated with a toggle. In the real app: IndexedDB queue,
service worker, background sync, and a server endpoint that accepts a batch of sales
with client ids.

## Roles `(ROLES, canSee, money)`

| role | can reach | money visible |
|---|---|---|
| **owner** (Cine) | everything | yes |
| **helper** (e.g. Kristian) | Home, Sales log, Bazaar | **no** — costs, expenses, margins and P&L hidden |
| **support** (KETH AI) | System health, Notifications, All tools | no — and **no customer or money data at all** |

Helpers can close a drawer. Attempting anything owner-only shows "Only Cine can do this.
Ask her to do this one." Enforce all of this **server-side**; the prototype only hides UI.

## Data retention `(retentionDays, contactHidden)`

`retention` is one of 6 months / 1 year / 2 years / keep until deleted. Once an order is
**Completed** and older than that window, the customer's contact details stop being
displayed. In the real app, delete or hash them — don't just hide them.

## Number and text formatting

- `₱1,234` — no decimals for totals; `₱12.34` for unit costs. Negative is `−₱120`.
- Weights: grams below 1000, kilograms at or above, **never rounded** — `1.346 kg`.
- Quantities that are being corrected are shown exact, never rounded.
- Times 12-hour with AM/PM. Dates `4 Sep`. Relative time: "just now" under 45 s, then
  "12 min ago", then the clock time today, then "Mon 3:15 PM" within six days, then the date.
