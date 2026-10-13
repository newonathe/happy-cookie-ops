# Current state — Happy Cookie Ops

Read this page first in a new session. It is kept short on purpose.

| If you need                                        | Read                                                                                                                                                     |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The goal to run next                               | [next-goal.md](next-goal.md) (slice B4)                                                                                                                  |
| The plan, approved 5 October                       | [final-plan.md](final-plan.md), version 2                                                                                                                |
| The rules every agent follows                      | [AGENTS.md](../../AGENTS.md)                                                                                                                             |
| Ethan's and Cine's decisions                       | [decision-register.md](decision-register.md)                                                                                                             |
| How we build (loop, models, two tracks)            | [finish-plan.md](finish-plan.md) section 8, [lean-plan.md](lean-plan.md), [agent-orchestration.md](agent-orchestration.md)                               |
| Approved edits to locked files                     | [protected-exception.md](protected-exception.md)                                                                                                         |
| What was found: data, research, defects, interface | [sot-consolidation.md](sot-consolidation.md), [product-research.md](product-research.md), [system-audit.md](system-audit.md), [ux-audit.md](ux-audit.md) |
| Cine's trial checklist                             | [F2-owner-trial.md](F2-owner-trial.md)                                                                                                                   |
| Older checkpoints, verbatim                        | [current-history.md](current-history.md)                                                                                                                 |

## Where things stand — 7 October 2026

**The plan is approved; stage A (A1 to A4) and slices B1, B2, B3a, B3b-1 and B3b-2 are built.** Ethan approved
[final-plan.md](final-plan.md), version 2, on 5 October after a re-audit, a debate and
wider research. It replaces finish-plan.md as the forward plan. The Bazaar defect B1 found is
fixed (below). The next step is slice B4 (her data).

**Bazaar readiness and her data, 13 October:** audited end to end, no behaviour change. Loaded on the trial through
its own owner functions, with no migration (still 55): 17 of her recipes (ingredients only; all 7 menu flavours now
have one), the item Oats and her 4 bookings. **Still no-go until a bake is recorded:** the table loads only from
baked stock, and a sale needs an owner sign-in. Prices, packaging lines, newer sales, photos and the cutover wait
for B4 after 26 October. Steps, rules, go / no-go: [bazaar-run-sheet.md](bazaar-run-sheet.md).

**B3b-2, 8 October:** migration 61 (`20260101006000_books_used.sql`), **not on the trial and not before
B4's cost cutover** (final-plan.md section 11), and the runtime. The books count stock when used and list what
has no cost, packs and bazaar sales included. The owner's screens read `get_item_costs` and `get_recipe_costs`;
an unknown cost reads "Cost pending". On the trial (migration 55) the engine's own path stands, as today.

Stage A and slices B1 and B2, as each was recorded when it closed, are in [current-history.md](current-history.md), the section moved on 7 October.

**Package:** F2, the owner trial, stays open but does not start until everything in the
plan is built (Ethan, 5 October). F3 (launch) stays closed until Cine accepts a real week.

### What exists and works

- **The product** is built through E1: menu and settings, checkout and owner orders,
  bazaar selling with offline close-out, stock, recipes and production, books, P&L and
  CSV, backups and health. `pnpm verify` passes 100 files / 1,850 tests; the planning
  validator passes 1,232 checks; the database role suite passes 2,600 cases a reset.
- **The private trial site** is live for owners only:
  <https://happy-cookie-owner-trial.admin-kethai.workers.dev>. Cloudflare Access sends an
  email code to two approved mailboxes. The shop is closed and the menu is unpublished.
- **On the trial** (read 5 October; migrations 54 and 55 added 6 October): 55 of the
  repository's 59 migrations applied (56 to 59 wait for Ethan, below); 72 stock items, 26
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

- **Migrations 56 to 61 (B3a, B3b-1, B3b-2) are not on the trial, and nothing in the bazaar needs them.** Migration 61 waits for B4's cost cutover: without it, stock already in the historical lines is expensed again when used.
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
  local database.
- **Decided 8 October (B3b):** today's packaging rule is entered by hand through that script; her per-cookie
  packaging lines reach the trial after 26 October with B4, once 56 to 60 are applied, and the pouch leaves the
  bazaar-sale and loose rules in the same sitting; undoing an untouched delivery is built in B5 with the receive form.
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
- Done on the trial on 6 October, at Ethan's instruction ("migrate everything"), through the
  database connector: migration `20260101005400_business_clock_shop_identity.sql` applied (55
  of 55; it was the only one pending; its history row renamed to the repository's version
  number). Read back: the three function bodies match the committed hashes, grants are as
  pinned (`business_clock` has no browser grant, anyone reads `get_shop_identity`, only a
  signed-in owner saves), the table has row security on, no policy, no API grant and no row,
  and the clock answers the shared cases. The security advisor shows the new objects only in
  the classes it already reports by design. Shop details now save; they are empty until set
  (Sell, Shop, Shop texts).
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
- Approve each import preview.

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
