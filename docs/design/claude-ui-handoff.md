# Claude continuation: the actual owner-facing interface

Updated 4 November 2026. Ethan requested this shared handoff while Codex fixes the four audit findings.
The complete application goal remains active. UI/UX is the immediate focus; this file does not reduce
the scope to Home, Money or Shop. Read AGENTS.md, current.md and next-goal.md before starting work.

## Current work and how to detect it

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
- Codex is the sole writer while Claude is usage-limited. Do not overwrite or revert its uncommitted fixes.
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
P3 must also reconcile a known-completed request left in an old projection: show its existing result,
rather than leave it looking like new unsaved work when recipes are missing. Keep another editor intact.
Acknowledgement toasts should identify their product when a different work item's form is open.
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
