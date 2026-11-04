# Owner screenshot requirements — 4 November 2026

These requirements extend the full actual-application goal. The supplied screenshots are the owner's
layout/feature references. Implement in the live app beside the protected demo. Keep the latest
neutral-light Happy Cookie theme, Onest and real assets; older cream surfaces in these images do not
override the owner's rejection of a cream theme. Preserve every existing capability and safeguard.

Private reference images are saved under the visualization root in `owner-screen-references-2026-11-04/`.
Local agents can inspect them with an image tool. Agents elsewhere need those files supplied separately.
The references are requirements, not screenshots proving current implementation.

## Bazaar

Use `bazaar-layout.png`: persistent owner navigation, Bazaar header, clear “Sell at the bazaar” title,
event/day beneath, Close day and Settings at the top, full-width truthful connection/sending strip.
Wide layout: three-column photo product grid on the left and a larger itemized Current sale panel
on the right. Each card shows name, table stock, price and selected quantity/Add. The sale lists selected
products with their actual selling price and minus/count/plus controls, exact total and dominant
Charge amount. Retain Freebie, fees, added stock, receipts/corrections and classic fallback access.
Use genuine pending/failed/sync states; Online alone does not prove all sales sent.
Events remains the first Bazaar destination; compact Back from selling returns without ending the day
or clearing its sale. Preserve restricted/helper/offline selling boundaries.
Adapt the same hierarchy to tablet/phone: reachable cart and Charge, readable product cards, no overflow.

## Make

Use `make-01-products.png` through `make-06-add-product.png`:

- Primary section navigation: Products and Production. Clear page heading, Start production, Settings.
- Product filters: Menu, All products, Needs recipe. Recipe drafts and Add product are explicit actions.
- Photo cards show name, price, optional shop label and authoritative baked stock. Recipe and Edit
  product remain directly reachable. Unknown stock is not zero.
- Product recipe detail has photo/name, current version/yield, Recipe/Cost/History views and Edit recipe.
  Recipe view groups Ingredients and Packaging, supports practical quantity scaling and preparation
  checkboxes; checking an ingredient does not record a stock movement. Stock for this batch shows
  truthful available/unmeasured/short states and direct Count. Preserve draft and return context.
- History lists real versions with Read version. Cost uses authoritative cost completeness and sources.
- Recipe drafts stay separate from the saved recipe. Needs a recipe lists products with Start recipe.
- Add product starts with name/price/optional Shop label. Recipe and menu visibility remain separate;
  new products stay off-menu until ready. Preserve supported identity/photo/advanced controls.

### Start production — clarified simultaneous planning

The owner explicitly requires selecting and planning **several products in one Start production flow**.
Retaining separate batches after starting products one at a time does not satisfy this requirement.
Show a multi-product selection list, per-product quantities and recipe version, then review the complete
plan together. Carry known order needs while allowing manual planning. Create independent work items
together, preserving each product/source/period/count/note and save identity. Dough portions retain
their full/half-yield validity. Support continuing any item while others remain active or save.
Planning creates no actual stock or production RPC. Actual counts/rejects are confirmed per item.
Keep scoped durable recovery, whole-plan validation, tab lease, stale callbacks and uncertain requests.
Storage/source failure must not silently create a partial group or erase selections.

## Money

Use `money-01-overview.png` through `money-07-owner-draw.png`:

- One period and All/Income/Expenses transaction filter above clear signed Income, Expenses and Result.
  Keep practical charts requested in the full goal, exact figures, readable legends and missing-cost flags.
- Readable transaction directory: description, date/category and signed amount; show finalized/open
  Bazaar inclusion honestly. Totals/list/export use the same period and actual books basis.
- Record expense, Record owner draw and Export this period are directly reachable.
- Money settings group currency/bazaar posting information, recipe costs and Manage books: Book rules,
  Expense categories, Owner draws and Export. Recipe cost rows offer View cost or direct product setup
  when missing; unknown cost never becomes a fabricated figure.
- Book rules expose supported tax reserve/margin-floor settings, show the actual current cost basis,
  and preserve explicit owner review/opening-count requirements for any cost cutover. Editing display
  settings never changes the basis. Example values/basis in the screenshots are not new business rules.
- Expense categories have a clear existing-category directory and Add category. Keep owner movements
  distinct from operating expenses even where the reference groups them under financial tools.
- Owner draw: description, actual amount/date, supported category, note/reference; Back, Review and
  acknowledged Save. Refunds/draws retain their authoritative classification and permission checks.

## Populate all sections

Populate Sell, Make, Stock, Money and related sections with realistic connected demo records so the
owner can try whole workflows: customers/orders/payment states, products/current and past recipes,
drafts/missing recipes, parallel production/dough/results, ingredients/packaging/stock movements,
suppliers/quotes, expenses/income/refunds/draws and events/days. Use linked and consistent quantities,
units, prices and dates; include low/out/unmeasured and incomplete-cost examples. Preserve real records.
The existing hosted demo-data insertion is authorized but still requires the independent SQL review.
Private preview fixtures must remain clearly distinguished from hosted execution evidence.

## Stock

Use `stock-01-inventory.png` through `stock-08-prices.png`: Inventory/Shopping/Suppliers section
navigation; prominent Add to inventory and Settings; direct Receive delivery and Count stock.
Inventory categories are Ingredients, Packaging, Dough and Baked stock, with grouped readable rows,
exact balance/unit, pack size and Low/In stock/Unknown/Not counted labels. Preserve measured zero.
Dough shows actual portions/readiness and direct Bake; zero/unavailable stock cannot enable a fake bake.
Baked stock shows actual kitchen counts and a direct selected-product Recipe action.
Shopping shows the selected planned bake and known purchase total, grouped by supplier; each item
shows need/have/buy-packs/known cost, Compare prices, View supplier and Receive delivery. Editing the
planned bake retains the shopping return context. Quotes/plans never become confirmed deliveries/costs.
Suppliers are a vertical directory with Add supplier and direct Open. Item price comparison shows
compatible pack/unit costs, Use supplier and genuine price history. Selecting a supplier carries the
quote into receiving while retaining a separate actual-paid amount. Do not invent pack equivalence.

## Full supplied HTML inspection — owner clarification

The owner explicitly requests visual analysis and screenshots of **each page, each flow, each explicit
page state, every feature, organization and design** in `C:/Users/ethan/Downloads/happy-cookie-workflows-refined.html`.
The verified file is 883,527 bytes, SHA256 `fad61841ac098a9cb5431e382b9703589b8fc9947fe29ee0eef0476e80646aae`.
Inventory its actual routes and state branches, exercise its controls in CLI headless Playwright, capture
the rendered states and map each to an implementation/component and verification/remaining gap.
An initial screenshot batch or the old 59-page plan does not prove this new full reference inspection.
Keep the complete scope in Claude-readable source documents. Integrate into the real app, preserving
all capabilities; do not stop at a screenshot gallery or another mockup. Use reusable React components,
clear interfaces and existing domain/runtime classes for state and business rules. Avoid page-sized
copy-paste implementations or a second calculation/state engine copied from the sample mockup.

## Current implementation boundary

Read current.md, next-goal.md and claude-ui-handoff.md for code/evidence. Recipe writer follow-up and
multi-product entry are local work in progress; no screenshot-matching claim is made by this document.
The entire Make/Bazaar/Money layout and all-section population remain required. Do not drop these
while finishing one slice. Do not replace implementation with another mockup or repeat a broad audit.
