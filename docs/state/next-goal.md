# Next goals — B1 (the permanent pieces of the new interface)

One goal per package, each in a fresh conversation opened in the repository root. Paste
one block. Where things stand: [current.md](current.md). The plan these come from:
[final-plan.md](final-plan.md), version 2, section 9, stage B, and section 8 (the
interface). Earlier goals are in [current-history.md](current-history.md).

Stage A (bazaar safety and access) is built: A1 the release check, A2 the bazaar phone
opens offline, A3 the sign-out warning, release hold and framework patch, A4 the
maintenance jobs written and off. B1 is the first slice of stage B and the first that edits
a locked file, through one approved, guarded exception, so it is attended and not one of the
interface-only slices that may run unattended until the exception and its port audit are
recorded and green.

## B1 — the guarded screen slot, the five tabs and the live smoke suite

| Setting         | Value                                                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------------------- |
| Model, effort   | Claude Opus, high to plan and sign off; Sonnet, high to build. A locked-file edit deserves the stronger model to plan |
| Plan mode       | On: the slot is a protected edit, so state the exact block, the exception record and the audit before writing         |
| Permission mode | Auto after the plan is accepted                                                                                       |
| Review          | The `port-auditor` agent on the slot, and `security-reviewer` on a different model; fix every P0 to P2 finding        |
| Browser QA      | Yes: the live build against the local database, phone width and desktop, in the browser pane                          |
| Tools           | Node 24.20.0 and pnpm 9.12.3 from `happy-cookie-tools`; local Supabase                                                |
| Stop            | Evidence printed and pushed; 25 turns; two failed fix attempts                                                        |

```text
/goal Slice B1 of docs/state/final-plan.md (version 2) for The Happy Cookie Ops in
C:\Users\ethan\dev\happy-cookie-ops-g0. Three parts, one commit each. Stage A is built;
this is the first slice of stage B. The phone rehearsal is by 20 October and the bazaar is
24 to 25 October: B1 must not change what Bazaar Mode does on the phone, and it must not
reach the trial while the release hold is on.

Read first: AGENTS.md, docs/state/current.md, docs/state/final-plan.md sections 1 (decisions
4 and 7), 6.7, 8 and 8.1, 9 (B1) and 14, docs/state/protected-exception.md,
docs/state/product-research.md, docs/state/ux-audit.md, src/components/shell/app-frame.tsx
(the frame, read-only until part 1), tests/unit/screens.test.ts and
tests/unit/ops-runtime-live-dock.test.tsx. Find what already exists before building:
the live phone dock already shows five labelled destinations for the owner, so do only what
is missing, and say what you found.

1. The guarded, live-only screen slot. One block in the locked frame file that draws a new
   screen in place of the old one in live mode only, modelled on the form slot approved on
   28 September. Write the exception into docs/state/protected-exception.md first (the exact
   block, why, how the validator reverses it), then make the edit, then update the port
   baseline only with `node scripts/check-port-integrity.mjs --update` in the same commit.
   Proof: the demo build, `pnpm verify:port` and the ten visual baselines are unchanged;
   a test shows the slot draws nothing in demo mode and nothing until a screen is registered.
2. The function map of section 8.1 as a test: all 33 All tools entries and 25 routes mapped
   to exactly one of the five tabs, nothing unmapped and nothing mapped twice. Dock and
   sidebar labels come from data. Write the test first.
3. A live-mode smoke suite, run locally against the local database (CI has none): sign in
   as the local owner, visit every mapped route, no console error, no "undefined" or "NaN"
   on screen, offline Bazaar Mode still sells. Paste its output. Do not add it to CI.

Review: run port-auditor on part 1 and security-reviewer (a different model) on parts 1 and
3 before committing; fix every P0 to P2 finding. Check the result in the browser pane at
phone width and desktop: the demo build looks identical, the live build reaches every tab.

Update docs/state/current.md (five lines) and docs/state/task-status.json (one note, by
string insertion), and replace this block with slice B2.

Evidence to print: each failing test before and passing after; the reviewers' verdicts; the
pnpm verify summary in a clean shell; the smoke-suite output; the browser check, step by
step; the commit hashes and the pushed branch.

No new resources, shop opening, real customers, production launch, merge or automatic
runner. Do not set the release hold. Stop after 25 turns or two failed fix attempts and
report the actual obstacle.
```
