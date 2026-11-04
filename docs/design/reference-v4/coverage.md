# v4 mockup — coverage in the real app

**This is the checklist for finishing the app. Every agent updates it in the same commit as the page.**
Reference: `C:/Users/ethan/Downloads/happy-cookie-workflows-refined.html`, SHA-256 `fad61841…646aae`.
What each page does, control by control: [flows.md](flows.md). Page inventory: [../reference-v4-page-contracts.md](../reference-v4-page-contracts.md).
Lossless record: [../capability-ledger.md](../capability-ledger.md).

Status: **Done** matches the mockup's structure on real data. **Partial** works, with a gap named. **Old** still draws the
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
  `ProductionWorkspace`, `MoneyDesk`, `HomeDesk`, `MakeDesk`, `ReceiveDelivery`, `MoneyEntry`). Do not add page logic to `ops-runtime.tsx`, which only wires them.
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
| events | `live/bazaar/event-list.tsx` | Done | |
| bazaar | `live/bazaar/event-page.tsx` | Done | Title, All events and Settings aligned; stats stay richer than the mockup |
| event-edit | `live/bazaar/event-form.tsx`, `store/event-entry.ts`, `scheduled-events-form.tsx` | Done | Adding is a page with Review, kept across reloads. Changing is under Bazaar settings |
| plan, plan-review | `live/bazaar/day-plan.tsx` | Partial | Title aligned; photo tiles stay. Saving goes straight from the plan, with no separate Review step |
| till | `live/bazaar/till.tsx`, `till-card.tsx` | Done | Owner sells inside the frame; Bazaar-only access stays till-only |
| classic-till | ported `bazaar-mode`, under the till bar | Done | Fallback only. Its screen is locked, so it keeps the ported look |
| receipt, void | `ReceiptPage`, `VoidPage` in `live/bazaar/till.tsx` | Done | Opened from Sales today. The engine records no void reason, so none is asked |
| close, close-review | `live/bazaar/close-form.tsx`, `day-review.tsx` | Done | Two columns on a wide screen; the count and drawer are on one page, with the recount question before closing |
| event-review | `live/bazaar/close-event-sheet.tsx` as a page | Done | |
| event-tools, event-tool-review | `TillPanelPage` in `live/bazaar/till-bar.tsx` | Partial | Pages now. No Review step: each entry can be removed from the same page |
| device-recovery | Selling device in `TillSettings`, `live/bazaar/till.tsx` | Done | No recovery export: sales wait in this browser until sent |
| bazaar-settings | Settings in `event-page.tsx`; `TillSettings` while selling | Done | |
| **Sell** | | | |
| sell | `live/sell/orders-live.tsx` | Done | |
| order | `live/sell/order-live.tsx` | Done | |
| payment-review | inside `order-live.tsx` | Done | Reconciliation stays at `payments-live.tsx` |
| order-action | `RefundLive`, `NoShowLive`, `SwapLive` in `live/settings-pages.tsx` | Done | |
| customers | `live/sell/customers-live.tsx`, `store/customer-desk.ts` | Done | |
| customer-detail, customer-message, contact-remove | `customers-live.tsx` | Done | Removal calls `anonymise_customer`. Not run against hosted data: test it on a test customer first |
| **Shop** | | | |
| shop | `live/sell/shop-live.tsx` | Done | |
| shop-status | `ShopStatusLive` | Done | |
| order-rules | `live/order-rules-form.tsx` | Done | Real fields differ from the mockup's sample fields |
| boxes | `live/order-extras-form.tsx` | Done | Flavours need migration 71 hosted |
| payment-methods, payment-method-edit | `live/payment-forms.tsx` | Done | Colours from the theme |
| shop-text | `live/payment-forms.tsx` | Done | Colours from the theme |
| shop-schedule | `ScheduleAndDrop` in `live/sell/shop-live.tsx`, `RulesLive` | Partial | Capacity, sold-out and past drops are together; the ordering week is on Rules |
| customer-shop, customer-checkout, customer-status | ported customer screens with live branches | Partial | Compare with the mockup |
| **Make** | | | |
| make | `live/recipes/products-live.tsx`, `store/make-desk.ts` | Done | |
| production | `live/production/production-live.tsx` | Done | Baked stock by product is on Inventory |
| production-entry, production-review | `production-start.tsx`, `production-focus-live.tsx` | Partial | Group entry exists; compare |
| recipe | `live/recipes/recipe-reader.tsx`, `flavour-page.tsx`, `lib/recipes/batch.ts` | Done | Cost and History stay together on the flavour page |
| recipe-edit, recipe-review | `live/recipes/recipe-editor.tsx` | Done | Each line has its type, kept on save. A new saved recipe for a product with none is not built |
| recipe-drafts | `live/recipe-drafts-form.tsx`, Needs recipe on Products | Done | Colours from the theme; the Needs recipe filter lists what has none |
| product-edit | `live/live-form-host.tsx` | Done | |
| new-product | `live/live-form-host.tsx`, page mode | Done | Same form as Edit product; the mockup has fewer fields |
| cost-edit, cost-review | `live/recipes/flavour-page.tsx`, bazaar `CostCard` | Partial | The recipe book cost has Review; the event cost card does not |
| make-settings | `useAreaSettings` area `make` | Done | Show inactive products is the All products filter |
| **Stock** | | | |
| stock | `live/stock/inventory-live.tsx` | Done | |
| item | `inventory-live.tsx` ItemPage | Done | |
| item-edit, new-item | `live/stock-items-form.tsx` | Done | Colours from the theme |
| receive, receive-review | `live/stock/stock-entry-live.tsx`, `store/stock-entries.ts` | Done | Delivery date is today: backdating needs a server decision. Paid may stay empty: cost stays pending |
| count, count-review | `live/stock/count-inventory.tsx` | Done | |
| adjust, adjust-review | `live/stock/stock-entry-live.tsx`, `store/stock-entries.ts` | Done | |
| shopping | `live/stock/grocery-live.tsx` | Done | Grouped by supplier, with the planned bake |
| bake-needs | `live/stock/bake-plan-live.tsx`, `store/bake-plan.ts` | Done | A note on this device: it records nothing. Prices count only for the same pack from a preferred supplier |
| suppliers, supplier, supplier-edit | `live/stock/suppliers-live.tsx`, `stock-suppliers-form.tsx` | Done | Colours from the theme; tools moved to Stock settings |
| purchase-prices | `live/stock/item-prices.tsx` | Done | Reached from the item and from Compare prices |
| supplier-price-edit | `live/stock-suppliers-form.tsx` from `item-prices.tsx` | Done | Codex's held editor, now applied. Refuses to save if the item or prices changed since it opened |
| stock-settings | `useAreaSettings` area `stock` | Done | Budget is in Make settings › Kitchen rules, on Rules |
| **Money** | | | |
| money | `live/money/money-live.tsx` | Done | |
| money-settings | `MoneySettings` | Done | |
| money-entry, money-review | `live/money/money-pages.tsx`, `store/money-entry.ts` | Done | Also Record owner draw |
| transaction | `TransactionLive` in `money-pages.tsx` | Done | |
| money-categories | `MoneyCategoriesLive` in page mode | Done | |
| book-rules | `RulesLive` in `live/settings-pages.tsx`, `books-form.tsx` | Done | Margin floor is not a rule the app has: not added |
| **Account** | | | |
| account | `live/account/account-live.tsx`, `settings-areas.tsx` | Done | Sign out stays on `SignOutControl`, drawn by the live gate |
| people, person-edit | `PeopleLive` in `live/settings-pages.tsx` | Partial | Lists people and access. Adding a person is not built: accounts are made outside the app |
| health | `HealthLive` | Done | |
| backups, restore-preview | health export | Partial | Real backups only; no local JSON restore as a service. `restore-preview` was not captured: it needs a chosen file |
| sign-out | `app/sign-out-control.tsx` | Done | Warns about unsent sales first |
| sign-in, account-help | `app/sign-in/sign-in-form.tsx` | Done | |
| record-unavailable | `RecordUnavailable` in `ui/owner-patterns.tsx` | Done | Used for an order that cannot be read |
| reset-preview | | Not a feature | Mockup tool: never reset real records |

## Also owed

- Realistic linked records in the 4186 preview for every section (see the owner references).
- Independent review of each money, offline, auth or SQL slice before it is committed.
- Hosted: migration 71, deploy, and the demo data all wait on Ethan's approval.
