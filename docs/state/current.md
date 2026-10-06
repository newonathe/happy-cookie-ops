# Current state — Happy Cookie Ops

Read this page first in a new session. It is kept short on purpose.

| If you need                                        | Read                                                                                                                                                     |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The goal to run next                               | [next-goal.md](next-goal.md) (slice B2)                                                                                                                  |
| The plan, approved 5 October                       | [final-plan.md](final-plan.md), version 2                                                                                                                |
| The rules every agent follows                      | [AGENTS.md](../../AGENTS.md)                                                                                                                             |
| Ethan's and Cine's decisions                       | [decision-register.md](decision-register.md)                                                                                                             |
| How we build (loop, models, two tracks)            | [finish-plan.md](finish-plan.md) section 8, [lean-plan.md](lean-plan.md), [agent-orchestration.md](agent-orchestration.md)                               |
| Approved edits to locked files                     | [protected-exception.md](protected-exception.md)                                                                                                         |
| What was found: data, research, defects, interface | [sot-consolidation.md](sot-consolidation.md), [product-research.md](product-research.md), [system-audit.md](system-audit.md), [ux-audit.md](ux-audit.md) |
| Cine's trial checklist                             | [F2-owner-trial.md](F2-owner-trial.md)                                                                                                                   |
| Older checkpoints, verbatim                        | [current-history.md](current-history.md)                                                                                                                 |

## Where things stand — 6 October 2026

**The plan is approved; stage A (A1 to A4) and slice B1 are built.** Ethan approved
[final-plan.md](final-plan.md), version 2, on 5 October after a re-audit, a debate and
wider research. It replaces finish-plan.md as the forward plan. The Bazaar defect B1 found is
fixed (below). The next step is slice B2.

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

**Package:** F2, the owner trial, stays open but does not start until everything in the
plan is built (Ethan, 5 October). F3 (launch) stays closed until Cine accepts a real week.

### What exists and works

- **The product** is built through E1: menu and settings, checkout and owner orders,
  bazaar selling with offline close-out, stock, recipes and production, books, P&L and
  CSV, backups and health. `pnpm verify` passes 93 files / 1,706 tests; the planning
  validator passes 1,228 checks.
- **The private trial site** is live for owners only:
  <https://happy-cookie-owner-trial.admin-kethai.workers.dev>. Cloudflare Access sends an
  email code to two approved mailboxes. The shop is closed and the menu is unpublished.
- **On the trial** (read 5 October; migration 54 added 6 October): all 54 migrations applied; 72 stock items, 26
  flavours, 804 historical book lines, no orders.
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
| Values from the prototype still show in the live app (pickups, greeting, Settings rows, shop tagline).       | B2     |
| Almost every cost per cookie is unknown: 8 of 72 items have a price, no costed delivery, no measured recipe. | B3, B4 |
| The trial's cost basis is "when bought"; "when used" was decided.                                            | B3     |
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

- A1 is built (the release check takes two to six addresses; Cine is not added yet). Add her
  two addresses to Cloudflare Access and the approved-digest variable in one sitting, or the
  next deploy fails. Set the session to one week: that deploy then fails once and prints the
  value; put it in `ALLOWED_SESSION_DURATIONS`, push, then invite her.
- Done on the trial on 6 October, at Ethan's instruction, through the database connector:
  migration `20260101005300_offline_open_hours.sql` applied (54 of 54; the three function
  bodies match the committed hashes); the test event of 5 October closed through
  `close_event` (no sales, no stock, nothing booked); the owner's idle time set to 480
  minutes through `save_setting`. Put the idle time back to 60 in Settings after the bazaar
  if wanted. No workflow applies migrations: the next one is again a step by hand.
- Decide where the encrypted backup lives and who can restore it, then switch the jobs on
  (steps and prerequisites in [F1-operations.md](F1-operations.md), last section). They only run
  from `main`, so that needs a merge, your call. Until then nothing is backed up: download the
  CSV each evening of the bazaar and keep the paper tally.
- **The release hold** is built and not set. To stop deploys (rehearsal to 26 October): GitHub,
  the repository's Settings, Secrets and variables, Actions, Variables, add `RELEASE_HOLD` =
  `true`. A push then builds and tests but does not deploy, and the run says so. Delete it or
  set it to `false` to lift. Any value that is not clearly "off" holds.
- The phone rehearsal by **20 October** ([final-plan.md](final-plan.md) section 11.1).
- Approve each import preview.
- Say whether the pointer lines in `AGENTS.md` and `CLAUDE.md` may be updated (below).

### Waiting on Cine

Nothing blocks the build. Still open: whether "Cornflake" is Cereal Milk; allergens;
her adviser's view on the privacy filing and on receipts; later, the wording pass, the
set-up screen and seven dates for her week.

### Stale lines in the rule files, left for Ethan's yes

- `AGENTS.md` line 90 says the next goal is drawn from finish-plan.md. It is drawn from
  final-plan.md.
- `AGENTS.md` line 129 forbids the in-app browser. Ethan lifted that on 29 September;
  the line was never changed.

### Smaller open items

- **Playwright issue 42775:** when a release fixes it, the WebKit run of OFFLINE-01 turns
  red on purpose. Upgrade then and delete the WebKit branches in the test.
- **Not eligible:** historical stock reconciliation. The counts are undated and opening
  balances and units are missing.

### Dates

Rehearsal by **20 October**; bazaar **24 to 25 October**; releases held from the
rehearsal to 26 October. Everything built: mid-November at the earliest, early December
more likely. Cine's week follows the wording pass. Second bazaar 12 to 13 December.
