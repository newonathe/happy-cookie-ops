# Data

> MP-06.b.1 authority update: `settings_effective()` now permits only service_role among API-facing roles. Its previous general-staff grant is revoked; the settings descriptions below preserve historical behavior, not authorization to restore that grant. Use the [current RPC plan](state/MP-06b-authority-plan.md) and owner/public projection boundaries. Direct table-policy hardening for `settings` is done (MP-09 b1: `insert`/`update`/`delete` revoked from `anon`/`authenticated`; see "Settings" below).

> MP-06.c.1 authority update: direct INSERT into `orders` and `order_items` is denied to anon/authenticated. The historical role table below does not authorize customer row insertion; future checkout must use a validated server command. Other table-policy gaps remain open. See [the insertion plan](state/MP-06c-plan.md).

> MP-08.j session boundary: `hco_private.bff_sessions` stores only hashed browser-session identifiers and encrypted provider credentials. API roles have no schema or table access. The service infrastructure can use only the seven `bff_session_*` functions for create/read, fenced refresh, local-first revocation, bounded expired-session cleanup and fence-checked cleanup completion. Browser code never receives provider credentials or this private row.

Money is stored as **centavos in `bigint`**. The prototype worked in pesos with two
decimals, which is fine in a display layer and not fine in a ledger. Conversion happens
at the API boundary, not in the engine.

## Tables

| Table                                       | Holds                         | Notes                                                                                                                                                                |
| ------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`                                  | staff accounts                | one row per `auth.users`; carries the role                                                                                                                           |
| `products`                                  | the catalogue                 | ids are the prototype's (`dcf`, `hc`, `wcb`, `pbm`, `rvc`, `nch`); `rotation` is Permanent or Rotating                                                               |
| `recipes`, `recipe_ingredients`             | what a batch needs            | drives the grocery list                                                                                                                                              |
| `suppliers`, `inventory_items`              | stock                         | `par_level` triggers a grocery line; `category` is Ingredients or Packaging                                                                                          |
| `settings`                                  | her 24 editable values        | read via `settings_effective()`/`get_settings()`/`get_operating_settings()`, which fill defaults from the engine; written only via `save_setting()`                  |
| `rate_limits`                               | abuse counters                | no direct access; `consume_rate_limit()` is the only door                                                                                                            |
| `erasure_requests`                          | RA 10173 requests             | owner only. Records what was blocked and why                                                                                                                         |
| `supplier_prices`                           | the price book                | one row per supplier per item: pack, current price, previous prices, whether it is preferred. This is what "best buy" compares.                                      |
| `drops`                                     | the weekly order window       | opens, closes, pickup, capacity                                                                                                                                      |
| `orders`, `order_items`                     | customer orders               | id is the customer-facing `HC-1042`                                                                                                                                  |
| `bake_batches`                              | production                    | planned vs baked per product per drop                                                                                                                                |
| `ledger_entries`                            | the books                     | signed centavos; costs negative; append-only                                                                                                                         |
| `events`, `event_sales`, `event_sale_items` | bazaars                       | `client_id` is the queue's idempotency key                                                                                                                           |
| `audit_log`                                 | who changed money or stock    | append-only, owner-readable                                                                                                                                          |
| `hco_private.bff_sessions`                  | durable BFF session authority | private schema; SHA-256 cookie hash, independent CSRF token, encrypted credential envelope, fixed 8-hour lifetime, refresh/cleanup fences; no direct API-role access |

## Roles

The prototype's three roles map straight to Postgres:

| Role      | Sees                                                    | Cannot                                           |
| --------- | ------------------------------------------------------- | ------------------------------------------------ |
| `owner`   | everything                                              | delete a ledger entry — corrections are new rows |
| `helper`  | production, stock, orders, and can record a bazaar sale | see the ledger, see P&L, change prices           |
| `support` | orders and their statuses                               | see money, change stock                          |
| `anon`    | the catalogue, the open drop, and can place an order    | read any order without its phone number          |

Enforced by row-level security, not by the UI. The role in engine state changes what is
_shown_; the policies decide what can be _read_. Both exist on purpose — the UI gate
keeps a helper from being confused, the policies keep them from being able.

## Settings

The engine's `DEFAULT_CFG` holds 21 owner-editable values and the Settings screen edits
them. `settings` stores the ones she has changed; `settings_effective()` (service_role
only) returns her overrides with the engine's defaults filled in for the rest, plus three
idle-sign-out keys (`idleMinutesOwner`/`Support`/`Helper`, DP-15) that have no engine-side
default because they only exist on the database.

Note what the shape buys: because a row exists only when she has changed something,
`is_default` distinguishes a deliberate choice of 200 from a default of 200 — which
matters the day a default changes and every business silently keeps the old one.

**MP-09 b1: writes only through `save_setting(key, value, expected_updated_at)`,** owner
only, `SECURITY DEFINER`. It knows every key's column (`int_value`/`text_value`/
`cents_value`), bounds and enum, taken from the engine's own `bumpCfg`/`numCfg` calls and
recorded in `tests/fixtures/settings-cases.json`; unknown keys, wrong types, out-of-range
values and a stale `expected_updated_at` are all rejected. `insert`/`update`/`delete` on
`settings` are revoked from `anon`/`authenticated` — even the owner can no longer write the
table directly, validated or not. Reads: `get_settings()` (owner, every key, with each
key's `updated_at` for the next save) or `get_operating_settings()` (any active staff, a
published-safe projection — capacity, the ordering window, `maxPerOrder`, the idle
minutes — with no cost key). The owner keeps raw `SELECT` on `settings` via the
pre-existing RLS policy; only writes moved behind the RPC.

Money keys (`packagingFee`, `flatBoxPrice`, `drawerFloat`, `groceryBudget`) go in
`cents_value`, counts in `int_value`, strings in `text_value`, and a check constraint
allows only one — so a peso value can never be read back as a count.

Not granted to `anon`. The shop needs `capacity` and the order window; `cogsMultiple` and
`groceryBudget` are her margins. T-11 should expose the first two through a narrow view.

**`taxRate` is 3(%) and nothing consumes it yet.** The P&L needs it, and no order or
ledger row carries a tax amount. Flagged in `docs/GAPS.md` §1.4 rather than guessed at —
whether that is percentage tax on gross or on margin is a question for her bookkeeper.

## Order states

`order_state` holds the engine's own status strings verbatim, spaces and capitals
included. The alternative — snake_case plus a mapping layer — puts one truth in two
places, which is the bug `src/lib/rules/capacity.ts` exists to prevent.

| State            | Meaning                                                             | Recognised revenue | Reserves capacity |
| ---------------- | ------------------------------------------------------------------- | ------------------ | ----------------- |
| `Payment review` | Placed, awaiting proof of payment. Where every order starts.        | no                 | no                |
| `Confirmed`      | Payment verified.                                                   | yes                | yes               |
| `Preparing`      | In the bake plan.                                                   | yes                | yes               |
| `Ready`          | Packed and waiting for collection.                                  | yes                | no                |
| `Completed`      | Handed over.                                                        | yes                | no                |
| `Cancelled`      | Rejected proof, or refunded. Can be reopened.                       | no                 | no                |
| `No-show`        | Nobody came. **They stay paid** and the cookies go back into stock. | **yes**            | no                |

The last row is the one to know. A no-show is recognised revenue — she keeps the money —
and the boxes return to stock, so the capacity is released. Both halves matter, and a
schema that could not represent this state would produce a P&L wrong by the value of
every uncollected box.

Two functions carry those columns so nothing restates them:

- `state_is_recognised(state)` — the engine's `RECOGNISED` list. Used by the P&L and the
  closeout.
- `state_reserves_capacity(state)` — the engine's `RESERVING` list. Used by
  `drop_remaining()`.

Query through the functions. A hardcoded state list in a new query is how these drift.

## The policies worth knowing

- **Default deny.** RLS is enabled on every table, and nothing has a permissive fallback.
- **`lookup_order(order_id, phone)`** is a `security definer` function, and the only way
  a customer reads an order. It normalises both phone numbers before comparing, so
  `0917 123 4567` and `+639171234567` match. Order ids alone leak nothing.
- **`drop_remaining(drop_id)`** computes capacity server-side. The prototype refused an
  over-capacity order in the UI; doing it in the database means two customers checking out
  in the same second cannot both get through.
- **`sync_event_sale(jsonb)`** is the only write path for bazaar sales. It checks
  `client_id` first and returns `duplicate = true` rather than inserting again, writes the
  matching ledger entry in the same transaction, and records an audit row.
- **A helper can insert a sale and never update one.** There is no `update` policy on
  `event_sales` at all.

## Migrations

```bash
pnpm db:start                              # local stack
pnpm db:reset                              # migrations + seed
supabase migration new describe_the_change  # new file, never edit an applied one
pnpm db:types                              # regenerate src/lib/types/database.ts
```

## The seed is generated, not written

`supabase/seed.sql` is produced by `scripts/gen-seed.mjs`, which reads `PRODUCTS`,
`INVENTORY`, `SUPPLIERS`, `PACK_SIZE`, `RECIPES` and `USE_BY_DAYS` straight out of the
engine. That is deliberate: a hand-written seed drifts from the design silently, and the
first symptom is demoing prices the owner has never charged.

After changing any of those constants, run `pnpm db:seed:gen` and commit the result. Do
not hand-edit the SQL.

Current contents: 10 suppliers, 6 products at ₱130/140/145/80/150/200, 30 stock items
across Ingredients and Packaging, 30 supplier price rows, 6 recipes, 51 ingredient lines.

## Quantities and units

Stock is held in the item's own unit — grams, millilitres or pieces — as
`numeric(12,3)`, and never rounded into whole units. Half a kilo of butter is a real
quantity, and `amt()` reads 1346 g back as `1.346 kg` because that is how the owner
shops. Rounding here changes a shopping list.
