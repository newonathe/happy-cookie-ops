# Next goal — B2

One goal per package, each in a fresh conversation opened in the repository root. Paste
one block. Where things stand: [current.md](current.md). The plan these come from:
[final-plan.md](final-plan.md), version 2, section 9, stage B. Earlier goals are in
[current-history.md](current-history.md).

B1 is built (6 October): the guarded screen slot, the function map and its test, the five
tabs with sub-tabs on the live owner's dock and sidebar, and the live smoke suite. The defect
that suite found (signal returning mid-sale sent the app to Home) was fixed the same day; its
goal block is in Git history and its result in [current.md](current.md).

## B2 — nothing fake on screen, one Manila clock

| Setting         | Value                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------- |
| Model, effort   | Claude Opus, high to plan and sign off; Sonnet, high to build                                       |
| Plan mode       | On: list each value and where it will come from before writing                                      |
| Permission mode | Auto after the plan is accepted                                                                     |
| Review          | `security-reviewer` on a different model if a migration or a setting's access changes; else none    |
| Browser QA      | Yes: the live build against the local database, phone width and desktop, and `pnpm test:live:smoke` |
| Tools           | Node 24.20.0 and pnpm 9.12.3 from `happy-cookie-tools`; local Supabase                              |
| Stop            | Evidence printed and pushed; 25 turns; two failed fix attempts                                      |

```text
/goal Slice B2 of docs/state/final-plan.md (version 2) for The Happy Cookie Ops in
C:\Users\ethan\dev\happy-cookie-ops-g0: nothing fake on screen, and one Manila clock. B1 is
built. The bazaar is 24 to 25 October: B2 must not change what Bazaar Mode does on the phone,
and it must not reach the trial while the release hold is on.

Read first: AGENTS.md, docs/state/current.md, docs/state/final-plan.md sections 5.1 (C10),
5.2, 6.1, 6.7 and 9 (B2), and docs/state/system-audit.md for findings H1 to H6, H14, C1, C2 and
C10 with each one's file and line. (C1 and C2 here are the audit's findings, "Profit this
month" and the CSV's UTC dates, not the stage C slices of the same names in the plan.) Also
docs/state/protected-exception.md, src/lib/nav/function-map.ts and
scripts/test-live-smoke.mjs. Find what already exists before building, and say what you found.

1. Nothing fake on screen: for H1 to H6, H14 and C1, every prototype value still shown in the
   live app (pickups, the greeting, Settings rows, the shop tagline, the owner's and the shop's
   names inside sentences) comes from a setting, a record, or is not shown. Locked files stay
   locked: change what the view model gives them. A value with no source yet becomes a setting
   with a labelled default, recorded in the decision register as a default, not a decision.
2. One Manila clock (C10, C2): one module and one database function for "today" and "this
   week" in Asia/Manila; the live layer uses only those. Tests pin the clock.
3. Two tests in pnpm verify, written first: an empty shop (no flavours, orders, stock or
   settings beyond defaults) shows no prototype value anywhere; two shops with different
   settings show each its own values and nothing of the other's.
4. Re-check the inventory in section 6.7: for each row marked "Today: yes", confirm the form
   exists in the live app; move anything found fixed in code to a setting, or record it.

Review: security-reviewer (a different model) if any migration, RPC or setting's access
changes; fix every P0 to P2 finding. Run pnpm test:live:smoke and paste it. Check in the
browser pane at phone width and desktop: no prototype value on any tab.

Update docs/state/current.md (five lines) and docs/state/task-status.json (one note, by
string insertion), and replace this block with slice B3.

Evidence to print: each failing test before and passing after; the reviewer's verdict if one
ran; the pnpm verify summary in a clean shell; the smoke-suite output; the browser check, step
by step; the commit hashes and the pushed branch.

No new resources, shop opening, real customers, production launch, merge or automatic runner.
Do not set the release hold. Stop after 25 turns or two failed fix attempts and report the
actual obstacle.
```
