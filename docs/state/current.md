# Current state — Happy Cookie Ops

Read this page first in a new session. It is kept short on purpose.

| If you need                      | Read                                                                      |
| -------------------------------- | ------------------------------------------------------------------------- |
| The one goal to run next         | [next-goal.md](next-goal.md)                                              |
| The rules every agent follows    | [AGENTS.md](../../AGENTS.md)                                              |
| Cine's trial checklist           | [F2-owner-trial.md](F2-owner-trial.md)                                    |
| The detailed F2 log              | [F2-checkpoint.md](F2-checkpoint.md) and [F2-fix-list.md](F2-fix-list.md) |
| The UX review awaiting decisions | [ux-audit.md](ux-audit.md)                                                |
| Older checkpoints, verbatim      | [current-history.md](current-history.md)                                  |
| The approved plan to the finish  | [finish-plan.md](finish-plan.md) and [lean-plan.md](lean-plan.md)         |

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
