# Current state — Happy Cookie Ops

Read this page first in a new session. It is kept short on purpose.

| If you need                                        | Read                                                                                                                                                     |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The goal to run next                               | [next-goal.md](next-goal.md) (slice S3, bazaar days)                                                                                                     |
| The plan, approved 5 October                       | [final-plan.md](final-plan.md), version 2                                                                                                                |
| The rules every agent follows                      | [AGENTS.md](../../AGENTS.md)                                                                                                                             |
| Ethan's and Cine's decisions                       | [decision-register.md](decision-register.md)                                                                                                             |
| How we build (loop, models, two tracks)            | [finish-plan.md](finish-plan.md) section 8, [lean-plan.md](lean-plan.md), [agent-orchestration.md](agent-orchestration.md)                               |
| Approved edits to locked files                     | [protected-exception.md](protected-exception.md)                                                                                                         |
| What was found: data, research, defects, interface | [sot-consolidation.md](sot-consolidation.md), [product-research.md](product-research.md), [system-audit.md](system-audit.md), [ux-audit.md](ux-audit.md) |
| Cine's trial checklist                             | [F2-owner-trial.md](F2-owner-trial.md)                                                                                                                   |
| Older checkpoints, verbatim                        | [current-history.md](current-history.md)                                                                                                                 |

## Where things stand — 7 October 2026

**The plan is approved; stage A (A1 to A4) and slices B1 to B3b-2, B4a, B4b and B5 are built.** Ethan approved
[final-plan.md](final-plan.md), version 2, on 5 October after a re-audit, a debate and
wider research. It replaces finish-plan.md as the forward plan. The Bazaar defect B1 found is
fixed (below). The next step is slice S3 of
[bazaar-days.md](bazaar-days.md): Ethan put the bazaar's new flow ahead of B6 on 13 October, with no fallback, so S1 to
S3 must be deployed and rehearsed on the phone by 20 October.

**S1, 13 October (built, local only; the trial stays at 67):** migration 68 holds a booking's days, fees, losses, costs,
start, close and finalise, held to a hand-worked example to the centavo; the books count an open bazaar in `held`.
Contracts as built, and Ethan's answers of 14 October (shop cookies are a batch of the drop): [bazaar-days.md](bazaar-days.md).

**S2, 14 October (built, local only; branch claude/bazaar-days-s2):** the Bazaar screen is the owner's event list, event page, day plan
and "Start this day" (`src/components/live/bazaar/`); with an event on the phone it draws the ported till unchanged, so a helper and a
phone with no signal still sell. The old one-tap start and the ported start list are closed in live mode; "Leave" and the old close-out
refuse on a started day (S3 closes it from a review). The smoke suite plans, starts and sells day 1 at its own price, online and offline.
Not built yet: fees, target and costs on the event page, carrying over, the review and close (S3).

**Her data and the database, 13 October:** at Ethan's instruction the trial went from migration 55 to 67 of 67 (through
B5), rehearsed first on the local database, and her data is in: 23 recipes with packaging lines, 72 prices, the items
Oats, Egg and Sauce Tub, 4 bookings. The cost cutover is **not** applied (it needs her opening count), so the books
stay on "bought" and equal the ledger. **Bazaar: still no-go until a bake is recorded**, and a sale needs an owner
sign-in: [bazaar-run-sheet.md](bazaar-run-sheet.md). What Cine sets once: [cine-set-up.md](cine-set-up.md).

**B5, 13 October:** migration 66 (an owner-only read of an item's movements, on the trial since 13 October) and the live Inventory and
Grocery screens. Out at 0, Low below the item's level, Good otherwise, always as a word. Grocery shows the running total;
"left" or "over" appears only once she sets a budget. An unknown cost reads "Cost pending", never 0. Smoke, 320 px and
keyboard checks are for the laptop (PR #14).

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

| What                                                                                                         | Slice  |
| ------------------------------------------------------------------------------------------------------------ | ------ |
| The backup, retention and keep-alive jobs are written but off: nothing is backed up yet.                     | Ethan  |
| Account has no button of its own: it is a chip on Home's strip. Customers and Expenses open a sheet.         | C6, C5 |
| Until the flavour list arrives, or if it cannot be read, staff screens show the engine's six flavours.       | B6     |
| Bazaar Mode offers a fixed list of wallets; Home's "Drop 32" starts from the engine's number.                | C7, C3 |
| An empty menu cannot get its first flavour (the trial has 26, so nobody meets it).                           | B6     |
| Almost every cost per cookie is unknown: 8 of 72 items have a price, no costed delivery, no measured recipe. | B4     |
| A mistyped delivery quantity cannot be undone, and under a running average it lingers. Needs a decision.     | Ethan  |
| Every page, the shop included, loads the whole staff app.                                                    | C8     |

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

- **Plan quantities as a bake batch (S2).** Ethan's 14 October note ("log those as part of the bake batch") is unclear: ask first.
- **The cost cutover**, once, after Cine's opening count: `select public.preview_cost_cutover();`, read `not_counted` and
  the items with no cost, then `select public.apply_cost_cutover('<its hash and total>');`. An opening count after it is
  refused. Until then the books stay on "bought".
- **No more database writes after the phone rehearsal passes**; set the release hold then.
- **The trial still runs the 8 October build.** The release job could not upload its build: the GitHub Actions artifact
  storage is full (run 38403473210). Delete old artifacts, or wait for the quota to be worked out again, then re-run the
  release of the newest run. Its database is already at 67.
- **Do not save a recipe in the Recipes screen yet.** It sends no line kind, so a saved recipe's packaging lines become
  ingredients (slice B6, New Recipes). Reading is safe.
- A1 is built (the release check takes two to six addresses; Cine is not added yet). Add her
  two addresses to Cloudflare Access and the approved-digest variable in one sitting, or the
  next deploy fails. Set the session to one week: that deploy then fails once and prints the
  value; put it in `ALLOWED_SESSION_DURATIONS`, push, then invite her.
- **Display names.** From this deploy the app greets each person, and records each bazaar
  sale, under their profile's `display_name`. No form edits it yet (C6). Check yours, Cine's
  and each helper's before 20 October: Supabase dashboard, Table editor, `profiles`, or say
  the word and it is done through the connector. The trial's profiles were not read.
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
- The phone rehearsal by **20 October** ([final-plan.md](final-plan.md) section 11.1).

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

Rehearsal by **20 October**; bazaar **24 to 25 October**; releases held from the
rehearsal to 26 October. Everything built: mid-November at the earliest, early December
more likely. Cine's week follows the wording pass. Second bazaar 12 to 13 December.
