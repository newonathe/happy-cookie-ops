# Current state — Happy Cookie Ops

**Active work, 2 November 2026:** Ethan authorized implementing the complete v4 workflows
in the actual app. Work is on `codex/refined-workflows`; see the [scope](../design/refined-workflows.md)
and [next goal](next-goal.md). A separate owner workspace now provides the new live header,
sidebar/phone navigation and original brand asset. Existing screen/sheet operations are reused;
demo, helper, denied, public and focus/till boundaries retain their existing frame. Quick add
remains reachable while its jobs acquire contextual homes. Stock item/count Back retains context.
The current owner frame/Stock theme is neutral light with Happy Cookie branding, selective glass
and reduced-motion support (Ethan, 2 November); this supersedes cream. Older page bodies remain pending.

Stock browsing now uses a compact ingredient/packaging panel with saved pack details and retained
filters, category counts, an editable count list, item/history retry and a vertical supplier directory.
Items also open their saved supplier prices/history with retained Back and filters.
**Next:** finish context-prefilled price editing, production categories and unknown-stock truth,
then Make and the other workflows. The private plan covers 59 pages/child flows,
238 decision branches and 224 automation field groups; these are planned coverage, not
implemented automation. Reuse known context/calculations and ask only new facts/exceptions.

Changed-path tests, independent frame review and four-width component fixture checks pass;
accepted commits record the pinned full gate. Database/hosted/physical-phone acceptance is
separate. No deployment or hosted changes are authorized. The release details below are historical.

Read this page first in a new session. It is kept short on purpose.

| If you need                                        | Read                                                                                                                                                     |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The goal to run next                               | [next-goal.md](next-goal.md)                                                                                                                             |
| The plan, approved 5 October                       | [final-plan.md](final-plan.md), version 2                                                                                                                |
| The rules every agent follows                      | [AGENTS.md](../../AGENTS.md)                                                                                                                             |
| Ethan's and Cine's decisions                       | [decision-register.md](decision-register.md)                                                                                                             |
| How we build (loop, models, two tracks)            | [finish-plan.md](finish-plan.md) section 8, [lean-plan.md](lean-plan.md), [agent-orchestration.md](agent-orchestration.md)                               |
| Approved edits to locked files                     | [protected-exception.md](protected-exception.md)                                                                                                         |
| What was found: data, research, defects, interface | [sot-consolidation.md](sot-consolidation.md), [product-research.md](product-research.md), [system-audit.md](system-audit.md), [ux-audit.md](ux-audit.md) |
| Cine's trial checklist                             | [F2-owner-trial.md](F2-owner-trial.md)                                                                                                                   |
| Older checkpoints, verbatim                        | [current-history.md](current-history.md)                                                                                                                 |

## Where things stand — 20 October 2026

The completed till release is recorded in [current history](current-history.md#20-october-release-checkpoint).

**What remains, in order:**

1. The **phone rehearsal by 22 October** on the selling iPhone, on the new till ([bazaar-run-sheet.md](bazaar-run-sheet.md),
   "The rehearsal"; step 7 checks the phone has the new till). The bazaar is 24 to 25 October.
2. `RELEASE_HOLD=true` once the rehearsal passes. Not set yet.
3. **The Ateneo test reversal** (`reverse_bazaar_test`): its rent, over, sales and stock use sit in October's books until then.
   Needs Ethan's separate yes.
4. **The cost cutover**, only after Cine's opening count and Ethan's separate yes.
5. **The rest of the consolidated design**, one slice each: Bazaar's day plan, review and close, event page and events list,
   then the recipe book and the other features. After 25 October, unless one is released and rehearsed by 22 October.
6. Optional: check the day plan at 320 px (a possible 16 px toast and footer overlap, unconfirmed).

**The plan is approved; stage A and slices B1 to B3b-2, B4a, B4b and B5 are built.** Ethan approved
[final-plan.md](final-plan.md), version 2, on 5 October; it replaces finish-plan.md as the forward plan. S1 to S3 of
[bazaar-days.md](bazaar-days.md) are built and released. **Bazaar: still no-go until the rehearsal passes**, and a sale needs an
owner sign-in. What Cine sets once: [cine-set-up.md](cine-set-up.md).

Stage A and slices B1 and B2, as each was recorded when it closed, are in [current-history.md](current-history.md), the section moved on 7 October.

**Package:** F2, the owner trial, stays open but does not start until everything in the
plan is built (Ethan, 5 October). F3 (launch) stays closed until Cine accepts a real week.

### What exists and works

- **The product** is built through E1: menu and settings, checkout and owner orders,
  bazaar selling with offline close-out, stock, recipes and production, books, P&L and
  CSV, backups and health. `pnpm verify` passes 110 files / 1,991 tests; the planning
  validator passes 1,232 checks; the database role suite passes 3,260 cases a reset (S1, local).
- **The private trial site** is live for owners only:
  <https://happy-cookie-owner-trial.admin-kethai.workers.dev>. Cloudflare Access sends an
  email code to four approved addresses (three have an app account, all owners). The shop is closed and the menu is unpublished.
- **On the trial** (20 October): 70 of 70 migrations; version `50f46e2c` (merge `94aa105`); 75 stock items, 72 priced; 26
  flavours, 7 on the menu, 23 with a recipe; 4 bookings; 835 historical book lines; no orders, no bake, no sale.
- **CI/CD:** a green push to `agent/codex/MP-04-g1-feasibility` redeploys the trial; a push that changes only documents does
  not. The performance-budget job is blocking since T-18 and passed on this release. Open the trial once before the rehearsal.

### Known not to work yet

Found by reading code or the trial, not by running. Each has a slice in the plan.

| What                                                                                                                                                                                              | Slice  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| The backup, retention and keep-alive jobs are written but off: nothing is backed up yet.                                                                                                          | Ethan  |
| Account has no button of its own: it is a chip on Home's strip. Customers and Expenses open a sheet.                                                                                              | C6, C5 |
| Until the flavour list arrives, or if it cannot be read, staff screens show the engine's six flavours.                                                                                            | B6     |
| Bazaar Mode offers a fixed list of wallets; Home's "Drop 32" starts from the engine's number.                                                                                                     | C7, C3 |
| An empty menu cannot get its first flavour (the trial has 26, so nobody meets it).                                                                                                                | B6     |
| Cost per cookie: 22 of 23 recipes are complete (all 7 menu flavours); the recipe book types a per-flavour cost (migration 70 is on the trial). The books stay on "bought" until the cost cutover. | Ethan  |
| A mistyped delivery quantity cannot be undone, and under a running average it lingers. Needs a decision.                                                                                          | Ethan  |
| Every page, the shop included, loads the whole staff app.                                                                                                                                         | C8     |

### Decisions in force

All in [decision-register.md](decision-register.md), the section for 5 October.

- Cine starts after everything is built. The October bazaar runs on today's Bazaar Mode
  plus A2, recorded in the trial database; no early production project.
- Two tracks, and unattended runs for interface-only slices only. The automatic runner
  stays off.
- New screens enter through one guarded, live-only slot in the locked frame file (built in
  B1). Every other locked file stays locked.
- The five tabs are on the owner's dock and sidebar now, with sub-tabs, not after the first
  redesigned screen (Ethan, 6 October). All tools keeps its address; nothing links to it.
- Nothing is hard-coded; everything that can change is Cine's to change; every function
  has exactly one home.
- The questions for Cine are answered, by Ethan on her behalf. She confirms each value
  in a one-time set-up screen.
- Still in force from earlier: the trial week is closed-shop; OFFLINE-01 handles the
  WebKit emulator defect on WebKit only, so the phone rehearsal is the only proof of
  offline selling in Safari.

### Waiting on Ethan

- **The Ateneo test reversal** (`reverse_bazaar_test`): say yes and it is run and reviewed; not done.
- **The rehearsal event on the trial.** Closing it leaves its records (voided sales, stock use as shortfalls). Run the closing
  step of the run sheet, or stop before it and leave the event open: your call.
- **The cost cutover**, once, after Cine's opening count: `select public.preview_cost_cutover();`, read `not_counted` and
  the items with no cost, then `select public.apply_cost_cutover('<its hash and total>');`. An opening count after it is
  refused. Until then the books stay on "bought".
- **No more database writes after the phone rehearsal passes**; set the release hold then.
- **The Actions storage quota is still full** (artifacts are about 5 MB across the account, so probably Packages). Releases
  no longer need it (PR #22); the performance-budget job still fails on its upload. Clear it in Settings, Billing.
- **Do not save a recipe in the Recipes screen yet.** It sends no line kind, so a saved recipe's packaging lines become
  ingredients (slice B6, New Recipes). Reading is safe.
- **The rehearsal gains one step** (B2): with the radio off, reload, sell, and read the name
  under "Rung up by" on the payment sheet. It must be the signed-in person's name, the same
  as with signal. Each helper's profile needs the display name they want on their sales.
- Decide where the encrypted backup lives and who can restore it, then switch the jobs on
  (steps and prerequisites in [F1-operations.md](F1-operations.md), last section). They only run
  from `main`, so that needs a merge, your call. Until then nothing is backed up: download the
  CSV each evening of the bazaar and keep the paper tally.
- **The release hold** is built and not set. To stop deploys (rehearsal to 26 October): GitHub,
  the repository's Settings, Secrets and variables, Actions, Variables, add `RELEASE_HOLD` =
  `true`. A push then builds and tests but does not deploy, and the run says so. Delete it or
  set it to `false` to lift. Any value that is not clearly "off" holds.
- The phone rehearsal by **22 October**: Bazaar v2 is live, so it can start ([run sheet](bazaar-run-sheet.md)).

### Waiting on Cine

Nothing blocks the build. Still open: whether "Cornflake" is Cereal Milk; allergens;
her adviser's view on the privacy filing and on receipts; later, the wording pass, the
set-up screen and seven dates for her week.

### Smaller open items

- **Playwright issue 42775:** when a release fixes it, the WebKit run of OFFLINE-01 turns
  red on purpose. Upgrade then and delete the WebKit branches in the test.
- **Not eligible:** historical stock reconciliation. The counts are undated and opening
  balances and units are missing.

### Dates

Rehearsal by **22 October**; bazaar **24 to 25 October**; releases held from the
rehearsal to 26 October. Everything built: mid-November at the earliest, early December
more likely. Cine's week follows the wording pass. Second bazaar 12 to 13 December.
