# Next goal — B4b

One goal per package, each in a fresh conversation opened in the repository root. Paste
one block. Where things stand: [current.md](current.md). The plan these come from:
[final-plan.md](final-plan.md), version 2, section 9, stage B. Earlier goals are in
[current-history.md](current-history.md).

B3 and B4a are built: B3a (migrations 56 to 59), B3b-1 (60), B3b-2 (61, and the runtime) and B4a (62 to 64: the cost
cutover, and the operator's preview and apply for her data). None is on the trial. What B4a decided is in
[decision-register.md](decision-register.md), the section for 12 October.

## B4b — her photos and her newer sales

| Setting         | Value                                                                                                            |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| Model, effort   | Claude Opus, high to plan and sign off; Sonnet, high to build                                                    |
| Plan mode       | On: the list of what is imported, with its counts and proof, for Ethan first                                     |
| Permission mode | Auto after the plan is accepted                                                                                  |
| Review          | Required: `security-reviewer` on a different model for every migration, upload path and import script            |
| Browser QA      | Yes: the live build against the local database, and `pnpm test:live:smoke`                                       |
| Tools           | Node 24.20.0 and pnpm 9.12.3 from `happy-cookie-tools`; local Supabase; her photo folder (561 MB, on his laptop) |
| Stop            | Evidence printed and pushed; 25 turns; two failed fix attempts                                                   |

```text
/goal Slice B4b of docs/state/final-plan.md (version 2) for The Happy Cookie Ops in
C:\Users\ethan\dev\happy-cookie-ops-g0: her photos and her newer sales, each previewed and approved.
B4a is built (migrations 62 to 64; none is on the trial, which is at 55). record_event_sale stays
untouched (hash 8cf2bd63); Bazaar Mode and the sale queue give today's results.

Read first: AGENTS.md, docs/state/current.md, the 12 October section of decision-register.md,
final-plan.md section 9 (B4) and sot-consolidation.md sections 3 and 11, scripts/import-her-data.py,
scripts/prepare-historical-ledger.mjs (prepareHistoricalLedgerAppend), and migration
20260101006300 (the preview and apply pattern). Say what exists before building.

1. Photos: her 15 finished pictures (0.8 to 18.2 MB, up to 4,284 by 5,712 px) are resized below the app's
   2 MB limit and uploaded through the owner's existing flavour-photo path, one flavour per picture.
   A preview lists each file with its hash, size before and after, and the flavour it matches; a name
   that is not exactly one flavour is listed and left alone. Two flavours have no finished picture
   (Gooey Nutella; Red Velvet Cheesecake has only a Photoshop file): they show none.
2. Newer sales: her Sales sheet since the 804 historical lines (4 October), appended to the ledger with
   prepareHistoricalLedgerAppend against the trial's exact ledger hash, which Ethan reads through the
   connector. Dates she did not enter are listed, not guessed. Needs his explicit approval of the source-date
   and repeat assumptions.
3. Her 23 costing rows: the recipe questions open in the register (pouch naming, per-cookie packaging, the
   items missing from her master) are answered by Ethan before the recipes import is run.

Tests first. Browser QA on the live build against the local database, then pnpm test:live:smoke.
Build with at most two Sonnet subagents. Review: security-reviewer on a different model; fix every P0 to P2.

Update docs/state/current.md (five lines) and task-status.json (one note, by string insertion); replace
this block with the next slice from final-plan.md. Print: each failing test before and passing after, the
reviewers' verdicts, the role-suite and pnpm verify summaries, the smoke-suite output, the commit hashes and
the pushed branch.

No new resources, shop opening, real customers, launch, merge or automatic runner. Do not set the release
hold. Stop after 25 turns or two failed fix attempts and report the obstacle.
```
