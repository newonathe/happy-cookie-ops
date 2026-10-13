# Bazaar days — the design Ethan approved on 13 October 2026

An event with its own stock, fees, daily review and a traceable P&L. Three slices, S1 to S3; S1's goal is in
[next-goal.md](next-goal.md), the other two are at the end of this page. Decisions: [decision-register.md](decision-register.md),
13 October. This is real money: where this page and the code disagree, stop and say so.

## What Ethan asked for

Bazaar Mode works without recording a bake. Cine adds an event, its details and what she paid for it (for a day or for
the whole event, never ingredients or packaging). For **each day** she sets the flavours and products, how many, and
their prices. She sells. Before closing a day she rechecks stock left, losses, revenue and profit against a target. When
the event ends, and only then, its sales, costs and stock use count in the main books. Every figure shows how it was
worked out, and the inputs are hers to change.

His four answers: the new flow **replaces** the old start (no fallback); each day Cine decides how many leftovers carry
over, go to the shop or are written off; she may type a cost per cookie, marked as hers; bazaar first, set-up after.

## What is reused and must not change

`record_event_sale` (body md5 `8cf2bd63…`) and `void_event_sale`; the tables `events`, `event_sales`, `event_sale_items`,
`event_expenses`; `add_event_expense`; the till (`src/components/screens/bazaar-mode.tsx`, `sheets/pay.tsx`); the offline
queue and its tests (`src/lib/offline/`, `tests/unit/offline-queue.test.ts`); `src/lib/auth/`; `public/sw.js`; the engine.

## The model

A **booking** (`scheduled_events`: name, place, dates, rent) is the event. Each **day** becomes one `events` row when it
starts: `price_snapshot` is that day's prices, `loaded` is that day's stock, `selling_device` is the phone that started
it. The till and `record_event_sale` then work as they do today, because they already read only those columns.

Planning, starting a day, adding stock, review, close and finalise need signal. Selling does not.

## Migration 68: `supabase/migrations/20260101006700_bazaar_days.sql`

Every table: row security on, no policy, no API grant. Every function: `SECURITY DEFINER`, `search_path = ''`, an owner
check inside, explicit grants, exact keys, whole centavos, each refusal one `if … then -- rule:name` line, and a repeat
of the same call answered, not refused. Follow the SQL-slice rules in the saved notes (pins, function authority, the
suite's counts).

| Table              | Columns                                                                                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bazaar_days`      | `id`, `scheduled_id`, `day` (unique with the booking, inside its dates), `float_cents`, `event_id` (unique, null until started), `closed_review` jsonb, `closed_hash` |
| `bazaar_day_lines` | `day_id`, `product_id`, `made_qty`, `carried_qty`, `price_cents`; set at close: `left_qty`, `carry_next_qty`, `to_shop_qty`, `written_off_qty`                        |
| `bazaar_costs`     | `scheduled_id`, `product_id`, `recipe_cents` numeric(14,4) or null, `recipe_read_at`, `typed_cents` or null, `typed_by`, `typed_at`                                   |
| `bazaar_fees`      | `client_id`, `scheduled_id`, `day_id` or null (the whole event), `label`, `category`, `amount_cents`, `paid_on`, `ledger_id` (null until finalised)                   |
| `bazaar_losses`    | `client_id`, `day_id`, `product_id`, `qty`, `reason`, `at`                                                                                                            |

`scheduled_events` gains `target_profit_cents`, `finalised_at`, `final_summary` jsonb, `final_hash`. Its `rent_cents` is
the first fee, shown as "Stall rent" and posted at finalise under the client id `rent:<booking id>`, the key the old
link used, so the two flows can never both book it.

| Function                                          | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `get_bazaar(booking)`                             | Everything the screens show: the booking, fees, target, costs, each day with its lines and state, and `bazaar_summary`.                                                                                                                                                                                                                                                                                                                                                                                                  |
| `save_bazaar_day(day, stamp)`                     | Create or change a day's plan (lines, float). Refused once the day has started. A flavour must exist; quantities are whole, 0 to 9,999; a price is 0 or more.                                                                                                                                                                                                                                                                                                                                                            |
| `save_bazaar_fee`, `save_bazaar_loss`             | Keyed on a client id and a body hash, as `add_event_expense` is. A fee is refused once the event is finalised; a loss once its day is closed. A loss may not take a flavour below zero left.                                                                                                                                                                                                                                                                                                                             |
| `save_bazaar_cost(booking, product, typed_cents)` | Her typed cost per cookie, or null to go back to the recipe's. Refused once finalised. Audited.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `save_bazaar_target(booking, cents)`              | Her target profit. Refused once finalised.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `start_bazaar_day(day, device, event_id)`         | Refused unless: the booking is active and not finalised; no earlier day of it is still open; the day has at least one line with stock; each `carried_qty` is at most the previous closed day's `carry_next_qty` for that flavour (0 on the first day). Inserts the `events` row (name: booking and date), `price_snapshot`, `loaded`, `opened_at`, `drawer_float_cents`; writes `recipe_cents` for a flavour not yet in `bazaar_costs`. Returns what `start_event` returns, plus `loaded` and the float.                 |
| `add_bazaar_day_stock(day, product, qty, kind)`   | Open days only. Adds to `made_qty` (or `carried_qty`, within the same bound) and to `events.loaded`. The flavour must have a price on that day.                                                                                                                                                                                                                                                                                                                                                                          |
| `bazaar_summary(booking)`                         | Internal. The one computation, below. Stable for the same rows.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `close_bazaar_day(close)`                         | Body: day, time, counted cash or null, per flavour `left`, `carry_next`, `to_shop`, `written_off`, and `expected` (the day's hash from the summary she was shown). Works the day out again; refused when the hash differs, when `left <> carry_next + to_shop + written_off`, when `carry_next > 0` on the booking's last day, or when a flavour would be negative. Sets `events.closed_at`, `counted_cents`, `variance_cents`, `returned` (the `left` map); stores the review and its hash. Posts nothing to the books. |
| `finalise_bazaar(booking, expected)`              | Once. Refused while a started day is open, or when `expected` is not the summary's hash. In one transaction: each fee and the rent become an `event_expenses` row and a ledger cost dated `paid_on`; each day's cash variance becomes a ledger line as `close_event` books it; stock is taken (below); `to_shop` cookies enter baked stock; the summary and hash are stored; one audit row.                                                                                                                              |

Redefined whole, exactly as last defined, with **one** change each, and a rule mutation in the suite:

- `record_sale_packaging`: when the sale's event is a bazaar day, take nothing and record no shortfall. Finalise takes it.
- `get_books`: a ledger line that belongs to a bazaar day of a booking not yet finalised (through `event_sales` or
  `event_expenses`) is left out of `lines`; a new key `held` carries their count, revenue and expense sums and the
  booking names. With none, `held` is an empty list and every other key is unchanged.

**Stock at finalise.** For each flavour: cookies made less cookies sent to the shop. Ingredients by the current recipe,
scaled as `record_production` scales a batch (same rounding: pieces up, others to one decimal), and the recipe's
per-cookie packaging lines, through `use_stock_item`. The bazaar-sale container rule is taken once per non-voided sale.
A shortfall is recorded with its why; it never refuses the finalise. Do not copy the scaling rule: move it into one
internal function that `record_production` also calls, and keep the production suite green.

**To the shop.** Check first how the app derives baked stock from `get_production` (`src/store/ops-runtime.tsx`, the
production patch). The cookies must appear there without taking ingredients a second time. If that cannot be done
without changing how baked stock is read, stop and report: do not invent a second stock count.

## The computation

Whole centavos. A cost per cookie is numeric with four decimals; a cost line is `quantity × cost`, rounded half up to the
centavo **per flavour line**, then summed. Write a hand-worked two-day example first, in the suite's header, and hold
`bazaar_summary` to it to the centavo.

Per flavour, per day: `made + carried = sold + given + lost + left + not_accounted`. `sold` and `given` come from the
non-voided sale items (a sale with a zero total is given). `left` is her count; `not_accounted` is what remains, shown to
her, 0 or more; a negative is a refusal. Before she counts, `left` is unknown and the day reads "not counted yet".

| Figure             | How                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Revenue            | Non-voided sale totals. Beside it: gross, discounts, freebies at their price, by how paid.                                     |
| Cash               | Expected = float + cash sales. Counted. Over or short.                                                                         |
| Fees               | Rent plus fees, for the event and by day.                                                                                      |
| Cost per cookie    | Her typed cost if set, else the recipe's `per_cookie_cents` read at the flavour's first day. Each says which.                  |
| Cookie cost        | Cost of cookies made − cost of cookies sent to the shop. Its parts must add up: sold, given, lost, written off, not accounted. |
| Profit             | Revenue − fees − cookie cost + cash over − cash short.                                                                         |
| Against the target | Profit − target; and the revenue still needed.                                                                                 |

If a flavour with cookies made has no cost, cookie cost and profit are **null and say why**; never 0. Every figure
returns its parts (label, quantity, unit figure, amount), so the screen can open it.

## App

- `src/lib/data/bazaar-days.ts`: the calls and a strict parser. Centavos become pesos only through `src/lib/money.ts`.
- `src/components/live/bazaar/`: event list and "Add an event"; event page (details, fees, target, costs, days); day plan
  (copies the day before); "Start this day"; day review; "Close the day"; event summary; "Close the event". Registered
  under the `bazaar` key in `src/components/app/live-gate.tsx`, as `registerLiveStockScreens` is. While a day is selling
  it renders the ported till component unchanged; with no signal that is all it renders.
- `src/store/ops-runtime.tsx`, subclass only: a started day is put into the engine's state exactly as `startLiveEvent`
  does (event with its id and `snapshot`, `eventPrices`, `eventStock`, `eventLoaded`, the drawer float, no sales), so
  `saveBazaar` and the offline gate work unchanged. "Close out" on the till opens the day review. The ported start list
  and the ported close-out are not offered in live mode.
- `src/lib/data/books.ts` and `src/components/live/books-form.tsx`: read `held` (absent means none) and say "Bazaar in
  progress: not counted yet" with the sums.
- Tokens from `src/app/globals.css`; no new hex; 44 px targets; every figure a word and a number, never colour alone.

## S2 — the plan, the start and the till

```text
/goal Slice S2 of docs/state/bazaar-days.md for The Happy Cookie Ops in C:\Users\ethan\dev\happy-cookie-ops-g0: the
data layer, the runtime and the screens up to selling. S1 (migration 68) is built and on the local database; it reaches
the trial only on Ethan's word. Read first: AGENTS.md, docs/state/current.md, docs/state/bazaar-days.md, migration
20260101006700, src/components/live/stock/ (the pattern), src/store/ops-runtime.tsx (startLiveEvent, liveBazaarEvents,
liveScreenVals), src/lib/offline/bazaar-state.ts. Say what exists before building.
Tests first: the parser refuses a malformed answer; a started day lands in the engine's state with its own prices and
stock and survives a reload; a second start of the same day is the same event. Build src/lib/data/bazaar-days.ts, the
event list, event page, day plan and "Start this day", and the screen registration; the till is the ported component,
unchanged. Extend scripts/test-live-smoke.mjs: plan two days, start day 1 at its own prices, sell online and offline,
reload, each sale arrives once. No change to src/components/screens|sheets|shell, the engine, src/lib/offline,
src/lib/auth or public/sw.js. Sonnet builds, at most two workers; port-auditor confirms the locked files; security-
reviewer on the runtime diff. pnpm verify before every commit; browser QA at 320 px. Update current.md (five lines) and
task-status.json (one note). Do not merge or deploy. Stop after 25 turns or two failed fix attempts.
```

## S3 — losses, review, close, finalise

```text
/goal Slice S3 of docs/state/bazaar-days.md for The Happy Cookie Ops in C:\Users\ethan\dev\happy-cookie-ops-g0: losses,
the day review, closing a day, carrying over, finalising the event and the books' hold. S1 and S2 are built. Read first:
AGENTS.md, docs/state/current.md, docs/state/bazaar-days.md (the computation), migration 20260101006700,
src/components/live/bazaar/, src/lib/data/books.ts. Say what exists before building.
Tests first: every figure on the review equals bazaar_summary for the hand-worked example, to the centavo; an unknown
cost reads "Cost pending" and never 0; the close sends exactly what she was shown; the books leave an open event out
and count it after finalise. Build the loss form, the review with each figure openable, "Close the day" with the
leftover split, the event summary, "Close the event", and the books caption. Extend the smoke suite: close day 1,
carry into day 2, sell, close, finalise, read the books. Rewrite docs/state/bazaar-run-sheet.md for the new flow
(a two-day rehearsal with a reload offline on day 2). Reviews as S2. Then, on Ethan's word only: rehearse and apply
migration 68 to the trial from a scratch folder (never the repository folder), compare the schema fingerprint with
local, merge and let CI deploy. Stop after 25 turns or two failed fix attempts.
```
