# Current-state history — Happy Cookie Ops

Earlier checkpoints, verbatim and newest first. Nothing here is current: the short status
is in [current.md](current.md). Sections were moved here from `current.md` on 2026-09-28 and
again, with the earlier goals from `next-goal.md`, on 2026-10-05, and again on 2026-10-06. Add nothing here by hand;
move a checkpoint here when it leaves `current.md`.

# Moved from current.md on 2026-10-15

Two "Waiting on Ethan" items, verbatim, done on 14 October (run sheet rows 5, 6 and 10).

- A1 is built (the release check takes two to six addresses; Cine is not added yet). Add her
  two addresses to Cloudflare Access and the approved-digest variable in one sitting, or the
  next deploy fails. Set the session to one week: that deploy then fails once and prints the
  value; put it in `ALLOWED_SESSION_DURATIONS`, push, then invite her.
- **Display names.** From this deploy the app greets each person, and records each bazaar
  sale, under their profile's `display_name`. No form edits it yet (C6). Check yours, Cine's
  and each helper's before 20 October: Supabase dashboard, Table editor, `profiles`, or say
  the word and it is done through the connector. The trial's profiles were not read.

# Moved from current.md on 2026-10-14

The migration 68 release paragraph of "Where things stand", verbatim (superseded by the S3.1 release).

**Release, 14 October (at Ethan's word):** migration 68 applied to the trial from a scratch folder (dry run first: only
that file); the trial is at 68 of 68. Schema fingerprint equal to local (columns, policies, row security, table grants,
functions), apart from Postgres 17 quoting `json_value` in three settings functions and the platform's `rls_auto_enable`.
PR #21 merged into the working branch at `de78fdc`. Its release could not upload its build (the account's artifact
storage quota), so PR #22 (Ethan's choice) builds the trial assets in the deploy job instead; run 38521932811 deployed
version `1b6c876c` to the trial, 14 October. The trial now runs S1 to S3 on a database at 68.

# Moved from current.md on 2026-10-13

The closed-slice paragraph of "Where things stand", verbatim.

**B4b, 12 October:** migration 65 and three offline tools, **none on the trial**. After the cutover a count that finds
less stock is an expense at the item's cost (a count that finds more books nothing). Her recipes go in as decided: 19 of 23
import, 4 are held for a unit clash or a missing quantity, 22 of 23 costing rows reproduce. Newer sales have an offline
append plan; flavour photos are resized in the browser before the existing upload. Ethan's reads and her photo folder are next.

# Moved from current.md on 2026-10-12

The closed-slice paragraphs of "Where things stand", verbatim.

**B4a, 12 October:** the database half of B4 (migrations 62 to 64), **none on the trial**. "When used" now
starts at a previewed cutover date: stock then on hand is valued once from her price list and credited once, so
stock already expensed in the historical lines is not expensed again (this takes back migration 61's flip; the
basis stays "bought" until the cutover is applied). An opening count is refused after it, and the preview lists
the items never counted. Her items, prices, recipes, flavour prices and bookings go in through `preview_import_*`
and `apply_import_*` (operator only, hash-checked). B4b (photos, newer sales) is next.

**B3b-2, 8 October:** migration 61 (`20260101006000_books_used.sql`), **not on the trial and not before
B4's cost cutover** (final-plan.md section 11), and the runtime. The books count stock when used and list what
has no cost, packs and bazaar sales included. The owner's screens read `get_item_costs` and `get_recipe_costs`;
an unknown cost reads "Cost pending". On the trial (migration 55) the engine's own path stands, as today.

# Moved from current.md on 2026-10-08

The closed-slice paragraphs of "Where things stand", verbatim.

**B3b-1, 8 October:** the database half of B3b, migration 60 (`20260101005900_packaging_rules.sql`), **not on
the trial**. Packaging is records: a recipe line is an ingredient or packaging (per cookie, never taken at a
bake), and a rule per container (each box size, loose, order, bazaar sale) lists the items. `record_pack` and
`record_sale_packaging` read them and no item name is left in SQL; until today's rule is entered they take no
packaging and say so. `get_recipe_costs` adds packaging per cookie. `record_event_sale` is untouched.

**B3a, 7 October:** the database half of B3, four migrations (56 to 59), **none on the trial**.
Recipe lines and supplier prices point at their stock item by id, after a step that is previewed
and counted; one cost function (average, else her usual price, else best quote per unit, else
unknown) stamps every use; a shortfall is costed; a recorded batch can be corrected. No client
code changed. What it did with each finding: [system-audit.md](system-audit.md), section 10.

# Moved from current.md on 2026-10-07

The closed-slice paragraphs of "Where things stand", verbatim.

**A2, 6 October:** the bazaar phone opens and reloads with no signal. Bazaar Mode alone
opens, only while the phone holds a running event, only within her offline hours (48 by
default) of its last online check; what happens is in [OFFLINE.md](../OFFLINE.md). Reviewed
independently and checked in the browser on a computer. The phone rehearsal still has to
prove it in Safari, from the Home Screen, overnight and with the radio off.

**A3, 6 October:** the live app now has one deliberate sign-out, a small pill above the
dock. It always asks first; with sales still on the phone it says how many and offers Send now,
Sign out anyway and Keep selling, and never touches the queue ([OFFLINE.md](../OFFLINE.md)).
`RELEASE_HOLD`, a repository variable, stops the trial deploy while it is on (below). Next.js is
16.3.8. Checked in the browser on the live build against the local database; two independent
reviews. Step 7 of the phone rehearsal can now be run.

**A4, 6 October:** the weekly backup, daily keep-alive and daily retention jobs are written and
off (`.github/workflows/ops-jobs.yml`, variable `OPS_JOBS_ENABLED`, not set); the backup is also
blocked on custody and a Postgres 17 dump ([F1-operations.md](F1-operations.md), last section).
The local dry run restored a real dump into a fresh container with matching hashes and found a
keep-alive defect, fixed.

**B1, 6 October:** the live owner's dock and sidebar are Home, Sell, Make, Stock, Money, with a
sub-tab strip above each screen (Ethan chose "Rename now, with sub-tabs" that day). Every All
tools entry and every route has exactly one home, kept as data and a test
(`src/lib/nav/function-map.ts`). New screens enter through one guarded, live-only slot in the
locked frame ([protected-exception.md](protected-exception.md), last section); none is
registered yet. `pnpm test:live:smoke` signs in on the live build against the local database
and opens everything, then sells at a bazaar with the network off. Helpers, support, the demo
and Bazaar Mode with an event open are unchanged. Port audit and two security reviews: no P0
to P2 left open.

**The Bazaar signal fix, 6 October:** when signal returns after the phone reopened offline on
the selling screen, the sale in hand carries on: same screen, same payment sheet, the queue
sent, the whole app open again. Before, the app went to Home and closed the sheet. The change
is in the sign-in gate only (`src/components/app/live-gate.tsx`); what it leaves alone is in
[OFFLINE.md](../OFFLINE.md). The smoke suite now fails if it comes back. Commit `1746d2a`,
reviewed independently; a green run of that push releases it to the trial.

**B2, 6 October:** no value of the prototype is left on a live page, and two tests in
`pnpm verify` hold that (an empty shop; two shops that share nothing). Names come from records:
the signed-in person's own name greets them and is on every bazaar sale (Ethan chose to fix
that before the bazaar; it was "Cine" or "Kristian"), and the owner sets her shop's name, her
own name, how to reach her and the shop tagline under Shop texts, all empty until she does.
One Manila clock: one module and one database function; the books CSV is on it. What it left
open is in [system-audit.md](system-audit.md), section 9. Migration 55 went onto the trial the
same day, at Ethan's instruction ("migrate everything").

# Moved from current.md on 2026-10-06

The status page as it stood at the end of 5 October, before it was rewritten around the
approved plan ([final-plan.md](final-plan.md), version 2).

## Where things stand — 5 October 2026

> **Change of direction, 5 October (Ethan):** Cine's updated workbook, recipe document and
> flavour photos are the source of truth, and everything must be consolidated and polished
> **before** her trial starts. The audit, the gaps and ten decisions waiting for his yes are
> in [sot-consolidation.md](sot-consolidation.md). Nothing has been built or imported for it
> yet. Her trial week waits for that work.
>
> Later the same day he asked for the interface and experience to be reworked as a whole,
> with research into the leading tools. That research, a proposed five-tab shape, the way
> to build it without editing ported files, and eight decisions are in
> [product-research.md](product-research.md). Wireframes are in the private
> `claude-20261005/rework/` folder. Nothing is built.
>
> Ethan approved both plans on 5 October ("yes to all, do what u recommend"), added
> "nothing must be hardcoded", and asked for a whole-system audit, now in
> [system-audit.md](system-audit.md) (findings only, nothing fixed), followed by one more
> round of research and a single final plan in the next conversation
> ([next-goal.md](next-goal.md)). The three source files now live in the private
> `claude-20261005/sot-sources/` folder.

> **The plan is approved (5 October, later): [final-plan.md](final-plan.md), version 2.**
> Ethan asked for a re-audit, a debate and wider research, answered five questions and
> approved the result. It replaces the first version written the same day and, from here
> on, finish-plan.md. Nothing was built, imported or deployed; the hosted trial was read
> twice, read-only.
>
> - **The October bazaar is not safe as built:** in the live app, opening or reloading
>   with no signal signs Cine out and she cannot sign in offline (read, not run). Slice
>   A2 fixes it, bounded and security-reviewed, before the 20 October rehearsal.
> - **Order:** A (bazaar safety and her access), then B (five tabs on the existing frame,
>   one guarded slot for new screens, true numbers, her prices and recipes, weighted
>   average cost, new Stock and Recipes), then C (everything else).
> - **Cine starts after everything is built:** mid-November at the earliest, early
>   December more likely. Two tracks; unattended runs for interface-only slices.
> - **On the trial today:** all 53 migrations applied; cost basis "when bought"; 8 of 72
>   items have any price; a test event has been open since 5 October with no sales.
> - **The questions for Cine are answered** (Ethan, 5 October, on her behalf; she confirms
>   each in a one-time set-up screen, now a slice of the plan). Nothing in the build waits
>   on her.
> - **Waiting on Ethan:** add her addresses after A1; close the test event; backup
>   custody; the rehearsal; approve each import preview.

**Package:** F2, the owner trial. F2 is incomplete, and F3 (launch) stays closed until Cine
accepts a real week of use.

### What exists and works

- **The product** is built through E1: menu and settings, checkout and owner orders, bazaar
  selling with offline close-out, stock, recipes and production, books, P&L and CSV, backups
  and health. `pnpm verify` passes 83 files / 1,512 tests.
- **The private trial site** is live for owners only:
  <https://happy-cookie-owner-trial.admin-kethai.workers.dev>. Cloudflare Access sends an
  email code to two approved mailboxes. The shop is closed and the menu is unpublished, so
  no customer can reach it. Ethan confirmed sign-in on 5 October.
- **Real data in the trial:** 72 stock items, 13 suppliers, 26 flavours (7 on the October
  menu), seven editable source recipes, and 804 historical financial lines (722 sales, 82
  stock purchases). No stock count, operating expense or order was invented.
- **CI/CD is green.** Every required GitHub job passes on
  `agent/codex/MP-04-g1-feasibility`, and a green push to that branch redeploys the private
  trial automatically. Push only accepted work, and read each run. Latest release: GitHub
  run 37302318279 at `3bc91dd`, Worker version `43267acc`, with all the UX review
  changes; anonymous requests still redirect to Cloudflare Access. A push that changes
  only documents does not run CI or redeploy.

### Decisions Ethan made on 5 October

- Prettier skips the byte-locked delivery paths and the recorded evidence; 52 reformatted
  receipts were restored. `scrub.ts` and `visual.spec.ts` were formatted once with his
  approval. Details: [protected-exception.md](protected-exception.md).
- OFFLINE-01 handles the Playwright WebKit emulator defect on WebKit only. The
  physical-phone rehearsal is therefore the only proof of offline selling in Safari.
- The trial week runs closed-shop, with a few agreed test orders in place of customers.
- The fonts are bundled in `src/app/fonts`, so a build no longer downloads them.
- This page and the front door were tidied; older sections moved to the history file.
- **UX review:** proposals 1 to 4 are built and on the trial: All tools grouping, no
  alerts for backups that never ran (with a neutral Home card), a five-item labelled phone
  dock, no empty Order or Production page, and All tools cards that fit a phone. Two
  protected edits were approved, recorded and audited
  ([protected-exception.md](protected-exception.md)). Details, limits and evidence:
  [ux-audit.md](ux-audit.md#implemented-on-5-october).

### Open items

- **Waiting on Cine:** sign-in on her iPhone and MacBook, a new password, seven trial dates,
  the opening stock count, weights for six recipes, her feedback. Allergens are needed
  before the shop opens, not before the week starts.
- **Waiting on Ethan:** a look at the changed screens on the trial itself; where the
  encrypted off-device backup lives and who can restore it; the phone rehearsal before
  20 October (Bazaar Mode is now under All tools on a phone). When backups are switched
  on, check that the first run appears in System health.
- **Performance budget (advisory job):** it measures the demo build's pages and they miss
  the budget (largest paint 5.8 to 9.4 s, shop page 1.6 MB). The live shop page has not
  been measured. Scoped on 5 October, nothing changed:
  [ux-audit.md](ux-audit.md#performance-scope-finding-10-5-october). It does not gate the
  release.
- **Fake orders, to decide before the shop opens:** the public checkout has no per-caller
  rate limit by design (decision D1, 28 September): an unpaid order holds slots for 24
  hours and a phone number may have two open unpaid orders. About nine made-up numbers
  could still fill a 200-cookie week until Cine cancels them. The options recorded then
  were a cap on how much of a week unpaid orders may hold, or a limit per pickup week.
- **Playwright issue 42775:** when a release fixes it, the WebKit run of OFFLINE-01 turns red
  on purpose. Upgrade then and delete the WebKit branches in the test.
- **Not eligible:** historical stock reconciliation. The counts are undated and opening
  balances and units are missing.

### Dates

The bazaar pilot is 24 to 25 October if the phone rehearsal passes by **20 October**;
otherwise 12 to 13 December.

# Moved from current.md on 2026-10-05

## Claude continuation — 5 October 2026 (latest)

Codex reached its usage limit at 03:52 Manila mid-commit. Ethan continued the same F2
goal in Claude Code (Opus coordinating, no workers used). Everything below this section
is older.

- **First automatic private-trial release succeeded.** GitHub run 37278233095 at
  `80fbcf1`: all five required jobs pass, the release workflow passes its full
  verification and format check in the container, builds the trial assets and deploys
  153 files to the existing Worker as version `eefade3a-24da-4ac6-9bec-fed8b9b3136b`.
  The release script's before-and-after gate checks passed. Independent read-only
  preflight afterwards: PASS. Anonymous requests to `/`, `/pl` and `/sw.js` all return
  302 to Cloudflare Access. No new resource; shop still closed. Ethan confirmed on 5 October that he signed in on the updated app and the dashboard loads; Cine's sign-in is still separate. Two things were needed first: a re-run of
  the build job after a transient `next/font` Google-font download failure in run
  37276284314, and `80fbcf1`, which trusts the checkout inside the release container
  (Git refused it as "dubious ownership"). The advisory performance-budget job still
  fails and does not gate the release. From now on every push to this branch that
  passes CI redeploys the private trial.
- **Two owner decisions, 5 October ("yes to both").**
  1. _OFFLINE-01 on WebKit_ (`784678e`). The test now handles the Playwright WebKit
     emulator defect on the `webkit` project only: the sale is made online, the offline
     reload must fail with exactly the known error (so the run turns red when Playwright
     fixes it), and every later assertion still runs. Phone and desktop Chromium are
     unchanged. CI Linux image: 14 of 14 WebKit and 6 of 6 Chromium runs pass;
     independent Sonnet review ACCEPT. The emulator no longer says anything about
     Safari offline behaviour, so the **physical-phone rehearsal is the only Safari
     proof** and must cover selling offline, reopening offline, reconnecting and no
     duplicates. The 20 October gate is now: this test green plus that rehearsal.
  2. _Closed-shop trial week._ Cine uses menu, stock, production, expenses and books
     daily on the private link. Order, payment, packing and collection steps are
     exercised with a few agreed test orders placed by Ethan or Cine through the same
     private link. Real customer ordering waits for launch; the shop stays closed and
     the Access gate stays at two mailboxes. See [F2-owner-trial.md](F2-owner-trial.md).
- **Formatting gate is green and GitHub CI ran past it for the first time.** Ethan
  approved formatting the last two files ("yes format both"); `261a250` applies exactly
  the recorded candidates and `pnpm format:check` passes with zero failures. GitHub run
  37273965631 at `261a250`: types/lint/unit **pass**, production build **pass**, visual
  regression **pass**, Storybook **pass**, browser flows **fail** (89 passed / 1 failed /
  75 skipped; the one failure is WebKit OFFLINE-01, failing its first attempt and both
  retries), release **skipped**. The advisory performance-budget job also fails
  (Lighthouse could not load `http://127.0.0.1:3000/`); it is `continue-on-error` and
  not required by the release. **OFFLINE-01 is now the only gate between this branch
  and an automatic private-trial release.**
- **How the formatting gate got there: 536 failing files → 2 → 0.** First 47 commits, `c8a2805` to `dd03072`, each
  through the pinned pre-commit hook (81 files / 1,487 tests) and the secret scan, all
  pushed. 135 hand-written files were formatted. 132 have a machine proof that only
  formatting changed (same syntax tree, comments and compiled output for code; same
  tokens for JSON; same document tree for Markdown). Three were handled individually:
  `tests/types/database-contracts.ts` gained a `prettier-ignore` comment (syntax tree
  still identical, all ten `@ts-expect-error` directives in place), `src/app/globals.css`
  was proven with a separate value normaliser, and `docs/ENVIRONMENTS.md` was committed
  despite one secret-scan pattern hit, which is the published local Supabase default
  connection string. Details: [F2-checkpoint.md](F2-checkpoint.md).
- **Checks after the run:** `git diff 497c6b7 HEAD` over every do-not-touch path is
  empty. `python scripts/validate-g0.py` passes 1,221 checks with zero failures.
  GitHub run 37271292933 at `dd03072` independently reports exactly the 2 files below
  and skips every later job.
- **Two Prettier scope decisions, both approved by Ethan on 5 October:**
  1. byte-locked delivery paths (`src/components/{screens,sheets,shell}/`,
     `docs/master-plan/`), recorded in [protected-exception.md](protected-exception.md);
  2. recorded evidence and script-maintained baselines (`docs/state/evidence/`, the two
     evidence index files, `tests/fixtures/g0-demo-state.json`,
     `tests/fixtures/function-authority.json`).
     No protected file, receipt or fixture was edited.
- **52 receipts restored** to their `5101724` bytes (`7e1c669`), as Ethan approved. They
  had been reformatted in the earlier runs, which broke their SHA-256 in
  `G1-evidence-index.json`. Now 769 of 774 indexed receipts match again.
- **The last two files** were `src/lib/observability/scrub.ts` and
  `tests/e2e/visual.spec.ts`, both on the do-not-touch list. They were formatted only
  after Ethan's specific approval, recorded in
  [protected-exception.md](protected-exception.md); structure, comments and compiled
  output are identical before and after.
- **Deployment token configured.** Ethan saved a dedicated Workers token. It is active,
  the four read-only Workers calls return 200 and the release script's `--check-only`
  preflight passes with no hosted writes. `CLOUDFLARE_API_TOKEN` was set as a GitHub
  Actions secret at 05:54 UTC. Nothing was deployed. Codex's private
  `configure-cloudflare-deploy.ps1` omits `TRIAL_ACCESS_EMAIL_SHA256` and fails its own
  preflight; it was not used.
- **OFFLINE-01 also fails on Linux.** In `mcr.microsoft.com/playwright:v1.63.0-noble`
  (the CI image), WebKit failed 3 of 3 runs and phone Chromium passed 3 of 3. Upstream
  Playwright issue 42775 is open, labelled v1.64 and reproduced on macOS; 1.63.0 is still
  the latest release. Zero of three local WebKit attempts passed; CI allows two retries
  per test, so expect the CI browser job to fail once formatting is green, which keeps
  the automatic release blocked. The test is unchanged. Receipt:
  [F2-offline01-linux-probe.json](evidence/F2-offline01-linux-probe.json).
- **CI workflow defect found and fixed (`655c95c`).** The browser and visual steps in
  `ci.yml`, and `verify:release` in `owner-trial.yml`, set Supabase variables at test
  time. `src/middleware.ts` then redirects every staff route to `/sign-in`, so the
  demo-fixture suites could never pass there. In the CI Linux image only 12 browser
  tests passed with the variables; a one-test A/B confirms the cause. The variables are
  removed from those three steps; no test, project or gate is removed.
- **Linux preview of the CI jobs that have never run on GitHub** (local container,
  source at `497c6b7`, without those variables): browser 89 passed / 1 failed (WebKit
  OFFLINE-01) / 75 skipped, the same as the Windows baseline; visual 75 passed;
  Storybook builds. Lighthouse and the release job are not covered. GitHub run
  37273965631 later confirmed the browser, visual and Storybook results exactly.
- **Unchanged:** the 804 imported financial rows, the hosted trial database and the
  private Worker (last recorded version `772d4a7e`; not re-probed), shop closed, no
  deployment, no merge, no jobs, no runner.
- **Not eligible:** historical stock reconciliation (counts undated, opening balances and
  units missing). **Waiting on people:** six recipe measurements, allergens, Cine's
  opening count, password and backup custody, real iPhone Safari/Chrome and MacBook
  checks, seven trial dates. F2 incomplete; F3 closed. OFFLINE-01 and the actual-phone
  rehearsal must both pass by 20 October.

## Earlier formatting checkpoint — 5 October 2026 (Codex)

Additional accepted/pushed slices: `9fb139c` (six historical guides), `199f9c6`
(six acceptance/audit JSON reports), `f88583f` (return-path test). Each full pinned
precommit passed 81 files / 1,487 tests, with targeted formatter and secret scans
passing. Root independently verified document structure, exact JSON values/tokens
and the test's unchanged AST. Fresh full formatting FAIL556, down53 from609.
The earlier53 files now pass targeted formatting; no release check is suppressed.
GitHub CI37228743055 at f88583f independently confirms556 formatting failures;
all downstream jobs including private release were skipped. No green CI claimed. Dedicated token remains unsaved; secure
Cloudflare creation/save instructions were supplied. Protected proposal and actual
Cine/device/count/custody/six measured mappings remain open. F2 incomplete/F3 closed.
Continue further authorized bounded formatting runs; reuse all804 financial rows.

## Successive formatting runs — 5 October 2026

Ethan authorized additional bounded runs without asking between them. Accepted and
pushed: `96c8794`, `dc24c9d`, `aeb4301`, `f9938c2`, `4694e69`. Each full
pinned precommit passed 81 files / 1,487 tests; targeted formatting and secret scans
passed. Twenty-four JSON reports retain exact values and literal tokens. Sixteen
Markdown documents retain content and hierarchy; only source positions and list
spacing metadata differ. Fresh full formatting remains FAIL: 569 files, down 40
from 609. No ignore or assertion weakened. Original OFFLINE-01 and protected files
remain unchanged; the delivery guard also protects historical docs/master-plan files.
Token instructions and the hidden save helper were provided; token remains unsaved.
The specific protected proposal and actual Cine/device/count/custody/recipe evidence
remain pending. F2 incomplete; F3 closed. No new imports or hosted mutations.

## Where things stand — 2026-10-05 continuation

- **Second bounded formatting run accepted:** `d7e465d`, `3f1b2a1`, `efa89e3`,
  `0f07e87`, `b16d8fe`; each full pinned precommit81/1487 PASS. Thirteen config
  files retain exact parsed values or structural hashes; fourteen JSON reports retain
  exact values/literal tokens. Playwright's240 selected tests have identical before/
  after listings. Fresh local formatting FAIL609 (down27 from636); no check suppressed.
  Protected source/app flows/original OFFLINE-01 unchanged. Private token remains
  unsaved, protected proposal awaits approval and Cine's device/week/count/custody
  evidence remains pending. No imports, hosted mutations or deployment in this run.

- **CI formatting continuation:** first unprotected slice `d637217` passes full
  pinned verify/precommit (81 files / 1,487 tests), secret scan and targeted
  formatter checks. No app, protected source or OFFLINE-01 edit. Full formatting
  remains red; deployment token file and GitHub deployment secret are absent.
  [Specific first protected proposal](F2-format-exception-proposal.md) awaits
  approval. [Count/custody/device preparation](F2-count-custody-device-preparation.md)
  reuses owner controls and the seven-day log. No new imports or hosted mutations.
  Final local formatting remains FAIL636 files. First-slice GitHub run37223588999
  fails638/skips release. Second accepted slice formats flavour/stocktake tests;
  all four changed tests retain their5101724 structural fingerprints. Recipe-draft
  formatting is held after the worker found a fingerprint change; original retained.

- **Historical financial data applied, dummy workbook excluded:** 722 real sales
  and82 stock-purchase costs (804 lines) read back exactly. Blank dates inherit the
  preceding explicit date and repeated lines count as separate sales by Ethan's
  explicit instruction. No stock count/stock-out or operating expenses invented.
  [Current import, P&L and CI evidence](F2-real-data.md#historical-financial-import-and-cicd---5-october-continuation).
- **Human login confirmed:** Ethan reports alternate-mailbox code and existing
  owner app sign-in worked. Admin OTP delivery remains intermittent; Cine sign-in
  and real-week acceptance remain separate.
- **P&L correction published:** frontendc30e3bd/private version772d4a7e; current
  gate/anonymous denial, routes0 and disabled-preview404 PASS. Manual approved
  private update; automatic CI release remains blocked.
- **Private CI/CD approved and prepared:** exact existing-target release guard and
  trusted-branch workflow committed; full gates retained. Current formatting gate
  fails640 files in fresh run37222065820; local inventory identified54 protected paths. Dedicated Workers deployment token
  is not configured; original OFFLINE-01 remains failing. No green CI claim.

- **Editable recipe originals delivered:** [draft editor/evidence](F2-recipe-drafts.md).
  All seven source recipes and batch sizes editable through All tools -> Recipe drafts.
  Existing menu/prices/stocktake controls remain available. Code72d7d17 pushed/private
  versionb29a55bc;53 migrations/38 RLS tables, verify79/1474 and role1945x2 PASS.
  Phone/desktop save/reload/revert and exact cleanup/Access denial PASS. Six measured
  production/cost mappings, opening stock and real-device/week gates remain open.
  Older52/78/1471 and catalogue-only notes below are historical checkpoints.

- **Real catalogue preparation applied:** [owner controls/data evidence](F2-real-data.md).
  72 stock definitions,13 suppliers,eight compatible quotes,26 library products,
  seven confirmed October prices and one exact Apple Pie recipe. All unpublished;
  shop closed; no physical counts imported. Historical financial subset is now applied. Six recipe
  conversions, cost/supplier links and allergens remain open. Older six-draft/no-import
  descriptions below are historical checkpoints. Accepted code73e556e is pushed and
  published on the existing private trial as version4ecc095c; fresh Access/anonymous
  app-assets denial and disabled-preview checks PASS.

- **Approved closed-shop hosted preparation is implemented.** Ethan approved free-plan setup and reuse of the empty existing trial project. All 52 migrations apply on PG17.6; the explicitly approved three-place 029 compatibility fix and new 051 maintenance hardening pass. Automated owner sign-in/refresh, active role and anonymous financial denial pass. The real catalogue above supersedes the initial six drafts; no orders, fake stock or payment accounts were imported.
- **Private trial link works behind owner-only email-code access:** https://happy-cookie-owner-trial.admin-kethai.workers.dev. Fresh configuration, independently accepted activation, phone/desktop login visuals, anonymous app/real-asset denial and disabled-preview404 checks PASS. Frontend73e556e/version4ecc095c, no routes; prior user-confirmed owner mailbox/dashboard sign-in and secure password handoff PASS. Shop remains closed; current recipe/cost completion, real-week, actual-phone and custody decisions remain pending.
- Latest accepted `pnpm verify` and full precommit: **78 files / 1,471 tests PASS**. PG15 SQL role suite reused: **1,922 cases/reset × 2**, 684 regressions detected, rollback/cleanup PASS. Hosted PG17: 94 app function contracts match apart from three expected quoted return-name renderings; all 37 public tables have RLS; browser MAINTAIN is zero across 39 public relations and service authority is preserved. The existing provider RLS event trigger is retained separately. Hosted-target local-browser P&L and current catalogue/stocktake phone/desktop captures are inspected; actual-device acceptance remains separate.

- **F2 technical work is checkpointed; readiness and real-week acceptance remain incomplete.** [Trial setup proposal](F2-trial-setup.md), [fix list](F2-fix-list.md), [checkpoint](F2-checkpoint.md) and [receipt](evidence/F2-trial.json) separate verified work from remaining browser/owner evidence. MP-26 stays in progress, next-goal stays F2 and F3 is closed.
- **F1 remains accepted locally, committed and pushed.** Encrypted database dumps and isolated recovery, fixed one-year retention, operational receipts, live health/alerts and the shop privacy notice are implemented; hosted jobs stay inactive.
- Product slices through **E1** are complete locally: menu/settings, checkout and owner orders, bazaars/offline close-out, stock/recipes/production, books/P&L and CSV. The detailed checkpoints remain in history.
- G0 is done; G1 passed locally and its synthetic hosted preview was published earlier. F1 made no hosted database change or deployment.
- Protected screens/sheets/shell/engine, applied migrations and port baselines are unchanged in F1. The privacy exception uses the existing live-only footer.

## Latest checkpoint — F2 technical renewal (2026-10-03)

- Fresh pinned `pnpm verify` passes: 77 files / 1,464 tests. The live rolling-period caption now has fresh nonzero UI/CSV and inspected phone/desktop evidence plus independent acceptance; publication authority is the continuation receipt and Git.
- Full E2E from bdd83f6 reused unchanged: **89 passed / 1 failed / 75 skipped**, exit 1; WebKit OFFLINE-01 fails at offline reload with an internal WebKit error. The suite is **not green**.
- Minimal cached/controlled SW reproduces WebKit's offline-emulation error; Chromium passes and both return 200 from SW when the origin is stopped. Strong evidence of a Playwright/WebKit emulation defect; original OFFLINE-01 stays unchanged/failing. No application/offline fix is justified.
- Live P&L caption patch uses the actual rolling period and retains demo styles/literal. Unit/port review and 1,219 G0 checks pass. Two new demo phone/desktop captures inspected; prior 47 captures reused. Fresh live phone/desktop P&L and books captures are inspected and accepted in the continuation.
- Nine nonzero SQL workflow suites pass twice on disposable databases: 684 assertions per run, rollback/cleanup pass. Continuation repairs the external harness preflight and exact cleanup. Fresh customer/owner UI workflows and CSV-to-RPC/P&L reconciliation pass; touched settings and packing stock restore, synthetic data is removed, and monotonic sequence advancement is retained. Earlier failed setup attempts remain in the receipt.
- Read-only preview probes show an older September 27 release and six missing current RPCs; signup is now disabled but Cine access is unverified. Dedicated Supabase + fresh Workers trial origin proposed; static config prepared locally. Hosted setup and real-trial data/customer/payment scope need approval.
- Independent coordinator review (Sol/high requested) and port reviews cover their stated scope; root model was not changed. The earlier checkpoint's three-child overlap is preserved in the receipt; this continuation used at most two workers. No hosted writes, jobs, deployment, merge or runner. F1 evidence and the checklist are reused.

## Previous accepted checkpoint — F1

- `pnpm verify`: **77 files / 1,462 tests**, exit 0; both typechecks and lint pass. Port integrity: 54 files. Engine contract: 49 exports / 21 setting keys / 38 documented engine tables.
- Final-schema recovery: **61 tables / 236 rows**, counts and deterministic hashes match; **55 FKs** match, validate and have zero orphans. Auth migration history is included. Atomic rollback and exact owned cleanup pass.
- SQL role suite: **1,922 cases/reset × 2**, matching matrices, **684 regressions detected**. Current SQL/authority/pin/type hashes match the proof. **20 unit mutations** detected, sources restored exactly.
- Python guards: **63 pass**. G0 continuity: **1,217 checks, zero failures**; unknown task IDs still rejected. Normal/live builds, Pages/Workers emulator checks and **11 live-checkout steps** pass.
- Headless Chromium visual QA: **11 screenshots inspected**, phone 390×844 and desktop 1440×900; missing/success/failed health, alert navigation at both widths and privacy. Synthetic success records test rendering only; cleanup passed.
- Full E2E remains **89 passed / 1 failed / 75 skipped**, exit 1: known WebKit **OFFLINE-01**. Its unchanged demo/offline evidence is reused; the suite is not called green. Physical-phone QA is still pending.
- Evidence: [acceptance](evidence/F1-acceptance.json), [restore](evidence/F1-backup-20261003.json), [SQL](evidence/F1-operations-sql.json), [checkpoint](F1-checkpoint.md), [operator guide](F1-operations.md). Each code commit's verification hook passed; credential-pattern scan passed before publication.

## Waiting on

- **Hosted operations:** no timer, keep-alive, retention job or backup-health write is activated. Ethan must approve the target, secret custody, off-device destination, archive expiry and failure delivery. Inactive schedule metadata is prepared; local recovery does not establish off-device protection.
- **F2:** Cine's actual real-week checklist and feedback on an explicitly approved target. Prepared checklists or synthetic tests do not complete that trial.
- **Existing carry-overs:** target owner/refresh and PG17 maintenance checks pass; private-origin, human/device and broader session scenarios remain open. `format:check` and WebKit E2E on main are known red; no merge while required checks fail.
- **Bazaar pilot:** 24–25 October requires OFFLINE-01 and the physical-phone test to pass by **20 October**. Phone-sized Chromium is separate evidence.
- Cine's C1–C12 answers remain open; Ethan approved the finish-plan defaults on 2026-09-28. No automatic runner, production cutover, hosted resource or deployment is authorized by F1.

Independent review found verify warning10002: token is not usable until 4 October
00:00 UTC / 08:00 Manila despite active200. Fix Start Date (no new secret needed)
or wait until that UTC time, then recheck scoped Access APIs. The user separately
reports an initial Zero Trust setup screen; that is not the proven cause of401. No
Access, paid-plan or billing mutation occurred. Corrected before publication.

## Latest continuation — 4 October, resumed at user request

The scheduled current-chat follow-up was deleted; no automatic product runner is active.
The saved replacement token is now usable: token, scoped Access applications, organization
and identity-provider GETs all return200. The initial future-token warning10002/401
diagnosis is historical and preserved, not a current credential blocker.

An independently reviewed exact-hostname private gate is created: one approved owner
email, one-time PIN only, one reusable Allow policy, eight-hour sessions; no wildcard,
bypass or service-token access. Fresh application/policy/IdP GETs match. The owner
identity and temporary password remain outside Git; a clipboard handoff helper is prepared
privately but has not run. No authentication email was sent.

The Worker remains disabled, including preview URLs: pre-enable browser login did not
reach an email field (initial direct redirect400; relative redirect ends404). A local
null-array check was corrected without duplicate resource creation; installed Playwright
import was corrected. These are verification-harness setup failures, not app repairs.
No Enable stage ran; explicit disabled readback passes after the failed preflight.
Activation, live anonymous/static/owner-route proof and Cine sign-in remain unverified.
No further login repair is attempted in this checkpoint. Reuse accepted be1e115,
caption85f6bc6, uploaded3188360e and all existing local financial/visual evidence.

Next goal: resolve the private-login preflight from its retained HTTP redirect evidence,
obtain independent activation acceptance, then verify the private origin and hand over
owner credentials securely. Real-week/customer/payment/shop-opening and custody/recovery
permissions remain separate. F2 incomplete, F3 closed; actual-phone rehearsal and the
unchanged failing OFFLINE-01 both must pass by20October. Jobs/imports/merge remain off.

Latest activation details and pending human proof: [checkpoint](F2-checkpoint.md).

User-confirmed owner sign-in and current clipboard cleanup PASS; read-only shopclosed, orders0/published0 checks PASS. Physical-device and real-week gates remain open.

# Moved from next-goal.md on 2026-10-05

## Session settings (Codex runs before the Claude continuation)

Latest pushed source checkpoint: `f88583f`. Fresh local format check FAIL556.
GitHub37228743055 confirms556 failures and all downstream/release jobs skipped.
Three additional slices (9fb139c/199f9c6/f88583f) each pass pinned full precommit
81/1,487, targeted formatting, independent content/AST checks and secret scan.
Continue authorized bounded runs without repeated approval. Two workers are idle:
format_slice (evidence/docs) and unit_format (unit tests), pinned Luna/medium.
The JSON helper's proof directory must get a new unique name before reuse.
Token creation/save instructions supplied; file still absent, no secret configured.

Latest successive checkpoint: pushed `4694e69`; five accepted slices preserve
24 JSON reports and 16 Markdown documents. Each pinned full precommit 81/1,487 PASS;
fresh full formatting FAIL569, down40. Human authorization permits further bounded
runs without asking between runs. Preserve protected sources and all failing gates.
Dedicated deployment token remains unsaved; use the hidden PowerShell helper.

Latest resumed formatting checkpoint: accepted slices through `b16d8fe`.
Fresh local formatter FAIL609 files; exact settings/report values and all240
selected tests retained. Continue another owner-authorized bounded run from the
latest pushed checkpoint; reuse the five slices and existing804 imports. Resolve
the pending specific All tools proposal and token save before dependent work.
No broad formatter ignore, test suppression, source-data guessing or setup restart.

Latest accepted formatting slices: `d637217`, `1fa65dc`; reuse the existing804 financial rows.
Continue small unprotected formatting slices with unchanged assertions/checks.
The exact protected All tools proposal in F2-format-exception-proposal.md requires
specific approval before source edits. Deployment token save/configuration and
actual Cine inputs remain pending; use F2-count-custody-device-preparation.md.
Final local format inventory:636 failing files. Reuse both unprotected test slices;
recipe-drafts formatting is held after a structural comparison failed. Preserve its
source and investigate before any later formatting acceptance.

Immediate continuation: reuse the accepted historical import and editable owner
controls. Human alternate-mailbox/owner app login is confirmed. No dummy workbook
content is imported; source-date/repeat assumptions are explicitly owner-approved.

```text
/goal Continue F2 from the latest pushed historical-data and private-CI commits.
Read current.md, F2-real-data.md and evidence/F2-trial.json; do not restart setup or
reimport the804 financial rows (722sales/82purchases). Reuse editable menu/prices,
seven original recipe drafts and stocktake. Preserve the approved date carry-forward
and separate-repeat interpretation, source hashes and exact receipt-cost links.
Finish historical stock reconciliation only when exact units/opening/as-of dates
are supported; no current stock or missing operating expenses may be invented.
Finish six measured recipe/cost links and allergens. Fix CI formatting in bounded
slices respecting protected source; obtain an exact exception before protected edits.
Configure the dedicated Workers deployment token securely and validate the existing
private release gates. Preserve unchanged OFFLINE-01; no suppressed failing checks.
Complete Cine's opening count, password custody, seven actual dates/feedback and
real iPhone Safari/Chrome/MacBook acceptance. F2 incomplete/F3 closed until the real
week passes. Actual-phone and OFFLINE-01 dualPASS required by20October. Pinned
headless CLI tools only, Codex Sol/high coordination, at most two bounded workers;
stop after two failed repairs on one issue or25turns. Verify, secret-scan, commit/push
accepted slices. Existing private-trial data and CI/CD are approved; no new resources,
production launch, shop opening, business jobs, merge or runner without approval.
Finish with actual remaining gaps and the next continuation goal.
```

Previous catalogue-only continuation (superseded above): finish six October recipe weight/yield mappings and full cost
references from [F2-real-data.md](F2-real-data.md), then Cine's opening count and actual
week. Real catalogue import is authorized/applied: do not ask again or recreate
resources. Keep menu unpublished until allergens confirmed and shop closed until
separate operating approval. Reuse accepted stocktake/pending-data UI proof. F2
incomplete/F3 closed; unchanged OFFLINE-01 and actual phone must both PASS by20October.

Accepted catalogue/control code73e556e is pushed and published to the existing private
trial (version4ecc095c). Verify/precommit78/1471 and inspected headless visuals PASS.
Prior setup/approval prompts below are historical; do not recreate resources or repeat
the approved catalogue import. Shop opening, payment setup and operational jobs remain
outside this approval.

```text
/goal Continue F2 from73e556e: finish Cine's October recipe/cost preparation,
opening count and real-week acceptance using F2-real-data.md and existing receipts.
Preserve the supplied seven recipes; obtain only missing yields, solid tsp/pinch/piece
weights, ingredient identities and allergen confirmation. Resolve held supplier/pack
cost links without guessing. Reuse existing owner editing controls and accepted QA.
Keep the shop closed and menu unpublished until the remaining decisions are confirmed.
Prepare concrete operating/recovery steps before requesting their specific approval.
Then record Cine's actual opening count, seven trial dates/feedback and real iPhone
Safari/Chrome evidence. Preserve unchanged failing OFFLINE-01; it and actual-phone
evidence must both PASS by20October. F2 stays incomplete/F3 closed until acceptance.
Pinned tools and headless CLI Playwright only; Codex Sol/high coordination, bounded
workers at most two. Stop on two failed repairs of one issue or25turns. Commit/push
accepted slices after verify/secret scan; no new resources/jobs/runner/merge or wider
deployment without explicit approval. Finish with actual evidence and next goal.
```

| Setting                        | Value                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Coordinator and sign-off       | Codex `gpt-6-sol` · high                                                                                                                    |
| Bounded implementation workers | Codex `gpt-6-luna` · medium; at most two active workers                                                                                     |
| Independent review             | Sol/high for Luna changes involving SQL, auth, money or offline; Luna/medium for bounded root changes; port auditor for protected contracts |
| Plan mode                      | Off after a short initial plan; the approved goal authorizes local work                                                                     |
| Permissions                    | Current session permissions; hosted writes, resources, deployment and merge need Ethan's explicit approval                                  |
| Browser QA                     | Headless command-line Playwright only; never Browser/Chrome-control plugins                                                                 |
| Toolchain                      | Node 24.20.0 / pnpm 9.12.3, pinned tools on PATH; `pnpm.cmd` on Windows                                                                     |
| Stop budget                    | Two failed fixes or 25 turns; checkpoint and stop at the boundary                                                                           |

Read `AGENTS.md`, `docs/state/current.md`, `finish-plan.md` sections 6 and 10, `F1-operations.md`, and `evidence/F1-acceptance.json`. Reuse verified F1 evidence; do not restart the repository audit. Record the trial package under historical `MP-26` in task-status.json and identify its approved finish-plan name as F2.

```text
/goal Complete F2: owner trial (finish-plan.md section 6, MP-26).

Codex only. Coordinate and sign off with gpt-6-sol/high; use economical,
bounded workers and independent review where required. At most two active
workers. Stop after two failed fixes or 25 turns.

Prepare a practical checklist for Cine to operate one real week in the
app: menu and shop window, order/payment/packing/collection, stock and
production, expenses/P&L/CSV, and health/alerts. Include the approved
bazaar/offline pilot checks where applicable. Keep a dated fix list with
reproduction, severity, owner feedback and proof of each resolution.

Run full E2E and headless phone/desktop visual QA for affected flows.
Record WebKit OFFLINE-01 honestly; do not call its suite green. Physical
phone evidence must come from the actual device, including the pilot
gate before 20 October. Automated phone-sized Chromium is separate proof.

Complete the real-week trial using Cine's recorded checklist and feedback
on an explicitly approved target. If account access, target approval or
owner participation is missing, finish the concrete local preparation,
record what remains, and request the missing input. Do not substitute a
prepared checklist or synthetic tests for completion of the real trial.

Make bounded fixes only where reproduced evidence requires them. Preserve
locked UI, applied migrations and queued-sale acknowledgment rules.
Run required affected gates, independent risky-change/port review and
visual QA; secret-scan, commit accepted slices and push the working branch.

F1 hosted schedules stay inactive. Do not deploy, merge, activate jobs or
create hosted resources without Ethan's explicit approval. Keep F3
cutover, imports and legal/accounting decisions separate from this trial.

Update current.md, task-status.json and the trial checkpoint. Advance to
F3 only when the real week, checklist and required acceptance evidence
are complete. No automatic runner.
```

Known carry-overs: target owner/refresh and PG17 MAINTAIN checks now pass; private-origin/human/device and broader session scenarios remain open. `format:check` and WebKit E2E on main remain known red. No merge to main while its required checks fail. F1 off-device custody, archive expiry and hosted activation are documented approval decisions, not configured production protection.

## Historical continuation after the accepted caption slice — 3 October

Reuse bdd83f6, the six-file accepted caption slice and technicalContinuation in evidence/F2-trial.json. Fresh local checkout/owner UI, CSV/P&L and phone/desktop caption evidence now pass; preserve earlier setup failures and explicit local timestamp/sequence side effects. Do not restart the audit or repeat the harness without a changed source or unresolved concern.

Next continuation goal: finish F2 trial-target preparation and Cine's actual week. Obtain Ethan's explicit approval for the concrete isolated Supabase project/schema/catalogue/owner account and fresh Workers release in F2-trial-setup.md, and separately record permitted customer/data/payment/shop-opening scope. Then verify the approved target, secure access, manual backup/custody/recovery and all seven actual dates with Cine's acceptance. Hosted jobs, imports, merge and runner remain off. Actual-phone evidence and original OFFLINE-01 must both pass by 20 October; F2 stays incomplete/F3 closed until real-week acceptance.

## Current continuation — private link enabled4October

Reuse7502fde, accepted frontendbe1e115/upload3188360e and current gate. The private
link is https://happy-cookie-owner-trial.admin-kethai.workers.dev. Fresh gate and
independently accepted activation PASS; canonical enabled, previews disabled, routes[].
Root inspected new phone/desktop login captures and anonymous real-asset/app denial PASS.
Human mailbox/Access/app dashboard confirmation and secure clipboard handoff now
PASS by user reply. Agree ongoing password custody/change, then obtain separate
real-data/customer/payment/shop-opening and encrypted custody/recovery decisions.
Record Cine seven actual dates and actual-phone rehearsal. Do not recreate resources
or restart the audit; F2 incomplete/F3 closed, unchanged OFFLINE-01/phone dualPASS
by20October remains required. Prior token401 and disabled-origin302->404 are retained
historical setup evidence, not current blockers.

## Previous checkpoint — 4 October, before private-link activation

The scheduled current-chat follow-up was deleted; no automatic product runner is active.
The saved replacement token is now usable: token, scoped Access applications, organization
and identity-provider GETs all return200. The initial future-token warning10002/401
diagnosis is historical and preserved, not a current credential blocker.

An independently reviewed exact-hostname private gate is created: one approved owner
email, one-time PIN only, one reusable Allow policy, eight-hour sessions; no wildcard,
bypass or service-token access. Fresh application/policy/IdP GETs match. The owner
identity and temporary password remain outside Git; a clipboard handoff helper is prepared
privately but has not run. No authentication email was sent.

The Worker remains disabled, including preview URLs: pre-enable browser login did not
reach an email field (initial direct redirect400; relative redirect ends404). A local
null-array check was corrected without duplicate resource creation; installed Playwright
import was corrected. These are verification-harness setup failures, not app repairs.
No Enable stage ran; explicit disabled readback passes after the failed preflight.
Activation, live anonymous/static/owner-route proof and Cine sign-in remain unverified.
No further login repair is attempted in this checkpoint. Reuse accepted be1e115,
caption85f6bc6, uploaded3188360e and all existing local financial/visual evidence.

Next goal: resolve the private-login preflight from its retained HTTP redirect evidence,
obtain independent activation acceptance, then verify the private origin and hand over
owner credentials securely. Real-week/customer/payment/shop-opening and custody/recovery
permissions remain separate. F2 incomplete, F3 closed; actual-phone rehearsal and the
unchanged failing OFFLINE-01 both must pass by20October. Jobs/imports/merge remain off.

# Moved from current.md on 2026-09-28

## Checkpoint - 2026-09-30 (C2 follow-up, before E1)

- **2026-09-30 (C2 follow-up, before E1):** binned dough and binned baked cookies are now recorded on the database. Migration `20260101004800`: owner-only `record_discard`
  (exact keys; dough or baked; a whole number up to what is there, a reason of 1 to 80 characters; idempotent on a client id) and `record_production` and `get_production`
  redefined so the chilled dough and the baked count subtract what was binned. The ported spoilage action for dough and cookies (`logSpoilage` with a flavour and kind) records
  first, then runs the engine's own bookkeeping with its own change to the counts undone, then reads the counts back (once, not twice). This closes the silent under-deduction the
  C2 review left open (mix 6, bin 2, bake 6 used to take no ingredients for the other 2). Evidence: `production.sql` 112 cases; SQL role suite 1807 cases per reset, 2 resets,
  596 regressions detected; unit tests with 8 mutations, all caught. Raw-stock waste was already a `waste` movement (C1). Not looked at on screen: the spoilage sheet.
  **E1 was started and re-scoped:** see the E1 block in `next-goal.md` (three slices, and the owner decisions each needs).

- **2026-09-30 (C2, finish-plan slice C2):** production. Two code commits (`3fd4df2` database, then the app half and review fixes).
  - **Database:** migration `20260101004700`: `production_records` (no API grant), `use` added to the stock movement kinds (only the new functions write
    it; `record_stock_movement` still refuses it), and owner-only `record_production` (a dough mix or a baked batch: exact keys; every recipe line of the
    version it was made on comes off stock in ONE transaction as `use` movements, never more than is there, the shortfall kept on the record; a batch draws
    on chilled dough first; pieces round up, the rest to 0.1, +/- steps of 10 g / 5 ml / 1 pc, multiply-first so 9 pieces of 9 stay 5, not 6; refused if the
    recipe changed since the screen read it; idempotent on a client id), `record_pack` (an order's packaging once per order: the record id is derived from the
    order), `get_production` (batches with their version, the chilled dough, the cookies baked and not yet packed in one drop, the shortfalls), and
    `record_event_sale` redefined to use a stall sale's pouches and bag on its first insert only (a replay, or a sale that arrives already voided, adds nothing).
    New suite `production.sql` (88 cases, 32 rule/text regressions).
  - **App (live mode, no protected markup or engine edit):** `confirmDough` and `confirmBatch` are replaced from `OpsRuntime`: the record is sent first, the
    engine's own bookkeeping (sheet, toast, what ran short) runs against the quantities it showed, then the stock, batches, dough and baked count are read back.
    Packing an order records its packaging first, then sets Ready. A second tap on Confirm is ignored while one is in flight; a lost reply keeps the id so
    repeating it never counts twice. `state.batches`, `variances`, `shortfalls` come from the database, so "baked on this version" and the records screen are
    real; `dough` and `baked` move by what changed on the database, so a change made only on the screen (binned dough or cookies, stall stock) is kept.
  - **Opus review** (database SAFE; the app half was NOT SAFE until fixed): a partial read overwrote the chilled dough and baked counts (binned dough came back,
    a sale flush put the stall's cookies back); a double tap recorded a batch twice (and a Back during the record crashed the engine's confirm); an order for
    another week could not be packed (drop -1); dough pieces could round up one too many. All fixed with tests.
  - **Recorded, not fixed:** (1) Packaging names and the pack rule (full sixes in a box, loose in pouches, a sticker each, a card per box) are the ported defaults, hard-coded
    in the database (DP-03 stays open: real box sizes 6/8/12 from `order_boxes` and per-flavour footprints are not used); a renamed catalogue item is a permanent
    shortfall; if her recipes list the pouch per cookie AND packing takes one, it is taken twice: **question for Ethan: which one owns packaging, the recipe line at bake or the pack rule at packing?** (the seed recipes have no packaging lines, so nothing is doubled today). (2) The stall's stock load and close-out still change only the screen (see the open item above for binned dough): after a reload the server's baked count does not subtract an event's loaded stock.
    (2b) Baked cookies are counted per drop on the server (`drop_no`), but the engine carries leftover baked cookies into the next drop (its drop rollover, `ops-engine.js:1091`, does not reset `baked`): after a rollover the server's view of last week's leftovers is 0. Decide in E1 whether leftovers carry over.
    (3) Packing records a shortfall and goes ahead; the ported engine refused to pack when packaging was short. (4) A count taken after a late `use` (an offline sale synced
    after a count) can double-count it. (5) A sale voided before it syncs deducts nothing on the server but the pouches on screen. (6) A batch of 0 is refused (the engine
    allowed it). (7) The staff RPCs are owner-only, so a helper cannot pack (unchanged). (8) Wording is PLACEHOLDER (`PRODUCTION_COPY`). (9) `bake_batches` (init) stays unused.
  - **Evidence:** `pnpm verify` 70 files / 1375 tests; G0 validator 1217 checks, 0 failures; port integrity OK (54 files); Python guards OK; SQL role suite 1783 cases per
    reset, 2 resets, 572 regressions detected (2 resets x 286); `pnpm build`, `test:pages:spike`, `test:workers:spike` pass; `pnpm test:e2e` 89 / 1 (OFFLINE-01 WebKit) / 75;
    `test:live:checkout` 11 steps. Mutations: 28 on the unit tests (all caught; two survived their first run, m02 and m19, and were strengthened and re-run; one, m18, matched nothing and was re-run by hand and caught). The two new test files and the gate test ran 5 times in a row green; the first pre-commit run of the app-half commit failed a test once and passed on retry with no change (cause not found). **Visual QA in the browser pane** (live-mode
    build, local test owner): mixed 12 dough balls (flour 4200 -> 4000 g in the database, 12 chilled dough), reloaded (still 12), baked 4 with 1 reject (dough went to 8, "1 still
    to bake"), the recipe screen said "1 batch baked on this version", packed a 13-cookie order (Box of 6 9 -> 7, sticker 4 -> 1, pouch 64 -> 63, card 42 -> 40), and after a
    reload the Inventory ingredients, packaging and dough tabs showed those quantities. Not looked at on screen: the Inventory screen before the changes (its "before" quantities come from the dough sheet and database queries), the stall sale's packaging (SQL and unit tests only), a
    shortfall toast, and a phone-width pass.

## Checkpoint - 2026-09-30 (C1)

- **2026-09-30 (C1, finish-plan slice C1):** the stock ledger. Two code commits (`f713738` database, then the app half and review fixes).
  - **Database:** migration `20260101004600`: `stock_movements` (no API grant) and owner-only `record_stock_movement` (exact keys; kinds opening,
    receipt, count, waste, adjust; idempotent on a client id: an identical retry is answered, a different body under the same id is `23505`).
    `on_hand` changes only here. A receipt with a cost also writes the cost to `ledger_entries` (category = the item's kind, negative amount) in the
    same transaction, so a retry can never book it twice. A count is the total counted and the variance comes from what the database held under a
    lock; a count taken before a later movement is refused (it would wipe that movement out); waste and adjustments never take more than is there; an
    opening needs nothing on hand and no earlier movement. `get_last_paid` returns the latest costed receipt per item. New suite `stock-ledger.sql`
    (87 cases, 16 rule regressions).
  - **App (live mode, no protected markup or engine edit):** the engine's actions are replaced from `OpsRuntime`: a count of one item (count movement), add
    and subtract (adjustments with a fixed reason), waste of raw stock (waste; cookies and dough waste stay the engine's own), a delivery (receipt with
    the cost paid and the supplier) from the receive sheet and from the expense sheet's stock purchase, the stocktake (a count per item entered, each
    taken at the moment it was entered) and "Add item" (opening quantity). The record is made first; the engine's own bookkeeping (part deliveries,
    substitutions, the grocery list) then runs and the catalogue is re-read, so the screen always shows what the database holds; no Undo is offered on
    stock toasts. `state.paid` comes from `get_last_paid`, so the cost per unit is what was really last paid. An unconfirmed answer keeps the entry:
    repeating it exactly reuses its id and time and can never count twice.
  - **Opus review** (database SAFE; the app half was BLOCKED until fixed): a receipt was recorded even when the engine refused the expense form (stock
    counted twice on the resend); a lost reply was reported as "nothing changed", inviting a second delivery and cost; a stocktake that failed partway
    threw away the unsaved counts and hid the failure; a paused stocktake could wipe out a later delivery; the engine's delayed toasts could hide a
    refusal and a refused delivery still ticked the grocery list. All fixed with tests, plus an opening only when nothing is on hand and quantities
    rounded to 3 decimals before sending.
  - **Recorded, not fixed:** (1) a mistyped receipt cost cannot be corrected (the books are append-only and undo is gone): a correcting entry belongs with E1.
    (2) Baking, dough mixing and bazaar packaging still change only the screen and are lost on a reload: they need a `use` movement, which is C2.
    (3) Raw-stock waste and live stocktakes add nothing to the engine's local waste record and count log (the records screen). (4) The waste toast shows
    the typed amount even when the server capped it at what was on hand. (5) Two quick movements can briefly show an older quantity (no out-of-order guard on
    the catalogue read). (6) Every movement bumps the item's stamp, so an open item-edit form is refused as stale (correct, costs a retry). (7) Wording
    is PLACEHOLDER (`STOCK_COPY`).
  - **Evidence:** `pnpm verify` 68 files / 1303 tests; G0 validator passes; port integrity OK (54 files); Python guards OK; SQL role suite 1695 cases per
    reset, 2 resets, 508 deliberate regressions detected; `pnpm build`, `test:pages:spike`, `test:workers:spike` pass; `pnpm test:e2e` 89 / 1 (OFFLINE-01
    WebKit) / 75; `test:live:checkout` 11 steps. Mutations: 16 on the first version (13 caught, 3 equivalent or fixed by tests) and 8 on the review fixes,
    all caught. **Visual QA in the browser pane** (live-mode build, local owner): the item sheet's count (850 g saved, movement -50 g in the database),
    the receive sheet (2000 g for ₱840 in stock, one receipt and one cost entry of -84000, the grocery list then shorter). Not looked at: waste and the
    stocktake sheets on screen, and a phone-width pass.

## Checkpoint - 2026-09-30 (A4)

- **2026-09-30 (A4, finish-plan slice A4):** the owner's recipes with versions. Three commits (`9432dda` database, `1ff31fb` app and review fixes; the docs are the third).
  - **Database:** `recipes` gets a version and stamp, `recipe_ingredients` an order, and `recipe_versions` keeps what each save replaced. Owner-only
    `get_recipes` and `save_recipe` (exact keys; a yield of 1 to 10000; up to 80 lines, each a name, an exact quantity of 0.001 to 999,999 with at most
    3 decimals, and g, ml or pcs; no ingredient twice; a line for a stock item must be in that item's unit, names compared ignoring case; stale stamp
    `P0002`; a create is replay-safe; a save with nothing new answers without a new version). Legacy direct writes on the recipe tables are revoked.
    Migration `20260101004500` redefines `save_stock_item` so an item a recipe uses keeps its unit (found by the review: a unit change would have
    locked the recipe and put the cost out by the ratio). New suite `recipes.sql` (80 cases, 13 rule regressions), `stock-catalogue.sql` +3.
  - **App (live mode, no protected markup or engine edit; the recipes are state-based, so no engine constant needed refilling):** the owner's recipes fill
    `state.recipes`, `recipeBase`, `recipeVer` and `recipeHistory` for each flavour on the menu; a flavour with no recipe gets an empty one, never the
    prototype's six (also at start-up, after a reset, and for a helper). The ported "Save as new version" calls `save_recipe`; the screen then shows
    the version the database made, the versions it replaced, and the cost per cookie from the A3 prices. The blank-name warning, the local checks and
    the wording of a refusal, a lost connection and a conflict are new PLACEHOLDER copy (`RECIPE_COPY`).
  - **Opus review** (database SAFE; the app half was BLOCKED until fixed): an edit was saved against the newest stamp read, not the one it started on, so
    a newer version made elsewhere could be overwritten with no warning; typed text before the first read landed on an empty placeholder and took the
    real stamp; a reset with no recipes read brought the prototype's six back; a save's answer was thrown away, so a failed read-back could make the
    next save a false conflict that discarded the edit; overlapping reads could bring back an older stamp. All fixed with tests; a conflict shows the
    other version (the replaced lines stay in `recipe_versions`).
  - **Recorded, not fixed:** (1) the history list shows counts, not the old lines, and there is no restore, although the database keeps every version.
    (2) Batch counts ("baked on this version") read nothing until batches are loaded (C2). (3) The seeded demo recipe lines all sit at position 0, so
    their order is arbitrary until first saved. (4) Item units are free text (A3) but a recipe unit is g, ml or pcs: an ingredient in kg cannot be
    recipe-measured (the form's hint says g, ml, pcs). (5) The import for her current menu is not written: her workbook layout belongs with the cutover
    (finish-plan section 9). (6) A conflict discards the local edit (their version shows). (7) Wording is PLACEHOLDER.
  - **Evidence:** `pnpm verify` 66 files / 1259 tests; G0 validator passes; port integrity OK (54 files); Python guards OK; SQL role suite 1608 cases per
    reset, 2 resets, 470 deliberate regressions detected; `pnpm build`, `test:pages:spike`, `test:workers:spike` pass; `pnpm test:e2e` 89 / 1 (OFFLINE-01
    WebKit) / 75; `test:live:checkout` 11 steps. Mutations: 18 on the app, all caught bar two equivalent ones, and 9 more on the review fixes, all caught.
    **Visual QA in the browser pane** (live-mode build, local owner, the seeded recipes as data): the recipes screen from the database (White
    Chocolate Biscoff, 24 cookies, ₱32.58 per cookie from the A3 prices), an edit and "Save as new version", then "Version 2 - current" with Version 1
    below it, and the database holding version 2 with version 1's ten lines kept. Not looked at: a phone-width pass, and a recipe for a flavour with none saved.

## Checkpoint - 2026-09-30 (A3)

- **2026-09-30 (A3, finish-plan slice A3):** the owner's stock items, suppliers and supplier prices. Two commits (`3cd8770` database, `7582680` app).
  - **Database:** the tables already existed (`suppliers`, `inventory_items`, `supplier_prices`); migration `20260101004300` adds `active` and
    stamps and four owner-only RPCs: `get_stock_catalogue`, `save_supplier`, `save_stock_item`, `save_supplier_price` (exact keys, bounds,
    case-insensitive unique names, stale stamp `P0002`, replay-safe creates; a changed price pushes the old one onto a three-deep "was" history; an
    item with prices or recipes cannot be renamed; quantity on hand is never written, that is C1). The legacy direct INSERT/UPDATE/DELETE grants on
    the three tables are revoked (as B3 did for orders): every write is validated. `trigger-authority.sql` now proves the inventory timestamp
    trigger as `service_role`; the private-read regression now expects the read failure. New suite `stock-catalogue.sql` (138 cases, 29 rule
    regressions, one table regression).
  - **App (live mode, no protected markup or engine edit):** the owner's items become the inventory rows (state); suppliers, pack sizes and best
    buys reach the ported suppliers, grocery and cost screens by refilling the engine's exported `SUPPLIERS`, `PACK_SIZE` and `BEST_BUY` in place
    (`src/lib/data/engine-catalogue.ts`; `OPTIONS_FOR` reads `SUPPLIERS` when called). Demo mode gets the prototype's own values back; live mode
    starts with none, and an empty supplier list shows one "No suppliers yet" tab because the engine's `adminVals` reads `SUPPLIERS[0]`. Two forms
    under All tools: "Stock items" (list, edit, add) and "Suppliers & prices" (list; a supplier's details and a row per price plus a blank one; the
    supplier is saved first, then each changed price with its own stamp; stops at the first failure). The ported "Add item" and "Remove" go to the
    database (an item is switched off, never deleted); a stock count says it is not kept (C1).
  - **Opus review:** SAFE TO MERGE, nothing critical. Fixed: a price create whose reply was lost could be overwritten by the next save (fresh id),
    quantities changed on the screen were wiped by the reload after a save (kept), a rename and a price create now share one lock order, refusal
    copy. **Recorded, not fixed:** (1) two suppliers selling one item in different pack sizes give a wrong best buy, cost and grocery estimate,
    because a price carries no pack size of its own (the form says so; fix: a `pack_size` on the price, before real data is entered). (2) The
    quantity on hand is 0 for every item until the stock ledger (C1) exists; receiving, waste, bake use and counts still change only the screen
    (a reload after they were entered keeps them, a full page reload loses them). (3) Names stay taken after an item is switched off. (4) A
    demotion without a reload leaves the catalogue in memory (theoretical). (5) The one-time import script is not written: Cine's workbook layout
    is not in the repo, so it belongs with the cutover (finish-plan section 9). (6) A 70-item list is one long scroll: a search box is the next
    step. (7) Only one table grant regression is restored in the SQL harness (RLS blocks the others with the same SQLSTATE).
  - **Evidence:** `pnpm verify` 64 files / 1222 tests; G0 validator passes; port integrity OK (54 files); Python guards OK; SQL role suite 1525
    cases per reset, 2 resets, 436 deliberate regressions detected; `pnpm build`, `test:pages:spike`, `test:workers:spike` pass; `pnpm test:e2e`
    89 / 1 (OFFLINE-01 WebKit) / 75; `test:live:checkout` 11 steps. Mutations: 27 on the first version (26 caught, 1 fixed by a new test) and 3
    on the review fixes, all caught. **Visual QA in the browser pane** (live-mode build, local owner, the seeded demo catalogue as data): the
    inventory, grocery and the ported suppliers screens read the database (a price edit shows "Before: ₱420, ₱438, ₱445"), the Stock items list
    and edit form (low-stock level 300 to 350 saved), the Suppliers & prices list and edit form (butter ₱420 to ₱430 saved, history kept).
    Not looked at: a phone-width pass of the two forms, and the ported "Add stock" sheet end to end.

## Checkpoint - 2026-09-30 (D4)

- **2026-09-30 (D4, finish-plan slice D4):** Cine's upcoming bazaars. Two commits (`d5536d9` database, then the app half and the review fix).
  - **Database:** `scheduled_events` (name, first and last day, place, rent in centavos, active, the event it became, `updated_at`; RLS on,
    no API grant). Owner-only `get_scheduled_events()`, `save_scheduled_event(jsonb, stamp)` (exact keys, whole-centavo rent, at most 15
    days, a stale stamp is `P0002`, an identical repeat of a create is answered) and `link_scheduled_event(booking, event)`. Migration
    `20260101004200` (review fix) makes the first link also book the stall rent as that event's "Stall rent" expense (category "Bazaar
    rent") and ledger cost in the same transaction, keyed on the booking, and gives an event at most one booking (unique index).
  - **App (live mode, no protected markup or engine edit):** All tools > "Bazaar events" (owner only) is the form: a row per booking plus a
    blank one, deactivate instead of delete, only changed rows are sent, each with its own stamp. The Bazaar screen's "Start an event"
    list shows her active, unstarted bookings that have not ended (name, "Sat, Oct 24 - Sun, Oct 25 · place"), soonest first, then "Start
    without a booking" (the two prototype events are never shown in live mode). Starting one opens the event under its name and links it;
    the event's expense list and close-out show "Stall rent" (a local, display-only row from the engine's own function: the
    server already booked it, so it is never queued). Unconfirmed links are kept on the phone (`hc-pending-link`, a list, 3 days) and
    retried whenever the list loads; the toast then tells her not to add the rent by hand.
  - **Opus review (before the fix: BLOCKED on one High):** the rent was booked by the phone after the link answered "first", with a random
    client id, so a lost reply, a failed link or a killed tab could book it twice or never, and the old warning ("add it under expenses")
    invited the double. Fixed as above (the database books it; a retry of the link is always harmless). Also fixed: a start whose reply was
    lost is reused by booking id, not by name (two bookings with the same name could share an event); the form remounts after a conflict so
    it shows what is saved; a create whose reply was lost leaves the blank row on a new id. Security side clean (owner check, grants,
    `search_path`, inputs, Manila dates, no personal data).
  - **Evidence:** `pnpm verify` 62 files / 1150 tests; G0 validator passes; port integrity OK (54 files); Python guards OK; SQL role suite
    1387 cases per reset, 2 resets, 368 deliberate regressions detected (for D4: 12 rule tags, the unique index and a table
    grant); `pnpm build`, `test:pages:spike`, `test:workers:spike` pass; `pnpm test:e2e` 89 / 1
    (OFFLINE-01 WebKit) / 75; `test:live:checkout` 11 steps. Mutations on the new branches: 17 on the first version (16 caught, 1 equivalent) and 8 on the review fix, all caught.
    **Visual QA in the browser pane** (live-mode build, local owner): the form and its saved rows, the Bazaar list, starting a booking
    (event opens under its name, "Stall rent ₱1,800" in Event expenses, one rent expense in the database, the booking linked and gone from
    the list). Not looked at: a test sale and the close-out screen with the rent (needs baked stock; it reads the same local row).
  - **Recorded, not fixed:** (1) the stale check compares to the millisecond, so two saves in the same millisecond are not told apart
    (one owner; theoretical). (2) A booking starts only when the phone is online (the event start is online-only by design). (3) The rent is
    the amount the booking asks at the moment of linking; changing it later does not touch an expense already booked. (4) `docs/DATA.md`
    does not list `scheduled_events` (nor `event_expenses`); documentation debt. (5) A pending link that keeps failing (for example refused with 23505) is retried silently for 3 days, then dropped. (6) Wording is PLACEHOLDER (`SCHEDULED_COPY`,
    `src/lib/orders/staff-copy.ts`). (7) The B4b items below and everything in [current-history.md](current-history.md) still stand.

## Checkpoint - 2026-09-30 (B4b)

- **2026-09-30 (B4b, finish-plan slice B4 second half):** the checkout and the owner's screens, two commits plus review fixes.
  - **Customer checkout** (live mode, `live-checkout.tsx`, no protected markup edited): a Boxes card (shown once the cookies reach
    the smallest box the owner offers; the picked boxes stay removable), an Add-ons card (a row per design, a message box only on an
    add-on that has one, limits counted across all rows of one add-on), the same-day date (today, labelled "same-day +N%", only when
    the owner switched it on and today is a pickup day; only time slots later than now, and a message when none are left), and the
    sampler (the ported flavour stepper; its cap is checked before sending). The client sends only ids, quantities, a design and a
    trimmed message; the server prices everything. The placed card shows the server total and "With: ..." lines. A new refusal
    `ZC007` (a size or add-on switched off after the page loaded) reloads the choices. The ported "no extra charge" line is replaced
    in live mode; a PLACEHOLDER line says extras are added to the total.
  - **Owner's ported screens, no markup edit:** `toEngineOrder` puts the part of the total the flavours do not explain into a reserved
    `priced.__extras` key; `OpsRuntime` replaces `boxTotal` (live only, in the constructor) with flavours at their sold prices plus that
    key, so every ported screen shows the server total by construction (the base also applied the demo price mode, packaging fee and
    flat box price, which the server never uses; this also corrects the customer cart total). The order detail gets rows for each
    add-on, box and the same-day extra ("Extra" label, no swap), the messages sheet a "To pack" line with the card message, and the
    payment reminder states the total and what it includes (never the card message: that text is forwarded).
  - **Bug found by visual QA and fixed (`6d7e759`):** the live gate re-checked the staff profile whenever a tab became visible,
    including on customer pages, where it finds no session and sent the anonymous customer to `/sign-in`, losing their checkout (for
    example on returning from paying in a bank app). It predates B4b. Customer screens are now left alone; a verified owner is still
    re-checked. Reproduced in Chromium and covered by tests.
  - **Evidence:** `pnpm verify` 60 files / 1110 tests; G0 validator 1217 checks, 0 failures; port integrity OK (54 files); Python
    guards 63 OK; SQL role suite 1318 cases per reset, 2 resets (SQL unchanged in B4b); `pnpm build`, `test:pages:spike`,
    `test:workers:spike` pass; `pnpm test:e2e` 89 / 1 (OFFLINE-01 WebKit) / 75; `test:live:checkout` 11 steps (a sticker, a note card
    and a same-day pickup priced by the server and stored; the script takes the next pickup day when no slot is left today, so it
    passes at any hour). 38 mutations on the new branches, each caught. **Visual QA in the browser pane** (live-mode build, local
    owner): the checkout (boxes, add-ons, same-day notice and slots), the placed card, the owner's orders list, order detail (rows add
    up to the server total), the messages sheet and the status page. **Opus review:** the client cannot influence any price; the
    `__extras` key does not leak; no protected markup touched. Fixed: a date that became today while the form was open (midnight)
    is confirmed before the same-day extra is added; a box stuck with no control; boxes refusal wording; a design containing `|`;
    the card message left out of the forwarded text; rows adding up on same-day orders; the owner re-check; the ported price note.
  - **Recorded, not fixed:** (1) the server derives same-day from the date at the moment it runs, so an unsettled retry that
    crosses midnight can still add the extra; a server-side `same_day` flag in the body (refused when it disagrees with the date) would
    close it, and needs a migration. (2) Boxes are offered for any non-sampler item; the server boxes only `cookie` items, so a cart
    with another set can be refused (the refusal is worded about the boxes); the shop view carries no item type. (3) The customer's
    status page does not list add-ons, boxes or the surcharge. (4) The ported "Your order" card total is the flavours only until the
    order is placed (the note under it says so). (5) The bake list shows a sampler as one line, not its flavours. (6) A staff swap
    does not recalculate the surcharge (B4a). (7) Wording is PLACEHOLDER: `ORDER_COPY.extras` (`src/lib/orders/copy.ts`),
    `EXTRAS_COPY` and `MESSAGE_SHEET` (`src/lib/orders/staff-copy.ts`), and the customer texts in `messages.ts`.
  - **Still open from earlier slices:** unchanged (see [current-history.md](current-history.md)). A direct load of a staff URL (for
    example `/orders`) lands on Home after the gate verifies, in live mode; navigate from Home instead (not investigated).

## Checkpoint — 2026-09-29 (B4a)

- **2026-09-29 (B4a, finish-plan slice B4 first half):** boxes, add-ons, the sampler cap and same-day, database and owner form.
  Ethan chose the split (B4a database + owner form, B4b checkout + owner screens) because B4 is far over the ~400-line rule.
  - **Database** (migration `20260101004000_order_extras.sql`): `order_extras` (one row, no API grant): same-day (on/off, percent,
    whether it also covers add-ons and box charges), the sampler (a flavour of kind `set` plus a quantity limit), `box_sizes` and
    `add_ons` (jsonb, validated by the save RPC). `get_order_extras`/`save_order_extras` (owner only, exact keys, whole numbers in
    range, stale stamp `P0002`), public `get_shop_extras` (active items only). `place_order` redefined with optional `add_ons` and
    `boxes` and ten new tagged rules (`same-day-off`, `same-day-time`, `sampler-cap`, `box-size`, `box-fit`, `addon-dup`,
    `addon-unknown`, `addon-variant`, `addon-text`, `addon-qty`); every earlier rule tag and mutation target is byte for byte. New
    SQLSTATE `ZC007` = a box size or add-on that is no longer offered (the customer's page is out of date). New tables
    `order_add_ons` (name, price, variant, note frozen at order time) and `order_boxes`; `orders.surcharge_cents`, `orders.same_day`.
    Total = items + add-ons + box charges + surcharge, all server-side; surcharge = `(base x percent + 50) / 100` centavos, half up,
    where base is the items (plus add-ons and box charges when the owner turns that on). Same-day = pickup date is today in
    Asia/Manila (the customer cannot dodge it); it is **off until the owner switches it on** (decision: a surcharge that starts by
    itself on deploy is not a default to ship; Cine's form offers it). `order_status` and `get_staff_orders` carry add-ons, boxes
    and surcharge; `order_status` never carries the note text. `anonymise_customer` and `prune_personal_data` blank the note-card
    message before they blank the phone (D11); an erased unpaid order takes its lines with it.
  - **Sampler = an ordinary flavour of kind `set`** (price, `capacity_weight` = its cookie count), made in Menu & flavours and named
    in Boxes & add-ons; capacity, swap and reopen need no change. **Boxes are chosen by the customer** (`boxes:[{size,qty}]`,
    at most as many cookies as the order holds; sets and the sampler are not boxable; the rest is bags); a box takes no extra
    capacity. **Add-on limits count all lines of one add-on together.**
  - **Owner form** (live mode, All tools > "Boxes & add-ons", no protected-markup edit): box sizes and charges, add-ons (name, price,
    choices such as sticker numbers, an optional message label and length, limit, on/off), the sampler and its limit, the same-day
    extra. Pesos on screen, centavos on the wire; nothing is deleted, an item is switched off.
  - **Evidence:** `pnpm verify` 57 files / 1052 tests (one unrelated teardown flake in `ops-runtime-live-state` seen once, green on two
    reruns); G0 validator 1217 checks, 0 failures; port integrity OK; Python guards 63 OK; SQL role suite 1318 cases per reset, 2
    resets, 167 regressions per reset each detected (new suite `order-extras.sql`, 143 cases, 24 regressions); `pnpm build`,
    `test:pages:spike`, `test:workers:spike` pass; `pnpm test:e2e` 89 / 1 (OFFLINE-01 WebKit) / 75; `test:live:checkout` 10 steps;
    21 unit-test mutations (data layer, runtime, form) each caught. **Opus review** (SQL, money, personal data): no authorization
    bypass, no High. Fixed: the add-on limit was per line (now per add-on, tested and mutation-checked); same-day default on ->
    off; the same-day campus check used the slot's end (now its start, with cases); a test that passed for the wrong reason (sets
    not boxable); duplicate box sizes `6` and `6.0` (compared as text). Recorded, not fixed: **a staff swap does not recalculate the
    surcharge and can swap a cookie into a set or the sampler after the fact** (staff only; the B3 swap keeps the non-item part of the
    total by design); same-day has no minimum-notice setting (a 16:58 order for 16:59 is accepted); the `23:59` test slot fails
    only if the suite starts in the last minute of the Manila day; newlines are refused in the note message.
  - **Customers see no change yet:** the live checkout sends no `add_ons` or `boxes` and offers no same-day date. `parseShopExtras`
    (the customer read of `get_shop_extras`) is not written; B4b writes it.
  - **Wording and prices are placeholders** (`EXTRAS_COPY` in `src/lib/orders/staff-copy.ts`; the September prices in the
    `order_extras` defaults: note card 10, ribbon 10, sticker 15 with numbers 1-4, sticker pack 50 pesos; boxes 6/8/12 free). Cine's
    real box charges and prices (C5) are entered in the app.
  - **Still open from B3/B2:** unchanged (see [current-history.md](current-history.md)): helper pack/collect, lapsed unpaid orders on
    the bake list, the overage sheet's "over by", no pickup code on the status page, the physical-phone test, WebKit OFFLINE-01, a real
    signed-in owner session against the hosted project.

## Checkpoint — 2026-09-29 (B3)

- **2026-09-29 (B3, finish-plan slice B3):** the owner's side of an order, four commits plus review fixes.
  - **Database** (migrations `20260101003700`, `…3800`, `…3900`): owner-only, idempotent `staff_*` RPCs with the
    `updated_at` stamp (idempotency is checked before the stamp, so a retry after a lost reply never fails): `get_staff_orders`,
    the paid tick `staff_confirm_payment` (re-checks the week when the unpaid hold lapsed; `force` = "confirm anyway"),
    reject, reopen, `staff_set_status` (baking, packed, collected, undo, no-show; packing is blocked while a flavour is
    flagged), flag and swap a flavour (re-priced from today's menu, idempotent on a client id), refund, settle a balance.
    `UPDATE` on `orders`/`order_items` is revoked from the API roles. `get_shop_status()` (public: the ordering window and
    the switch, nothing else) and `set_shop_override()`; `place_order` honours the switch (closed, sold out, held open).
  - **Screens (live mode, no protected-markup edit except the lookup slot):** the ported orders, order, bake and pack
    screens are fed from the database (status = the database state) and their actions call the RPCs server first; the
    engine's local side effects are not repeated (no packaging-stock check on packing, no local ledger, no invoice).
    **The bake list counts unpaid orders** (28 Sep), for the current pickup week. "Customer messages" in All tools: a status
    link and a text to copy per open order. "Order rules" in All tools (`get_order_rules`/`save_order_rules`).
    Every live page reads the shop status, so the banner and the add buttons say what `place_order` will do; the owner's
    close-now, sold-out, closing-soon, open, extend and follow-my-schedule reach the server first.
  - **Guarded slot in `find-my-order.tsx`** (Ethan approved 2026-09-29): `/lookup` shows the live form. Exact reversals
    `LOOKUP_REVERSALS`, baselines regenerated, record in [protected-exception.md](protected-exception.md), port audit PASS;
    the visual PNGs are unchanged.
  - **Decisions and deviations:** the staff RPCs are **owner only** (helper pack/collect stays an open decision; a helper is
    refused in the role suite). The switch is a `shop_state` table, not a setting (a fourth allowed key would have meant
    redefining three settings functions). The 20260101003900 migration is a review fix, added rather than editing 3700.
  - **Evidence:** `pnpm verify` 55 files / 1002 tests; G0 validator 1217 checks, 0 failures; port integrity OK; Python guards
    63 OK; SQL role suite 1175 cases per reset, 2 resets, 143 regressions per reset, each detected; `pnpm build`,
    `test:pages:spike`, `test:workers:spike` pass; `pnpm test:e2e` 89 / 1 (OFFLINE-01 WebKit) / 75; `test:live:checkout` 10
    steps (the shop opens from the server window with no local override, close-now closes the banner, `/lookup` finds an
    order). Unit tests carry a mutation per new branch (about 60 deliberate mutations, each caught). Port audit (Sonnet)
    PASS. **Opus review:** no authorization bypass; one High (reopen could overbook a week), five Medium and six Low; fixed:
    the High, the "this drop" sums (now the current pickup week, anchored on today's Manila date so an order nobody closed in a
    past week cannot become "this week"), the extend-closing and close-drop switches (every other write of the engine's
    `shopOverride` was checked: set-drop-state, close-early and reopen are wrapped; the preview toggles are hidden in live
    mode), a swap refusal with no message, the swap total, lost replies, the refund amount, reopen of a refunded order, the
    list limit. A second review pass by the advisor found the past-week bug and the close-drop gap in those fixes; both are
    fixed and tested. Review finding 4 (demo orders on screen) is not a defect: `orders` is in `EMPTIED_KEYS`, so the live
    base state never holds them (pinned by `live-state.test.ts`).
  - **The order detail's link row** now shows the customer's real status link and really copies it (the ported values are a
    made-up `happycookie.ph/o/…` address and a toast that copied nothing); an order with no token says so. No markup edit:
    the values are view-model fields.
  - **"Payments" screen:** the payments-review screen (`reconcile`) reads `state.orders`, so it lists the database's orders
    and the paid tick is the confirm action. Its "matched to my statement" ticks (`state.matched`) are local only and do not
    survive a reload: **not live yet**, a later slice (E1) if Cine wants them kept.
  - **Left open from the review (not fixed, recorded):** the overage sheet's "over by" mixes cookies and weighted slots (only
    wrong when a flavour's weight is not 1); an owed-back amount after a cheaper swap on a paid order is not shown (the ported
    balance line has no negative form); **lapsed unpaid orders still count on the bake list** until the owner cancels them, which is a
    question for Cine (she said unpaid orders show on her bake list, not whether an order past its 24-hour hold does).
  - **Wording is placeholder** (`src/lib/orders/staff-copy.ts`, `STAFF_COPY`, `MESSAGE_SHEET`, `RULES_COPY`, and the customer
    texts in `src/lib/orders/messages.ts`; the customer sentences in `copy.ts` are still open too): the paid, rejected,
    reopened, packed, collected, no-show, refund, balance, flag and swap toasts; "tick paid before packing"; "a refunded order
    cannot be reopened"; the offline, conflict and unsure lines; the four customer messages (payment reminder, payment
    received, ready for pickup, flavour swap); the order-rules labels and the switch and rules save/refusal lines.
  - **Still open from B2:** the status page has no pickup code in live mode (`showCode` false); the ported status line about
    booking a Grab or Lalamove is false for the campus slot; the ported screens still say Saturday and Sunday for Monday and
    Thursday pickup days (mapped by rank); the invoice wording (F10). **Ported lines false in live mode on the owner screens**
    (kept, not edited): "Emailed when they submitted", the payment-proof sheet and the "Order submitted with proof" timeline line.
  - **Still not run:** the physical-phone test for the 20-Oct gate, WebKit OFFLINE-01, a real signed-in owner session against
    the hosted project (the owner screens are proven against the local stack and unit tests, not a browser sign-in).

## Checkpoint — 2026-09-29 (B2 app half)

- **2026-09-29 (B2 app half, finish-plan slice B2):** the live checkout on the customer pages, live mode only.
  - **One guarded slot in `checkout.tsx`** (D4): `{bareFrame ? <LiveCheckout v={v} /> : (…ported, verbatim…)}` from "About
    you" to the footnote. Exact reversals in `scripts/validate-g0.py` (`CHECKOUT_REVERSALS`), baselines regenerated,
    recorded with the ported lines that are false in live mode in [protected-exception.md](protected-exception.md).
    `order-status.tsx`, `find-my-order.tsx` and `shop.tsx` are not touched by this slice.
  - **What a customer does:** name, Instagram, contact number, pickup date (the owner's pickup days inside the lead
    window, counted on the Manila clock, from `get_shop_order_rules()`), pickup time (half hours, or the campus slot),
    payment method and QR, an optional reference. No email, address, amount or screenshot. `place_order` is called under one
    client id per attempt; the form and box are locked while it is sending, unsettled or placed, so "Try again" always
    resends the identical frozen body; definite refusals (ZC001 to ZC006, 22023, 23505, 42501, 55000) are worded, anything
    else is an unknown outcome. The order number and the status link (`/status#t=…`, fragment only) show on success.
  - **Status page:** fed from `order_status(token)` through `cust.*` (no invoice, no "payment proof", no pickup code); a
    link opens it on a direct load or pasted into the tab. **Find my order** (number + phone) and the **waiting list**
    open as sheets from the shop footer, on customer screens only (gated on the screen, because an anonymous visitor's
    engine role is `'owner'`).
  - **Evidence:** `pnpm verify` 51 files / 898 tests; G0 validator 1211 checks, 0 failures; port integrity OK, 54 files;
    Python guards 63 OK; `pnpm build`, `test:pages:spike`, `test:workers:spike` pass; **`pnpm test:live:checkout`** (new,
    headless Chromium against the live static export and the local stack after `pnpm db:reset`): shop, order, database
    row, status link and reload, lookup, waiting list, no CSP violation, no foreign origin, token in no URL. 43
    deliberate mutations, each caught. Port audit (Sonnet) PASS; Opus review: no Critical, one High (the sent order
    could differ from the screen), fixed with the Mediums and most Lows. `pnpm test:e2e`: see the line under Baseline.
  - **Customer wording is placeholder.** Every new sentence is in `src/lib/orders/copy.ts` (marked PLACEHOLDER; the
    closed-drop sentence is the signed-off one). Cine still needs to word: not enough room (in slots), too many unpaid
    orders, pickup not available, payment method not offered, waiting-list limit, malformed order, order id reused,
    ordering unavailable, the lost-reply and "Change the order" lines, the pay-help line, the unpaid, lapsed, cancelled and
    ready lines on the status page, and the lookup and waiting-list lines.
  - **Cutover blockers found here (not built):**
    1. **The shop's open state must come from the server.** An anonymous customer's engine decides open or closed from the
       default schedule (Monday 9:00 to Thursday 21:00), not the owner's settings: outside it the shop shows "Orders are
       closed" with no add buttons even if the server would take the order, and inside it the banner can say open while
       `place_order` refuses (ZC001). The owner's "close now" (`shopOverride`) is not on the server either, so it stops
       nothing. Needs a public read of the ordering window and the override, and a migration that redefines `place_order`.
    2. The direct URL `/lookup` still shows the ported page (its copy promises email lookup); the shop footer opens the live
       sheet. A second guarded slot in `find-my-order.tsx` fixes it; **Ethan approved it on 2026-09-29, it lands in B3**.
    3. The ported status line "Book your Grab or Lalamove for that window. We send the exact address that morning." is
       protected and false for the campus slot.
  - **Also open:** the owner's form for the order rules (`get_order_rules`/`save_order_rules`) is B3; the two heaviest
    render-every-screen tests in `flavours.test.tsx` got an explicit 20 s timeout (they exceeded 5 s under load at HEAD too).
  - **Still not run:** the physical-phone test for the 20-Oct gate, WebKit OFFLINE-01.

## Checkpoint — 2026-09-29 (B2 database half)

- **2026-09-29 (B2, database half only; the app half was not started):** migration
  `20260101003600_order_lookup.sql`.
  - **`get_shop_order_rules()`** (anon may execute): the eight pickup values a customer's date picker needs (pickup
    days, lead min and max, pickup hours, campus slot, unpaid hold hours) and nothing else. `get_order_rules()` stays
    owner-only because it also holds the anti-abuse numbers.
  - **`find_order(order_no, phone)`** (anon): the status token for an order number and the phone it was placed with,
    or null. Every miss is the same null: malformed input, unknown number, wrong phone, erased order, too many tries.
    The phone is normalised exactly as in `place_order` and `anonymise_customer` (including `+63…` and `9XXXXXXXXX`).
    Throttled per order number, ten tries per fifteen minutes, and only on orders that exist (so no counter row is
    created for a made-up number); the price is that a stranger can use up someone's tries for a while.
  - **Fixture:** the parity case `committed = 2.9` is marked `"sql": false` (TypeScript only) in
    `capacity-cases.json`, and the SQL half of the parity spec skips it, with a note: `capacity_allows()` takes integers
    and the server's committed count is always an integer sum. With that, the spec passes in full against a live stack.
  - **Evidence:** SQL role suite 1024 cases per reset (`order-lookup.sql` 24), 2 resets, 182 regressions detected
    (5 new per reset: throttle, phone check, both phone forms, and a rules leak); function manifest 52; types
    regenerated.
  - **The app half is still to do** and is written in [next-goal.md](next-goal.md): the guarded slot in `checkout.tsx`,
    the `custSubmit` override, the status page from `order_status`, the lookup screen and the waitlist. Decisions
    already made for it (advisor review, 2026-09-29): keep the status token in the URL fragment (`#t=`), not the query
    string; keep one client id per attempt and resend the identical frozen body after a network error; mint a new id
    after a definite refusal or a success; check that a customer page can open the live sheet host before adding a
    second protected edit (the lookup screen's ported copy promises email lookup, which is false in live mode); run
    `pnpm db:reset` before any E2E run (the long-running dev stack was hand-migrated and its grants are stale); the E2E
    fixture must set its own world through the service role (a published flavour, an active method, an open ordering
    window computed in Asia/Manila).
  - **Still not run:** everything in the B2 goal that is app work, `pnpm test:e2e`, the physical-phone test for the
    20-Oct gate, WebKit OFFLINE-01.

## Checkpoint — 2026-09-29 (B1 database half)

- **2026-09-29 (B1, finish-plan slice B1, database half):** migration `20260101003500_place_order.sql`.
  - **`place_order(jsonb)`** (anon and signed-in may execute; `SECURITY DEFINER`, `search_path ''`). The body carries
    exactly the customer's fields (`client_id`, `name`, `ig`, `mobile`, `pickup_date`, `pickup_window`, `pay_method`,
    `items`, optional `pay_ref`, `notes`); any other key (a price, total, state, role) is refused. The server prices from
    `products` where published **and** active, snapshots the price and the capacity weight on each line, and returns
    the order number (`HC-<seq>`), a 64-hex status token and whether it was a replay. Rules, in order: idempotent on
    the client id first (a retry returns the same order and token, also while the shop is shut or the phone is at its
    limit; the same id with another body is 23505), the ordering window (the engine's `dropCycle`, Asia/Manila), the
    payment method is one the owner offers now (active, by label), pickup day / lead time / time (Mon and Thu, 1 to 14
    days ahead, 09:00 to before 17:00 or `campus`), the menu, `maxPerOrder`, open unpaid orders per phone, then
    capacity per pickup week (Mon to Sun, so a Monday and a Thursday count together, C1). Same-day is refused until B4.
  - **D1 in two runtimes:** `order_holds_capacity()` and `holdsCapacity()` in `capacity.ts`, 16 `holds` cases in
    `capacity-cases.json`, run by the unit parity test and by `tests/e2e/capacity-parity.spec.ts` on the SQL side.
    `capacity_allows` did **not** change: D1 changes which orders count as committed, not the arithmetic, and
    `place_order` still asks `capacity_allows()` with weighted units (D9). An order holds unless cancelled, a no-show or
    refunded; an unpaid order still in review lets go after the owner's hold hours (default 24).
  - **Owner rules:** one-row `order_rules` (hold hours 24, unpaid per number 2, pickup days Mon/Thu, lead 1 to 14 days,
    pickup hours 9 to 17, campus 14:00 to 15:30) with `get_order_rules` and `save_order_rules` (exact keys, bounds,
    stale stamp gives P0002). No screen edits them yet.
  - **`order_status(token)`** returns the order, its items at the price paid, the unpaid hold expiry; null for an
    unknown or malformed token; no name, phone, handle or notes. **`join_waitlist(jsonb)`**: idempotent, one entry per
    number and date, five open per number.
  - **No IP keying anywhere**; the limits key on the phone number. Refusals a customer can fix carry ZC001 to ZC006.
  - **Erasure and retention** cover the new personal data: `anonymise_customer` and `prune_personal_data` were
    re-created to blank the Instagram handle, the status token and the body hash, and to delete waitlist rows.
    `pay_ref` stays with the financial record (`erasure-authority.sql` asserts it). The 10-digit form `9XXXXXXXXX` is
    normalised to `09…` in all three functions.
  - **Evidence:** SQL role suite 1000 cases per reset (`order-placement.sql` 175), 2 resets, 172 regressions detected
    (36 new per reset: every customer rule neutralised one line at a time, text mutations on price, hold predicate,
    status keys and erasure, ACL and table grants); function manifest 50; types regenerated; `pnpm verify` 48 files /
    814 tests; Python guards 63 OK; G0 validator 1206 checks, 0 failures; port integrity OK. The SQL half of the
    parity spec passes its 16 hold cases against the local stack. Opus review (model opus): no P0 or P1; fixed before
    commit: the 10-digit phone form, a missing rules row now refuses (55000), a share lock on the menu rows while
    pricing, `payload_hash` cleared on erasure, `24.0` accepted as a whole number.
  - **Recorded, not fixed (owner or later-slice decisions):**
    1. **Capacity can be drained by rotating made-up phone numbers** (Opus P2): about 9 anonymous orders of 24 cookies
       with different numbers fill a 200-cookie week until Cine cancels them. No IP limit is possible; options are a
       cap on how much of a week unpaid orders may hold, or a `consume_rate_limit` bucket per pickup week. Same for
       the waitlist. **Decide before the shop opens (B2/F2).**
    2. `pay_ref` (free text, 40 characters) survives erasure by design; a customer could type personal text in it.
    3. Erasing an unpaid order deletes it, so an offline retry with the same client id would recreate it.
    4. The status token is stored in the clear so a retry can return it; the table has no API grant.
    5. `shopOverride` (close early) is not on the database, so `place_order` cannot see it; persist it before B2 ships.
    6. Any code that creates orders later (B3) must set `pickup_date`, take the week lock and use `order_number_seq`.
    7. The parity spec's old fractional case (`committed = 2.9`) fails against a live database: PostgREST cannot pass
       2.9 to an integer parameter. It was skipped in every earlier run (no local keys) and is unrelated to B1.
  - **Still not run:** the physical-phone test for the 20-Oct gate; WebKit OFFLINE-01 (Playwright); `pnpm test:e2e`
    was not re-run this slice (no app code changed).

## Checkpoint — 2026-09-29 (A2 app half)

- **2026-09-29 (A2 app half, finish-plan slice A2):**
  - **Live checkout:** the customer sees only the payment methods `get_shop_payment_info()` returned, each with
    the owner's account number and name and a QR when she uploaded one. A failed or empty read, or a build with no
    Supabase, shows no method, no QR and none of the ported bank/cash note (the Opus review's P1: that note
    named a real-looking number). Demo mode is unchanged.
  - **Shop footer (finding 16):** live mode prints the registration badge, TIN line, invoice note and allergen
    note only when the owner has typed them; empty prints nothing. The order status page and order detail still
    say "Invoice INV-…": that wording waits for F10 ("Order no.").
  - **Owner forms** (in the existing `LiveFormHost`, no further protected markup): All tools, Business: "Payment
    methods" (list, add, edit, show/hide, order, QR upload) and "Shop texts". The flavour editor gained a photo
    upload. Uploads go to the public `shop-media` bucket under a generated name (uuid plus extension); PNG, JPEG or
    WebP up to 2 MB, checked before sending; the bucket and its owner-only policies are the real lock.
  - **One resolver** (`src/lib/media/resolve-image.ts`) turns a stored path into a display URL for flavours and QR:
    `assets/…` stays page-relative, a generated bucket path becomes the Supabase public URL, anything unsafe draws
    nothing. CSP `img-src` gained the Supabase origin (same value as `connect-src`).
  - **Two protected edits**, recorded in [protected-exception.md](protected-exception.md) with exact reversals in
    `scripts/validate-g0.py` and the baselines regenerated in the same commit: `replacePayAccounts` in the engine
    (three lines after `PAY_ACCOUNTS`) and one guarded branch around the footer in `shop.tsx` (`elements` +1).
  - **Evidence:** `pnpm verify` 48 files / 797 tests (new: `payments.test.ts`, `ops-runtime-payments.test.tsx`; the
    live-gate test also checks the payment read); ten deliberate mutations of the new code, each caught; port
    integrity OK; G0 validator 1206 checks, 0 failures; Python guards OK; `pnpm build`, `test:pages:spike`,
    `test:workers:spike` pass; `pnpm test:e2e` 89 passed / 1 failed (WebKit OFFLINE-01) / 30 skipped. No SQL changed
    in this half, so the SQL role suite stands at the database half's 825 cases per reset. Opus review of the two
    protected edits and the upload path: BLOCKED on the P1 above, fixed and re-tested (see the record).
  - **Recorded, not fixed:** (1) an image is never deleted when the owner cancels or replaces it (orphans stay in
    the bucket); (2) a customer who picked a method the owner then turned off can still submit its label, so B1's
    `place_order` must check the method is offered; (3) the checkout still runs the ported local submit until B2;
    (4) **the D2 carry-over was not built** (the close's `cashCents`/`floatCents` from acknowledged rows): it is
    money/offline work and this slice was already past the size limit, so it stays open ("Recorded, not fixed" 1
    in the D2 checkpoint, [current-history.md](current-history.md)); do it before a two-phone event.
  - **Hosted setup at cutover (F3):** check the `shop-media` bucket on the hosted project (public, 2 MiB, png/jpeg/
    webp); the local config declares it, hosted needs the dashboard or `supabase config push`.
  - **Still not run:** the physical-phone test for the 20-Oct gate; WebKit OFFLINE-01 (Playwright).

## Checkpoint — 2026-09-29 (A2 database half)

- **Database (migration `20260101003400_payment_methods_shop_texts.sql`):** `payment_methods` (label the customer
  sees and an order stores, account number and name, `qr_path`, on/off, order; unique label) and a one-row
  `shop_texts` (registration badge, TIN line, invoice note, allergen note; empty means the shop prints nothing).
  Both tables have RLS, no policy and no API grant. Owner RPCs, `search_path ''`, in-function `is_owner()`:
  `get_payment_methods`, `save_payment_method` (exact keys; `qr_path` must be `qr/<name>.png|jpg|jpeg|webp`, so no
  scheme, colon, `..`, leading slash or subfolder; stale `updated_at` gives P0002), `save_shop_texts`. The one
  anonymous read is `get_shop_payment_info()` (active methods, the four texts, nothing else). The migration seeds
  no row: no real number, QR or claim is committed.
- **Bucket:** `shop-media`, public, 2 MiB, png/jpeg/webp only (no SVG). Four `storage.objects` policies: only the
  active owner selects (upsert needs it), inserts, updates and deletes, and only a generated name under `qr/` or
  `flavours/`; there is no anon SELECT, so the bucket cannot be listed. The bucket row is created by the migration
  when Storage's own columns exist, and otherwise from `supabase/config.toml` (`[storage.buckets.shop-media]`): a
  fresh CLI reset applies migrations before Storage's migrations add `public` and the other columns. Hosted
  projects need one check of the bucket's public flag, size limit and mime list at cutover (F3).
- **`save_flavour` is unchanged.** Its path rule already accepts `flavours/<generated>.png`; uploads get generated
  names (uuid plus extension), so no widening was needed.
- **Evidence:** SQL role suite 825 cases per reset (`payment-methods.sql` 88), 2 resets, 100 deliberate
  regressions detected (8 new per reset: three anon-EXECUTE grants, an anon bucket read, a helper bucket write, an
  unchecked object name, a raw table write, and the public read leaking an inactive method); function manifest 44;
  `pnpm typecheck` clean, `pnpm verify` 46 files / 736 tests, port integrity OK 54 files, G0 validator 1201 checks
  0 failures, Python guards OK, `pnpm db:types` regenerated. An Opus review found no P0/P1 in the SQL logic; its two
  P1s (a harness syntax error and a wrong mutation message) were in an intermediate state and are fixed, and its P2
  (direct SELECT/UPDATE/DELETE probes for every actor on both tables) is in the suite.
- **Not done (the app half, still A2):** the engine `PAY_ACCOUNTS` guarded edit and its records/baselines, the
  stored-path to URL resolver (one for flavours and QR; `RES` in the engine would turn `https://…` into `/https://…`),
  the owner forms for methods, QR/photo upload and shop texts, the guarded footer edit in `shop.tsx` (finding 16),
  CSP `img-src` and the D2 carry-over (the close's `cashCents`/`floatCents` from acknowledged rows). The next goal
  in [next-goal.md](next-goal.md) carries the detail.
- **Recorded, accepted:** `get_shop_payment_info()` has no rate limit (it returns only what the shop prints, like
  `shop_products`); the bucket's public/size/mime settings are enforced by the Storage API and are not asserted by
  the SQL suite; the storage DELETE policy cannot be exercised over SQL (Storage's own trigger blocks it).
- **Still not run:** the physical-phone test for the 20-Oct gate; WebKit OFFLINE-01 (Playwright).

## Checkpoint — 2026-09-29 (D2, bazaar close-out)

- **Database (migration `20260101003300_bazaar_closeout.sql`):** four owner-only RPCs, `search_path ''`, EXECUTE
  for `authenticated`. `load_event_stock` sets the table stock and the drawer float once (only flavours in the
  event's price snapshot; the float has its own column so `start_event`'s retry still matches). `add_event_expense`
  is idempotent on a client id plus a body hash and posts a negative cost to the ledger. `close_event` sets
  `closed_at`, stores the count and the unsold stock, books a short drawer as a cost and an over drawer as
  takings, and returns `event_summary`. `event_summary` is recomputed from rows every time: voided sales never
  count; profit is takings minus expenses plus the drawer variance, and leaves out ingredient cost (needs C2).
- **Close safety (from the Opus review, both P1s):** the close carries the phone's `floatCents` and `cashCents`.
  The server closes only when its own float and non-voided Cash total match; otherwise it refuses with `40001`,
  which the phone treats as "try again later". So a close that overtakes a sale, a void or the stock load is
  retried instead of being booked as a drawer variance. A close dated before an already-recorded sale is refused.
- **Phone:** stock load, each expense and the close are queued like sales (`open:<event>`, `expense:<uuid>`,
  `close:<event>` rows, frozen bodies, sent in the order sales, voids, stock, expenses, close). `OpsRuntime`
  wraps `setEventStock` (a flavour off the event menu cannot be put on the table: closes D1 carry-over 1),
  `openSelling`, `addEventExpense` (positive amounts only), `closeEvent` (queued only if the engine actually
  closed) and `reopenEvent` (a closed event stays closed in live mode). Refusals (22023, 23505, 42501, 55000,
  P0002) are now told apart from a lost connection, and the sync toast says so (closes D1 carry-over 2).
- **Evidence:** `pnpm verify` and `pnpm test:e2e` numbers in the baseline above; SQL role suite 737 cases per
  reset (2 resets, 84 deliberate regressions detected), `bazaar-closeout.sql` 80 cases; 17 deliberate
  mutations of the new SQL and 12 of the phone code, each caught by a test; Python guards 63 OK (function count
  40); G0 validator 1201 checks, 0 failures. Opus review of the SQL: two P1s and four P2s, all fixed or
  recorded; a second look at the fixes found no new P0/P1.
- **Recorded, not fixed:** (1) **The close can retry forever** if the phone counts money the server will
  never hold: a sale the server permanently refused, Cash sales from a former phone after `set_event_device`, or
  a stock load that was refused. The phone should build `cashCents`/`floatCents` only from rows the server has
  acknowledged, and an audited owner override after N tries; do this before a two-phone event. (2) A Cash sale
  that arrives from a former device after the close changes the summary's expected cash but not the stored
  variance. (3) The variance ledger row is linked to its event only by its memo. (4) An expense's date is not
  bounded by the event. (5) A close with no count cannot be given one later. (6) A close dated before a sale
  (clock corrected backwards) is refused as permanent. (7) The lock around `record_event_sale` still needs a
  two-connection test. (8) E1's revenue must use `event_summary` or skip rows with `voided_at`. (9) Helper
  access to selling and closing waits for DP-18.
- **Still not run:** the physical-phone test for the 20-Oct gate; WebKit OFFLINE-01 (Playwright).

## Checkpoint — 2026-09-29 (D1, bazaar sales offline on one phone)

- **Database (migration `20260101003200_bazaar_events.sql`):** an event holds its price snapshot (taken at
  `start_event`, DP-20) and one selling device (decision 5; `set_event_device` keeps the old phone accepted).
  `record_event_sale` is idempotent on the client id plus a hash of the body: a true repeat is acknowledged once,
  the same id with a different body is refused (23505), a total that disagrees with the snapshot is refused
  (22023), a freebie books no ledger row. `void_event_sale` is a never-clearing marker, so void-before-sale,
  repeat void and a stale retry all end voided. `start_event` takes a client event id so a lost reply cannot open
  a second event. Owner-only (DP-18 open), `search_path ''`, EXECUTE for `authenticated`.
- **Phone:** `src/lib/offline/sync.ts` now sends one row at a time to those RPCs through the signed-in
  browser client (`src/lib/data/event-sales.ts`, pesos to centavos in one place) and clears a row only when the
  reply names its client id. A void is its own queue row. `OpsRuntime` wraps `startEvent` (live: online only,
  server snapshot prices, event id kept in `hc-event-attempt` for a retry), `voidSale` (queues the void),
  `recordSale` (renames a sale id the engine reused after a void), `setEventPrice` (locked in live) and, in live
  mode, keeps the running event in `hc-live-bazaar` so a reload at the stall carries on with the same event
  (`bazaar-state.ts`). After every flush the on-screen sale flags follow the queue (live only). `OfflineBridge`
  subscribes to sales (this was the OFFLINE-01 root cause), retries a failed IndexedDB write, and stores the
  scripts the page loaded through the service worker so the phone can reload with no signal (`shell.ts`,
  `data-hc-offline-ready`). `public/sw.js` no longer posts anywhere: it wakes open tabs and caches the shell.
  `src/app/api/sync/route.ts` stays as an uncalled 503 only because the G0 validator pins it as a delivery
  file; the middleware carve-out for it is gone.
- **OFFLINE-01:** passes on desktop and phone (Pixel 7). **WebKit (iPhone 13 profile) still fails** at
  `page.reload()` offline with "WebKit encountered an internal error", before any of our code runs; not
  diagnosed further (Playwright's WebKit with a service worker and `setOffline`). The e2e build has no Supabase
  project, so the acknowledgment comes from a stand-in `saleClient` set on the engine; the server contract is
  proven by the SQL role suite. **The physical-phone test for the 20-Oct gate is not run and still needed.**
- **Evidence:** `pnpm verify` 46 files / 714 tests, exit 0; `pnpm test:e2e` 89 passed / 1 failed (WebKit
  OFFLINE-01) / 30 skipped; SQL role suite `bazaar-events.sql` 87 cases per reset (657 combined, 2 resets, 76
  deliberate regressions detected); Python guards 63 OK (function count 36); G0 validator 1201 checks, 0 failures.
  Mutation checks: four on the RPCs (SQL), eight on the phone code (reply not checked, every row marked sent,
  void not queued, id collision left, start retry id, unnamed event sent, saved event not read back, flags not
  from the queue) each caught by a test. Two Opus reviews: SQL (no P0/P1; two P2 fixed) and phone (two P1 and
  four P2; the reload-loses-the-event P1 fixed by `hc-live-bazaar`, the void-guard P1 not applicable because
  the engine's `voidSale` only returns early for an unknown id).
- **Recorded, not fixed:** (1) a flavour that was inactive when the event started is still on the sell grid;
  a sale of it is refused (22023) and stays queued as failed. The start now says how many flavours cannot be sold;
  D2's stock loading should stop offering them. (2) A permanently refused sale (22023/23505/42501) is retried
  on every flush and looks like a network failure; the sync toast counts void rows as sales. (3) Old queue rows
  from before D1 have no server event and stay failed. (4) The advisory lock (void racing its own sale) needs a
  two-connection test. (5) The owner can already write `event_sales`/`events` directly under RLS, so E1's revenue
  query must skip rows with `voided_at`. (6) Helper access to selling waits for DP-18.

## Checkpoint — 2026-09-28 (MP-09 c1c, slice A1)

- The owner can now add, edit and publish flavours in live mode: name, short name, description, photo path,
  allergens, badge, Permanent/Rotating, cookie/set, capacity weight, sort order and price, saved whole through
  `FlavourSync.saveWhole`/`save_flavour`. A new flavour is a draft (unpublished) until the next publish, with
  an id slugged from its name. "Publish menu" calls `FlavourSync.publish()` and says how many flavours
  customers will now see. Entry points: "Menu & flavours" in `toolGroups` (Business group) and the products
  screen's "Edit price", both owner-only in live mode; every other role still gets the ported edit-price
  sheet. No SQL migration: `save_flavour`/`publish_flavours` already covered every field.
- **F3 applied for the first time:** one live-only form host, reached through the engine's own unrecognised
  `sheet('flavours', …)` kind (already rendered as empty before this slice — confirmed by reading the engine,
  not assumed). `app-frame.tsx` (protected) gained exactly one import and one `bareFrame`-guarded render line;
  inserted by script, not the Edit tool, so it was never reformatted. Exact record: `protected-exception.md`
  "MP-09 c1c"; exact reversals: `scripts/validate-g0.py`; `port-baseline.json`/`port-structure-baseline.json`
  regenerated in the same commit.
- **Independent review (Opus) first BLOCKED**, on one P0 (an unloaded flavour cache let "Publish menu"
  unpublish every real flavour, or a new-flavour save shrink the engine's whole list to one row) and two P1s
  (a form left open across a concurrent quick edit could silently revert it, since its own fields are
  uncontrolled; a cleared price field saved as ₱0). All three fixed, regression-tested and re-verified: **SAFE
  TO MERGE.** One P2 (a same-flavour quick edit mid-whole-form-save is dropped, not resent) accepted, not
  fixed — narrow, no worse than pre-c1c behaviour for that overlap. Independent port audit (Opus): PASS on
  every point; also caught and fixed a formatter's CRLF→LF rewrite of `vals.ts` (content-only diff restored)
  and reverted evidence-file churn left by its own validator run.
- Evidence: `pnpm typecheck` clean; 688 tests / 44 files (17 new, each locally mutation-checked); port
  integrity OK; G0 validator 1201 checks / 0 failures (evidence churn reverted). No SQL role suite run (no
  migration). No deploy.
- Next goal: D1 (bazaar sales, offline on one phone), then D2, gated on the OFFLINE-01/phone test by 20 Oct.

## Current checkpoint — 2026-09-28 (audit of Cine's current system; finish-plan.md written)

- Audited Cine's whole current system against the app.
  - Sources: the workbook (17 tabs), the form, the payment image, the Apps Script, the client guide, and 115
    walkthrough comments.
  - Wrote [finish-plan.md](finish-plan.md): 16 slices to launch, the cut list, how we build, and the decisions.
  - Moved the old status history to [current-history.md](current-history.md).
  - Found: the live shop footer (protected copy) shows "REGISTERED", a placeholder TIN and "An invoice is
    issued…". It must not reach customers; fixed in A2, and F10 decides the wording.
  - Ethan approved every default (F1–F10). F6 applied: the typecheck runs once per turn in the `Stop` hook.
  - Next goal (as recorded then): A1 (the flavour editor and publish button), then the bazaar slices D1–D2.

## Prior checkpoint — 2026-09-28 (MP-09 c1b: prices, publishing, the live shop menu; G2 slice 5 second part)

- **MP-09 c1b is complete locally.** Split as the goal allowed: the flavour editor and its "Publish menu"
  button are **c1c** ([next goal](next-goal.md)). The products screen has no edit-flavour or add-flavour
  control, and every sheet is registered in the protected shell (`app-frame.tsx`), so the editor needs guarded
  protected-markup edits and its own port audit.
- **Database** ([migration 20260101003100](../../supabase/migrations/20260101003100_publish_flavours.sql)):
  `publish_flavours(p_ids)`, active owner only (checked first), `search_path ''`, EXECUTE for `authenticated`
  only. It makes exactly the listed flavours published and every other flavour unpublished, and writes only
  rows whose flag changes: the touch trigger moves `updated_at`, which the owner's device holds for
  `save_flavour`'s conflict check, so changed rows come back with their new `updated_at`. Refuses a null list,
  a null or malformed id, an unknown id and more than 200 ids. `active` stays the day-to-day switch: a
  published flavour taken off the form leaves the shop at once and returns without republishing.
- **Prices:** `OpsRuntime` wraps the engine's `setPrice` (the edit-price sheet). `FlavourSync.save` now covers
  the on-menu switch and the price together: a change made while another save for that flavour is still
  sending is sent right after it, from what the engine shows by then (before, a price changed during an
  on-menu save would have been lost). Pesos become centavos only through `src/lib/money.ts`. Infinity,
  negatives and anything over ₱10,000 (`save_flavour`'s bound) are put back without a round trip; ₱12.346 is
  stored as 1235 centavos and shown as ₱12.35. Conflict reloads with a toast; refusal, offline and a list that
  never loaded put the price back. Placed orders keep their price (the engine's `priced` map;
  `order_items.unit_price_cents` in the database).
- **Live customer shop:** customer pages (signed in or not) read `shop_products` through `fetchShopFlavours`
  and show only published flavours that are on the form, at the published prices. **Found:** the engine's render
  paths name the ported ids (`wcb`, `rvc`, `pbm`), so replacing the list with only the published rows crashed
  every screen (render probe). The ported entries are therefore kept in `P` but off the form, so the shop never
  shows them. Nothing published, a failed read, no Supabase configured, or the moment before the read lands:
  no flavours, never the demo menu. A signed-in owner on `/shop` sees what customers see: the live gate loads
  the full staff list only on a staff screen. Known limit: a page that starts on `/shop`, verifies there
  and then moves to a staff screen without a page load keeps the shop's list (live mode has no such in-app
  link: `bareFrame` removes "Back to ops").
- **Not yet in the app:** publishing (the RPC and `FlavourSync.publish()` are tested; the button is c1c). Until
  then the live shop shows no flavours, which replaces c1's ported demo menu.
- **Evidence (this session):** `pnpm verify` 43 files / 671 tests, exit 0 (24 new: `tests/unit/flavours.test.tsx`
  c1b block, `tests/unit/live-gate-menu.test.tsx`; seven mutations each caught: no pending-shop guard, replay
  sending only the switch, no local price bound, publish not refreshing the cache, ported flavours left on the
  shop's form, staff list loaded on a customer page, an edit with no staff list left unreverted). SQL role suite 570 cases/reset over 2 resets (14 new
  `flavours.sql` rows; the anon EXECUTE regression for `publish_flavours` is detected; 68 deliberate
  regressions). Python guards 63 OK. G0 validator 1198 checks, 0 failures. Evidence churn reverted.
- **Independent review (security reviewer, Sonnet, a different model from this Opus implementation): SAFE TO
  MERGE, no P0/P1.** It confirmed the owner check runs first and needs an active profile (the inactive-owner case
  proves it), `search_path ''` with every reference qualified, EXECUTE for `authenticated` only, complete input
  checks before any write, `shop_products` still exposing only its nine named columns, money only through
  `money.ts`, and no secret or personal data in the diff. Its three P3s: (1) a save landing just after a publish
  can make the next edit show a conflict toast and reload (self-correcting; recorded, not changed); (2) an edit
  made where only the shop menu was read was silently unsent: unreachable in live mode, but now put back with a
  toast (tested); (3) the engine's owner preview cart names `wcb`/`rvc`/`pbm`: safe while products are never
  deleted, since staff always have those ids (recorded; the engine is protected).
- No hosted preview update, no deploy.

## Prior checkpoint — 2026-09-28 (MP-09 c1: flavours from the database, G2 slice 5 first part)

- **MP-09 c1 is complete locally.** Split as the goal allowed: prices, publishing and a flavour editor are
  **c1b** ([next goal](next-goal.md)); payment accounts stay in c2.
- **Database** ([migration 20260101003000](../../supabase/migrations/20260101003000_flavours.sql)): `products`
  gains `allergens`, `item_type` (cookie or set; `kind` already means Permanent/Rotating), `capacity_weight`
  (1–48, default 1, decision D9) and `updated_at` with the touch trigger. Direct `products` DML is revoked
  from anon and authenticated: the owner could previously write any value through PostgREST. New
  `get_flavours()` (any active staff member; a flavour carries no cost) and `save_flavour()` (active owner
  only; exact key set, types and bounds; `image_path` limited to path characters because the engine puts it
  unquoted into a CSS `url(…)`; millisecond `updated_at` check, P0002 when stale; no delete, since the foreign
  keys cascade to recipes). `shop_products` gains only `allergens`; the role suite asserts its exact key set.
- **Engine exception applied** (approved 2026-09-27, extended to `ALLERGENS`): one inserted
  `replaceFlavours()` replaces `PRODUCTS`/`P`/`SEED_PRICES`/`ALLERGENS` in place, plus an appended allergen
  block in the generated seed. Both are exact reversals in `scripts/validate-g0.py`
  ([record](protected-exception.md)). The `PreToolUse` hook blocks every engine edit, so the approved block
  was inserted by a script; the record says so.
- **App:** `OpsRuntime.loadFlavours()` runs on the first verified sign-in for every role (live mode only) and
  also sets `prices`, `dropActive` and an empty recipe for a flavour with none. The engine's
  `toggleDropProduct` saves the whole flavour through `save_flavour`. A conflict reloads with a toast; a
  refusal, going offline or a list that never loaded puts the switch back. **Owner-editable at the database
  only:** Cine cannot yet edit names, prices or add a flavour in the app (c1b). The live customer shop still
  shows the ported list until c1b publishes a menu (every `published` flag is false).
- **Found, not fixed:** `scripts/gen-seed.mjs` already produced a different header comment than the
  checked-in `seed.sql`, so the seed was appended to, not regenerated.
- **Evidence (this session):** `pnpm verify` 42 files / 647 tests, exit 0
  (`tests/unit/flavours.test.tsx`: the seeded rows map back onto the ported constants exactly; every screen
  renders with a seventh flavour that has no recipe; save, conflict, refusal, never-loaded and Settings-reset
  paths; the public projection). SQL role suite 556 cases/reset over 2 resets (new `flavours.sql`, 38 rows; 66
  deliberate regressions detected). Python guards 63 OK. G0 validator 1198 checks, 0 failures. All re-run after the audit fixes; the
  security review saw the migration before the allergen minimum was added. Evidence churn reverted.
- **Independent reviews:** security (Sonnet, a different model from this Opus implementation): SAFE TO MERGE,
  no critical/high/medium. Of its two lows, the silent no-op for a flavour with no loaded row now reverts
  with a toast (tested); a toggle made in the moment before the first load finishes is not saved, recorded
  here and not fixed. **Port audit (Sonnet, independent):** one inserted engine block and nothing else, called only from live mode; the validator reversals and the seed block are exact; port integrity OK (54 files). Its two real findings were fixed and tested: the live Settings reset rebuilt state from the six ported flavours (a loaded seventh would lose its placeholder recipe), and an empty allergen value would print a dangling "Contains " on the shop (`save_flavour` now requires 1–200 characters). Recorded, not changed: `replaceFlavours` also refreshes `P` and `SEED_PRICES`, which are derived from `PRODUCTS`; if the flavour read fails after a reload, the engine shows the ported list. The auditor ran `pip install jsonschema` into the global Python (outside the pinned `python-libs-314`).
- No hosted preview update, no deploy.

## Prior checkpoint — 2026-09-28 (MP-09 b4: helper sale totals and helper money privacy; MP-09 b closed)

- **MP-09 b4 is complete locally, which closes MP-09 b** (settings on the database: b1–b4). Run in
  the same conversation at Ethan's request.
- **Exposure proven first** with a render probe of a live helper on today, sales and bazaar
  (selling, the close-out sheet, and after a close-out). Before the fix a helper saw the running
  "1 sale · ₱260" total, the ₱1,500 event expense, past drop totals (₱5,200) in the sales log,
  and after a close-out the revenue, cookie cost (₱53) and expenses; the big profit figure showed
  whenever the event made money. Today showed no amounts. Helpers cannot reach other screens:
  the engine's `canSee` renders "Only Cine can open this" for anything outside today, sales and
  bazaar.
- **Fix, in view-model values only** ([helper-money.ts](../../src/lib/auth/helper-money.ts),
  applied by `OpsRuntime.renderVals()` for every non-owner role in live mode): cost, expenses and
  profit show "—" whatever the switch says; sale totals (running total, close-out revenue, past
  drop totals) follow `helperSeesSales`, off by default; menu prices, the cart, each sale's own
  amount and the cash-drawer count stay (needed to charge, void and cash up). Cine's control is a
  new "Helpers see sale totals" row on the live rules sheet, saved through `save_setting`. No
  protected file changed ([protected-exception.md](protected-exception.md)).
- **Evidence (this session):** `tests/unit/helper-money.test.tsx` (18 tests: switch never set,
  off and on, each screen and state, a profitable close-out, the close-out sheet, today, demo
  unchanged, and the owner reference); with the fix disabled, 11 of them fail. Owner row test in
  `ops-runtime-settings.test.tsx`.
- **Independent review (Sonnet, a different model from this Opus implementation): first NOT
  SAFE, one P1, fixed; re-check SAFE TO MERGE.** The close-out sheet's per-app totals (GCash, Maya, GoTyme) plus the cash
  sales added up to the exact revenue the switch hides, on every close-out. They now follow the
  switch; the cash-box line stays (the helper counts that cash by hand). Three more tests (21 in
  the file); removing the fix fails the two switch-off cases. The review's P3: the switch is a
  display rule, not a security boundary (a helper summing every sale line by hand still gets the
  total); recorded, no change. It confirmed cost, expenses and profit are hidden everywhere a
  helper can reach, `canSee` blocks every other screen, the sales-log split is exact, and demo
  mode is untouched.
- **Evidence (this session):** `pnpm verify` 41 files/637 tests exit 0; G0 validator 1196
  checks/0 failures; evidence churn reverted. No SQL change (the SQL role suite is unaffected).
  No hosted preview update, no deploy.

## Prior checkpoint — 2026-09-28 (MP-09 b3: preferences and half steps on the database, G2 slice 4)

- **MP-09 b3 is complete locally** (run in the same conversation as b2 at Ethan's request).
  [Migration 20260101002900](../../supabase/migrations/20260101002900_settings_preferences.sql)
  adds one `json_value jsonb` column to `settings` and moves five keys into it: `taxRate` and
  `cogsMultiple` (0.5 steps again), `channels`, `categories` and `inactiveCats`. It also adds
  `helperSeesSales` (0/1, default off) for b4. `save_setting()` is replaced with three new
  kinds, each validated: `half` (a JSON number on a 0.5 step inside the engine's bounds),
  `channels` (known alert names only, booleans only) and `list` (unique, trimmed, 1–40
  characters; categories 1–40 items, inactive categories 0–40). The table's original "no
  jsonb blob" concern is answered in the migration: `save_setting()` is the only writer and
  checks each key's kind.
- `settings_effective()`, `get_settings()` and `get_operating_settings()` gain the column,
  so they are dropped and recreated. The observed catalog shows only their body hashes and
  return types changed: permissions, security definer and `search_path` are identical. The
  staff projection gains the two lists, `channels` and `helperSeesSales` (helpers pick an
  expense category at the bazaar; support reaches the notifications screen). None is a cost.
- **Upgrade proof** (local, by hand): reset to 20260101002800, saved whole-number
  `taxRate` 5 and `cogsMultiple` 6 with September timestamps, applied 20260101002900. Both
  read back as 5 and 6 from `json_value`, not defaults, with their original `updated_at`
  (the touch trigger is paused around the move).
- **App:** `SettingsSync` now reads and applies any setting key through the host, which
  routes the three lists to the top of the engine's state (`STATE_LEVEL_KEYS`) and the rest to
  `cfg`. List defaults come from `BASE_STATE()`, so an offline revert never leaves a list
  undefined. Lists compare by content, so toggling back does not send a save. `OpsRuntime`
  captures `addCategory`/`renameCategory`/`toggleCategory` and its own `toggleChannel`.
  Renaming a category also rewrites the ledger's categories, which stay on the device until
  MP-15. The live rules sheet uses the prototype's 0.5 step again; that part of the b2
  locked-UI exception is withdrawn.
- **The parity test now follows the newest `save_setting()` definition**, not the b1 file, and
  checks the channel names and default categories against the engine's `BASE_STATE()`.
- **Found, for b4 (not fixed here):** the helper-totals switch cannot just flip the engine's
  `showEventMoney` flag. In the close-out sheet that flag also shows cookie cost, event
  expenses and profit, which helpers must never see. And the ported bazaar screen already
  shows helpers the running "N sales · ₱total" line, and after a close-out shows profit and
  cookie cost with no role check (read from the markup; b4 confirms it with a render test).
  Live books are empty today, so nothing real is exposed yet; b4 must land before MP-07
  finish makes bazaar sales real.
- **Independent review (Sonnet, a different model from this Opus implementation): SAFE TO
  MERGE, no P0/P1.** It confirmed identical permissions on the recreated functions, the owner
  check before any read of the value, exact numeric parsing for half steps, and no cost key in
  the staff projection. One low note, kept as is: comparing lists by JSON text can see the same
  object with reordered keys as changed, which only sends a redundant save.
- **Evidence (this session):** `pnpm verify` 40 files/615 tests exit 0 (14 new; two
  mutations each caught: dropping the category save, and treating a half step as whole).
  SQL role suite 518 cases/reset × 2 (10 new owner cases: half step saved, quarter step
  refused, channels saved, unknown alert and non-boolean refused, lists saved, duplicate,
  untrimmed and empty-categories refused, helper switch out of range refused). Python guards
  37 unit + 3 auth + 17 db + 6 security OK. G0 validator 1196 checks/0 failures. Evidence
  files the runs rewrote were reverted. No hosted preview update, no deploy.

## Prior checkpoint — 2026-09-28 (MP-09 b2: settings on the database, app half, G2 slice 4)

- **MP-09 b2 is complete locally, except the preferences, which need a migration.** In live mode the
  Settings values now come from and go to the database. On the first verified sign-in the live gate
  calls `OpsRuntime.loadSettings(client, role)`: the owner reads `get_settings()`, helper and support
  read `get_operating_settings()`, into `state.cfg` on top of `DEFAULT_CFG`. A key the staff projection
  does not return keeps its default, so a helper never sees a cost key, even one left on the device.
- [src/lib/data/settings.ts](../../src/lib/data/settings.ts) holds the one key→column map (`int`/
  `cents`/`text`, parity-tested against `tests/fixtures/settings-cases.json`). The four `cents` keys are
  converted through `src/lib/money.ts` both ways; `discountA`/`discountB` stay whole pesos.
  [src/lib/data/settings-sync.ts](../../src/lib/data/settings-sync.ts) sends one `save_setting` per
  key 600 ms after the last edit, with the `updated_at` it last read:
  - a conflict (`P0002`) reloads and toasts. Keys with an edit still waiting or in flight keep their
    local value and their old `updated_at`, so they are not lost and cannot overwrite the other change
    unchecked;
  - offline, a refusal (`22023`/`42501`) or a typed fraction reverts to the last saved value and toasts.
- `OpsRuntime` wraps the engine's `setCfg`/`bumpCfg`/`numCfg`/`publishPriceMode`/`extendDrop`/
  `closeDrop` in live mode (`closeDrop` resets `extendH`; unsaved, later drops would close late). The
  protected engine is untouched; `componentDidUpdate`'s prop-driven cfg writes are the harness tweak
  panel, which live mode never shows.
- **Idle sign-out** reads `idleMinutesOwner`/`Support`/`Helper` from `cfg` on every activity, clamped
  15–480, falling back to `IDLE_MINUTES` when absent (not saved yet, the read failed, or offline).
- **Locked-UI exception** ([protected-exception.md](protected-exception.md), no protected file changed:
  the ported rules sheet maps over `v.rules`): three idle-minute rows on the live owner's rules sheet;
  "Tax set-aside" and "Cost multiplier" step by 1, not 0.5, because `save_setting` stores whole numbers
  (Ethan left this to Claude on 2026-09-28).
- **Not done: needs a new migration.** The goal said to stop rather than improvise one:
  - `channels`/`categories`/`inactiveCats` cannot go through `save_setting` (a fixed 24-key table,
    `int`/`cents`/`text` columns only). MP-09's "non-config preferences" acceptance therefore stays
    open, and in live mode these three stay in memory only;
  - half-percent tax and half-step multipliers need storage in tenths or a numeric column.
    Drafted as the next goal (MP-09 b3).
- **Fixed after b2 (2026-09-28):** the engine (and the prototype) called `this.toggleChannel` but never
  defined it, so every notification switch threw. `OpsRuntime.toggleChannel` flips that one channel;
  `tests/unit/notification-channels.test.tsx` failed with the TypeError before the fix, in demo and live mode.
- **Independent review (Sonnet, a different model from this Opus implementation): SAFE TO MERGE, no
  P0/P1.** It confirmed no cost key reaches helper/support, one money conversion each way, an idle timer
  that cannot fail open, no trusted client role, and nothing new outside live mode. Two low notes, both
  already covered: the `null` `updated_at` cast carries a comment, and `reload()`'s docstring explains
  the busy-key skip. A second conflict on an edit made mid-flight resolves one round trip later.
- **Evidence (this session):** `pnpm verify` 39 files/599 tests exit 0 (26 new tests; two deliberate
  mutations — dropping the `closeDrop` save and the busy-key skip on reload — were each caught). SQL role
  suite 508 cases/reset × 2 (no migration change). Python guards 37 unit + 3 auth + db + security OK.
  G0 validator 1196 checks/0 failures. The evidence files the runs rewrote were reverted again. No
  hosted preview update, no deploy.

## Prior checkpoint — 2026-09-27 (MP-09 b1: settings on the database, database half, G2 slice 3)

- **MP-09 b1 is complete locally.** Direct writes to `public.settings` are gone: `insert`/
  `update`/`delete` are revoked from `anon`/`authenticated` (the owner keeps raw `SELECT`
  via the pre-existing RLS policy — only writes moved). Every write now goes through
  [save_setting(key, value, expected_updated_at)](../../supabase/migrations/20260101002800_settings_authority.sql),
  a new owner-only `SECURITY DEFINER` RPC that validates against an embedded 24-key rules
  table (column kind, numeric bounds or an enum) built from the engine's own `bumpCfg`/
  `numCfg` bounds and `DEFAULT_CFG` — unknown keys, wrong JSON types, non-integer values
  for `int`/`cents` columns, out-of-range values and a stale `expected_updated_at` are all
  rejected (SQLSTATE `22023` for validation, `P0002` for staleness, `42501` for the
  owner-only gate). `get_settings()` (owner, every key plus `updated_at`) and
  `get_operating_settings()` (any active staff, a 12-key published-safe projection with
  no cost key) round out the read side. `settings_effective()`'s defaults CTE gains
  `idleMinutesOwner`/`Support`/`Helper` (60/60/240, range 15–480, DP-15); its signature and
  config are otherwise restated unchanged.
- **Bounds parity:** [tests/fixtures/settings-cases.json](../../tests/fixtures/settings-cases.json)
  records every key's bounds once; [tests/unit/settings-parity.test.ts](../../tests/unit/settings-parity.test.ts)
  checks it two ways — against the protected engine's own source text, and against the
  migration's VALUES text — 45 tests, mutation-tested (a deliberately wrong bound in the
  fixture was confirmed to fail 2 of them before being reverted).
- **`tests/integration/security/settings.sql` was extended, not rewritten:** the existing
  anon/no_subject/missing_profile/inactive-* denial paths and the service_role
  direct-write path are unchanged; new coverage adds `get_settings`/`save_setting`/
  `get_operating_settings` denial and success paths per actor, plus owner sub-cases for a
  valid save, an update-path save, unknown-key/out-of-range/non-integer/stale (both the
  insert-races-an-existing-row case and a wrong-timestamp update case) rejections, an
  `updated_by` stamping check, a `priceMode` round-trip through a value containing the
  literal "×" (U+00D7) character, and a value check (not just a key-set check) that a
  helper sees the owner's saved capacity through `get_operating_settings`. Result count
  40 → 74; the suite's combined total in `scripts/test-db-security.py` moved 474 → 508.
- **Independent review (Opus, different model from this Sonnet implementation): SAFE TO
  MERGE, no P0/P1.** One medium (P2), fixed: the optimistic-concurrency check compared
  `expected_updated_at` to the microsecond, which a JS `Date` (b2's future client) cannot
  round-trip — every save after the first would have failed forever. Fixed by truncating
  both sides of the comparison to milliseconds. Three low findings fixed: `get_settings`'
  row-count check tightened from `< 21` to `= 24`; the `UPDATE` branch now nulls the two
  non-matching value columns explicitly, rather than leaving a stale one from an
  inconsistent row (theoretical with real data, cheap to close); `docs/DATA.md`'s stale
  "21 editable values" table row corrected to 24. One nit taken: `jsonb_typeof(p_value)`
  moved from the `DECLARE` section to immediately after the owner check — the review's own
  analysis found no actual leak either way (a malformed `jsonb` parameter never reaches the
  function body, for every caller alike), but keeping every read of caller input strictly
  after the auth gate is worth stating as a rule, not just true by construction here. One
  nit not taken: an unqualified `settings` reference inside `settings_effective()`'s
  untouched body predates this migration and is confirmed safe (that function's
  `search_path` is `pg_catalog, public, pg_temp`, not empty); left as-is to keep the body
  byte-identical to the original except for the added defaults, matching the "keep the
  body's shape" instruction from MP-09 a's own review.
- **Evidence:** `pnpm verify` 37 files/573 tests exit 0; the SQL role suite 508 cases/reset
  across 2 fresh resets; all Python guards pass (37 unit + 3 auth + 17 db + 6 security
  integration); G0 validator 1196 checks, 0 failures. `pnpm db:types` regenerated (byte-
  identical output — only the function body changed, not its signature). No hosted preview
  update; no protected file edited; no deploy.
- **Ripple fix, disclosed:** `tests/integration/security/trigger-authority.sql`'s
  `settings_touch` trigger-firing proof used to rely on the owner writing directly via
  RLS; since that path is now revoked, it runs as `service_role` instead (the same
  `auth.uid()`, since `request.jwt.claim.sub` is transaction-local and survives the role
  switch) and is relabeled `service_role` rather than `active_owner` in its result row —
  not removed, just honestly re-attributed to the role that actually performs it now.
- **Caught and reverted before commit, same pattern as MP-09 a:** `validate-g0.py` and
  `pnpm db:types`/`scripts/test-db-security.py` all silently overwrite hash-pinned or
  unrelated historical `evidence/*.json` files as a side effect of running, regardless of
  which slice is current. This session's run touched
  `MP-05b-schema-inventory.json`/`MP-05b-types-write.json`/`MP-06l-bootstrap.json`/
  `MP-06l-security.json` (reverted with `git checkout HEAD --`) and created a stray
  `MP-05b-types-bootstrap.json` (removed). **Worth fixing at the source in a future
  slice** — this is now a repeated failure mode, not a one-off.
- **Disclosed, not fixed:** `taxRate`/`cogsMultiple`'s engine-side 0.5 step can't be saved
  (`int_value` is `bigint`) — blocks b2's ±0.5 buttons for those two keys specifically,
  an open decision for that slice, not this one. `discountA`/`discountB` stay whole pesos
  in `int_value`, not centavos (inherited from migration 00700 unchanged).
  `openDow`/`closeDow`/`openM`/`closeM`/`extendH` bounds are this migration's own choice,
  since the engine never validates them (documented in the migration's comment and the
  fixture).

## Prior checkpoint — 2026-09-27 (MP-09 a: live data boundary, G2 slice 2)

- **MP-09 a is complete locally.** Live mode (`NEXT_PUBLIC_APP_MODE=live`) never shows or stores
  the demo books. [src/lib/data/live-state.ts](../../src/lib/data/live-state.ts) classifies every
  non-ephemeral `BASE_STATE()` key as **emptied** (34 keys: the demo orders, ledger, inventory,
  batches, sales, queue, waitlist and the rest of the audit's list) or **kept** (`cfg` for MP-09 b;
  `prices`/`recipes`/`soldOut`/`dropActive`/`shopOverride` for MP-09 c/d; `dropNo`/`orderSeq`/
  `invoiceSeq` for MP-10; `backup`/`backupAt` for G4 DP-10; `channels`/`categories`/`inactiveCats`
  for MP-09 b2; the rest UI state) — with a unit test that fails on any unclassified key.
- `OpsRuntime` ([src/store/ops-runtime.tsx](../../src/store/ops-runtime.tsx)), never the protected
  engine: its constructor starts live-mode state from `BASE_STATE()` with the emptied keys wiped,
  instead of the protected `loadState()`; `persist`/`resetData` are instance fields on the engine,
  not prototype methods (`super.persist` does not exist), so they are replaced wholesale after
  construction rather than called; `componentDidMount` skips the protected storage-restoring path
  entirely in live mode. `clearStoredBooks()` removes `hc-ops-state-v1` from both `localStorage`
  and `sessionStorage` (never `.clear()`, which would also drop `hc-device-id`) on live mount, the
  live Settings reset, and now `signOutAndRedirect` too
  ([src/lib/auth/live-gate.ts](../../src/lib/auth/live-gate.ts), before the `signOut` call so it
  runs even if `signOut` hangs). `renderVals()` drops the protected engine's fabricated
  `PRIOR_MONTHS` P&L trend to just the current month and recomputes its bar from
  `this.pnlTotals(state).profit`, with the same clamp the engine's own formula uses.
- `src/store/engine/ops-engine.d.ts` gained `EPHEMERAL`/`persist`/`resetData`/`pnlTotals`
  declarations, so the override is fully typed (no `any`). The `.d.ts` is not itself protected —
  only `ops-engine.js` is (`scripts/check-port-integrity.mjs` and the pre-tool-use hook both name
  only the `.js` file).
- Evidence: 80 new unit tests (528 total, after the review below) — every staff screen renders on
  all three devices from the live state with no throw, no `console.error`, no NaN/`undefined`/
  `Infinity` text, and a `[data-screen-label]` where one is reachable without a prior selection
  (order/batch/stocktake need one first, in demo mode too — not a live-state regression); none of
  three seeded demo names appear, with a demo-mode positive control proving each one _does_ render
  somewhere first; live mount never reads a stale save and strips it from both storages while
  keeping `hc-device-id`; live mode never autosaves, even past the debounce window and a `pagehide`
  flush; demo mode still restores an existing save (a real field, not just the write) and keeps
  writing `hc-ops-state-v1`; the live reset preserves device/role, clears storage and is the exact
  function `v.confirmReset` calls; the trend recompute is checked against a real nonzero profit
  (100%), not just the zero-profit case where the clamp floor would hide a missing recompute; a
  mocked offline sale queue is untouched by sign-out, plus a stubbed `indexedDB.open`/
  `deleteDatabase` global proving neither is even reached (jsdom has no IndexedDB, so this remains
  stub-level evidence, not a real-IndexedDB proof — a headless Playwright check is next, once
  MP-07 finish lands). `pnpm verify` 36 files/528 tests exit 0; `pnpm build:pages:spike`/
  `test:pages:spike`/`test:workers:spike` pass with `NEXT_PUBLIC_SUPABASE_URL`/`…PUBLISHABLE_KEY`
  unset (`connect-src 'self'` only, confirmed from the emitted `_headers`); G0 validator 1196
  checks, 0 failures. No protected file edited; no deploy.
- **Independent review (Opus, different model from this Sonnet implementation): SAFE TO MERGE, no
  P0/P1.** Four P2s, three fixed here:
  1. `clearStoredBooks()` read `window.localStorage`/`window.sessionStorage` _outside_ its own
     try — in a browser that blocks site data, or a sandboxed iframe, that getter itself can throw
     a `SecurityError`, crashing the live mount (public shop included) or aborting
     `signOutAndRedirect` before the redirect. Fixed to read `window[name]` inside the try, the
     same pattern the protected engine's own `STORES` already uses. New regression test.
  2. The new live-reset toast claimed "Anything you had entered on this device is gone" — false
     for a sale already queued to IndexedDB (invariant 2). Reworded to "Local records on this
     device were cleared," with no claim about the queue.
  3. (Low) `barHeight` now guards `Number.isFinite(profit)` before the trend formula, matching the
     protected engine's own behaviour on non-finite input; not a behaviour change today.
  4. Not fixed, disclosed instead: the sign-out queue-survival test is jsdom-mock-only. The
     review's own import-chain reading (`live-gate.ts` never imports `@/lib/offline/queue` or
     touches `indexedDB`) is stronger evidence than the mock; a real check needs headless
     Playwright once MP-07 finish (offline queue) lands.
  - Also confirmed by the review: no SSR/hydration risk (`OpsApp` renders `null` until mounted, so
    `OpsRuntime` never renders server-side); editing `ops-engine.d.ts` is in scope (only
    `ops-engine.js` is protected, per both the pre-tool-use hook and `scripts/validate-g0.py`); the
    known MP-07 limitation (a reload drops the on-screen bazaar tally even though IndexedDB rows
    survive) is already disclosed in [G2-plan.md](G2-plan.md) and not new to this slice.
- **Caught and reverted, not committed:** running `scripts/validate-g0.py` for evidence overwrote
  `docs/state/evidence/g0-validation.json` as a side effect (it writes that file regardless of
  stdout redirection). That file is hash-pinned as frozen G0 evidence in `evidence-index.json`
  (`sha256 5ca9431…`); the overwrite was reverted with `git checkout 3e4e146 -- …` both times before
  committing, and the restored file's hash matches the pin. Unlike
  [MP-06l-evidence-overwrite.json](evidence/MP-06l-evidence-overwrite.json)'s incident, git history
  made this fully recoverable, so no separate disclosure file was needed — this paragraph is the
  disclosure. `docs/state/task-status.json`'s `manual_status_values` check also caught a genuine
  typo in this session (`"in progress"` instead of the enum's `"in_progress"`), fixed before commit.
- **Known, not fixed — copy that reads as false in live mode, both in protected files:**
  `src/components/sheets/reset.tsx`'s ported copy ("Everything on this device goes back to the
  sample books") and the protected engine's `savedText` ("saved on this device as you work," now
  true only until the next reload). Both need a locked-UI exception decision, like the live-frame
  one, before they can be corrected — recorded here for that future slice, not decided now.
- **Disclosed: this slice is over the lean plan's ~400-changed-line guideline.** About 620 authored
  lines (577 excluding the auto-generated evidence JSON that was reverted anyway), of which
  roughly 470 are test code across four new/changed test files; ~150 are the actual behaviour
  change (`live-state.ts`, `ops-runtime.tsx`, `live-gate.ts`, `ops-engine.d.ts`). Continued rather
  than split mid-flight because the goal's own acceptance criteria (the full screen matrix, the
  storage-boundary proofs) only hold together as one slice; noted here rather than force-pushed
  history, since force-push is denied by this repo's tooling.

## Prior checkpoint — 2026-09-27 (MP-08 closed: idle sign-out defaults, G2 slice 1)

- **DP-15 decided (Ethan, 2026-09-27):** option B with the audit B10 defaults. `src/lib/auth/idle-signout.ts`
  signs owner and support out after 60 idle minutes and helpers after 240 (was 180, a placeholder). The owner will
  be able to change these within 15 min – 8 h in MP-09 b. The V7.1.1 rationale and accepted risk are recorded in
  the [decision register](decision-register.md); the runbook and configurability audit B10 now give the decided
  minutes. Unit tests assert each role's minutes and a four-hour helper timer.
- Evidence: `pnpm verify` 33 files/445 tests, exit 0; G0 validator 1196 checks, 0 failures. Independent review of
  `061ed64` by the Sonnet security-reviewer: no findings. No deploy; no protected file edited.
- MP-08 is **complete locally** in `task-status.json`. Carried over, not done: the signed-in checks on the hosted
  preview (refresh probe, `auth.sessions`, role bootstrap, idle sign-out), which need a test account Ethan creates
  and signs in with himself (next-goal.md "After these goals" 1); and the provider-account MFA and recovery-code
  rehearsal on Ethan's Supabase, Cloudflare and GitHub accounts (documented in
  [RUNBOOK-accounts.md](../RUNBOOK-accounts.md) §7, not yet recorded as performed).

- Next goals re-audited against the code (G2-plan.md "Slice audit"): MP-09 a gained the full private-key
  classification, sessionStorage and stale-copy cleanup, the live Settings reset and the fake P&L trend; MP-09 b is
  split into b1 (database) and b2 (app). A render probe showed every screen survives empty books, so no protected edit
  is needed for MP-09 a.

## Prior checkpoint — 2026-09-27 (G2 planned)

- Ethan: "start connecting orders, money and stock to the database". [G2-plan.md](G2-plan.md) sets the
  principles (database is the source of truth; every write is a server command wrapped in `OpsRuntime`; live mode
  never starts from the demo books; one protected-engine exception for `PRODUCTS`/`PAY_ACCOUNTS` before MP-09 c)
  and the order: MP-08 close → MP-09 a–d → MP-16 → MP-07 finish → MP-10 → MP-11 → MP-12 → MP-17 → MP-13 → MP-14 →
  MP-15. MP-07 is unfinished (durable offline queue, OFFLINE-01), so customer ordering waits for it.
- The first two goal blocks (MP-08 close, MP-09 a) are in [next-goal.md](next-goal.md). No G2 code yet.

## Prior checkpoint — 2026-09-27 (live frame: no review harness, automatic screen size)

- **Owner-directed (Ethan):** the live build keeps every screen, animation and layout but drops the prototype's
  review aids: header row ("Interactive prototype · … · mock data", device/role/width pickers, simulated
  Online toggle), flow strip and flow bar, and the owner-preview row on the customer shop/order-status screens
  ("Back to ops", "Preview · customer view", drop-state toggles). The frame fills the screen and uses the
  prototype's own phone/tablet/desktop layout by viewport width (<768/<1200/else). Demo mode is unchanged.
  Protected-markup exception recorded in [protected-exception.md](protected-exception.md) and registered in
  `scripts/validate-g0.py` as exact reversals (1196 checks, 0 failures).
- Evidence: `pnpm verify` 33 files/444 tests; `pnpm test:e2e` 87 passed/3 failed (known OFFLINE-01)/30 skipped,
  unchanged; local `build:pages:spike`/`test:pages:spike`/`test:workers:spike` pass; Python guards pass;
  redeployed with `scripts/deploy-preview.mjs` (build → QR placeholders → real-QR refusal → deploy) and
  `scripts/test-hosted-preview.mjs` PASS incl. no harness text and no sideways scroll at 390/834/1280 px.
  Independent port audit: no copy/element/demo change; its process findings are addressed.
- **Still true and easy to misread:** every staff-screen number ("78 of 200", orders, "Good evening, Cine")
  is the prototype's demo data held in the browser. Nothing reads from or writes to Supabase yet; that is G2.

## Prior checkpoint — 2026-09-27 (hosted preview, MP-04)

- **The hosted static preview is live (Ethan approved, $0):** https://happy-cookie-preview.admin-kethai.workers.dev,
  Workers static assets with no Worker script ([spikes/workers-preview](../../spikes/workers-preview/README.md)),
  against the synthetic Supabase project `happy-cookie-preview` (org "Happy Cookie", ap-southeast-1, Free) holding
  fake catalogue data only. The connected Supabase account's other org belongs to another client and was not used.
- All 28 migrations applied; schema equivalence vs the local stack proven by catalog fingerprints (columns,
  policies, functions incl. ACLs identical). Evidence: [MP-04-hosted-preview-2026-09-27.json](evidence/MP-04-hosted-preview-2026-09-27.json).
- `scripts/test-hosted-preview.mjs` PASS: 26 routes with the exact manifest CSP, security headers and cache policy;
  immutable fingerprinted assets; real 404; payment QR images are "test preview, do not pay" placeholders
  (`scripts/preview-placeholder-qr.mjs`, build output only); anon sees 0 rows in all 19 tables (including the
  seeded ones) and 401 on service-only RPCs; `/shop` hydrates with 0 CSP violations/JS errors; in-page proof that
  `connect-src` allows the Supabase origin and blocks an unrelated one. SQL probes: a new function is not
  executable by anon/authenticated/PUBLIC, no table without RLS, only the two shop views, no API grant in `hco_private`.
- **Found:** hosted Postgres is 17, local is 15. PG17 adds the MAINTAIN privilege, which anon/authenticated hold on
  every public table there (not usable over PostgREST, invisible to the local SQL role suite). Follow-up: move the
  local stack to PG17 and add a reviewed migration revoking MAINTAIN from API roles.
- Self-signup is off (Ethan, 2026-09-27; verified `disable_signup: true` via `/auth/v1/settings`).
- Access-token expiry set to 1800 s by Ethan (2026-09-27) under Authentication → Sessions (it moved there from the
  Legacy JWT Secret tab after the signing-key migration). Not verifiable anonymously: `/auth/v1/settings` does not
  expose it; confirm from a signed-in token's `exp` during the signed-in checks.
- **Open for Ethan:** the
  signed-in checks (refresh probe, `auth.sessions`, role bootstrap, idle sign-out) need a test account Ethan creates
  and signs in with himself. Free projects pause after about a week without activity.

## Prior checkpoint — 2026-09-27 (static CSP headers)

- **next-goal.md Goal 2 — static headers for direct Supabase (MP-04 prerequisite) — is done
  locally. No deploy.** [scripts/pages-spike-headers.mjs](../../scripts/pages-spike-headers.mjs)
  now emits `form-action 'self'` and `connect-src 'self'` plus exactly the origin of
  `NEXT_PUBLIC_SUPABASE_URL` (`'self'` alone when unset). `supabaseConnectOrigin()` emits
  only the parsed `URL.origin`, so a path, `;` or newline cannot widen or inject into the
  policy; it accepts `https:` (and `http:` only for a loopback host) and rejects userinfo,
  query or fragment. No `ws:`/`wss:` source: a grep of `src/` finds no Realtime use
  (`.channel(` / `realtime`). [scripts/build-pages-spike.mjs](../../scripts/build-pages-spike.mjs)
  reads the variable once, validates it before building, and passes the same value to the
  bundle env and the header generator (recorded as `staticHeaders.supabaseOrigin` in the
  manifest), so header and bundle cannot diverge.
  - Tests: 4 new unit tests in `tests/unit/pages-spike.test.ts` assert exact directive values
    (parsed, not substrings), rejection of broader/unsafe URLs, and the 2000-character line
    check (3 fail against the previous generator; the overflow check already existed).
    `test-pages-spike.mjs` and `test-workers-web-spike.mjs` assert the served/manifest CSP's
    exact `form-action` and `connect-src`.
  - Evidence (this session): `pnpm verify` 32 files/438 tests exit 0. With the local
    Supabase stack's URL and publishable key set, `build:pages:spike`, `test:pages:spike`
    (`/shop` hydrated, 0 CSP violations, 0 JS errors) and `test:workers:spike` (26 routes)
    all exit 0; the emitted `_headers` carries `connect-src 'self' http://127.0.0.1:54321`,
    the bundle inlines the same origin, longest line 1733/2000. With the variables unset the
    build exits 0 and emits `connect-src 'self'`.
  - **Fixed the same day (follow-up commit):** the live gate no longer creates a Supabase client when the build has
    no URL/key (`hasSupabaseConfig()`); customer screens render and staff screens stay closed and go to sign-in.
    With the variables unset, `build:pages:spike`/`test:pages:spike`/`test:workers:spike` now all exit 0 (`/shop`
    hydrated, 0 CSP violations); configured runs still pass; `pnpm verify` 32 files/440 tests. Independent review
    (Sonnet security-reviewer, different model from this Opus session): SAFE TO MERGE, no P0/P1; its test-coverage
    P2 was added. Its other P2 (a set-but-malformed URL) is already refused at build time by `supabaseConnectOrigin()`.
  - **Previously pre-existing (now fixed, see above):** with `NEXT_PUBLIC_SUPABASE_URL`/`…PUBLISHABLE_KEY`
    unset, both spike tests time out waiting for `/shop` to hydrate. Reproduced identically
    on `f2d14d5` with this change stashed, so it comes from Goal 1's live mode, not the CSP.
    The spike tests therefore need a configured Supabase env.
  - CSP headroom: 267 characters under the 2000 limit; it shrinks by ~54 per new distinct
    inline script hash, and a hosted `https://<ref>.supabase.co` origin is ~18 characters
    longer than the loopback one.

## Prior checkpoint — 2026-09-27 (later)

- **next-goal.md Goal 1 — staff sign-in under architecture A — is done locally.** The
  static export ships with no `src/middleware.ts` (`scripts/build-pages-spike.mjs`
  deliberately excludes it), so the actual gate for a Workers static-asset deploy is
  client-side: [src/components/app/live-gate.tsx](../../src/components/app/live-gate.tsx)
  plus [src/lib/auth/live-gate.ts](../../src/lib/auth/live-gate.ts) and
  [src/lib/auth/idle-signout.ts](../../src/lib/auth/idle-signout.ts).
  - Key rename: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`) replaces
    `NEXT_PUBLIC_SUPABASE_ANON_KEY` everywhere (client/server/config/middleware,
    `.env.example`, CI, Dockerfile, docs). The browser client's own `requireEnv` now reads
    `process.env.NEXT_PUBLIC_SUPABASE_URL`/`…PUBLISHABLE_KEY` as literal member
    expressions, not a computed lookup — the computed form silently returns `undefined` in
    Next's client bundle; verified by grepping a built static export for the literal value.
  - `NEXT_PUBLIC_APP_MODE` (default `demo`) is set to `live` only by
    `scripts/build-pages-spike.mjs`. Live mode: no demo/harness bootstrap
    (`OpsRuntime.renderVals()` starves the role switcher regardless of
    `NEXT_PUBLIC_HARNESS`, which the static build never sets); staff routes need a real
    Supabase session; role and routing come from the signed-in profile via RLS
    (`engine.setRole()`); sign-out uses `{ scope: 'local' }` and never touches the offline
    sale queue (invariant 2).
  - **Independent review (Opus, different model from the Sonnet implementation) found two
    P1s, both fixed and re-verified before commit:**
    1. The gate was decided once from the page's initial screen. The ported
       `shop`/`order-status` screens have a "Back to ops" control
       (`goBackOwner: () => this.go('today')`, protected `ops-engine.js`) that moves the
       engine straight to a staff screen with no page load and no auth check — an
       anonymous customer, or a signed-in helper, could reach staff Home this way. Fixed by
       deriving the gate from the engine's _current_ screen on every render (seeded from
       the initial screen to avoid gating on the engine's own transient default screen
       before `RouteSync` corrects it — that default is `'today'` for every route,
       protected `BASE_STATE`). Covered by a new regression test,
       `tests/unit/live-gate-component.test.tsx`, that reproduces the exact bypass.
    2. `supabase.auth.signOut({ scope: 'local' })` does not always remove the local
       session: reviewed and reproduced against the installed `@supabase/auth-js@2.115.0`
       — if the access token is expired (the normal case for an idle sign-out with no
       signal), `_signOut` tries a token refresh first, and an offline refresh failure
       makes it return before removing the stored session. Fixed by checking `signOut`'s
       own result and force-clearing the session cookies directly on any error
       (`src/lib/auth/live-gate.ts`).
    - Also fixed: a profile re-check that merely can't reach the network (offline, a
      timeout) is now treated as inconclusive rather than a denial once a session has
      already been verified once this page load — otherwise Bazaar Mode's own
      connectivity re-checks would sign the till out for no security reason. A removed
      false claim of an "8 h absolute session lifetime" (`idle-signout.ts`,
      `decision-register.md` DP-15) — that was a property of the archived BFF; there is no
      absolute lifetime under architecture A, which is exactly why the idle timer matters.
  - Local rehearsal on the actual Supabase stack (Docker, all 28 migrations): provisioned
    a helper account, confirmed the finance-only `ledger_entries` table is invisible
    before _and_ after `refreshSession()`, deactivated the account, confirmed it can still
    read its own (now-inactive) profile row — exactly what `live-gate.ts` depends on — and
    is fully locked out. This also found and fixed a real local
    `supabase/config.toml` bug: `[auth.email].enable_signup` is the email/password
    provider's own on/off switch (`GOTRUE_EXTERNAL_EMAIL_ENABLED`), not "allow self-serve
    signup" (that's the top-level `[auth].enable_signup`, `GOTRUE_DISABLE_SIGNUP`) — the
    file had it set off, which silently disabled password sign-in entirely, not just
    signup.
  - [docs/RUNBOOK-accounts.md](../RUNBOOK-accounts.md): owner-assisted provisioning,
    revocation, password recovery with no SMTP, JWT expiry (1800 s, matching
    `supabase/config.toml`), and Supabase/Cloudflare/GitHub account MFA with offline
    recovery codes.
  - `pnpm verify` 32 files/434 tests exit 0; `pnpm test:e2e` 87 passed/3 failed (the same
    known OFFLINE-01 durable-queue failures)/30 skipped, unchanged from baseline;
    `pnpm build:pages:spike`/`test:pages:spike`/`test:workers:spike` all pass, `/shop`
    still hydrates with zero CSP violations and zero JS errors; the built export was
    grepped for `SERVICE_ROLE`/`sb_secret_<value>` (clean) and for the literal configured
    Supabase URL/key (found — confirms the env-inlining fix); the SQL role suite passes
    474 cases/reset across 2 resets.
  - **Not done:** the hosted Workers static-assets preview (needs Ethan's approval, see
    next-goal.md "After these goals"); DP-15's exact idle minutes were then still Ethan's
    decision, not this session's (decided 2026-09-27: 60/60/240; the code then marked them as awaiting DP-15 everywhere they
    appear); Goal 2 (static CSP headers for direct Supabase) is done — see the checkpoint above.
  - **Unrelated, noticed mid-session, left alone:** `.codex/config.toml` was reformatted
    (comments stripped) and gained a `[mcp_servers.codebase-memory-mcp]` entry, and a new
    `.codex/agents/Explore.toml` appeared — neither was an intentional edit in this
    session; both look like an automatic side effect of using the codebase-memory-mcp
    tools rather than anything this session wrote by hand. Left uncommitted for Ethan to
    review and decide on separately; not part of this commit.

## Prior checkpoint — 2026-09-27 (MP-06n)

- **MP-06 default-privilege hardening is done locally.** The 28th migration
  ([20260101002700_function_default_privileges.sql](../../supabase/migrations/20260101002700_function_default_privileges.sql))
  revokes function EXECUTE from PUBLIC both globally (`FOR ROLE postgres`) and
  for the `public` schema's `anon`/`authenticated` default (`IN SCHEMA public`),
  closing the gap [MP-06m](MP-06m-plan.md) proved. It also makes explicit the
  EXECUTE grants on `current_role_name`, `is_owner`, `is_staff`,
  `state_is_recognised`, `state_reserves_capacity` and `capacity_allows` —
  these six had never had an explicit GRANT, so their ACL was purely
  default-derived and would have silently lost `anon`/`authenticated` EXECUTE
  on a second `supabase db reset` against the same database once the two
  revokes above exist (found and fixed after an initial same-model
  security-reviewer pass caught it; a second same-model pass confirmed the fix
  and a related catalog-guard PUBLIC-grantee gap, which was also fixed). A
  third pass, explicitly run on Opus — a different model from the Sonnet
  session that implemented and reviewed this — is the required different-model
  gate: verdict SAFE TO MERGE, nothing at P0/P1, four low/P2 notes (none
  requiring a code change; one was a documentation-accuracy note about this
  line, now corrected).
  - [tests/integration/security/future-function-defaults.sql](../../tests/integration/security/future-function-defaults.sql)
    - `scripts/probe-future-function-defaults.py` prove the new state on two
      identical 28-migration resets: a brand-new function is not executable by
      anon/authenticated/PUBLIC, `service_role` keeps its reviewed grant, and no
      existing function ACL changed.
  - `scripts/test-db-security.py` adds a catalog-wide guard: every `public`
    table/partitioned table has RLS enabled, the only `public` views are
    `shop_products`/`shop_drops`, and no API role (nor PUBLIC) has any
    privilege in `hco_private`. Two red probes (a table without RLS, a PUBLIC
    grant into `hco_private`) prove the guard actually fails closed.
  - `tests/fixtures/mp08g-source-pins.json` now pins 28 migrations; the
    hardcoded "27 migrations" checks in `scripts/test-auth-fixture.py`,
    `scripts/test-db-bootstrap.py`, `scripts/test-cleanup-recovery-rpcs.py`,
    `scripts/test-pages-provider-fixture.py`, `scripts/test-session-repository.py`
    and `tests/unit/test_auth_fixture.py` all derive the count from that pin
    file instead.
  - `pnpm verify` 28/410 exit 0; `python scripts/test-db-security.py` passes
    474 cases/reset across 2 identical resets plus the new guard; all 63
    Python unit/integration guards pass; `scripts/test-session-repository.py`,
    `scripts/test-cleanup-recovery-rpcs.py` and `scripts/test-pages-provider-fixture.py`
    all report PASS with `migration_count: 28`.
  - Not done: the managed-Supabase creator/upgrade rehearsal MP-06m flagged as
    the next step is still open, and hosted acceptance is unstarted. G1 remains
    incomplete.

## Prior checkpoint — 2026-09-26

- **How we work now:** the [lean plan](lean-plan.md), approved by Ethan on 2026-09-26.
  - **Architecture A:** a static site plus direct Supabase, with RLS as the boundary. The BFF is archived.
  - **Process:** one `/goal` per package, and git is the evidence trail.
  - **Run next:** the [next goal](next-goal.md).
  - **Agents:** whichever one is available does the work. Codex is unavailable, so Claude does it for now.
- **Gates:** G0 (MP-00–03) complete. G1 (MP-04–08) **in progress**. Release acceptance **FAIL** — see [task-status.json](task-status.json).
- **Accepted locally since 2026-09-24** (details and limits are in the history below):
  - [MP-08n](MP-08n-plan.md).2/.3: an actual Workerd → private GoTrue/PostgREST lifecycle.
  - [MP-08o](MP-08o-plan.md).1–.4: cleanup recovery, fair claims and a scheduled cleanup Worker (migrations 25–26).
  - [MP-06l](MP-06l-plan.md): the erasure digest/EXECUTE repair (migration 27).
  - [MP-04d](MP-04d-plan.md): one export served by both Pages and Workers adapters, with a generated hash CSP and cache policy.
  - MP-04e: the Cloudflare Wrangler profile is ready. No hosted resource exists.
- **Verified 2026-09-26 by Claude**, on the tree Codex left:
  - Pinned `pnpm verify`: 28 files / 410 tests, exit 0 ([receipt](evidence/G1-verify-claude-20260926.txt)).
  - Continuity: 1,184 checks, 0 failures.
  - All 934 evidence-index hashes matched.
  - The latest full CLI E2E is still 87 passed / 3 failed (durable offline queue) / 30 skipped, from [MP-07a](MP-07a-plan.md).
- **Open G1 work, in order:**
  1. [MP-06m](MP-06m-plan.md) default-privilege probe: **complete locally 2026-09-26** (Claude ran it: two identical resets, clean rollback and cleanup). It proves a global-only default revoke is insufficient, because new `public` functions still get `anon`/`authenticated` EXECUTE. Next is a separately reviewed 28th-migration hardening plan with a managed-upgrade rehearsal.
  2. The rest of G1 under architecture A is **one goal**: [next-goal.md](next-goal.md). It covers:
     - the 28th-migration default-privilege hardening;
     - `supabase-js` sign-in, role bootstrap and fail-closed sessions;
     - a client-side idle sign-out with its minutes then awaiting DP-15 (decided 2026-09-27);
     - a provisioning runbook;
     - the CSP `connect-src`/`form-action` changes.
  3. The hosted static preview on Workers static assets (DP-14 is resolved) needs Ethan's approval.
  - MP-08p, the BFF sign-in, is superseded by architecture A.
- **Open residue:**
  - the test-only `build/pages-spike/.mp08n3-network-sxm347` scratch directory;
  - the historical `evidence/MP-05a-failure-cleanup.json`, overwritten by a test and disclosed in [MP-06l-evidence-overwrite.json](evidence/MP-06l-evidence-overwrite.json). The original bytes are unrecoverable because the file was never committed.
- **Owner decisions:** see the [decision register](decision-register.md), the [owner decision packet](owner-decision-packet.md) and [owner inputs](owner-inputs.md). **G2 (MP-09+) stays blocked** until they are answered.
- **Committed:** the G1 baseline is `6f334c1` (pre-commit `pnpm verify` 28/410 passed; secret scan of 1,049 files found no hits). It is pushed to the private branch `origin/agent/codex/MP-04-g1-feasibility`. Agents now commit and push each accepted slice under Ethan's standing approval. `main` has 15 Dependabot alerts (7 high); those belong to the G4 security pass.
- **Frozen:** `G1-evidence-index.json` and the per-slice receipts are history. From now on, git commits are the evidence trail.

## Checkpoint history (newest first; kept verbatim except for a mojibake repair of `â€”`/`â€“` to —/–)

### Checkpoint bullets as recorded before the 2026-09-26 consolidation (verbatim)

- **Cloudflare account setup — 2026-09-26:** a distinct `happy-cookie-ops` Wrangler profile is authenticated and bound to this checkout after owner approval through GitHub sign-in. Read-only identity and name checks show the reported email, one account, zero Pages projects and no target Worker collision; the default profile is preserved. The owner reports that Workers & Pages displays Free. [Sanitized preflight](evidence/MP-04e-cloudflare-preflight.json). Spend settings, hosted config, secrets, CPU/quota proof and deployment are still open; no hosted resource was created.
- **MP-06l erasure authority — 2026-09-25:** accepted on local disposable fixtures. A forward-only 27th migration qualifies `extensions.digest` inside the owner-only erasure function and removes PUBLIC/anon EXECUTE while preserving its other body behavior, owner, path and authenticated/service grants. Two fresh database resets and the SQL role suite pass 474 cases per reset and 62 unsafe-grant probes, with exact rollback/cleanup; a two-pair private Auth HTTP lifecycle, unchanged generated types, 60 Python guards and [pinned verification](evidence/MP-06l-verify-accepted.txt) (28 files/410 tests) pass. [MP-06l plan and limits](MP-06l-plan.md). Hosted API/JWT, legal retention rules, function defaults, assigned-event capability, MP-06 and G1 remain open.
- **MP-04d local Pages/Workers prerequisite — 2026-09-25:** accepted locally. One fresh 26-page export drives both adapters. Generated exact-HTML CSP hashes, strict fingerprinted-asset cache validation, Pages and Workers Workerd oracles, all-route Workers CSP checks and CLI Playwright `/shop` hydration pass; the Worker bundles in dry-run mode with no upload. [Pinned verification](evidence/MP-04d-verify-accepted.txt) passes 28 files/410 tests. [Plan and bounded evidence](MP-04d-plan.md). Correct-account Wrangler setup completed separately on 2026-09-26; hosted Pages/Workers proof, Auth/private file/sync/CPU/quota checks, DP-14 and G1 remain open.
- **MP-08o.4 local scheduled adapter — 2026-09-25:** local acceptance **PASS**. A separate `scheduled()`-only Worker composes the existing cleanup authority, caps each tick at three claims/40 fetch attempts/24.5 seconds, and emits aggregate-only outcomes. Five focused tests, no-binding Workerd dispatch, dry-run bundle and independent Sol/high review pass. Two consecutive fresh private-provider/database fixtures after the review correction ([attempt 10](evidence/MP-08o4-provider-attempt10.txt), [attempt 11](evidence/MP-08o4-provider-attempt11.txt)) prove empty, cooldown and completed revocation ticks, exact provider-session absence and SQL state, wrong-key/TLS rejection, 26 migrations, no published provider ports and zero owned residue. Earlier fixture failures remain in the [attempt ledger](evidence/MP-08o4-provider-attempts.json). The synthetic-key translation is test-only and does not prove hosted Supabase key handling. Correct-account Wrangler setup completed separately on 2026-09-26. Hosted configuration, Cron activation, CPU/free-tier measurement, browser/provisioning checks, MP-08 and G1 remain open. See [MP-08o](MP-08o-plan.md).
- **MP-08o.3 local acceptance — 2026-09-25:** the new 26th migration gives eligible cleanup rows a fair first-eligibility/last-attempt order while retaining the 30-second floor, skip-locked claims, fences and restricted grants. Two fresh private Auth/database pairs pass 12 repository/race scenarios, including repeated waiting early revocations ahead of one eligible failed row; final cleanup RPC and real composed provider fixtures pass with zero owned residue. Two-reset schema generation leaves public TypeScript types unchanged; the reviewed function manifest records one body-hash change. [Final pinned verify](evidence/MP-08o3-verify-final.txt) passes 26 files/403 tests; independent Codex Sol/high review found no remaining P0–P2 issue in the inspected SQL and fixture. See [MP-08o](MP-08o-plan.md). The scheduled caller, hosted/browser gates and G1 remain open.
- **MP-08o.2 local acceptance — 2026-09-25:** the 25th migration, generated types/manifest, fenced encrypted-credential rotation, exact Auth-row absence completion and bounded cleanup pass their local gates. The SQL fixture proves role/binding/version checks and observes a concurrent follower waiting on the leader's row lock; two consecutive fresh private-provider fixtures pass post-refresh/pre-save interruption, 11-second parent replay and exact cleanup, with 25 migrations, no published ports and zero owned fixture residue. [Final pinned verify](evidence/MP-08o2-acceptance-verify.txt) passes 26 files/403 tests; [continuity](evidence/G1-continuity-MP08o2-accepted.txt) passes 1,184 checks. Independent Codex Sol/high follow-up found no remaining P0–P2 issue in the inspected final changes. See [MP-08o plan](MP-08o-plan.md). Fair claims, scheduled caller, hosted/browser gates and G1 remain open.
- **Earlier MP-08o.2 provider prerequisite:** a fresh pinned private GoTrue/PostgreSQL fixture proved that replaying the direct-parent refresh token after 11 seconds returns the same active child token, preserves the exact user/provider-session binding, and permits local logout of only that session while another session of the same user remains usable. An independent Codex Sol/high review found three P2 gaps; the plan and fixture were corrected and the final fixture rerun passed. See the [probe and limits](MP-08o-plan.md) and [sanitized result](evidence/MP-08o2-parent-reuse.txt). This is local provider-behavior evidence; the current implementation and remaining acceptance gates are recorded above. Claude is unavailable; Codex-only work applies.
- **Gates:** G0 (MP-00–03) complete. G1 (MP-04–08) **in progress**. Release acceptance **FAIL** — see [task-status.json](task-status.json).
- **Latest engineering:** [MP-08m](MP-08m-plan.md) is complete locally. [MP-08n](MP-08n-plan.md) is in progress: the n.1 PostgREST smoke passes, and the n.2 composed lifecycle is **flaky and not accepted**. See its "Interim results".
- **Codex follow-up, later on 2026-09-24:** the earlier n.2 interim assessment above is superseded for the **local injected-bridge criterion** by two consecutive timed fresh-fixture passes, with 24 migrations, no published ports and zero owned residue ([attempt 1](evidence/MP-08n2-timing-attempt1.txt), [attempt 2](evidence/MP-08n2-timing-attempt2.txt)). The previous 503 root cause remains unknown. Actual Workerd-to-provider networking (n.3), integrated browser acceptance and G1 remain open.
- **Verified today:** full `pnpm verify` on the current tree with the pinned Node 24.20.0 / pnpm 9.12.3 passed 26 files / 387 tests, exit 0 ([receipt](evidence/MP-08n-verify-claude.txt)). The latest full CLI E2E remains 87 passed / 3 failed (durable offline queue) / 30 skipped (SQL fixture) from [MP-07a](MP-07a-plan.md).
- **Owner decisions:** owner-authored sources (the filled client guide, walkthrough margin comments, the Meeting 1 transcript) conflict with parts of the plan and prototype. They are recorded in the [decision register](decision-register.md). The open questions for the owner are in the [owner decision packet](owner-decision-packet.md), and the materials she offered are tracked in [owner inputs](owner-inputs.md). **G2 (MP-09+) stays blocked** until those are answered.
- **Open G1 work, in order:** finish MP-08n → MP-06 remaining authority → MP-04 hosted spikes on Pages _and_ Workers (DP-14) → MP-08 closure (UI wiring, session cleanup, idle timeout, provisioning) → MP-07 real bootstrap.
- **Who does what:** see the [shared Codex/Claude policy](agent-orchestration.md). Codex owns application code, migrations, tests and fixtures. Claude owns governance/docs and cross-reviews.
- **Availability update, later on 2026-09-24:** Ethan no longer has a Claude subscription. The [current Codex-only override](agent-orchestration.md) supersedes the prior allocation; independent Codex review replaces queued Claude review. No paid/API fallback is authorized.
- **MP-08n.3 update, later on 2026-09-24:** the 26-page build and unconfigured emulator pass, but three fresh actual Workerd/provider fixtures fail at login HTTP 503. The latest sanitized diagnostic records zero gateway/provider requests, so the [local runtime boundary](MP-08n3-plan.md) remains unaccepted. A Codex security review also found that expired/failed session cleanup has no scheduled caller. MP-08 and G1 remain open.
- **MP-08o.1 update:** a fresh private GoTrue probe confirms expired access-token logout returns 403 `bad_jwt` without removing its session; refresh then local logout of the same session succeeds. See the [probe plan/result](MP-08o-plan.md). This is provider behavior evidence, not a cleanup implementation or MP-08 closure.
- **MP-08n.3a update, later on 2026-09-24:** a minimal non-secret Pages Function in actual local Workerd reached loopback HTTP and CA-trusted HTTPS (both 204); the no-CA HTTPS control failed while HTTP still worked. [Probe receipt](evidence/MP-08n3a-network-probe-final.txt). This narrows the earlier login 503 to the full configured/gateway path. The next full private-provider rerun stopped before fixture creation because the Docker Desktop Linux engine pipe was absent. An initial probe left one test-only scratch directory after a Windows file lock; exact cleanup remains open. The full lifecycle, MP-08 and G1 are still unaccepted.
- **MP-08n.3b supersedes the earlier local lifecycle failure:** actual Pages Workerd → CA-trusted gateway → private GoTrue/PostgREST login/read/refresh/role-change/logout/post-logout and final SQL passed on three fresh fixtures, including [two consecutive passes](evidence/MP-08n3b-lifecycle-attempt4.txt) with 24 migrations, zero published ports and guarded fixture cleanup. The [plan/result](MP-08n3-plan.md) records the Workerd fetch fixes, a generic failed attempt between passes, and one prior test-only network scratch directory that remains after command policy rejected exact-path recursive cleanup. Local functional behavior passed; total test residue, hosted and browser acceptance, scheduled cleanup, MP-08 and G1 remain open.
- **Uncommitted:** all G1 work since `dc8c8a5` is uncommitted, and the branch has no remote. Committing or pushing needs Ethan's approval after cross-review. The 2026-09-24 secret scan found only synthetic test values.

> **Latest G1 checkpoint — 2026-09-24:** [MP-08m](MP-08m-plan.md) completes local Pages session route composition with a typed, allowlisted service RPC bridge, exact-origin/session dispatch, trusted caller selection and fail-closed configuration. `pnpm verify` passes 26 files/387 tests; the 26-page build and unconfigured emulator pass. A configured Workerd boot with synthetic-only bindings passes four boundary statuses without contacting a provider. Independent read-only review found no actionable P0–P2 issue. Actual composed GoTrue/PostgREST lifecycle, real browser bootstrap, MP-06 remaining authority, offline queue, hosted Cloudflare and physical Apple acceptance remain open. G1 is active, not release-ready.

> **Latest G1 checkpoint — 2026-09-22:** [MP-08k](MP-08k-plan.md) completes the unwired persistent `SessionAuthority` adapter locally, and [MP-08l](MP-08l-plan.md) records the exact pinned-provider duplicate-logout contract. The adapter composes the durable repository, Auth transport and encrypted envelope with fail-closed validation, stable browser identity and bounded cleanup recovery. Eighty focused tests, 33 fixture guards and full `pnpm verify` (24 files, 363 tests) pass; final independent review found no P0–P2 issue, and Docker cleanup reports zero owned residue. Route/service composition, integrated browser lifecycle, real bootstrap, offline persistence, hosted Cloudflare and physical Apple acceptance remain open, so G1 is still active.

> **Latest G1 checkpoint — 2026-09-22:** [MP-08j](MP-08j-plan.md) is complete locally. A private 24th migration and seven service-only RPCs now provide durable hashed BFF sessions, fixed eight-hour expiry, refresh fencing, revocation and retryable cleanup. Two fresh pinned Auth/database pairs pass 11 repository/race scenario groups; 26 guards and two 462-case security resets pass; generated types/manifest align and cleanup finds zero owned resources. Review found no P0/P1 issue and one documented exact-clock evidence limitation. G1 remains incomplete: the adapter and routes are unwired, and real bootstrap, offline persistence, hosted Cloudflare and physical Apple acceptance remain.

> **Latest G1 local checkpoint — 2026-09-21:** Docker Desktop is running again. [MP-08i](MP-08i-plan.md) passes two fresh pinned private GoTrue/PostgreSQL HTTP lifecycles: signup, login, Auth-checked user, refresh, local logout, deleted session row and exact post-logout 403 `session_not_found`; all owned fixtures were removed. The app Auth transport now accepts that exact provider denial. [MP-04c local export repair](MP-04c-plan.md) passes static build, emulator and forced-failure artifact invalidation with untracked nonignored source included. Full `pnpm verify` passes 336 tests, and 21 Python fixture guards pass. Durable session persistence/authority, hosted Pages measurement, real bootstrap, offline queue and G1 release acceptance remain open.

> **Prior MP-08h checkpoint — 2026-09-21:** [MP-08h](MP-08h-plan.md) adds an Auth `/user`-checked provider session ID binding and requires routine refresh to preserve the cookie ID, CSRF token and absolute expiry. Focused 97 tests and full `pnpm verify` (336 tests) pass; independent read-only review has no findings in this bounded scope. The binding remains unwired. Docker was unavailable at that checkpoint; MP-08i above supersedes that limit with actual pinned HTTP evidence.

> **Latest local Auth-schema checkpoint — 2026-09-21:** [MP-08g](MP-08g-plan.md) passes the managed `auth.sessions` metadata preflight on two fresh pinned GoTrue/PostgreSQL pairs: 23 reviewed migrations, three single-column PK contracts, matching schema metadata, no demo transactions, no published host ports and exact cleanup. [Final receipt](evidence/MP-08g-live-final.txt), 15 guard tests and `pnpm verify` (323 tests) pass. The prior [MP-08e](MP-08e-plan.md) failure came from the bare PostgreSQL fixture and is not a provider incompatibility finding. Persistent BFF sessions, real Auth HTTP behavior and G1 remain incomplete.

> **Environment after the passing run:** an immediate read-only check found zero MP-08g containers, networks and workdirs. Docker Desktop later stopped exposing its API; a normal hidden launch did not restore a responsive engine. Do not rerun SQL acceptance until the local daemon responds. No socket deletion or global Docker cleanup was attempted.

> **Prior local SQL checkpoint — 2026-09-20:** [MP-06k](MP-06k-plan.md) passes its previously blocked role suite on two clean disposable resets: 462 cases per reset, 60 deliberate red probes, four function guards, ten sequence restorations, two profile upgrades, matching catalog/schema and guarded cleanup. A stale profile test oracle was corrected to the MP-06k raw-table policy.

> **Latest G1 checkpoint — 2026-09-20:** [MP-07a](MP-07a-plan.md) repairs the local demo's direct-route adoption, stocktake alias, clock-drift hydration and mixed browser/app history, including bake navigation without a tick, without editing protected UI or engine. `pnpm verify` passes 323 tests and the latest full CLI Playwright suite records **87 passed, 3 failed, 30 skipped**. All 3 failures are the still-absent durable bazaar sale queue; 30 SQL capacity cases lack an isolated database fixture. The client mount gate leaves public prerender HTML blank pending deterministic real bootstrap. MP-07, MP-08, MP-04 and G1 remain incomplete; no hosted/provider or physical Apple acceptance is claimed.

> **Latest G1 checkpoint — 2026-09-20:** [MP-08f](MP-08f-plan.md). MP-08f safe sign-in return paths complete locally:38 focused cases and pnpm verify323 tests pass. Existing form only changes helper import/next computation; original form-tail hash restored after Claude formatter drift. Sol/high review no findings; Claude review unavailable due expired OAuth. Real BFF persistence, Docker SQL and G1 acceptance remain incomplete.

> **Latest G1 checkpoint — 2026-09-14:** [MP-08e](MP-08e-plan.md). MP-08e provider-schema preflight prepared and statically reviewed:3 runner guard tests and pnpm verify285 tests pass. Actual managed-schema SQL is NOT_VERIFIED/BLOCKED_ENVIRONMENT; outer Docker check stopped before fixture creation. Explicit not_after expiry and durable repository/race requirements documented. No persistence migration, real Auth or G1 completion claimed.

> **Latest G1 checkpoint — 2026-09-14:** [MP-08d](MP-08d-plan.md). MP-08d encrypted session-token envelope complete locally:21 crypto/interoperability tests and full pnpm verify285 tests pass; Sol/high review has no remaining findings. Claude timed out without writes; one Terra/medium fallback implemented the module and unit tests, root independently verified Node AES-GCM interoperability. Persistent session store/provider races/Pages and MP06k SQL remain incomplete. G1 active.

> **Latest G1 checkpoint — 2026-09-14:** [MP-08c](MP-08c-plan.md). MP-08c Auth transport complete locally: Claude Sonnet/medium implementation, independent root tests and Sol/high review; 43 transport tests and full pnpm verify264 tests pass. Includes real loopback HTTP gzip decoding evidence. Persistent SessionAuthority, real provider acceptance, Pages/UI integration and MP06k SQL remain incomplete. G1 active.

> **Latest G1 checkpoint — 2026-09-14:** [MP-08b](MP-08b-plan.md). MP-08b HTTP session handler and independent verification packets complete with injected test authority:41handler+65requestpolicychecks, full pnpmverify221tests, final Sol/highreview no remainingfindings. Claude coded the handler; root integrated and fixed reviewfindings. Real persistent Auth/session authority, Pages/UI wiring, revocation/refresh concurrency and MP06kSQL remain incomplete. G1 active.

> **Latest G1 checkpoint — 2026-09-13:** [MP-08a](MP-08a-plan.md). MP-08a request-policy prerequisite complete locally:65 new real Request/stream security tests, full pnpmverify180tests, independent Sol/high review no findings. Origin/customheader, session CSRF comparison and boundedJSON validation implemented; no actual login/cookies/JWT/session binding or revocation yet. MP06k SQL behavior remains blocked by Docker startup; G1 incomplete.

> **Latest G1 checkpoint — 2026-09-13:** [MP-06k](MP-06k-plan.md). MP-06k implemented; acceptance incomplete. Explicit unpublished-by-default catalog and fixed-field read-only views generated consistently across two23migration resets. Final pnpm verify passes115tests with two forks;22Python checks pass and the real Docker cleanup check is environment-blocked. New SQL role/projection suite is NOT_RUN because Docker startup fails at stale dockerInference socket. Claude supplied code and independent review. G1 remains active and incomplete.

> **Latest G1 checkpoint — 2026-09-13:** [MP-06j](MP-06j-plan.md). MP-06j private-table restrictions pass locally: 16 policies on 11 tables; 842 SQL checks, 56 regression probes, 4 live function guards, 10 sequence restorations and 2 profile upgrades. Unchanged types and all other catalog sections; 115 application tests and 23 Python guards pass. Claude review has no blocking findings. G1 remains incomplete; assigned-event projections, controlled commands, function defaults, sessions, routing and hosted acceptance remain open.

> **Latest G1 checkpoint — 2026-09-13:** [MP06i](MP-06i-plan.md) adds a verified local function drift guard and creator/extension audit:4liveboundaries/636SQL/52red/10seq/2upgrades,115tests/23guards pass. Actual legacy erasure fails42883 at unqualified digest; rollback preserves customerfixture. Globalfunctiondefaults/managedupgrade compatibility and erasure remediation remain open. G1 incomplete; no hosted/production change.

> **Latest G1 checkpoint — 2026-09-13:** [MP06h](MP-06h-plan.md) completes trusted function search paths locally.636SQL/52red/10seq/2upgrades,19guards/115tests/types/catalog/cleanup pass;17bodies/owners/grants unchanged,16configchanges. Claude no blockers. G1 remains incomplete: global function defaults/remaining capabilities/projections,real sessions,routing and hosted acceptance are open.

> **Latest G1 checkpoint — 2026-09-13:** [MP06g](MP-06g-plan.md) is complete locally: future public table/sequence defaults restricted; explicit existing grants preserve20migration reset parity.626SQL/46red/10sequence restores/2upgrades,19guards/115tests/types/catalog/cleanup pass. Claude regex finding rejected with source/execution proof; remaining review clear. G1 remains incomplete: function defaults/helper/capability security,real sessions,routing and hosted acceptance remain.

> **Latest G1 checkpoint:** [MP06f](MP-06f-plan.md) is complete locally: REFERENCES and audit-sequence permissions restricted;578SQL/42red/10sequence restorations/2upgrades,115tests/16guards/types/catalog/cleanup pass. Existing constraints and trusted inserts remain. Next: future-object defaults/helper security,then role/session/routing/hosting gates. G1 remains incomplete.

> **Latest G1 checkpoint:** MP-06e trigger containment is complete locally:486 SQL scenarios/34 regression probes/2 upgrades,36 actual table grant removals/two function ACL changes,unchanged types,16 guards/115 tests and bounded Claude review pass. Existing six triggers still fire. [Evidence and incident disclosure](MP-06e-plan.md). G1 remains incomplete; next auxiliary grants/defaults/helper security, then session/routing/hosting acceptance. UI/UX unchanged; no live deployment.

> **Latest G1 checkpoint - 2026-09-12:** MP-06.d is complete locally. Two unsafe legacy mutation RPCs deny application execution; POST /api/sync returns fixed503/no ACK/no-store before auth or body access. Two resets pass386 SQL scenarios,28 regression probes and2 profile upgrades; exact two-function catalog delta, unchanged types and cleanup pass. All16 Python guards,115 unit tests, production build and3 standalone HTTP probes pass. Claude Sonnet5/medium found no blocking issues; Terra supplied complementary SQL/HTTP evidence. See [MP-06d plan and evidence](MP-06d-plan.md). Docker recovered without data reset. G1 remains incomplete: broader roles/functions/default privileges, real sessions, routing/hydration, durable offline behavior and hosted acceptance remain open; latest broad E2E78failed/30skipped. UI/UX remains locked; no deployment or live database. Next audit: [MP06e](MP-06e-plan.md) reproduced unauthorized SQL-role trigger attachment on two disposable fixtures; remediation is specified and pending. [Full G1 completion matrix](G1-completion-matrix.md) keeps remaining requirements explicit. Earlier checkpoints are history.

> **Active G1 continuation — 2026-09-10:** The owner authorized G1 and bounded Codex/Claude collaboration. Read [G1-plan.md](G1-plan.md) and the shared orchestration policy. Branch `agent/codex/MP-04-g1-feasibility` starts at G0 `dc8c8a5`. MP-04.b and MP-05.a local slices are complete. The approved SQL repair passes two real explicit-connection CLI resets on a disposable loopback-bound PostgreSQL container; exact migration history, catalog/schema equality, empty transactions, sentinel removal and cleanup pass. Eight additional fixture guard/failure tests pass. The earlier managed `--local` transport failure is retained as a limitation, not the accepted fixture. See [MP-05a-plan.md](MP-05a-plan.md). Docker runs and Cloudflare OAuth succeeded; no hosted database or deployment was created. Next is MP-05.b database types/schema reconciliation, then MP-06 authorization. G1 remains incomplete. The G0 evidence below is historical, including its older dependency counts and stop boundary.

## G0 foundation record (historical)

Authoritative root: `C:\Users\ethan\dev\happy-cookie-ops-g0`. The original OneDrive delivery is preserved with a working-copy pointer. No previous Git ancestry was recovered. The owner subsequently confirmed no previous database or SQL application; that confirmation resolved the limited baseline-repair approval gate.

Manual progress authority: [task-status.json](task-status.json). The generated master-plan catalog and audit remain historical planned scope; regeneration must not overwrite implementation progress. Read the [shared Codex/Claude policy](agent-orchestration.md) before delegation.

## Outcome

MP-00 through MP-03 foundation acceptance is complete. Product release acceptance remains red. The owner additionally authorized private GitHub publication and a Vercel demo preview; no production backend, customer operation, paid upgrade or automatic runner was introduced.

- [Private GitHub source](https://github.com/newonathe/happy-cookie-ops): bootstrap `main` commit `32e37da`, followed by the recorded packaging and baseline checkpoints. Local branch `agent/codex/MP-00-g0-foundation`; final checkpoint publication is recorded in the handoff.
- [Protected live preview](https://happy-cookie-ops-demo-m0wbduoz7-newonathes-projects.vercel.app): READY; sign in with the owner's Vercel account. This is a manually deployed demo, not a Git-connected automatic deployment.
- [Cloud evidence and configuration](cloud-preview.md): authenticated app 200, health 200/database not-configured, sync 500/no acknowledgment, unauthenticated 302 to Vercel sign-in. No hosted browser-hydration or production-readiness claim.

## Foundation evidence

| Package | Verified outcome                                                                                                                                                                                                                                                                                                                 |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MP-00   | 675 delivered files preserved; original 347-file audit manifest unchanged. Private source checkpoint established. Current validator: 1,181 checks, zero failures, including schema/DAG/generator reproduction, protected hashes, policy/document links, 70 coverage rows and 75 baseline hashes.                                 |
| MP-01   | Node 24.20.0 locally/CI/Docker; pnpm 9.12.3 and frozen lock. Verified clean pinned install and reviewed lifecycle setup. Hosted Node 24.19.0 is within the documented supported range and cloud build passes with pinned pnpm through Corepack.                                                                                  |
| MP-02   | Initial 108 TypeScript diagnostics repaired; flat lint and reporting privacy tests pass. `pnpm verify`: 13 test files, 103 tests, exit 0. Local standalone, Docker and Vercel production builds pass. Five exact owner-approved null guards; other protected render bodies unchanged.                                            |
| MP-03   | Copy/style/handler/structure/relationship/declaration mutation probes detect changes. Route/offline false positives are rejected. Deterministic fixtures, five valid-sheet captures and 70-row state ledger. All 75 Docker regression snapshots accepted after source/visual review and independent readonly comparison, exit 0. |

See [toolchain](toolchain.md), [protected exception](protected-exception.md), [visual acceptance](visual-review.md), [state coverage](state-coverage.md), and [evidence index](evidence-index.json). The original prototype remains the design answer key. Regression images have visible review controls, frozen fixture/prerequisite differences and inherited clipping; they do not certify prototype pixel identity or all conditional states.

## Retained failures and unknowns

Latest full `pnpm test:e2e`: **78 failed, 30 skipped**, exit 1. Each phone Chromium, desktop Chromium and emulated iPhone WebKit run records 24 non-Home route redirects, one Home hydration error (React 418), and one nonzero sale without a durable IndexedDB queue row. Earlier focused phone Home passed; the fresh-build full run proves that hydration is still an intermittent release defect. MP-07 owns bootstrap/routing; MP-18–21 own offline persistence/reconciliation. The actual-runtime empty-ack test also remains red for MP-20.

Thirty SQL capacity cases skipped because no isolated database URL/key was configured. This is unavailable integration evidence, not a pass; MP-05/06 must supply it. No real database, physical iPhone/macOS Safari, PWA or hosted performance acceptance is claimed.

The first two-worker visual comparison passed 73 and timed out during page setup for two mobile tests; a full single-worker comparison passed all 75 without changing assertions or timeouts. Hosted CI pixel parity/concurrency remains unverified. GitHub bootstrap CI failed its inherited whole-repository formatting check; dependent jobs were skipped. Do not mass-format locked source or historical evidence to hide it. Dependency audit retains 11 transitive tooling advisories (5 high, 3 moderate, 3 low; zero critical), documented in the toolchain evidence.

## Next boundary

Stop at G0. The next product work follows G1/MP-04 onward and its decision gates; routing and offline fixes require their assigned packages. See [continuation](continuation.md). Keep preview fixtures isolated and use a fresh reviewed origin for eventual production. No further owner setup is needed for the current demo; future database/hosting decisions are not silently settled by this preview.

> **Current environment note:** Docker recovered for MP-06d; both owned SQL/type fixtures and cleanup pass. Earlier c5 daemon failure remains historical evidence. See [recovery evidence](evidence/MP-06d-environment.json). No image/volume/data reset.

## Preserved checkpoint before F1 (2026-10-03)

- **2026-10-01 (E1, finish-plan slice E1, done in one goal after all):** the owner's books. Decisions (Ethan, 2026-09-30): the cost rule is **both, with a setting** (default: when bought);
  revenue is dated **when the order was paid**; draws and the drop close-out stay in live mode.
  - **Database:** migration `20260101004900`. `orders.paid_at` / `refunded_at` (stamped by a trigger, so the paid tick, settle and refund RPCs are unchanged; backfilled from `updated_at`
    without bumping it). Owner-only `get_books(from, to)` (revenue: each order at `paid_at`, stall sales; refunds; expenses; draws; the cost basis; the deliveries of the last 90 days that
    can be corrected), `record_expense` (her categories including wages; exact keys; idempotent on a client id; the category "Owner draw" is refused), `record_draw` (kept apart: never an
    expense, profit does not move), `record_cost_correction` (a wrong delivery cost is answered by a correcting entry, nothing is edited; `get_last_paid` and the cost of stock used read the
    corrected cost; the latest correction is the one saved last), `set_cost_basis`. Cost **when used** = stock used or wasted x the price per unit of the latest costed receipt up to that moment
    (0 before any: a later delivery never reprices a reported period); the receipts' own cost lines are then not costs. New tables have no API grant. Suite `books.sql` (101 cases).
  - **App (live mode, no protected-markup or engine edit):** the P&L, Home profit and the expense list read the database's books (`state.ledger` is REPLACED on every read, never added to; the
    engine's own count of the open drop's orders returns 0 so paid orders are not counted twice; closing a drop says its orders are already in the P&L). A plain expense (no stock item named)
    and a draw are recorded first, once (a lost reply keeps the id), then the books are read back. A delivery form with a quantity missing, or an item the catalogue does not have, is left to the
    engine to refuse and books nothing. "Books & costs" under All tools (the live form host): the cost basis, correct a delivery cost, download the CSV. The export (the ported system-health
    control) now writes the database's books for the last 13 months as a CSV. Books are read again after an order moves on, a receipt or expense, a stall sale that reached the server.
  - **Unpaid-orders tracker (added after E1, 2026-10-01):** "Books & costs" opens on "Waiting on payment": every order still owed money, oldest first (no payment yet, a payment claimed but not
    confirmed, or the balance of a part-paid order), with what is owed, how long it has waited and the total. It is read from the owner's orders already on the phone (no database change); a
    cancelled order and a no-show owe nothing. Seen in the browser pane: "2 orders · ₱649 still to come in" (HC-1001 ₱260, HC-1002 ₱389), matching the Orders screen. Unit tests with 5 mutations.
  - **Opus review** (database SAFE; the app half was NOT SAFE until fixed): an expense form naming a stock item with no quantity was booked on the database while the engine told her no (the cost
    counted twice when she entered it again); the latest correction was chosen by the phone's clock, not the save order; the drop-close toast claimed revenue was booked at 0; cost when used
    fell back to a LATER delivery's price. All fixed with tests (a SQL case and a mutation for each database fix).
  - **Recorded, not fixed:** (1) money given back through a settle after a cheaper swap lowers `paid_cents`, so the first-paid date's revenue shrinks and no refund line appears; a dearer balance
    lands on the first-paid date (revenue date = when first paid). (2) Under "used", stock counts (shrinkage) and adjustments never become costs, and the part of a use that stock could not cover
    is costed at 0. (3) The retry ids live in memory: a reload loses them, so re-entering an expense whose reply was lost can record it twice; two identical entries while one is unconfirmed merge.
    (4) A stall sale or event expense that exists only on the phone (not synced) is not in the books until it syncs. (5) Renaming an expense category changes only the local ledger. (6) Voids and
    drawer variance are read through `get_books` but not covered by a case. (7) Wording is PLACEHOLDER (`BOOKS_COPY`). (8) The 30-day P&L window is the engine's rolling 30 days over the fetched 35.
  - **Evidence:** `pnpm verify` 72 files / 1437 tests; SQL role suite 1908 cases per reset, 2 resets, 670 regressions detected (books.sql 101 cases, 37 per reset); mutations: 20 on the
    books' unit tests (the ones that survived a first run were strengthened); the closing gates are listed below.
  - **Gates, all exit 0 in this session:** `pnpm verify` 72 files / 1437 tests; Python guards OK; G0 validator 1217 checks, 0 failures; port integrity OK (54 files); `pnpm build`, `test:pages:spike`,
    `test:workers:spike` pass; `pnpm test:e2e` 89 / 1 (OFFLINE-01 WebKit) / 75; `test:live:checkout` 11 steps; SQL role suite 1908 cases per reset, 2 resets, 670 regressions (the suite's same-day
    order case fails between 23:00 and midnight Manila time: a time-of-day dependence that is not E1's).
  - **Visual QA in the browser pane** (live-mode build, local test owner; a paid order, a refunded order, a stall sale, a costed delivery and 300 g of it used in the database): Home showed
    Profit ₱1,180 (revenue ₱1,600, expenses ₱420); the P&L showed Revenue ₱1,600 (Drops ₱1,300, Bazaar ₱300), Refunded ₱500, Ingredients ₱420; "Record expense" of ₱500 under Helper wages
    (one row in the database) made it Profit ₱680 and survived a reload; the drill-down listed "Week 1 wages ₱500" and "Bread flour · Landers ₱420" (total ₱920); "Books & costs" corrected the
    delivery to ₱400 (a +₱20 adjusting entry, nothing edited); "When used" made the P&L Profit ₱980 (Ingredients ₱120 = 300 g at the corrected ₱0.40/g); the CSV (read in the page) had one row per
    line with the basis. Not looked at on screen: a phone-width pass, the Home card under "used", an offline state.

## F1 in-progress checkpoint before local acceptance — 2026-10-03

- **2026-10-03 (F1, Codex only, IN PROGRESS; not accepted):** local implementation exists for encrypted database dumps, service-only operation receipts, a fixed 365-day retention routine, live System health/alerts and the live shop privacy notice. No protected screen/shell/engine or applied migration edited. No hosted operation, schedule activation or deployment.
  - **Verified:** `pnpm verify` 76 files/1,456 tests; SQL role suite 1,922 cases/reset across two fresh resets, identical matrices, 684 deliberate regressions detected, rollback and disposable cleanup passed. Generated types and authority/source pins updated. Python guards 63 passed; G0 validator 1,217 checks/0 failures (historical receipt churn reverted); port integrity 54 files. Normal build passes with the explicit Webpack build command. Live Pages and Workers emulator checks pass; shop hydration has zero CSP violations/JavaScript errors after disabling Zod's eval probe before schema construction. E2E remains 89 passed/1 failed/75 skipped (known WebKit OFFLINE-01). Sixteen unit mutations detected; final port audit and dismissal-preservation test pass.
  - **Restore PASS after explicit renewal:** all 60 tables/254 rows across `public`, `auth` and `hco_private` match source counts and hashes; all 55 foreign keys match, validate and have zero orphans. Atomic rollback, wrong-port sentinel probes and exact owned cleanup passed. The CLI excludes Auth migration history; an additional read-only dump now preserves those rows. No off-device copy or hosted backup-health success is claimed. See [backup receipt](evidence/F1-backup-20261003.json), [SQL receipt](evidence/F1-operations-sql.json), [operations guide](F1-operations.md) and [checkpoint](F1-checkpoint.md).
  - **Independent review:** bounded Sol review found no remaining P1/P2 code defect after correcting false backup-success reporting, target binding, Windows containment, privacy wording and post-enqueue health-read failures. Acceptance still requires recovery proof. Final port review passes; headless live health/alerts/privacy visual QA and live-checkout gate remain outstanding; no F1 completion/commit/push claimed.
  - **Continue F1, not F2.** Stop-budget reconciliation and latest gate output are in F1-checkpoint.md. Hosted activation and schedule activation still need Ethan's approval after a concrete, reviewed local result.
  - **Latest verify rerun exited 1:** port/engine/typechecks/lint passed; 75 test files / 1,455 tests passed, with one 5-second timeout at `tests/unit/sync-unavailable.test.ts:15`. Earlier green verify remains historical evidence; the latest gate is not green. No retry after the exhausted restore budget.

## Moved from current.md on 13 October 2026 (the trial reached migration 67)

- **Migrations 56 to 66 (B3a to B5) are not on the trial, and nothing in the bazaar needs them.** Apply 61 to 64 only together with the cutover (below).
  Recommended: not before 27 October. When you say so, in one quiet sitting and in this order,
  each file as one transaction: (1) read the owner and grants of `business_clock`, `place_order`
  and `join_waitlist`, and the 40 policies against `tests/fixtures/policies-before-58.json`;
  (2) apply 56; (3) run `select public.preview_identity_links();`, read what is unmatched or
  ambiguous, then `select public.apply_identity_links('<its counts>');`; (4) apply 57, which
  refuses to run until step 3 is done; (5) apply 58 and 59, then read the three functions'
  owner again; (6) apply 60, then run `scripts/packaging-rule-today.sql` (one call, today's packaging as data;
  a name that is not exactly one stock item is listed and nothing is written). Until it runs, a pack or bazaar
  sale takes no packaging and is flagged. A recipe line still listed as unmatched takes no stock when baked: fix it in
  Recipes before baking. `python scripts/test-b3a-upgrade.py` rehearses steps 2 to 6 on the
  local database. Then (7) apply 61 to 65 and append newer sales (before 8: its guard refuses after); (8) with Cine's opening count done, run `preview_cost_cutover()`, read
  `not_counted` and the items with no cost, then `apply_cost_cutover('<its hash and total>')` once; (9) run each
  `preview_import_*`, read what is unmatched, and apply it with its hash and counts.
- **Decided 8 October (B3b):** today's packaging rule is entered by hand through that script; her per-cookie
  packaging lines reach the trial after 26 October with B4, once 56 to 60 are applied, and the pouch leaves the
  bazaar-sale and loose rules in the same sitting; undoing an untouched delivery is built in B5 with the receive form.
- **Decided 12 October (B4):** a cutover with one opening credit; a count down is an expense; her eight packaging items;
  Oats, Sea salt and Sauce Tub created unpriced; unit clashes held ([register](decision-register.md)). **Yours next:** run
  `scripts/b4b-trial-reads.sql` (three read-only queries) so newer sales can be appended; on your laptop run the photo
  script on her folder and the browser checks listed in PR #14.
- Done on the trial on 6 October, at Ethan's instruction, through the database connector:
  migration `20260101005300_offline_open_hours.sql` applied (54 of 54; the three function
  bodies match the committed hashes); the test event of 5 October closed through
  `close_event` (no sales, no stock, nothing booked); the owner's idle time set to 480
  minutes through `save_setting`. Put the idle time back to 60 in Settings after the bazaar
  if wanted. No workflow applies migrations: the next one is again a step by hand.
- Done on the trial on 6 October, at Ethan's instruction ("migrate everything"), through the
  database connector: migration `20260101005400_business_clock_shop_identity.sql` applied (55
  of 55; it was the only one pending; its history row renamed to the repository's version
  number). Read back: the three function bodies match the committed hashes, grants are as
  pinned (`business_clock` has no browser grant, anyone reads `get_shop_identity`, only a
  signed-in owner saves), the table has row security on, no policy, no API grant and no row,
  and the clock answers the shared cases. The security advisor shows the new objects only in
  the classes it already reports by design. Shop details now save; they are empty until set
  (Sell, Shop, Shop texts).
- Approve each import preview.

## B5, moved from current.md on 14 October 2026

**B5, 13 October:** migration 66 (an owner-only read of an item's movements, on the trial since 13 October) and the live Inventory and
Grocery screens. Out at 0, Low below the item's level, Good otherwise, always as a word. Grocery shows the running total;
"left" or "over" appears only once she sets a budget. An unknown cost reads "Cost pending", never 0. Smoke, 320 px and
keyboard checks are for the laptop (PR #14).

## S1 and S2 of the bazaar days, moved from current.md on 14 October

**S1, 13 October (built, local only; the trial stays at 67):** migration 68 holds a booking's days, fees, losses, costs,
start, close and finalise, held to a hand-worked example to the centavo; the books count an open bazaar in `held`.
Contracts as built, and Ethan's answers of 14 October (shop cookies are a batch of the drop): [bazaar-days.md](bazaar-days.md).

**S2, 14 October (built, local only; branch claude/bazaar-days-s2):** the Bazaar screen is the owner's event list, event page, day plan
and "Start this day" (`src/components/live/bazaar/`); with an event on the phone it draws the ported till unchanged, so a helper and a
phone with no signal still sell. The old one-tap start and the ported start list are closed in live mode; "Leave" and the old close-out
refuse on a started day (S3 closes it from a review). The smoke suite plans, starts and sells day 1 at its own price, online and offline.

## S3.1 bazaar hardening, moved from current.md on 15 October 2026

**S3.1, 14 October (released to the trial):** Migration 69 (`20260101006800_bazaar_hardening.sql`) and its
client: a refused sale no longer blocks the close; close and finalise check the till's count and cash (40001); a fee or a loss can be
removed; no sale or void lands on a finalised event; no stock load on a bazaar day; retry ids survive a reload. Before release:
`pnpm test:e2e` (90 passed; the capacity parity spec 25 of 25 on the local database), the live smoke suite (14 steps), the role suite
(3,294 cases on each of two resets) and the **Remove** buttons in the browser pane at 375 px. At Ethan's word: 69 applied from a
scratch folder (the CLI needs every applied version present, so all 69 files were exported from the commit; the dry run listed only
69); the trial is at 69 of 69, its fingerprint equal to local apart from `json_value` quoting in three settings functions and
`rls_auto_enable`. PR #24 merged (`3cf4a36`); the deploy job was refused twice for GitHub billing (free private-repo minutes used
up), so **Ethan made the repository public** (Cine agreed: her name, GCash number and payment QR codes are in its history) and the
rerun deployed version `2eda3738`; anonymous requests still go to Cloudflare Access. Same day, run sheet rows 5, 6 and 10: Cine's two addresses are active owners named "Cine" (the admin one is "Ethan"), Access admits four addresses, and its session is one week (`168h`, now allowed by the release guard; PR #26 redeployed the same app as `fbfd8860`). Next: the phone rehearsal
([run sheet](bazaar-run-sheet.md) row 7, [next-goal.md](next-goal.md)).

## Bazaar v2 build log, 15 to 16 October 2026 (moved from current.md on 16 October)

Ethan's 13-point review of the bazaar screens (design, flow, motion) was planned as 10 slices, D0 to U9, in
[bazaar-v2.md](bazaar-v2.md). D0 approved 15 Oct ([spec](../design/bazaar-v2.md)). U1 (tokens, 16 components, `peso()`, motion
helpers; live money shows two decimals), U2 (leave and return to the till, sold-out tiles hidden, Add cookies; Ateneo B1, B2),
U3 (events hub, add-event sheet, a status pill per row), U4 (event page, day plan; Ateneo A1, A2, A5, B4, B5), U5 (review and
close), U6 (migration 70, with Opus review and the database suites in "U6 as built") and U7 (recipe book and flavour page, its
cost save) were built 15 to 16 Oct on stacked branches `claude/bazaar-v2-u2` to `-u7`; each has an "as built" section in
bazaar-v2.md. The Ateneo test audit (15 Oct, in bazaar-v2.md) found 13 issues; Ethan chose migration 70 before the bazaar and a
reviewed reversal of the Ateneo test (its rent, over, sales and stock use are in October's books until then).

**S3, 14 October (built; merged in PR #21):** losses, more stock, the day review with each figure openable, "Close the day" with
the leftover split, carrying over, fees, target, typed cost, "Close the event", and the books' "Bazaar in progress" line. No new
migration. The smoke suite closes day 1, carries into day 2, sells through an offline reload, closes, finalises and reads the
books. Decisions as built: [bazaar-days.md](bazaar-days.md), "S3 as built".

**Her data and the database, 13 October:** at Ethan's instruction the trial went from migration 55 to 67 of 67 (through B5),
rehearsed first on the local database, and her data is in: 23 recipes with packaging lines, 72 prices, the items Oats, Egg and
Sauce Tub, 4 bookings. The cost cutover is not applied (it needs her opening count), so the books stay on "bought" and equal the
ledger.

**Release records before U9:** the early 6 October pushes (A3 at `79b8e97`, A4 at `851e95e`) did not release (GitHub could not give
their jobs a hosted runner: runs 37370848143 and 37372795892); B1 was pushed later that day at `23e02b3` and released (run
37424595177). The trial moved from the A2 build straight to A3, A4 and B1.

**U9, 16 October (released):** U1 to U7 and the U9 motion pass with 44 px targets were merged into
`agent/codex/MP-04-g1-feasibility` and deployed: head `ea0ba7f`, Cloudflare version `7d7d8414`, every CI job green except the
known red "Performance budget" (artifact quota). Migration 70 (`20260101006900_flavour_cost_closing_reversal.sql`) was applied by
Ethan's approval from a scratch folder after a dry run that listed only that file; the trial is at 70 of 70 and the function body
hashes equal local. Opus reviewed it twice (cutover check after the locks; no false "changed after close" for events finalised
before 70); one low finding is left: a flavour cost saved mid-close can be stored with a stale hash. Local role suite 3,366 cases
a reset (two resets), live smoke 17 steps, `pnpm verify` 2,588 tests, e2e 90 passed. U8 (two decimals in ported screens) is
skipped: Ethan kept whole pesos on the till. A clean browser pass at four widths is not done: layout QA found 36 px targets
(fixed to 44 px) and a possible 16 px toast and footer overlap at 320 px on the day plan (unconfirmed).
