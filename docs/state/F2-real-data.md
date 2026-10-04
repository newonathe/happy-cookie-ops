# F2 owner controls and real data — 4 October 2026

Ethan requested owner editing of flavours/products, monthly menu, prices, recipes and
stocktake, and population from Cine's supplied files. This authorizes the bounded
real catalogue import into the existing approved private trial, superseding its
earlier test-data-only/import hold. It does not authorize opening the shop, importing
historical sales, jobs, merge or production launch.

## Applied, independently accepted and read back

- Workbook SHA256 `c32c12fd8064092d06e9d2ad741a8b1fb50a1c3d2a887ada1e36b601b9eb52cb`:
  71 ingredient/packaging definitions,13 suppliers,eight compatible quotes. Box of6
  adds a72nd stock definition from the newly supplied packaging list.
- 26 library flavours/products,seven active October flavours at the newly confirmed
  prices. Others are off this month's menu; required ported IDs retained. All remain
  unpublished pending allergen confirmation; shop closed.
- Apple Pie version1: twelve new owner quantities match workbook lines; yield14 is
  supported by Costing Dashboard and fourteen separate packaging units. Packaging
  lines are excluded from dough to avoid deducting them twice.
- No historical orders/sales/expenses, stock movements or physical counts imported.
  Initial on-hand zero is uncounted, not a claim that Cine has no stock. Par zero is
  the unset default. Eggs/oats remain outside bought stock under C7.
- Unattributed master/package costs, uncertain aliases, differing packs/units and
  incomplete sticker row are held in the private preview. No fictitious supplier,
  purchase or cost conversion was created.

Sol independently accepted both exact plans. Hosted owner-RPC dry runs rolled back;
apply used source/hash guards, optimistic stamps, transaction checks, encrypted
before snapshots and fresh readback. No schema or protected-source change for import.

Private source/plans/receipts live outside Git at
`C:/Users/ethan/.codex/visualizations/2026/10/03/01a101cc-ce31-7cd1-be5b-65218afaa853`:
`F2-October-owner-input.md`, `F2-real-data-plan.json`, `F2-real-menu-plan.json`, their
independent acceptance and Apply receipts, `F2-real-data-visual.json`.

## Controls and verified repairs

Menu & flavours adds/edits cookie/set products, menu inclusion and explicit Publish.
Products provides price/recipe/menu controls. Recipes supports ingredients, yields
and versions. Inventory catalogue, Set to and Weekly count persist via owner RPCs.
Stickers/add-ons and sampler composition use existing configuration; generic product
types beyond cookie/set require a separate model decision.

Real-data visuals exposed zero/partial cost, false count age and blank direct
stocktake. Runtime now shows Cost pending until ingredient and packing costs match,
preserves confirmed zero quotes, labels uncounted/unmatched stock Opening count
pending and counts the loaded catalogue. Direct stocktake waits for owner inventory
and starts once; same-role auth rechecks preserve entered counts while actual role
changes still apply. Protected screens/engine and original OFFLINE-01 are unchanged.
Independent Luna review accepted after its unmatched-count finding was resolved.
Focused tests:42PASS. Final build/visual/full-verify/publication proof is in F2 evidence.

Final pinned verify passes78 files/1471 tests, including port, G0, typecheck and lint.
Root inspected all eight final phone/desktop screenshots: products, inventory,
Weekly count and Apple Pie recipe. Strict headless checks retain an entered17 across
same-role profile rechecks. These use a local static Worker against the hosted trial
database; they do not establish physical Safari or Cine's real-week acceptance.

Accepted code `73e556e04abe06f543bddc2344308121457bf1fc` is secret-scanned,
committed/pushed and rebuilt from the clean commit. Full precommit78/1471 PASS.
The existing private Worker was updated to `4ecc095c-960e-4036-937f-555e2358af4e`.
Exact-owner Access GETs pass before/after; canonical enabled, previews disabled and
routes empty. Anonymous login/P&L/actual JS/SW redirect to Access; new version URL404.
Both Access login viewports200 are inspected. No new resources/jobs or shop opening.
Prior human sign-in is retained; the updated app's human login is not an automated claim.

## Remaining facts and gates

Six recipes need current yields and measured solid teaspoon/pinch/piece weights.
Preserve components, optional cinnamon, extra PB & Miso sugar and exact ingredient
identities. Confirm allergens/cross-contact before publishing. Resolve held supplier
links/pack sizes and unattributed costs; packing still uses the known Box of6/Brand
sticker/Thank-you card rule pending its mapping decision. Do not claim final margins.
Cine must take a real opening count, confirm password custody and seven actual trial
dates, and accept the week. Physical iPhone Safari/Chrome and unchanged OFFLINE-01
must both pass by20October. F2 incomplete; F3 closed.

## Setup evidence retained

Wrong shop-table inspection400 was corrected to shop_state.override. An overwritten
before JSON was restored exactly from encrypted backup; Inspect now writes current
separately. DPAPI text needed newline trimming. Menu timestamp-JSON guard required
two evidence-led harness repairs, ending in typed timestamp PASS. Product RPCs were
unchanged. Initial browser assertions missed blank stocktake; visual review rejected
that claim and the final harness explicitly checks Weekly count and input retention.
The first source build caught type errors and a local Wrangler asset lock; both were
corrected before the final build. These are separate setup/product failure records.


## Editable source recipes - 4 October continuation

2026-10-04: saved editable source recipe drafts delivered. All seven October originals retain teaspoons/pinches/components/optional notes; batch14 is editable, six provisional and Apple verified. New052 owner-only table/two RPCs applied to existing private trial;53 migrations/38 RLS tables/browser MAINTAIN0. Verify/full precommit79/1474; role1945x2/684 regressions/cleanupPASS. Independent backend/source-plan ACCEPT and root frontend review; four headless phone/desktop captures inspected, live save/reload/revertPASS and exact production/stock/ledger cleanupPASS. Code61d3e8e/72d7d17 pushed; private versionb29a55bc. Fresh owner gate/anonymous app-assets denial/preview404PASS. F2 incomplete/F3 closed; actual-phone/OFFLINE-01 dualPASS by20October remains.

See [F2-recipe-drafts.md](F2-recipe-drafts.md). Original text and batch sizes are
available for editing now; missing measured quantities concern production/costing.
