# v4 mockup — coverage in the real app

**This is the checklist for finishing the app. Every agent updates it in the same commit as the page.**
Reference: `C:/Users/ethan/Downloads/happy-cookie-workflows-refined.html`, SHA-256 `fad61841…646aae`.
What each page does, control by control: [flows.md](flows.md). Page inventory: [../reference-v4-page-contracts.md](../reference-v4-page-contracts.md).
Lossless record: [../capability-ledger.md](../capability-ledger.md).

Status: **Done** matches the mockup's structure on real data. **Landing** is being moved into the repo now. **Partial** works, with a gap named. **Old** still draws the
ported prototype screen or sheet. **Missing** has no home yet. **Not a feature** is mockup tooling. Done means checked
on the 4186 preview with synthetic data; it is not hosted, device or owner acceptance.

## How the mockup is organized

- Frame: quiet left directory, thin top bar with location and Account, then the page.
- Page: one heading and purpose line; primary action, then Settings, on the right; section tabs under the heading.
- Content: solid panels of rows. A row is a name, one line of detail and one action. Figures align right.
- Any change: entry page, then a Review page listing what will be saved, then Save. Each step has its own Back.
- Each section's rules live on its own Settings page, never in daily work.
- Photos fill the top of product cards. Status is always a word; money is signed and coloured.

## How to build it here

- **Components:** pages compose `src/components/ui/owner-kit.tsx` and `owner-patterns.tsx`. Add a pattern there once it repeats.
- **Classes:** logic for a page lives in a class with injected dependencies and a `vals()` method (`RecipeBook`, `BazaarDays`,
  `ProductionWorkspace`, `MoneyDesk`, `HomeDesk`). Do not add page logic to `ops-runtime.tsx`, which only wires them.
- **Slots:** register with `registerLiveScreen` under `src/components/live/<area>/`; call it from `live-gate.tsx` and the private
  4186 `entry.tsx`. Locked screens, sheets, shell and engine stay untouched. No sample calculations from the mockup.
- **Lossless:** keep every capability reachable; record any move or drop in the capability ledger.
- Where this file and the mockup differ, the owner corrections in `../owner-screen-references-2026-11-04.md` win
  (neutral theme, Shop label, group Start production, owner draws separate from expenses).

## Pages

| Mockup page | App location | Status | Gap |
|---|---|---|---|
| **Home** | | | |
| home | `live/home/home-live.tsx` | Done | |
| **Bazaar** | | | |
| events | `live/bazaar/event-list.tsx` | Partial | Row and title layout to align |
| bazaar | `live/bazaar/event-page.tsx` | Partial | Hero facts and selling-days panel to align |
| event-edit | `live/bazaar/event-form.tsx` | Partial | Page form, re-skin |
| plan, plan-review | `live/bazaar/day-plan.tsx` | Partial | Review as its own step |
| till | `live/bazaar/till.tsx` | Partial | Owner's layout: frame, status strip, 3-column photo grid, Current sale panel |
| classic-till | ported `bazaar-mode` | Old | Keep as fallback, re-skin |
| receipt, void | ported sheets via till | Old | Pages |
| close, close-review | `live/bazaar/close-form.tsx`, `day-review.tsx` | Partial | Two-column layout |
| event-review | `live/bazaar/close-event-sheet.tsx` | Partial | Page |
| event-tools, event-tool-review | till tools | Partial | Entry/review pages |
| device-recovery | till/event page | Partial | Page |
| bazaar-settings | | Missing | Settings page |
| **Sell** | | | |
| sell | `live/sell/orders-live.tsx` | Done | |
| order | `live/sell/order-live.tsx` | Done | |
| payment-review | inside `order-live.tsx` | Done | Reconciliation stays at `payments-live.tsx` |
| order-action | ported refund, no-show, swap sheets | Old | Page with reason |
| customers | `live/sell/customers-live.tsx` in page mode (`pageFormOf`) | Partial | Rows show this drop and the waitlist; needs customer rows with order history |
| customer-detail, customer-message, contact-remove | | Missing | Needs a customers class and the existing erasure RPC |
| **Shop** | | | |
| shop | `live/sell/shop-live.tsx` | Done | |
| shop-status | `ShopStatusLive` | Done | |
| order-rules | `live/order-rules-form.tsx` | Done | Real fields differ from the mockup's sample fields |
| boxes | `live/order-extras-form.tsx` | Done | Flavours need migration 71 hosted |
| payment-methods, payment-method-edit | `live/payment-forms.tsx` | Partial | Page mode done, re-skin inner form |
| shop-text | `live/payment-forms.tsx` | Partial | Same |
| shop-schedule | `ScheduleAndDrop` in `live/sell/shop-live.tsx` | Partial | Capacity, sold-out and past drops are here. Schedule fields still in the ported `rules` sheet |
| customer-shop, customer-checkout, customer-status | ported customer screens with live branches | Partial | Compare with the mockup |
| **Make** | | | |
| make | `live/recipes/products-live.tsx` | Landing | |
| production | `live/production/production-live.tsx` | Partial | Title and tabs to align |
| production-entry, production-review | `production-start.tsx`, `production-focus-live.tsx` | Partial | Group entry exists; compare |
| recipe | `live/recipes/recipe-book.tsx`, `flavour-page.tsx`, `recipe-reader.tsx` | Partial | Recipe/Cost/History tabs, scaling, stock for this batch |
| recipe-edit, recipe-review | ported recipes screen | Old | Rebuild beside it; keep the legacy warning until reviewed |
| recipe-drafts | `live/recipe-drafts-form.tsx` | Partial | Needs-a-recipe list |
| product-edit | `live/live-form-host.tsx` | Done | |
| new-product | `live/live-form-host.tsx` | Partial | Short first step |
| cost-edit, cost-review | `live/recipes/flavour-page.tsx` | Partial | Review step |
| make-settings | | Missing | Use `SettingsAreaPage` area `make`; add Show inactive products |
| **Stock** | | | |
| stock | `live/stock/inventory-live.tsx` | Partial | Receive at top, Dough and Baked categories, simpler rows |
| item | `inventory-live.tsx` ItemPage | Partial | Layout |
| item-edit, new-item | `live/stock-items-form.tsx` | Partial | Re-skin |
| receive, receive-review | ported `receive` sheet | Old | Multi-line page and review |
| count, count-review | `live/stock/count-inventory.tsx` | Done | |
| adjust, adjust-review | ported `spoil` and adjust sheets | Old | Page and review |
| shopping | `live/stock/grocery-live.tsx` | Partial | Grouped by supplier, planned bake |
| bake-needs | | Missing | Planned bake page |
| suppliers, supplier, supplier-edit | `live/stock/suppliers-live.tsx`, `stock-suppliers-form.tsx` | Partial | Re-skin |
| purchase-prices | `live/stock/item-prices.tsx` | Partial | Use supplier |
| supplier-price-edit | stash `7f5924a` | Missing | Held price editor; read its review packet first |
| stock-settings | | Missing | Use `SettingsAreaPage` area `stock`; add the shopping budget |
| **Money** | | | |
| money | `live/money/money-live.tsx` | Done | |
| money-settings | `MoneySettings` | Partial | Recipe cost list |
| money-entry, money-review | ported `expense`, `draw` sheets | Old | Pages with review |
| transaction | | Missing | Detail page with source |
| money-categories | ported `categories` sheet | Old | Page |
| book-rules | ported `rules` sheet, `books-form.tsx` | Partial | Page |
| **Account** | | | |
| account | `live/account/account-live.tsx`, `settings-areas.tsx` | Done | Sign out stays on `SignOutControl`, drawn by the live gate |
| people, person-edit | ported `users` sheet | Old | Pages; each person uses their own account |
| health | `HealthLive` | Done | |
| backups, restore-preview | health export | Partial | Real backups only; no local JSON restore as a service. `restore-preview` was not captured: it needs a chosen file |
| sign-out | `app/sign-out-control.tsx` | Partial | Page wording |
| sign-in, account-help | `app/sign-in` | Partial | Compare |
| record-unavailable | | Missing | Shared not-found state |
| reset-preview | | Not a feature | Mockup tool: never reset real records |

## Also owed

- Realistic linked records in the 4186 preview for every section (see the owner references).
- Fresh screenshots at phone width for every rebuilt page.
- Independent review of each money, offline, auth or SQL slice.
