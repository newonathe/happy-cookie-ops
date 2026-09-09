# Data model

The prototype keeps everything in one `localStorage` object under `hc-ops-state-v1`,
shaped `{ v: 1, data: { ...84 keys } }`. That shape is a prototype convenience, not a
schema. Below is the model it implies.

Money is stored in pesos as a number with 2 decimal places of precision. Prefer integer
centavos or `numeric(12,2)` in Postgres — never a float.

## Entities

### product (flavour) — 6 rows, effectively static
```
id            text pk        'dcf' | 'hc' | 'wcb' | 'pbm' | 'rvc' | 'nch'
name          text           lowercase display name
short         text           title-case name used in most UI
price          money          current menu price per cookie
img            text           product photograph
kind           text           'Permanent' | 'Rotating'
tag            text           '' | 'Best seller' | 'New'
desc           text           one-sentence description shown to customers
allergens      text           comma list; see ALLERGENS in seed-data.js
active_in_drop bool           toggled per drop, not deleted
sold_out       bool           per drop
```

### recipe — one per product, versioned
```
product_id    fk
version       int            starts at 1; any edit creates a new version
yield         int            cookies per batch (14–24 depending on flavour)
ingredients   [{ name, qty, unit }]
```
Old versions are retained and readable. A batch records which version it used.

### ingredient / inventory_item
```
name        text pk        'Unsalted butter', 'Box of 6', ...
category    text           'Ingredients' | 'Packaging'
qty         numeric        current stock in `unit`
unit        text           'g' | 'pcs'
level       numeric        reorder level — below this it appears on the grocery list
supplier    text           preferred supplier name
updated_at  timestamptz
use_by      date nullable  only for perishables; see USE_BY_DAYS in seed-data.js
pack_size   numeric        units per purchased pack; see PACK_SIZE
```

### supplier and supplier_price
```
supplier: name, place
supplier_price: supplier, item, pack ('1 kg block'), price, last_bought, preferred
```
Plus `purchase` rows — every recorded buy. The **most recent** purchase price for an
item is the cost basis. Previous prices are kept for the "was ₱438" comparison.

### order
```
id             text          'HC-1042', sequential
drop_id        fk
name, ig, email, mobile
items          { product_id: qty }
priced         { product_id: price }   snapshot of prices at time of order — immutable
status         text          see the state machine in 03-business-rules.md
pay_method     text          'GCash' | 'Maya' | 'GoTyme' | 'Cash'
ref            text          payment reference the customer typed
paid_amount    money nullable
balance        money nullable   set when a confirmed payment was short
proof_url      text          uploaded screenshot
invoice_no     text nullable 'INV-0001', issued on confirm
pickup_window  text          'mon' — one window per drop
placed_at      timestamptz
warn           text nullable an owner-facing flag on the order
rejected       bool
cancel_requested bool
```

### drop
```
no             int            'Drop 12'
opens_at, closes_at, pickup_at  timestamptz  — derived from config, see rules
capacity       int            cookies
state          text           'open' | 'soon' | 'closed' | 'soldout' (can be overridden)
closed_at      timestamptz nullable
```

### ledger_entry — the journal. Append-only.
```
id        text pk
kind      text        'revenue' | 'expense' | 'refund'
at        timestamptz
category  text        user-editable list; see `categories` / `inactiveCats`
label     text        human description
amount    money       always positive; `kind` carries the sign
order_id  fk nullable
item      text nullable   inventory item, when the expense was a stock purchase
qty       numeric nullable amount received, in the item's unit
drop_id   fk nullable     set on the revenue line posted when a drop closes
event_id  fk nullable     set on bazaar lines
```
**Never update or delete a line.** "Undo" within the toast window removes it; anything
later is a reversing entry.

### dough_lot and bake
```
dough_lot: product_id, qty (cookies' worth), mixed_at, recipe_version
bake:      product_id, planned, actual, rejects, baked_at, by
```
`baked[product_id]` is the running count of finished cookies available.

### event (bazaar)
```
id, name, stage ('setup'|'selling'|'closed')
stock_loaded  { product_id: qty }
prices        { product_id: price }   may differ from the menu
sales         [{ items, gross, discount, pay, ref, at, synced }]
drawer        { float, counted }
z_expected, z_counted, z_diff, closed_by, closed_at
```

### stock_count, spoilage, shortfall, variance
Audit tables. Each row carries who, when, expected, actual. Nothing is overwritten.

### user
Three roles: `owner`, `helper`, `support`. See the roles table in
03-business-rules.md for exactly what each can reach.

## Config

One row of owner-editable settings — `DEFAULT_CFG` in `seed-data.js`:

```
capacity 200          cookies per drop
taxRate 3             %
drawerFloat 1000      ₱ cash float at a bazaar
discountA 20, discountB 50   ₱ quick discount buttons
restHours 24          dough rest before baking
doughWarnDays 14      dough older than this is flagged
groceryBudget 6000    ₱ per drop
packagingFee 38.44    ₱, used by two of the pricing rules
flatBoxPrice 860      ₱, used by one pricing rule
cogsMultiple 4        cost multiplier for cost-based pricing
priceMode null        null falls back to 'Sum of menu prices'
openDow 1, openH 9, openM 0     ordering opens Monday 9:00
closeDow 4, closeH 21, closeM 0 ordering closes Thursday 21:00
extendH 0             hours the current drop was extended by
retention '1 year'    how long customer contact details are kept
maxPerOrder 24        cookies per order cap
```
