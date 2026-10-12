# Next goal — B5

One goal per package, each in a fresh conversation opened in the repository root. Paste
one block. Where things stand: [current.md](current.md). The plan these come from:
[final-plan.md](final-plan.md), version 2, section 9, stage B. Earlier goals are in
[current-history.md](current-history.md).

B3 and B4 are built: B3a (migrations 56 to 59), B3b-1 (60), B3b-2 (61, and the runtime), B4a (62 to 64: the cost
cutover and the operator's imports) and B4b (65, the count rule, and the offline tools for her recipes, newer sales and
photos). None is on the trial. What B4b decided is in [decision-register.md](decision-register.md), the section for
12 October. B5 is an interface slice; it waits on none of Ethan's reads.

## B5 — New Stock: Inventory and Grocery

| Setting         | Value                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------- |
| Model, effort   | Claude Opus, high to plan and sign off; Sonnet, high to build                                                  |
| Plan mode       | On: the screens, their states and every figure they show, for Ethan first                                      |
| Permission mode | Auto after the plan is accepted                                                                                |
| Review          | Required: `port-auditor` (locked files untouched); `security-reviewer` only if a migration or write path moves |
| Browser QA      | Yes: the live build against the local database, an accessibility scan, and `pnpm test:live:smoke`              |
| Tools           | Node 24.20.0 and pnpm 9.12.3 from `happy-cookie-tools`; local Supabase                                         |
| Stop            | Evidence printed and pushed; 25 turns; two failed fix attempts                                                 |

```text
/goal Slice B5 of docs/state/final-plan.md (version 2) for The Happy Cookie Ops in
C:\Users\ethan\dev\happy-cookie-ops-g0: New Stock, Inventory and Grocery. B4 is built (migrations 62 to 65;
none is on the trial, which is at 55). record_event_sale stays untouched (hash 8cf2bd63); Bazaar Mode and the
sale queue give today's results. The ported screens, sheets, shell and engine stay locked: the new screens
enter through the guarded live-only slot (src/components/live/live-screens.ts, docs/state/protected-exception.md).

Read first: AGENTS.md, docs/state/current.md, final-plan.md section 6 (6.4 the accessibility floor, and the
Stock rows of the function map in section 8.1) and 7.1 (Ingredient, Packaging rule), the existing Inventory
screen and its live actions in src/store/ops-runtime.tsx (stockCatalogue, recordMovement, liveReceipt,
liveReconcile, liveWaste), src/lib/data/stock-catalogue.ts and stock-ledger.ts. Say what exists before building.

1. Inventory: the items list with Out, Low and Good (a word as well as a colour); an item page with its
   movements; receive a delivery; the weekly count; waste. The same movements and the same database calls as
   today. A cost that is unknown reads "Cost pending", never 0.
2. Grocery: the same list filtered to Out and Low, with Have, Needed and To buy, the pack, the best price per
   unit, the supplier and a running total against her budget; "I bought these" records the deliveries.
3. A count that finds less after the cutover is an expense (migration 65): the count sheet says so before it is
   saved, using the item's known cost, or says the cost is pending.
4. 320 px wide and 200% text with no sideways scroll; every target at least 24 px (selling and primary buttons
   44); a keyboard pass on desktop; an automated accessibility scan for each new screen in the browser tests.

Interface track: new files only; src/store/ops-runtime.tsx and src/lib/types/database.ts belong to the database
track, so a runtime change is queued behind it and named in the report. Tests first. tests/unit/no-prototype-
values.test.tsx stays green. Build with at most two Sonnet subagents. Review: port-auditor confirms the locked
files are untouched.

Update docs/state/current.md (five lines) and task-status.json (one note, by string insertion); replace this
block with slice B6 from final-plan.md. Print: each failing test before and passing after, the reviewers'
verdicts, the pnpm verify summary, the smoke-suite output, the accessibility scan result, the commit hashes and
the pushed branch.

No new resources, shop opening, real customers, launch, merge or automatic runner. Do not set the release
hold. Stop after 25 turns or two failed fix attempts and report the obstacle.
```
