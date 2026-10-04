# F2 owner controls and real data â€” 4 October 2026

Ethan requested owner editing of flavours/products, monthly menu, prices, recipes and
stocktake, and population from Cine's supplied files. This authorizes the bounded
real catalogue import into the existing approved private trial, superseding its
earlier test-data-only/import hold. The5October approval below separately authorizes
historical imports and private-target CI/CD. Shop opening, jobs, merge and production
launch remain outside scope.

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


## Historical financial import and CI/CD - 5 October continuation

Ethan explicitly approved historical sales, expenses and stock records, GitHub
publication and CI/CD, then excluded dummy data. The entire `[DUMMY VER]` workbook
is excluded; the previously hash-verified real workbook is the sole source here.
Ethan subsequently instructed us to assume blank sales dates inherit the preceding
explicit date and repeated identical lines represent separate genuine sales.

804 actual financial lines are applied:722 sales and82 dated stock-purchase costs.
Initial175 unambiguous sales/82 costs were independently accepted and applied; the
subsequently approved547-sale append uses deterministic source-row IDs and an exact
existing-ledger digest. Original257 rows are preserved exactly. Both stages have
rollback proofs, independent Luna acceptance, encrypted before snapshots and fresh
readback. Receipt costs carry durable audit mappings; future receipt imports must
link those costs rather than book them again. Actual PG17 rollback proof refuses
missing historical opening balances and duplicate links without double booking.

28 sales rows without valid amounts and8 incomplete receipts are held. Sales GForm
responses are not counted a second time. No newer expense/count source exists per
Ethan: the workbook's broken P&L expense formulas do not constitute expense entries.
Undated manual counts and stock-out units/opening balances are unresolved, so current
stock, stock movements, orders, menu prices and closed-shop state remain unchanged.
Current profit is only the available books; zero recent costs/100% margin must not
be interpreted as complete business profitability.

Visual inspection caught a genuine P&L defect: only Drops/Bazaar revenue was summed.
Live runtime now includes other revenue while retaining the same30-day filter,
refunds, draws and channel subtotals; it does not guess the historical channel.
Independent root money review found/fixed a35-versus30-day mismatch; regression covers
both10-day and31-day entries. Demo and protected engine/screens remain unchanged.
Fresh headless phone390x844/desktop1440x900 P&L captures are inspected. Actual UI CSV
contains804 rows and exact source/RPC totals; both displayed P&L totals reconcile
against the CSV's30-day subset. Real-device and owner-week acceptance remain open.

Private release helper checks the exact existing account/Worker/app/policy/OTP,
two approved-email hashes, eight-hour sessions, no bypass/routes/previews and Access
denial for app/P&L/actualJS/SW. Failed deployment/postcheck disables both Worker domains.
Read-only live preflight PASS. Trusted-branch CI requires every existing gate before
calling a same-commit reusable/manual release; original OFFLINE-01 is retained.
Two existing credentials and email hashes are configured securely in GitHub; a
separate Workers deployment token remains missing. CI run37217614536 failed the
inherited formatting check at642 files (54 protected); later jobs skipped. No green
CI/CD, main merge, production launch, business job or automatic runner is claimed.

Accepted code: e1f02fa release guard, c30e3bd P&L repair,77a0cb6 import compiler,
23bad2c reusable release and4dfad9b trusted CI caller. Full verify/precommit81 files/
1487 tests PASS. Private receipts: F2-history-Apply.json, F2-history-append-Apply.json,
F2-history-LinkProof.json, F2-history-append-acceptance.json, F2-history-browser.json.
Setup failures remain distinct: initial wrapper normalization, a PowerShell nested
here-string parse, DPAPI size limit repaired with encrypted chunks, Windows ESM URL
corrected before dry-run, and a SHA256-versus-SHA384 review-packet misunderstanding.
Initial weak UI oracle was rejected from actual zero screenshots; final totals are
independently reconciled against actual CSV/body captures. No such failure weakened
product assertions or OFFLINE-01. F2 incomplete; F3 closed.

Private P&L update is published manually under the existing trial approval:
frontendc30e3bd, Worker version772d4a7e-9fde-4e77-bb50-7d7d6f0e9739. Built committed
app bytes are unchanged in later tooling commits; actual target gate/anonymous denial
PASS before/after, canonical enabled, previews disabled, version-preview404, routes0.
This is separate from blocked automatic CI release. A legacy post-deploy readback
expected the previous version and failed; new-version read-only checks passed without
another deployment. Publication receipt: F2-history-private-publication.json.
Independent port acceptance confirms protected/demo fidelity and30-day calculations.
