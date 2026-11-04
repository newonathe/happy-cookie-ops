# Claude continuation: the actual owner-facing interface

Updated 4 November 2026. Ethan requested this shared handoff while Codex continues the actual application.
The complete application goal remains active. UI/UX is the immediate focus; this file does not reduce
the scope to Home, Money or Shop. Read AGENTS.md, current.md and next-goal.md before starting work.

## Current work and how to detect it

- **Status, 4 November, late night:** Claude finished Codex's retained Add event work (`store/event-entry.ts`,
  page in `live/bazaar/event-form.tsx`), with its three review findings fixed. Also added: event page title and
  Bazaar settings, day review in two columns, customer list and detail (`store/customer-desk.ts`), the product
  form as a page, and theme tokens in the owner forms. Remaining rows are in coverage. Customer removal has
  not been run against hosted data. `anonymise_customer` keeps payment proofs and matches only numbers stored
  in the normal form; changing either needs a new migration and Ethan's decision.

- **Isolated Codex follow-up:** read [performance follow-up](performance-followup-2026-11-04.md).
  Based on d21d302; display-format reuse and truthful recipe stock coverage are prepared on
  `codex/render-performance-followup`, outside Claude's checkout. Do not assume they are integrated.
  Optimized decc2c4 build is measured at3001; updated Events directory is on HMR preview4188/bazaar.
  Add-event page conversion needs a retained draft/request controller first; the sheet remains.

- **Ownership resolved:** Ethan confirmed Claude paused/finished. Codex fast-forwarded the working
  branch to8d4cc81 without hosted changes. Retained event-entry work now happens in the primary repo;
  3000 and4186 use the integrated source. The earlier isolation notes describe history.
  The new prerequisite `lib/bazaar/event-entry-recovery.ts` retains scoped drafts and normalized
  create-event RPC arguments, with a checked device write and the existing lock helper.13 focused
  tests pass; independent review's raw-input finding is fixed and re-review has no findings.
  It is not wired yet. Next build the retained controller and page: verified identity, lock held
  through restore/write/send, stored-payload retry, matching server readback before resolving,
  actor/generation guards and navigation retention. Do not claim the sheet has been replaced.
  The protocol is accepted at9022ff4 (182files/2968tests+2TODOs, including its commit hook).
  A separate actual-UI probe reproduced a cancelled save reply closing a newer Add event opening
  and resetting its filter. The new EventList opening token/mounted checks fence close, save,
  filter and deferred focus callbacks.51 focused UI/runtime tests pass; independent review has
  no findings. Eight width/motion browser runs check the newer draft/focus survives. The retained
  controller/page and server-confirmed recovery remain unfinished; this guard does not replace them.

- **Status, 4 November, night: read [coverage](reference-v4/coverage.md) first.** It lists all 85 mockup
  routes with their place in the app, status and gap, and how to build (kit, classes with injected
  dependencies, slots). Update it in the same commit as a page. [flows](reference-v4/flows.md) is generated from
  a crawl of every control. Private: `mockup-page-state-audit/flows.json`, `flows/*.png`. New classes:
  `store/home-desk.ts`, `money-desk.ts`, `money-entry.ts`, `make-desk.ts`, `stock-entries.ts`. Shared:
  `ui/owner-patterns.tsx`, `live/account/settings-areas.tsx`, `live/settings-pages.tsx`. Open a page from a sheet through
  `pageFormOf` in `owner-workspace.tsx`. The 4186 preview needs `/bazaar` for events; a selling till needs
  a state injected from a script (`stage: 'selling'`, `dayId`), since a day cannot start there.

- **Status, 4 November evening:** everything below marked uncommitted or awaiting review has passed
  independent Sonnet review and is committed; the two Medium recovery findings are fixed. The hold on
  the hosted demo-data SQL still stands, and hosted apply of migration 71 needs Ethan's approval.

- **Latest verified source + reference inventory:** full gate176files/2886tests+2existingTODOs, live
  build28pages, eight 320/390/768/1240 normal/reduced-motion group-entry runs pass. Reference catalogue:
  [index](reference-v4-page-contracts.md), split family contracts under `reference-v4/`, and
  [visual notes](reference-v4/visual-review-notes.md). All85 source routes have desktop/phone captures;
  1190 built-in situation renders have no failures and190 distinct images. Four parent-page checks
  produce identical pixels against untouched source. This is capture/initial review evidence, not full
  interaction coverage or actual-app parity. 404/723 source conditions were reached;85 observed both
  outcomes. Remaining control/validation/save/return branches and child-page visual review are explicit.
  Gallery: `http://localhost:4190/index.html`, served from private `mockup-page-state-audit/`.
  Actual-component preview: `http://localhost:4186/`; hosted-record source:3000, read-only verification.
  Do not overwrite older frozen review packets with today's changes. Keep all independent review holds.
- **Newest explicit scope:** read [owner screen references](owner-screen-references-2026-11-04.md).
  All supplied screenshots came from the downloaded v4 HTML. Ethan now requests its complete rendered
  page/flow/state/feature inspection, screenshots and integration into the actual modular app. Record
  exact coverage and remaining states; do not treat old audit numbers or the image batch as completion.
  The reference and screenshot requirements cover Bazaar, Make, Stock, Money and populated other tabs.
  Existing neutral theme, business rules and review boundaries remain. React components/interfaces
  and focused domain classes are the implementation direction; no copied sample calculation engine.
- Multi-product entry is now a local implementation: `production-plan-entry.tsx`/CSS, `plan.ts`,
  `planner.ts`, production start/types, recovery schema, workspace transaction, runtime and tests.
  Several products/quantities can be selected together, reviewed and added as independent work items.
  Recipe/source/period guards, whole-plan storage rollback and scoped reload are retained. Plans never
  post actual production. 41 focused tests and the latest full gate/build/browser runs above pass.
  This fixes group entry; the entire screenshot-matched Products/Recipe/Cost/History/Stock/Money
  interface is still required. Private preview now has six synthetic recipes, twelve stock items and
  four suppliers; richer all-section population and hosted insertion are not claimed complete.
- **Latest steering, 4 November:** match the supplied Bazaar screenshot's organization: owner frame,
  “Sell at the bazaar” heading with event/day, Close day and Settings, full-width connection status,
  three-column product cards left and itemized Current sale right with quantity steppers, total and
  Charge amount. Preserve the current neutral-light theme; adapt the hierarchy to smaller widths.
  Events-first and a compact Back path remain required. Populate Sell/Make/Stock/Money and other tabs
  with realistic linked demo records so complete workflows can be tried. Existing hosted demo insertion
  is authorized but still gated on its required SQL review; preview fixtures are not hosted evidence.
- **Recipe writer prerequisite is an uncommitted local draft.** Files: `src/lib/data/recipes.ts`,
  `src/store/ops-runtime.tsx`, `src/lib/orders/staff-copy.ts`, `tests/unit/recipes.test.ts` and
  `tests/unit/ops-runtime-recipes.test.tsx`. Editable/base/history rows retain line kind in an optional
  fourth tuple slot; existing engine edit/add/remove operations preserve it. Outbound RPCs retain kind,
  with unknown explicit kind refused. Same-product double taps are ignored; role/identity-stale replies
  do not apply. Reads preserve edits made during save/readback. A usable acknowledgement supplies the
  complete submitted recipe after failed refresh, including a new recipe; stale cached quantities
  are not relabeled with its version. Empty acknowledgement is unconfirmed and keeps edits.
  76 focused tests and the latest full gate/build pass. Do not remove the legacy
  warning or imply the direct missing-recipe setup has been implemented. SQL/protected screens unchanged.
- **Newest P3 work is locally verified, uncommitted and awaiting review.** This overrides older in-memory-only
  descriptions below. Files: `src/lib/production/recovery.ts`, `recovery-session.ts`, `workspace.ts`,
  runtime/types, `src/lib/auth/live-gate.ts`, `src/components/app/live-gate.tsx`, production recovery
  notices/forms/receipts, plus recovery/pool/gate/UI tests and `production-runtime-helpers.ts`.
  Device copies are keyed to server-verified owner UID and configured backend origin. No role/email
  fallback, SQL change or automatic posting. Web Locks enforce one writer; another tab can view and
  retry after the first closes. Invalid bytes remain untouched. A new RPC waits for checked storage;
  exact unanswered requests keep their ID/body/time. Same-user verification preserves work. Account
  changes clear projections; a late reply belongs only to its original owner, leaving the new owner's
  work intact. Recently saved receipts restore with stock explicitly unchecked. Unsubmitted setup,
  raw invalid counts, notes, step and source snapshots persist. Full `pnpm verify` passes: 175 files,
  2,873 tests + 2 existing TODOs. Eight normal/reduced-motion browser flows at 320/390/768/1240 pass,
  with zero captured errors/overflow. Phone/desktop screenshots inspected. Live build passes 28 pages;
  independent auth/offline/Money review remains pending. No protected port or applied SQL changed.
  Local review packet: private `gap-refinement/pending-review/production-device-recovery/parts.json`
  and README; ordered patches, each ≤400 changed lines, replay to the changed P3 files.
  It depends on the nine prior patches listed there. Real Git index is untouched; secret-pattern scan
  is clear. This export is review preparation, not acceptance or a commit.
  Inspect `git status --short`, `git diff` **and untracked files**. Do not reset to HEAD or restore an
  old patch over these changes. Start with this newest block, then use history below for context.
- Starting accepted HEAD: `52292e3`, branch `codex/refined-workflows`. Inspect current Git state first.
- Latest local source guard: runtime no longer captures an engine placeholder as a saved recipe.
  Batch/dough forms keep drafts, hide unverified ingredient/portion claims and offer Retry saved recipe;
  when the selected saved source arrives, Use saved recipe explicitly adopts it before review.
  Cached verified sources remain usable after a failed refresh. Confirmation compares saved source
  version/yield/lines/units/kind as well as the screen projection; exact unanswered requests still
  check their original body/ID/time. Unconfirmed dough remains discardable. 96 focused tests and 8
  responsive/motion flows pass, no errors/overflow. Full gate: 173 files / 2,854 tests + 2 existing TODOs
  passes; live Webpack build passes 28 pages. No RPC/SQL change or review bypass.
  Files: runtime/types, `production-focus-live.tsx`, `production-dough.tsx`, `production-recipe-update.tsx`,
  receipts/results formatting and corresponding production tests. Small fractional shortages remain
  visible; same-day ranges show one date; the failed-history banner now names history explicitly.
- Newest local slice: `production-receipts.tsx` and its new unit test, `production-live.tsx`,
  `results.module.css`, `live-production-types.ts`, runtime and production regressions. Each saved
  batch/dough item shows original drop/version/time, actual quantities, server shortages/used dough,
  and a separately checked recorded stock balance/time. Failed reads preserve Saved; Retry only reads
  the original drop. Older receipts collapse. Replayed acknowledgements explicitly say no second entry.
  Engine-derived shortage toasts are replaced with the acknowledged shortage outcome. 57 focused
  tests and 8 final responsive/motion flows pass (zero errors/overflow/duplicate writes). Full gate:
  173 files / 2,843 tests + 2 existing TODOs passes; live build passes 28 pages. Receipts are in-memory, not durable
  recovery. Positive ingredient-use details, source-unavailable handling and P3 remain incomplete.
- Claude holds the checkout since 4 November, 4:41 PM (Ethan). Codex's listed work is reviewed and committed.
- Four fixes are implemented locally: signed Money bars; retained add-on message drafts; direct Home
  receiving/counting; choice inputs matching the existing 20-character limit. These are uncommitted;
  required independent review remains pending. A screenshot alone is not proof of complete functionality.
- UI: `src/components/live/money/money-live.tsx`, `src/components/live/home/home-live.tsx`,
  `src/components/live/order-extras-form.tsx`, `src/components/ui/owner-kit.tsx`.
- Navigation/model: `src/store/ops-runtime.tsx`, `src/view-models/vals.ts`.
- Regressions: `order-extras.test.tsx`, `ops-runtime-home-live.test.tsx`, `ops-runtime-money-live.test.tsx`
  in `tests/unit`. The original audit reproduced disappearing message labels and hidden negative bars.
- Source checks initially reproduced five failures; focused61tests and eight width/motion browser flows
  pass. Final exact-source gate:172files/2828tests pass +2existing todo. Live Webpack build28pages passes.
- Production history correction is now a separate local slice: `production-results.tsx` displays
  made = good + rejects; SQL58's returned good output is not reduced again. High/all-reject rows stay
  valid. History says “Recent history · all drops” and gives real dates; selected-drop planning waits
  for its own read. 65 focused tests / 4 files and 8 responsive state flows pass. Full gate: 172 files,
  2,834 tests pass and 2 existing TODOs; live Webpack build passes 28 pages. Full application incomplete.
- Its other changed files are `src/lib/data/production.ts`, `src/store/ops-runtime.tsx`,
  `tests/unit/production-results.test.tsx` and `tests/unit/ops-runtime-production.test.tsx`.
  The returned batch quantity means good output; the separately returned baked-stock map is scoped to
  the requested drop. Do not silently reinterpret either contract or change historical records.
- Private fixture `gap-refinement/app-qa/entry.tsx` now uses the same good-output convention. This is
  synthetic test data, not hosted demo data. The tracked Git diff plus this note covers the current work;
  review both tracked changes and the untracked handoff before resuming.
- Open the rendered examples with your image tool, not just the source: private root
  `C:/Users/ethan/.codex/visualizations/2026/10/23/01a168b8-98ab-7872-9ec3-90530179bab5/gap-refinement/`,
  `review-fixes-money-chart-390.png`, `review-fixes-money-1240.png`, `review-fixes-count-390.png`,
  `production-history-contract-390.png`, `production-history-contract-1240.png`.
  Current receipt views: `production-receipts-390.png`, `production-receipts-1240.png`, final runs inspected.
  Source-recovery views: `source-unavailable-batch-{390,1240}.png`,
  `source-unavailable-dough-{390,1240}.png`; settled phone and desktop screenshots inspected.
  New recovery views: `production-p3-workspace-{390,1240}.png`,
  `production-p3-saved-{390,1240}.png`, `production-p3-device-copy-{390,1240}.png`.
  The first shows two distinct work rows after reload; the second shows an acknowledged result with
  stock unchecked; the third shows retained Review and Retry device copy with confirmation disabled.
  Browser details: `production-p3-browser-checks.json`; full gate: `production-p3-final-verify.log`.
  Live build: `production-p3-final-build.log` (exit0, 28 pages); exact-source final browser run:
  `production-p3-browser-frozen.log` (exit0). Existing middleware/Sentry build warnings remain.
  These are synthetic local examples; remote agents need the images supplied separately.
- Draft/retry identity, multiple production items and Events-first navigation already exist. Check Git
  before rebuilding them; old paragraphs in state files may describe earlier uncommitted checkpoints.

## Copy-paste continuation prompt

Continue the actual Happy Cookie application, concentrating on the interface the owner sees and uses.
Read the shared entry documents, `docs/design/owner-workflow-brief.md`, `docs/design/refined-workflows.md`,
this handoff and `docs/design/capability-ledger.md`; inspect the
current implementation and Git diff before changing anything. Preserve all completed work and the
entire original goal. Resolve conflicting historical status against current source and verified evidence.

Use `C:/Users/ethan/Downloads/happy-cookie-workflows-refined.html` as the principal organization and
workflow reference. This v4 received positive cleanliness feedback; it is not proof of complete functionality.
Keep the original prototype/real assets and hosted feature map as additional references. The latest
neutral white/cool gray, charcoal, restrained Happy Cookie orange, Onest, real logo/photos and selective
glass direction wins over older cream colors. Extend the reference to missing screens and states.

Think as the owner standing in front of the rendered app. For each page and child flow, answer:
What is this page for? What needs attention? What can I do next? What will happen after I click?
Where do I return? Which information should already be filled in? What remains uncertain?
Then implement that experience. Do not finish with another mockup-only deliverable or a planning-only reset.

### Work from the visible screen, not just the component names

1. Inspect the actual rendered page at phone, tablet and desktop widths. Compare its relevant v4 screen
   using matching content; sample records alone can hide long labels, losses, empty lists and failures.
2. Check the first viewport: clear heading/purpose, one dominant action or figure, a useful status and
   supporting detail. Avoid equal-weight cards everywhere, duplicate tabs, repeated Back controls and
   settings blocking daily work. Use the six main destinations consistently.
3. Click the complete flow, including Back, Cancel and Save. Check the destination, selected record,
   period/filter, scroll/focus, unfinished inputs and late replies. A new page wrapper alone is insufficient.
4. Carry known product/item/supplier/recipe/version/unit/period/origin automatically. Ask for the new
   physical quantity, actual payment or meaningful exception. Never infer actual stock/payment from plans.
5. Use a chart when it answers a business question. Keep exact amounts, units, dates, legends and source
   completeness visible. Do not add decorative graphs, forecasts, maps or an enterprise planning board.
6. Verify applicable normal, loading, empty, failed, offline, stale/conflict and uncertain-save states.
   A failed read needs an honest explanation and usable recovery; unknown is not a confirmed zero.
7. Verify keyboard/touch, readable contrast, reduced motion/transparency and no horizontal overflow.
   Use CLI headless Playwright under the current stability rules; preserve the normal Chrome preview.

### Concrete front-facing examples and acceptance checks

**Home:** Put actual work first: payments to check, orders to prepare, ready pickups, unfinished batches
and stock needing attention. Show available figures with purposeful emphasis; flag incomplete costs.
“Receive delivery” must open receiving with an item picker, rather than stop at a directory. “Count
stock” must enter/resume the existing count, preserving measured zero and pending identity. Opening
either records nothing. Empty/unavailable inventory must explain the next useful action.

**Money:** Keep a clear period above the important Income, Expenses and Profit/Loss figures. The chart,
transactions and selected-period export must agree. Keep draws separate from expenses and missing
costs visible. Example: a refund-heavy day with −₱200 income needs a visible red bar below a labeled
zero line and an exact signed amount; it must not look identical to a day with no activity. Positive
income remains green above zero; spending is red below zero, matching its signed amount. Reversed
expenses appear green above zero. Show useful amounts without requiring the owner to interpret formulas.
Keep configuration in Money settings. Do not change the accounting basis or stock-cost rules for styling.

**Shop settings:** Use plain groups, saved sizes, visible add-on rows and optional choices/messages.
Example: type “Recipient name”, switch the message option off, then on: the text must still be there
until deliberately changed/cancelled. Choices must obey the same 20-character limit at entry and save.
Keep hidden saved limits and historical orders intact. Info controls must work on tap and keyboard.
Check the customer-facing sampler description against the saved configuration and supported order flow.

**Make:** Products lead directly to the selected saved recipe. Production entry/review/confirmation/
result must be distinct. Keep different or identical batches/dough mixes independent. Acknowledging
batch A must preserve B's editor. Explain source changes before adopting a recipe. Show made/good/
reject quantities and authoritative stock honestly. Preserve the corrected saved-results arithmetic:
24 good + 2 rejects means 26 baked. Keep unavailable, unknown-save and refresh-failed results distinct.
History covers all drops; its “Saved batch plans” bars use those same batches' original targets.
The current order plan is separately labeled with its drop. The previous handoff incorrectly described
the history bars as selected-drop targets; fresh source/SQL58 inspection corrected that description.
Keep these scopes distinct. A saved result and a successful subsequent stock read are separate facts.
`productionWorkMetadata` no longer falls back to engine recipes. Missing saved sources retain drafts
and have a retry/adoption path; the exact unanswered request remains checkable. Canonical comparison
also checks line kind. Keep the verified cache usable without claiming it was refreshed successfully.
The source guard and fraction/date/history wording fixes are local, gate/browser checks passed;
live build passes 28 pages; required review remains pending.
Dirty recipe-editor versus production-projection conflicts and positive ingredient-use detail still
need careful reconciliation alongside the separate recipe-write problem; do not overwrite drafts.
P3 now clears only the acknowledged work's old projection and identifies product/batch in its toast;
another open editor remains intact. Verify these paths alongside durable recovery before accepting it.
From the rendered interface, use this exact walkthrough:

1. Make → Start production → Double Chocolate Fudge → 24 planned → Continue. Enter 26 made,
   2 rejects, and note “Keep tray A”. Review it; a lost reply must say Save result not confirmed.
2. Leave for now, start a different product, then leave again. Make must show two distinct work rows
   with product, Batch/Mix number and status; no row silently replaces the first.
3. Reload. Both rows remain; no write fires. Continue the first: return to its retained Review with
   26 made / 24 good / 2 rejects. Check saved result sends the **original** request, never a new batch.
4. Open the same work in another tab: show read-only and a plain recovery message. Counts, recipe
   adoption, confirmation and discard cannot change it there. Close the writing tab; Retry production
   work must reread the latest device copy before enabling edits/checks.
5. A confirmed reply removes only its row and adds its receipt. Reload: “Saved earlier. Stock has not
   been checked.” Check recorded stock is read-only for the original drop; it cannot record again.
6. Block device storage: preserve inputs, show Retry device copy, submit nothing new. Going offline
   keeps the draft and says Connect to record production. Do not claim unsaved edits survived reload.
7. Switch verified accounts during a save: the new owner sees only their own work. A late old reply
   cannot replace their editor. Return to the first owner to reconcile that saved result, without posting.

The batch note is a device draft, not a new database-history field. These are local recovery semantics;
do not label them cross-device sync or promise browser data survives clearing site storage.
For a confirmed missing recipe, finish a direct selected-product recipe setup path; Retry alone is
useful for a failed read but cannot create a recipe. Retain the production draft and its return context.

**Stock:** Show actual balance/unit and actionable Low/Out/unknown states. Receiving, Count, waste and
item definition editing are different actions. Reuse known packs/suppliers, preserve compatible units,
and keep quotes separate from actual paid costs. Blank count means unmeasured; explicit 0 means zero.
Back must preserve the originating item/filter and unfinished work. Never clear unacknowledged records.

**Bazaar/Sell/Account:** Bazaar opens Events first, with explicit Resume selling. Till Back returns to
Events while retaining the held day/cart/prices/drawer/queue. Keep close-day and finalize-event distinct.
Orders keep actual statuses/payment/refund/contact actions; Customers/Waitlist keeps both functions.
Keep all settings, access/session, notifications, exports/backups and recovery reachable after consolidation.

### Evidence, review and handoff

Work in coherent diffs below the repository limit. Reuse existing live slots and authoritative actions;
coordinate file ownership before editing shared runtime files when another agent is working.
Protected port files and applied migrations remain protected. Do not copy the mockup's sample engine.
Use meaningful regressions and actual responsive interactions. Run the pinned Node24.20.0/pnpm9.12.3
toolchain. Run build and `pnpm verify` sequentially: concurrent generated `.next/types` changes can race.
Keep local fixtures/headless checks separate from SQL, hosted, physical-phone and owner acceptance.

Preserve independent-review requirements. Claude is limited; do not bypass quotas/accounts/providers
or claim self-review is independent. Keep review-sensitive work explicit until required review is available.
The localhost3000 preview uses hosted records: inspect it read-only. Exercise mutations with isolated
local fixtures. Hosted data changes, deployment, main merge and cost cutover require separate authority.

After each slice update the capability ledger, current/next and this handoff with actual files, visible
before/after behavior, verification and remaining gaps. Keep the59-page/238-branch/224-automation map
as planned coverage. After implementation, perform the requested final researched review of every
page/flow/state and reconcile original, client HTML, actual source and then-current hosted capabilities.
Never mark the whole goal complete merely because a small slice, screenshot or test suite passes.

For each next page, report a concrete visible outcome. Example: “From Home, Receive delivery opens the
receiving form; choose Flour, enter two 1 kg packs and the actual amount paid, review, then save. The
acknowledged result shows the recorded quantity; a failed stock refresh says so and offers Retry.”
Name the actual source of each shown number and test the failure path. Do not label this example as
implemented until that full interaction is verified. Keep the correction, files, checks and unresolved
states in the shared handoff so another agent can continue without access to this chat.
