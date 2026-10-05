# Current state — Happy Cookie Ops

Read this page first in a new session. It is kept short on purpose.

| If you need                                        | Read                                                                                                                                                     |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The goal to run next                               | [next-goal.md](next-goal.md) (A1, then A2)                                                                                                               |
| The plan, approved 5 October                       | [final-plan.md](final-plan.md), version 2                                                                                                                |
| The rules every agent follows                      | [AGENTS.md](../../AGENTS.md)                                                                                                                             |
| Ethan's and Cine's decisions                       | [decision-register.md](decision-register.md)                                                                                                             |
| How we build (loop, models, two tracks)            | [finish-plan.md](finish-plan.md) section 8, [lean-plan.md](lean-plan.md), [agent-orchestration.md](agent-orchestration.md)                               |
| Approved edits to locked files                     | [protected-exception.md](protected-exception.md)                                                                                                         |
| What was found: data, research, defects, interface | [sot-consolidation.md](sot-consolidation.md), [product-research.md](product-research.md), [system-audit.md](system-audit.md), [ux-audit.md](ux-audit.md) |
| Cine's trial checklist                             | [F2-owner-trial.md](F2-owner-trial.md)                                                                                                                   |
| Older checkpoints, verbatim                        | [current-history.md](current-history.md)                                                                                                                 |

## Where things stand — 6 October 2026

**The plan is approved and nothing of it is built yet.** Ethan approved
[final-plan.md](final-plan.md), version 2, on 5 October after a re-audit, a debate and
wider research. It replaces finish-plan.md as the forward plan. The next step is slice
A1, then A2.

**Package:** F2, the owner trial, stays open but does not start until everything in the
plan is built (Ethan, 5 October). F3 (launch) stays closed until Cine accepts a real week.

### What exists and works

- **The product** is built through E1: menu and settings, checkout and owner orders,
  bazaar selling with offline close-out, stock, recipes and production, books, P&L and
  CSV, backups and health. `pnpm verify` passes 83 files / 1,512 tests; the planning
  validator passes 1,225 checks.
- **The private trial site** is live for owners only:
  <https://happy-cookie-owner-trial.admin-kethai.workers.dev>. Cloudflare Access sends an
  email code to two approved mailboxes. The shop is closed and the menu is unpublished.
- **On the trial** (read-only, 5 October): all 53 migrations applied; 72 stock items, 26
  flavours, 804 historical book lines, no orders.
- **CI/CD is green.** A green push to `agent/codex/MP-04-g1-feasibility` redeploys the
  trial; a push that changes only documents does not. Latest release: GitHub run
  37302318279 at `3bc91dd`, Worker version `43267acc`.

### Known not to work yet

Found by reading code or the trial, not by running. Each has a slice in the plan.

| What                                                                                                                   | Slice  |
| ---------------------------------------------------------------------------------------------------------------------- | ------ |
| **The live app signs the owner out when opened or reloaded with no signal.** The October bazaar is unsafe until fixed. | A2     |
| The release check allows exactly two addresses, so Cine cannot be added.                                               | A1     |
| No backup, restore drill, retention or keep-alive job is scheduled.                                                    | A4     |
| Nothing tests the live app; the browser suites run the demo build.                                                     | B1     |
| Values from the prototype still show in the live app (pickups, greeting, Settings rows, shop tagline).                 | B2     |
| Almost every cost per cookie is unknown: 8 of 72 items have a price, no costed delivery, no measured recipe.           | B3, B4 |
| The trial's cost basis is "when bought"; "when used" was decided.                                                      | B3     |
| Every page, the shop included, loads the whole staff app.                                                              | C8     |

### Decisions in force

All in [decision-register.md](decision-register.md), the section for 5 October.

- Cine starts after everything is built. The October bazaar runs on today's Bazaar Mode
  plus A2, recorded in the trial database; no early production project.
- Two tracks, and unattended runs for interface-only slices only. The automatic runner
  stays off.
- New screens enter through one guarded, live-only slot in the locked frame file. Every
  other locked file stays locked.
- Nothing is hard-coded; everything that can change is Cine's to change; every function
  has exactly one home.
- The questions for Cine are answered, by Ethan on her behalf. She confirms each value
  in a one-time set-up screen.
- Still in force from earlier: the trial week is closed-shop; OFFLINE-01 handles the
  WebKit emulator defect on WebKit only, so the phone rehearsal is the only proof of
  offline selling in Safari.

### Waiting on Ethan

- After A1 is released: add Cine's two addresses to Cloudflare Access and the approved
  list together, set the session to one week, invite her.
- Close the test event left open on the trial since 5 October.
- Decide where the encrypted backup lives and who can restore it; switch the jobs on.
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
