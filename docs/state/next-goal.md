# Next goal — B4

One goal per package, each in a fresh conversation opened in the repository root. Paste
one block. Where things stand: [current.md](current.md). The plan these come from:
[final-plan.md](final-plan.md), version 2, section 9, stage B. Earlier goals are in
[current-history.md](current-history.md).

B3 is built in three parts: B3a (7 October, migrations 56 to 59), B3b-1 (8 October, migration 60,
packaging as records) and B3b-2 (8 October, migration 61, the screens read the database's cost and
the books move to "when used"). None is on the trial. What B3b-1 decided is in
[decision-register.md](decision-register.md), the section for 8 October.

## B4 — her data, each import previewed and approved

| Setting         | Value                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------- |
| Model, effort   | Claude Opus, high to plan and sign off; Sonnet, high to build                                     |
| Plan mode       | On: the cutover question for Ethan first, with one recommendation; list each import and its proof |
| Permission mode | Auto after the plan is accepted                                                                   |
| Review          | Required: `security-reviewer` on a different model for every migration and import function        |
| Browser QA      | Yes: the live build against the local database, and `pnpm test:live:smoke`                        |
| Tools           | Node 24.20.0 and pnpm 9.12.3 from `happy-cookie-tools`; local Supabase                            |
| Stop            | Evidence printed and pushed; 25 turns; two failed fix attempts                                    |

```text
/goal Slice B4 of docs/state/final-plan.md (version 2) for The Happy Cookie Ops in
C:\Users\ethan\dev\happy-cookie-ops-g0: her data, each import previewed and approved: prices,
recipes, flavours, photos, newer sales, bookings and packaging costs. B3 is built (migrations 56
to 61; the trial is at 55 and gets no migration without Ethan's word). record_event_sale stays
untouched (hash 8cf2bd63); Bazaar Mode and the sale queue give today's results.

Read first: AGENTS.md, docs/state/current.md, final-plan.md sections 9 (B4) and 11 (the cutover
rule), sot-consolidation.md sections 1 to 4 and 11, the 8 October section of
decision-register.md, and migrations 20260101005600, 20260101005900 and 20260101006000. Say what
exists before building.

Ask Ethan in plan mode, one recommendation: the cost cutover (final-plan.md section 11). Stock
bought before the opening count is already an expense in the 804 historical lines, so "when
used" (migration 61) must start from a cutover date, with opening stock valued from her price
list and not expensed a second time. Migration 61 must not reach the trial before this rule is
built and rehearsed: apply 61 and the cutover in one sitting, or move 61's flip of the existing
row into the cutover migration (B3b-2 review, P3).

1. Each import (prices, recipes, flavours, photos, newer sales, bookings, packaging costs) is a
   preview with counts and hashes that Ethan approves, then one apply. Nothing is guessed: a row
   that does not match exactly one record is listed, not imported.
2. Her 23 costing rows are reproduced by get_recipe_costs, ingredients against ingredients.
3. Her per-cookie packaging lines (decision (b), 8 October): in the same sitting the per-cookie
   pouch leaves the bazaar-sale and loose rules.
4. The B3b-1 review's residual: save_recipe refuses an ingredient line (including one sent
   without `kind`) whose item is on any packaging rule, so a bake and a pack cannot both take it.
   A rule mutation in the role suite.

Tests first, in the SQL role suite and pnpm verify. Browser QA on the live build against the
local database, then pnpm test:live:smoke.

Build with at most two Sonnet subagents, one database writer at a time. Review:
security-reviewer on a different model for every migration and import function. Fix every P0
to P2.

Update docs/state/current.md (five lines) and task-status.json (one note, by string
insertion); replace this block with the next slice from final-plan.md. Print: each failing test
before and passing after, the reviewers' verdicts, the role-suite and pnpm verify summaries,
the smoke-suite output, the commit hashes and the pushed branch.

No new resources, shop opening, real customers, launch, merge or automatic runner. Do not set
the release hold. Stop after 25 turns or two failed fix attempts and report the obstacle.
```
