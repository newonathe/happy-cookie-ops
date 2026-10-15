# Current state — Happy Cookie Ops

Read this page first in a new session. It is kept short on purpose.

| If you need                                        | Read                                                                                                                                                     |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The goal to run next                               | [bazaar-days.md](bazaar-days.md), its S3 block (next-goal.md holds S3.1)                                                                                 |
| The plan, approved 5 October                       | [final-plan.md](final-plan.md), version 2                                                                                                                |
| The rules every agent follows                      | [AGENTS.md](../../AGENTS.md)                                                                                                                             |
| Ethan's and Cine's decisions                       | [decision-register.md](decision-register.md)                                                                                                             |
| How we build (loop, models, two tracks)            | [finish-plan.md](finish-plan.md) section 8, [lean-plan.md](lean-plan.md), [agent-orchestration.md](agent-orchestration.md)                               |
| Approved edits to locked files                     | [protected-exception.md](protected-exception.md)                                                                                                         |
| What was found: data, research, defects, interface | [sot-consolidation.md](sot-consolidation.md), [product-research.md](product-research.md), [system-audit.md](system-audit.md), [ux-audit.md](ux-audit.md) |
| Cine's trial checklist                             | [F2-owner-trial.md](F2-owner-trial.md)                                                                                                                   |
| Older checkpoints, verbatim                        | [current-history.md](current-history.md)                                                                                                                 |

## Where things stand — 7 October 2026

**Bazaar v2 (15 October): in progress.** Ethan's 13-point review of the bazaar screens (design, flow, motion)
is planned as 10 slices, D0 to U9, in [bazaar-v2.md](bazaar-v2.md); everything lands before the bazaar, one release, then the
rehearsal by 22 October. D0 approved 15 Oct ([spec](../design/bazaar-v2.md)). U1 built 15 Oct (tokens, 16 components, `peso()`, motion helpers; live money now shows two decimals). U2 built 15 Oct (branch `claude/bazaar-v2-u2`: leave and return to the till, sold-out tiles hidden, Add cookies; Ateneo B1, B2). U6 built 15 Oct, local only (migration 70 in the repo, not on the trial, still 69 of 69; Opus review and database suites noted in [bazaar-v2.md](bazaar-v2.md), "U6 as built"). U3 built 15 Oct (branch `claude/bazaar-v2-u3`, from `-u2`: the events hub, the add-event sheet, a status pill per row; "U3 as built" in bazaar-v2.md). U5 built 16 Oct (review and close; "U5 as built" in bazaar-v2.md). U4 built 16 Oct (event page, day plan, Ateneo A1, A2, A5, B4, B5; branch `claude/bazaar-v2-u4`, cut from `-u3`; "U4 as built" in bazaar-v2.md; A1 and A5 need migration 70). Next: U7, the recipe book ([next-goal.md](next-goal.md)). The
Ateneo test audit (15 Oct, in bazaar-v2.md) found 13 issues. Ethan chose migration 70 before the bazaar and a reviewed
reversal of the Ateneo test (its rent, over, sales and stock use are in October's books until then).

**The plan is approved; stage A (A1 to A4) and slices B1 to B3b-2, B4a, B4b and B5 are built.** Ethan approved
[final-plan.md](final-plan.md), version 2, on 5 October after a re-audit, a debate and
wider research. It replaces finish-plan.md as the forward plan. The Bazaar defect B1 found is
fixed (below). S1 to S3 of [bazaar-days.md](bazaar-days.md) are built (Ethan put the bazaar's new flow ahead of B6 on
13 October, with no fallback), migration 68 is on the trial and the code is merged (14 October). The next step is the
phone rehearsal by 22 October ([bazaar-run-sheet.md](bazaar-run-sheet.md)): the release is deployed.

**S3, 14 October (built; merged in PR #21):** losses, more stock, the day review with each figure
openable, "Close the day" with the leftover split, carrying over, fees, target, typed cost, "Close the event", and the books'
"Bazaar in progress" line. No new migration. The smoke suite closes day 1, carries into day 2, sells through an offline
reload, closes, finalises and reads the books. Decisions as built: [bazaar-days.md](bazaar-days.md), "S3 as built".

**Her data and the database, 13 October:** at Ethan's instruction the trial went from migration 55 to 67 of 67 (through
B5), rehearsed first on the local database, and her data is in: 23 recipes with packaging lines, 72 prices, the items
Oats, Egg and Sauce Tub, 4 bookings. The cost cutover is **not** applied (it needs her opening count), so the books
stay on "bought" and equal the ledger. **Bazaar: still no-go until a bake is recorded**, and a sale needs an owner
sign-in: [bazaar-run-sheet.md](bazaar-run-sheet.md). What Cine sets once: [cine-set-up.md](cine-set-up.md).

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
  email code to two approved mailboxes. The shop is closed and the menu is unpublished.
- **On the trial** (read 13 October): 67 of 67 migrations; 75 stock items, 72 priced; 26 flavours, 7 on the menu,
  23 with a recipe; 4 bookings; 835 historical book lines (her 31 newer sales, to 4 October, appended); no orders,
  no bake, no sale.
- **CI/CD:** a green push to `agent/codex/MP-04-g1-feasibility` redeploys the trial; a push
  that changes only documents does not. The last runs that completed were green (A1 and A2).
  **The two early 6 October pushes (A3 at `79b8e97`, A4 at `851e95e`) did not release:** GitHub
  could not give their jobs a hosted runner (runs 37370848143 and 37372795892). **B1 was pushed
  later that day at `23e02b3`, and that run released** (run 37424595177: unit, visual
  regression, browser flows, build and Storybook green; the trial's quality and deploy jobs
  green). The trial moved from the A2 build straight to A3, A4 and B1: the sign-out pill and
  the five tabs arrived together. The performance-budget job is red, as it was on the last
  green run (slice C8). Open the trial once before the rehearsal.

### Known not to work yet

Found by reading code or the trial, not by running. Each has a slice in the plan.

| What                                                                                                                | Slice  |
| ------------------------------------------------------------------------------------------------------------------- | ------ |
| The backup, retention and keep-alive jobs are written but off: nothing is backed up yet.                            | Ethan  |
| Account has no button of its own: it is a chip on Home's strip. Customers and Expenses open a sheet.                | C6, C5 |
| Until the flavour list arrives, or if it cannot be read, staff screens show the engine's six flavours.              | B6     |
| Bazaar Mode offers a fixed list of wallets; Home's "Drop 32" starts from the engine's number.                       | C7, C3 |
| An empty menu cannot get its first flavour (the trial has 26, so nobody meets it).                                  | B6     |
| Cost per cookie: 22 of 23 recipes are complete (all 7 menu flavours, read 15 October); no per-flavour override yet. | U6     |
| A mistyped delivery quantity cannot be undone, and under a running average it lingers. Needs a decision.            | Ethan  |
| Every page, the shop included, loads the whole staff app.                                                           | C8     |

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

- **The rehearsal event on the trial.** Closing it leaves its records (voided sales, stock use as shortfalls). Run step 9 of
  the run sheet, or stop after step 8 and leave it open: your call.
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
- The phone rehearsal by **22 October** (Bazaar v2 lands first) ([final-plan.md](final-plan.md) section 11.1).

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
