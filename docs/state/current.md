# Current state — Happy Cookie Ops

**The full application remains incomplete.** Source, deployment, public availability, physical-device and unaided-owner acceptance are separate. Read next-goal.md next; prior details are in current-history.md.

## Released — 19 November 2026 (afternoon)

Latest deployed: #118 (merge `b3c3126a`, run 44507905747, Worker version `96f5290a-c030-4cf1-b9d1-b13ec7846184`). Schema unchanged: 91 migrations / 186 exact public functions. Each PR went into the deploy branch after green CI under the owner's standing approval; the morning releases (#89–#105) are in [history](current-history.md).

- **#107 HCB-018:** one date formatter on the Manila clock (`src/lib/date/display.ts`: `dayLabel`, `dayTimeLabel`, `timeLabel`) across Home, till, events and production.
- **#108 HCB-030:** a data request answered 401 makes the live gate re-check the sign-in (`src/lib/auth/session-rejected.ts`); a refused session shows "You were signed out" (placeholder wording for Cine) instead of a blank page, queued sales kept.
- **#109 HCB-033:** live owner checkboxes are at least 24 px; HCB-032 was already fixed (regression test added).
- **#110, #113 HCB-010/016/017:** a helper's Home offers Bazaar and Sales log (until OD-04); "1 cookie" everywhere the engine wrote "1 cookies" (`src/lib/display/singular-cookies.ts`); order income on Money reads "Orders", not "Drops". HCB-011 and HCB-019 were already fixed.
- **#111, #114, #116 shop card:** an empty cart says "Nothing picked yet" once (card only; the phone Continue bar shows ₱0); once picked, the card title carries the count. Checked on the live trial at 375 and desktop width.
- **#112 HCB-078/072 (browser):** `tests/e2e-scenarios/scenario-{a,c}.spec.ts` drive loops A and C through the live owner UI on a local stack, including an offline reload and a single replay by `clientId`; run locally with `pnpm test:e2e:scenarios` (not in CI: no hosted stack).
- **#115 release gate:** after a deploy every public route and resource is waited for (12 × 5 s) before the strict byte check; the #114 release had failed closed on a stale `/lookup/` and the trial was 404 until the deploy job was re-run.
- **#117 HCB-015:** the till keeps its own "Back to events" and the header Back is left out. HCB-021, 022, 034 and 040 were already fixed in current source.
- **#118 HCB-004c:** an older empty menu read after a newer failed read no longer counts as a confirmed empty menu. HCB-031, 035 and 002 were already fixed.

Open: Cine has not seen the glass look, public form, pickup place, flavour removal, choice photos or the new notices; owner wording for "You were signed out" and the helper Home. Unit tests can still time out at 5 s when two sessions run commit hooks at once (retry with `VITEST_MAX_WORKERS=3`, never a longer timeout). A fresh worktree has no `.husky/_`, so run `pnpm verify` by hand there. The uncommitted Sell glass edits in the original urgent checkout predate #84 and are superseded; they stay untouched.

## Preservation and external acceptance

Original urgent remains ata4126ff3 with all nine intake hashes, six stashes and prior worktrees preserved (rechecked before pickup commit). Never replay those input bytes or reset/copy a whole worktree onto deploy. Keep the Option A glass look (Ethan, 19 November; it replaced the light palette) and existing money/offline behavior. Accepted releases require fresh no-open-today safe-use checks and existing schema/Access/post-deploy gates. Hosted SQL requires the exact reviewed kit and recovery prerequisites. Maintenance44239699173 skipped backup/keepalive/retention despite overall success; recovery/off-device custody remains unconfirmed. Repository variables were empty, so the approved public Access cutover still needs operator setup/app ID. No applied SQL/protected demo/real-data/memory edits. Physical iPhone, unaided Cine, connected full-cycle/recovery, backup custody/restore and full-product acceptance remain open.

Ethan18November requests pushing/releasing these fixes, then a comprehensive repository-backed Cloud handoff, including preserved WIP and local-only context. Codex recorded that he approved publishing supplied assets/private project context to the existing public repository; reconfirm with Ethan in chat before publishing anything private (the repository is public). Credentials and customer records stay excluded. Use Codex workers only. Prepare an auditable manifest and portable continuation after release; do not upload raw internal session traces or global memory.
