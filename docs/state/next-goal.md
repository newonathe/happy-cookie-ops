# Next goal — B3

One goal per package, each in a fresh conversation opened in the repository root. Paste
one block. Where things stand: [current.md](current.md). The plan these come from:
[final-plan.md](final-plan.md), version 2, section 9, stage B. Earlier goals are in
[current-history.md](current-history.md).

B2 is built (6 October): no prototype value on any live page, the signed-in person's own name
on every bazaar sale, one Manila clock, and the two tests that hold it
(`tests/unit/no-prototype-values.test.tsx`). Its goal block is in Git history and its result
in [current.md](current.md).

## B3 — the database window: one cost, links by identity

| Setting         | Value                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| Model, effort   | Claude Opus, high to plan and sign off; Sonnet, high to build                                         |
| Plan mode       | On: list each table and function it changes, and each money figure that will move, before writing     |
| Permission mode | Auto after the plan is accepted                                                                       |
| Review          | Required: `security-reviewer` on a different model for every migration; fix every P0 to P2            |
| Browser QA      | Yes: the live build against the local database, and `pnpm test:live:smoke`                            |
| Tools           | Node 24.20.0 and pnpm 9.12.3 from `happy-cookie-tools`; local Supabase                                |
| Stop            | Evidence printed and pushed; 25 turns; two failed fix attempts; split into B3a and B3b if it outgrows |

```text
/goal Slice B3 of docs/state/final-plan.md (version 2) for The Happy Cookie Ops in
C:\Users\ethan\dev\happy-cookie-ops-g0: the database window. One cost per ingredient, stamped
when used, and records linked by identity, not by name. The bazaar is 24 to 25 October and
runs on the trial: record_event_sale, the sale queue and Bazaar Mode must give the same
results as today, and no migration goes on the trial without Ethan's word.

Read first: AGENTS.md, docs/state/current.md, final-plan.md sections 5.1 (C3, C5), 5.2 (H12,
H13), 5.3 (N7, N9), 6.1, 7, 7.1 and 9 (B3), and in docs/state/system-audit.md only the rows
C3, C5, L1, L2, L5, H12, H13 and section 9 (grep them; do not read the file). Read the
migrations they name. Say what already exists before building.

1. Links by identity: a recipe line points at a stock item, a supplier price at its item with
   its own pack size, a production record at the recipe version it used. Existing rows are
   matched by name in a previewed, counted step; an unmatched row is listed, never guessed.
2. Her usual price and pack per stock item, dated, editable.
3. One database cost function: the weighted average of what is on hand, updated at each
   costed delivery; else her usual price; else the best supplier price per unit; else unknown,
   never zero. The cost is stamped on each use. A recipe's cost answers with the amount,
   whether it is complete, and what is missing. Live mode feeds the engine's cost path from
   it, so screens and books cannot disagree.
4. A production shortfall is costed and flagged. Cost basis "when used", as decided.
5. Packaging as records: per-cookie lines on each recipe and a rule per order container,
   replacing the item names in record_pack, record_sale_packaging and the completeness check.
   A bazaar sale takes the same stock as today for today's rule.
6. The three functions that inline the Manila date call public.business_clock(). The 23
   security rules call their helper wrapped, with the indexes they need.
7. Correct a recorded batch (Ethan, 6 October). An owner action on the batch's record writes
   an opposite entry; the batch row is never edited. The baked count, the yield record and
   the cost per cookie follow. Default to state in the plan: it moves no ingredients or dough.
   It needs a reason and is refused if the baked count would go negative.

Tests first, in the SQL role suite and pnpm verify: money cases worked by hand (average over
two deliveries, a use before any costed delivery, a shortfall, a correction), a batch
corrected up and down, each refusal as a rule mutation, the bazaar sale's stock effect before
and after. tests/unit/no-prototype-values.test.tsx stays green.

Plan and sign off in this session; build with at most two Sonnet subagents. Review:
security-reviewer on a different model for every migration; fix every P0 to P2. Split into
B3a and B3b if it outgrows one session.

Update docs/state/current.md (five lines) and task-status.json (one note, by string
insertion); replace this block with slice B4. Print: each failing test before and passing
after, the reviewer's verdict, the role-suite and pnpm verify summaries, the smoke-suite
output, the commit hashes and the pushed branch.

No new resources, shop opening, real customers, launch, merge or automatic runner. Do not set
the release hold. Stop after 25 turns or two failed fix attempts and report the obstacle.
```
