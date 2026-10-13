# Next goal — B6

One goal per package, each in a fresh conversation opened in the repository root. Paste
one block. Where things stand: [current.md](current.md). The plan these come from:
[final-plan.md](final-plan.md), version 2, section 9, stage B. Earlier goals are in
[current-history.md](current-history.md).

B3, B4 and B5 are built: B3a (migrations 56 to 59), B3b-1 (60), B3b-2 (61, and the runtime), B4a (62 to 64: the cost
cutover and the operator's imports), B4b (65, the count rule, and the offline tools for her recipes, newer sales and
photos) and B5 (66, the owner-only item movements read, and the live Inventory and Grocery screens). None is on the
trial. What B5 decided is in [decision-register.md](decision-register.md), the section for 13 October. B6 is an interface
slice; it waits on none of Ethan's reads, but the cost of a recipe stays "Cost pending" until her prices are imported.

## B6 — New Recipes

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
/goal Slice B6 of docs/state/final-plan.md (version 2) for The Happy Cookie Ops in
C:\Users\ethan\dev\happy-cookie-ops-g0: New Recipes, the picture grid and the flavour page. B5 is built
(migrations 56 to 66; none is on the trial, which is at 55). record_event_sale stays untouched (hash 8cf2bd63).
The ported screens, sheets, shell and engine stay locked: the new screens enter through the guarded live-only slot
(src/components/live/live-screens.ts; the B5 stock screens in src/components/live/stock/ are the pattern to follow).

Read first: AGENTS.md, docs/state/current.md, final-plan.md section 6 (the Make, Recipes row of the screen table and
6.4 the accessibility floor) and 7.1 (Recipe, Ingredient cost, Packaging rule), the existing Recipes, Menu & flavours
and Recipe drafts screens and their live actions in src/store/ops-runtime.tsx (recipeCosts, knownRecipeCost, the
packaging fallbacks), src/lib/data/costs.ts and the recipe reads. Say what exists before building.

1. Picture grid of flavours with the filters on sale, all and cannot make now.
2. Flavour page: picture, price, cost per cookie, margin, allergens, ingredients each marked Good, Low or Out (the B5
   status words), versions, her original recipe text, Edit recipe, Add a flavour. An incomplete cost names what is
   missing ("Cost pending: Oats has no price") and never shows 0 or a margin made from it.
3. Margin "against her floor" only once a floor is set; the floor setting itself is slice B7. Put this to Ethan in plan
   mode: show cost and margin without a floor line until then.
4. 320 px wide and 200% text with no sideways scroll; every target at least 24 px (primary buttons 44); a keyboard
   pass; an axe scan for each new screen in the vitest and smoke tests, as B5 did.

Interface track: new files only; src/store/ops-runtime.tsx and src/lib/types/database.ts belong to the database
track, so a runtime change is queued behind it and named in the report. Tests first. tests/unit/no-prototype-
values.test.tsx stays green. Build with at most two Sonnet subagents. Review: port-auditor confirms the locked
files are untouched.

Update docs/state/current.md (five lines) and task-status.json (one note, by string insertion); replace this
block with slice B7 from final-plan.md. Print: each failing test before and passing after, the reviewers'
verdicts, the pnpm verify summary, the smoke-suite output, the accessibility scan result, the commit hashes and
the pushed branch.

No new resources, shop opening, real customers, launch, merge or automatic runner. Do not set the release
hold. Stop after 25 turns or two failed fix attempts and report the obstacle.
```
