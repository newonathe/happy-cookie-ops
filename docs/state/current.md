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

**Package:** F2, the owner trial. F2 is incomplete, and F3 (launch) stays closed until Cine
accepts a real week of use.

### What exists and works

- **The product** is built through E1: menu and settings, checkout and owner orders, bazaar
  selling with offline close-out, stock, recipes and production, books, P&L and CSV, backups
  and health. `pnpm verify` passes 81 files / 1,487 tests.
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
  run 37284430841 at `acaad11`, Worker version `2203aad0`, with the bundled fonts; anonymous
  requests still redirect to Cloudflare Access.

### Decisions Ethan made on 5 October

- Prettier skips the byte-locked delivery paths and the recorded evidence; 52 reformatted
  receipts were restored. `scrub.ts` and `visual.spec.ts` were formatted once with his
  approval. Details: [protected-exception.md](protected-exception.md).
- OFFLINE-01 handles the Playwright WebKit emulator defect on WebKit only. The
  physical-phone rehearsal is therefore the only proof of offline selling in Safari.
- The trial week runs closed-shop, with a few agreed test orders in place of customers.
- The fonts are bundled in `src/app/fonts`, so a build no longer downloads them.
- This page and the front door were tidied; older sections moved to the history file.

### Open items

- **Waiting on Cine:** sign-in on her iPhone and MacBook, a new password, seven trial dates,
  the opening stock count, weights for six recipes, her feedback. Allergens are needed
  before the shop opens, not before the week starts.
- **Waiting on Ethan:** where the encrypted off-device backup lives and who can restore it;
  the phone rehearsal before 20 October; his look at the exact phone-dock change when
  it is prepared. The [UX review](ux-audit.md) changes land before Cine starts her week.
- **Performance budget (advisory job):** it now measures the real pages and they miss the
  budget (GitHub: performance about 0.58, largest paint 5.8 to 9.4 s, shop page 1.63 MB).
  Nothing was loosened. It does not gate the release.
- **Playwright issue 42775:** when a release fixes it, the WebKit run of OFFLINE-01 turns red
  on purpose. Upgrade then and delete the WebKit branches in the test.
- **Not eligible:** historical stock reconciliation. The counts are undated and opening
  balances and units are missing.

### Dates

The bazaar pilot is 24 to 25 October if the phone rehearsal passes by **20 October**;
otherwise 12 to 13 December.
