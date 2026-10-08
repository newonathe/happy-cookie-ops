# Next goal — B3b-2

One goal per package, each in a fresh conversation opened in the repository root. Paste
one block. Where things stand: [current.md](current.md). The plan these come from:
[final-plan.md](final-plan.md), version 2, section 9, stage B. Earlier goals are in
[current-history.md](current-history.md).

B3 was split twice. B3a (7 October, migrations 56 to 59) and B3b-1 (8 October, migration 60,
packaging as records) are built; none is on the trial. What B3b-1 decided is in
[decision-register.md](decision-register.md), the section for 8 October. B4 (her data) follows B3b-2.

## B3b-2 — the screens read the database's cost, and the books move to "when used"

| Setting         | Value                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------- |
| Model, effort   | Claude Opus, high to plan and sign off; Sonnet, high to build                            |
| Plan mode       | Off: the plan is below. List each screen figure that moves before changing code          |
| Permission mode | Auto                                                                                     |
| Review          | Required: `security-reviewer` on a different model for migration 61 and the runtime diff |
| Browser QA      | Yes: the live build against the local database, and `pnpm test:live:smoke`               |
| Tools           | Node 24.20.0 and pnpm 9.12.3 from `happy-cookie-tools`; local Supabase                   |
| Stop            | Evidence printed and pushed; 25 turns; two failed fix attempts                           |

```text
/goal Slice B3b-2 of docs/state/final-plan.md (version 2) for The Happy Cookie Ops in
C:\Users\ethan\dev\happy-cookie-ops-g0: the screens read the database's cost, and the books
move to "when used". B3b-1 is built (migration 60: packaging_rules, get_recipe_costs with
ingredient_cents_per_cookie and packaging_cents_per_cookie). The trial is at 55 and gets no
migration without Ethan's word. record_event_sale stays untouched (hash 8cf2bd63); Bazaar Mode
and the sale queue give today's results.

Read first: AGENTS.md, docs/state/current.md, the 8 October section of decision-register.md,
migrations 20260101005600 (get_books, get_item_costs, get_recipe_costs) and 20260101005900,
src/store/ops-runtime.tsx (costPerUnit, ingCost, packCostPerCookie, unitCost, completeRecipeCost,
liveProductRows, recipeVals, adminVals, bazaarVals, miscVals, pnlVals, boxTotal), src/lib/data/
shop-identity.ts:88 (the missing-function pattern) and books.ts. Say what exists before building.

1. Migration 20260101006000_books_used.sql (61): books_settings default and the existing row
   become 'used'; get_books `uncosted` also lists pack and sale shortfalls with their `why`.
   Its tests go in the role suite first (a rule mutation per refusal, as in B3b-1).
2. Runtime, subclass only, no engine edit: ops-runtime.tsx overrides costPerUnit, ingCost,
   packCostPerCookie and unitCost from get_item_costs and get_recipe_costs, converting centavos
   to pesos in ONE place and carrying a known/unknown flag. New src/lib/data/costs.ts parses
   both. A missing function (PGRST202, 42883 or 404) falls back to super.*, held by a unit test
   on a faked client. books.ts parses `uncosted`; an absent list is [].
3. Figures that move: Recipes cost per cookie and batch cost; Products unit cost and margin;
   bazaar profit and COGS ("Cost pending" if any flavour sold is incomplete); waste cost
   ("Cost pending" when unknown); packaging per cookie (her recipe packaging lines only; the
   box cost is no longer spread per cookie, which is intended); completeness
   (completeRecipeCost reads complete/missing and its three item names go); P&L (basis
   'used' plus the uncosted list); boxTotal (check at build; "Cost pending" if unknown).
   Unknown is "Cost pending", never 0 or ₱0.00.

Tests first, in pnpm verify: the cost per cookie on screen equals get_recipe_costs for the worked
recipe; the fallback gives today's figures on a client without the new functions; Recipes,
Products, bazaar profit and waste show "Cost pending"; no packaging names remain in
ops-runtime.tsx; the P&L lists uncosted uses; tests/unit/no-prototype-values.test.tsx stays
green. Browser QA on the live build against the local database, then pnpm test:live:smoke.

Build with at most two Sonnet subagents, one database writer at a time. Review:
security-reviewer on a different model for migration 61 and the runtime diff; port-auditor
confirms the locked screens are untouched. Fix every P0 to P2.

Update docs/state/current.md (five lines) and task-status.json (one note, by string
insertion); replace this block with slice B4 from final-plan.md. Print: each failing test
before and passing after, the reviewers' verdicts, the role-suite and pnpm verify summaries,
the smoke-suite output, the commit hashes and the pushed branch.

No new resources, shop opening, real customers, launch, merge or automatic runner. Do not set
the release hold. Stop after 25 turns or two failed fix attempts and report the obstacle.
```
