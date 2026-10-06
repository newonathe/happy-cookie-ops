# Next goal — B3b

One goal per package, each in a fresh conversation opened in the repository root. Paste
one block. Where things stand: [current.md](current.md). The plan these come from:
[final-plan.md](final-plan.md), version 2, section 9, stage B. Earlier goals are in
[current-history.md](current-history.md).

B3 was split on 6 October. B3a is built (7 October): migrations 56 to 59, the database half,
none on the trial; what it did with each finding is in [system-audit.md](system-audit.md),
section 10. B4 (her data) follows B3b.

## B3b — packaging as records, and the screens read the database's cost

| Setting         | Value                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------- |
| Model, effort   | Claude Opus, high to plan and sign off; Sonnet, high to build                                     |
| Plan mode       | On: three questions for Ethan first; list each function and each screen figure that will move     |
| Permission mode | Auto after the plan is accepted                                                                   |
| Review          | Required: `security-reviewer` on a different model for every migration and for the runtime change |
| Browser QA      | Yes: the live build against the local database, and `pnpm test:live:smoke`                        |
| Tools           | Node 24.20.0 and pnpm 9.12.3 from `happy-cookie-tools`; local Supabase                            |
| Stop            | Evidence printed and pushed; 25 turns; two failed fix attempts                                    |

```text
/goal Slice B3b of docs/state/final-plan.md (version 2) for The Happy Cookie Ops in
C:\Users\ethan\dev\happy-cookie-ops-g0: packaging as records, and the screens read the
database's cost. B3a is built (migrations 56 to 59; none is on the trial, which is at 55). The
bazaar is 24 to 25 October and runs on the trial: record_event_sale is not redefined (its
pinned body hash stays 8cf2bd63), the sale queue and Bazaar Mode give the same results as
today, and no migration goes on the trial without Ethan's word.

Read first: AGENTS.md, docs/state/current.md, final-plan.md sections 5.2 (H12, H13), 6.1 and
7.1 (Packaging rule, Ingredient cost), migrations 20260101005500 to 20260101005800, and in
20260101004700 only record_pack and record_sale_packaging. Say what exists before building.

Ask Ethan in plan mode, one recommendation each: (a) new SQL may not name a packaging item,
so is today's rule (a pouch per cookie and a bag per bazaar sale) entered by hand through the
new owner action, or seeded as an unconfirmed default; (b) when her per-cookie packaging lines
may reach the trial, because a bazaar sale then takes them too; (c) how a mistyped delivery
quantity is undone (system-audit.md section 10).

1. Packaging as records: each recipe line is an ingredient or packaging (packaging is per
   cookie and is not taken at bake), and a rule per container (each box size on an order, a
   loose cookie, an order, a bazaar sale) lists stock items and quantities, per container or
   per cookie. Owner actions read and save them. record_pack and record_sale_packaging read
   both; no item name is left in SQL. get_recipe_costs adds packaging per cookie.
2. With today's rule entered as records, a bazaar sale writes the same stock rows as today:
   the sale_pin cases in the role suite pass unchanged.
3. Live mode feeds the engine's cost path from get_item_costs and get_recipe_costs by
   replacing costPerUnit, ingCost, packCostPerCookie and unitCost in the subclass, with no
   engine edit. Unknown is "Cost pending", never zero, on Recipes, Products, bazaar profit
   and waste. The completeness check reads complete and missing; its three item names go.
4. Version skew: the client works on the trial at migration 55 and at the new schema. A
   missing function falls back to today's path, held by a unit test. No exact-key payload
   gains a required key.
5. The books move to "when used" (DP-04) in this slice's migration, and the P&L shows the
   uncosted uses get_books now returns, so an unknown cost is never silent.

Tests first, in the SQL role suite and pnpm verify: each refusal as a rule mutation; packing an
order by its boxes; the bazaar pin; the cost per cookie on screen equal to get_recipe_costs
for a worked recipe; the fallback on a database without the new functions.
tests/unit/no-prototype-values.test.tsx stays green. Browser QA on the live build against the
local database, and pnpm test:live:smoke.

Plan and sign off in this session; build with at most two Sonnet subagents, one writer at a
time on the database. Review: security-reviewer on a different model for every migration and
for the runtime change; fix every P0 to P2.

Update docs/state/current.md (five lines) and task-status.json (one note, by string
insertion); replace this block with slice B4. Print: each failing test before and passing
after, the reviewers' verdicts, the role-suite and pnpm verify summaries, the smoke-suite
output, the commit hashes and the pushed branch.

No new resources, shop opening, real customers, launch, merge or automatic runner. Do not set
the release hold. Stop after 25 turns or two failed fix attempts and report the obstacle.
```
