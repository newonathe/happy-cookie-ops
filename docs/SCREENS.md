# Screen reference

> **Historical context (T-task era, before the 2026-09-08 master plan):** where this page conflicts with [MASTER-PLAN.md](../MASTER-PLAN.md), [docs/state/current.md](../docs/state/current.md) or the [decision register](../docs/state/decision-register.md), those win. Its protection rules still apply unless they say otherwise.

91 screenshots of the working prototype, captured by driving its real engine — every
number, label and state in them is genuine, not mocked.

**What these are for.** When you are about to change a screen, look at it first. The
port's guarantee is that the app matches these; `pnpm verify:port` proves the copy and
styles are unchanged, and `pnpm test:visual` proves the layout is. These images are what
those gates are ultimately defending.

They are also the answer key for a question that comes up constantly: *is this how it is
supposed to look?* If the running app disagrees with the image, the app is wrong.

## Layout

```
docs/reference/screens/
  mobile/    390 × 800    25 screens — the primary device, a phone in a kitchen
  tablet/    834 × 900    25 screens — the same screens with room to breathe
  desktop/  1280 × 800    25 screens — two-pane layouts and the left rail
  states/                 16 sheets, roles and the offline state
```

The harness chrome (device picker, role switcher, width toggles) is hidden in every shot.
Filenames are stable — reference them in a task or a PR.

## The 25 screens

Same numbering in all three device folders, so `mobile/09`, `tablet/09` and `desktop/09`
are the same screen.

| # | Screen | Key | Route | Component | What it is |
| --- | --- | --- | --- | --- | --- |
| 01 | Home | `today` | `/` | `home.tsx` | The morning screen. What to do now, the flow strip, the next drop. |
| 02 | Orders | `orders` | `/orders` | `orders.tsx` | Every order, filtered by state. The list she works down. |
| 03 | Order detail | `order` | `/order` | `order-detail.tsx` | One order: items, payment, the state machine buttons. |
| 04 | Bake plan | `bake` | `/bake` | `bake-plan.tsx` | What to bake, by flavour, derived from live orders. |
| 05 | Production | `batch` | `/batch` | `production-focus.tsx` | One batch at a time. Big targets, one-handed. |
| 06 | Inventory | `inventory` | `/inventory` | `inventory.tsx` | Stock on hand against par levels, grouped Ingredients / Packaging. |
| 07 | Stocktake | `stocktake` | `/stocktake` | `(inside inventory.tsx)` | Counting mode. A screen key with no file of its own. |
| 08 | Grocery list | `grocery` | `/grocery` | `grocery-list.tsx` | Derived, never stored. What to buy and from whom. |
| 09 | Bazaar mode | `bazaar` | `/bazaar` | `bazaar-mode.tsx` | The till. Works with no signal; the queue badge is the trust signal. |
| 10 | Sales log | `sales` | `/sales` | `sales-log.tsx` | Every sale taken, synced or not. |
| 11 | Payments | `reconcile` | `/reconcile` | `payments.tsx` | Matching GCash screenshots to orders. Her slowest weekly job. |
| 12 | Profit and loss | `pnl` | `/pnl` | `profit-and-loss.tsx` | Owner only. The number she decides on. |
| 13 | Form queue | `formqueue` | `/formqueue` | `form-queue.tsx` | Orders taken by hand, waiting to be entered. |
| 14 | Drops | `drops` | `/drops` | `drops.tsx` | The weekly cycle: open, close, pickup. |
| 15 | Products | `products` | `/products` | `products.tsx` | The catalogue and its prices. |
| 16 | Recipes | `recipes` | `/recipes` | `recipes.tsx` | Read-only. Yields and ingredient quantities. |
| 17 | Suppliers | `suppliers` | `/suppliers` | `suppliers.tsx` | The price book, and the best-buy comparison. |
| 18 | Settings | `settings` | `/settings` | `settings.tsx` | The 21 DEFAULT_CFG values, and the books export. |
| 19 | Notifications | `notifications` | `/notifications` | `notifications.tsx` | Generated locally. Nothing pushes yet. |
| 20 | System health | `health` | `/health` | `system-health.tsx` | Reads local state, not /api/health. |
| 21 | All tools | `more` | `/more` | `all-tools.tsx` | The full index, role-filtered. |
| 22 | Shop | `shop` | `/shop` | `shop.tsx` | Public. No login. The quantity picker clamps to remaining capacity. |
| 23 | Checkout | `checkout` | `/checkout` | `checkout.tsx` | Public. Name, phone, payment method. |
| 24 | Order status | `status` | `/status` | `order-status.tsx` | What a customer sees after ordering. |
| 25 | Find my order | `lookup` | `/lookup` | `find-my-order.tsx` | One field accepting order number, reference, mobile, email or Instagram (corrected 2026-09-24; audit F04). Secure capability-link lookup is DP-01. |

## States, sheets and roles

In `states/`. Mobile unless the name says desktop.

| # | State | On screen | Why it is here |
| --- | --- | --- | --- |
| 01 | Confirm payment | `order` | Owner marks a payment verified. Writes an audit row. |
| 02 | No-show | `order` | **They stay paid and the cookies go back into stock.** Recognised revenue, released capacity. |
| 03 | Refund | `order` | A correction, not a deletion — the ledger gets a second signed row. |
| 04 | Write off / spoilage | `inventory` | Stock removed with a reason. Hits the P&L. |
| 05 | Receive stock | `inventory` | A purchase. Sets the new cost basis. |
| 06 | Bazaar closeout | `bazaar` | End of the event. The sequence that must balance. |
| 07 | Shop status | `drops` | Open, closed or sold out. What the public shop shows. |
| 08 | Rules | `settings` | The editable business rules. |
| 09 | Reset data | `settings` | The destructive one. Confirmation copy matters. |
| 10 | Edit price | `products` | Owner only. Her prices. |
| 11 | Bazaar, offline | `bazaar` | **The most important state in the app.** No signal, sales still taken, queue visible. |
| 12 | Helper — home | `today` | No money anywhere. Compare against mobile/01-home. |
| 13 | Helper — bake plan | `bake` | What a helper is given: the work, not the books. |
| 14 | Support — home | `today` | The narrowest role. |
| 15 | Desktop orders + toast | `orders` | The two-pane desktop layout, with a confirmation toast. |
| 16 | Desktop recipes | `recipes` | How a dense read-only screen uses the width. |

## Reading them well

**Start with `states/11-bazaar-offline.png`.** It is the state the whole architecture
exists for: no signal, money still changing hands, and the customer's confidence resting
on one badge. `docs/OFFLINE.md` is the rules; that image is what they produce.

**Compare `states/12` against `mobile/01`.** Same screen, helper role. Every money value
is gone. That is the role model doing its job in the UI — and `docs/DATA.md` explains why
row-level security has to do it again in the database, because the UI gate only keeps a
helper from being *confused*, not from being *able*.

**Compare a screen across the three folders before changing a layout.** Mobile is a single
column with a bottom dock; desktop is two panes with a left rail. Both are in the ported
markup already. A change that looks right on one can break the other, which is what
`pnpm test:visual` catches — but only for the ten screens it covers.

**Look at an empty state before you write one.** `mobile/13-form-queue.png` and
`mobile/19-notifications.png` show the register: plain, specific, about her work. New copy
should sound like theirs.

## Regenerating

These were captured from `docs/reference/prototype.dc.html` through its harness
(`window.__thc.go(screen)`, `.sheet(kind, props)`, `.setRole(role)`,
`.setState({device})`). The prototype is committed, so they can be reproduced.

Do not regenerate them casually. They are a record of the design **as signed off** — if
the app has drifted, recapturing turns a caught regression into a new baseline. Recapture
only when the owner has approved a change, and say so in the commit.

For layout regression testing use `pnpm test:visual` instead: its baselines are rendered
in the CI container and are meant to change with approved work. `docs/TESTING.md` §visual.
