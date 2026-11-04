# Visual review notes — supplied v4 reference

## Scope and current proof

The complete route inventory and captures are in ../reference-v4-page-contracts.md. All 85 route
views have desktop/phone screenshots. The render-situation matrix is not complete interaction coverage.
Detailed human/model visual review remains in progress. This note records actual inspected images;
do not promote every captured image to a reviewed or implemented page.

Inspected at full image size: make-baseline-1440.png, stock-baseline-1440.png,
money-baseline-1440.png and till-baseline-1440.png. These match the owner's supplied parent-page
screenshots. Also inspected the actual-app multi-product Review phone screenshot; its group planning
is implemented, while the full Make catalogue/detail layout is still pending.

## Observed visual organization

- Shared frame: a quiet, persistent left directory; thin top location/account bar; one strong page
  heading and short purpose line; primary action and Settings to the right. Content has generous white
  space and repeated border/radius treatments. On smaller screens retain location and primary actions
  while changing the arrangement. Remove the reference's DESIGN PREVIEW/Keeping changes tooling from
  real operator screens; saving status must come from actual acknowledgements.
- Make: Products/Production is section navigation. The separate Menu/All products/Needs recipe row
  filters the catalogue and hosts drafts/add-product actions. Three equal photo cards per desktop row
  give real images most of the upper area. Name, price/shop label and actual baked stock are grouped
  beneath; Recipe and Edit product have a separate aligned footer. Stock is contextual information on
  a product card, not a replacement for its recipe or pricing. A reusable ProductCard can serve both
  catalogue and till with distinct action/footer slots.
- Bazaar: title and event/day are separate from a wide connection/sending strip. The working area
  uses roughly 60% product grid / 40% Current sale. The empty sale still shows its purpose and a
  disabled Charge; adding cookies must create itemized rows and a total in that same panel. Recent
  sales and additional stock/loss/fees tools follow the main sale work. The actual till currently needs
  this reorganization and the permitted owner frame; retain focused/restricted offline/helper behavior.
- Stock: section navigation, primary daily actions and category filters have visibly different roles.
  A wide directory aligns names/pack information left and exact balance/status right. Unknown is
  written explicitly; not-counted is distinct from Low and In stock. Reuse one InventoryRow/Balance
  presentation across ingredients and packaging, with specialized dough/baked rows and direct actions.
- Money: period and transaction-kind controls share one row above the summary. Income, expenses
  and result remain readable through exact signed figures. The open-bazaar exclusion sits between
  the summary and source transactions. Rows align descriptions/date/category left and signed value
  right. Owner draw and export remain easy to find at the bottom. Preserve the actual app's useful
  charts and cost-completeness warnings as the full goal requires; do not replace them with a list alone.

## Approved adaptations and implementation boundaries

Keep neutral white/cool-gray surfaces, charcoal, restrained Happy Cookie orange, real assets/Onest,
selective glass and accessible motion. The reference's cream surfaces do not override that direction.
Use Shop label instead of Badge. Group Start production accepts several products at once, an explicit
owner correction to the reference's single-product entry. Planned quantities never become actual output.
Keep owner draws separate from operating expenses. Sample dates, totals and cost basis are examples;
actual figures and restrictions must come from the existing authoritative model/RPCs.
The reset-preview route and preview-situation selector are reference/testing utilities. They do not
become operator controls that reset real records. The real application needs the corresponding genuine
failure/recovery states, with existing authorization and acknowledgement boundaries.

Use reusable React views and controls plus focused domain classes/controllers. Preserve OpsRuntime,
ProductionWorkspace, recipe/stock/book services, source versions, permissions, tab leases and queued
sale acknowledgement rules. Do not transplant the reference's single sample-state object or calculations.
The new planner is separated into plan.ts, planner.ts, typed presentation props, a production-entry
component and a transactional workspace operation; continue that separation for the remaining families.

## Still required

Inspect remaining child pages and rendered states at useful sizes, exercise all main interactions and
validation/empty/loading/failed/conflict/unknown outcomes, and map every feature to actual components,
controller actions and tests. Then implement and verify the gaps. The capture gallery is an intermediate
reference tool, not the requested finished application. Hosted reconciliation, independent sensitive
reviews, additive demo insertion and physical-phone/owner acceptance remain separately required.
