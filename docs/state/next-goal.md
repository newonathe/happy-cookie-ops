# Next goal — S1, bazaar days (the database)

One goal per package, each in a fresh conversation opened in the repository root. Paste
one block. Where things stand: [current.md](current.md). The design these come from:
[bazaar-days.md](bazaar-days.md), approved by Ethan on 13 October; it holds the S2 and S3 goals. Earlier goals are in
[current-history.md](current-history.md).

Ethan put the bazaar ahead of B6 on 13 October: the 24 to 25 October bazaar sells on the new flow, with no fallback, so
S1 to S3 must be deployed and rehearsed on the phone by 20 October. The one-time set-up (S4, S5:
[cine-set-up.md](cine-set-up.md)) follows, then B6 (New Recipes; its goal is in Git at `3597c19`, this file).

## S1 — migration 68: days, fees, losses, the summary, close and finalise

| Setting         | Value                                                                             |
| --------------- | --------------------------------------------------------------------------------- |
| Model, effort   | Claude Sonnet, high to build; Opus, high for the sign-off only                    |
| Plan mode       | Off: the design is approved. Write the hand-worked example before any SQL         |
| Permission mode | Auto                                                                              |
| Review          | Required: `security-reviewer` on a different model for the whole migration        |
| Browser QA      | None (no screen changes)                                                          |
| Tools           | Node 24.20.0 and pnpm 9.12.3 from `happy-cookie-tools`; Docker and local Supabase |
| Stop            | Evidence printed and pushed; 25 turns; two failed fix attempts                    |

```text
/goal Slice S1 of docs/state/bazaar-days.md for The Happy Cookie Ops in C:\Users\ethan\dev\happy-cookie-ops-g0, on a
new branch from agent/codex/MP-04-g1-feasibility: migration 20260101006700_bazaar_days.sql and its tests. This is real
money: exact, whole centavos, nothing guessed. The trial is at 67 of 67 and gets no migration without Ethan's word.
record_event_sale stays untouched (body md5 8cf2bd637503cd4ef791a80eb415bb43).

Read first, and nothing else until you have said what exists: AGENTS.md, docs/state/current.md,
docs/state/bazaar-days.md, migrations 20260101003200, 003300, 004100, 004200, 004700 (record_production),
005900 (record_sale_packaging, get_recipe_costs) and 006400 (get_books), tests/integration/security/bazaar-events.sql
and bazaar-closeout.sql, and how scripts/test-db-security.py counts a suite.

1. First, in the new suite's header: a hand-worked two-day event (three flavours, one with a typed cost, one with no
   cost; a discount, a freebie, a void, a loss, a short drawer, a carry-over, cookies to the shop, a fee for the event
   and one for a day), with every figure of the summary worked out by hand.
2. tests/integration/security/bazaar-days.sql: that example to the centavo; one case and one rule mutation per
   refusal; anon, helper, support and an inactive owner denied every function; a repeat of each call answered.
3. The migration, as the design's tables and contracts say. One scaling rule for a recipe's stock, shared with
   record_production. record_sale_packaging and get_books redefined whole with one change each.
4. Check how the app reads baked stock before writing "to the shop"; if it needs a second stock count, stop and report.
5. Pins, function authority, the suite's counts, pnpm db:types.

Run python scripts/test-b3a-upgrade.py, python scripts/test-db-security.py (then git checkout -- docs/state/evidence/)
and pnpm verify. security-reviewer on a different model; fix every P0 to P2. Update docs/state/current.md (five lines)
and task-status.json (one note, by string insertion); replace this block with S2 from bazaar-days.md. Print each
failing test before and passing after, the reviewer's verdict, the suite and verify summaries, the commit hashes and
the pushed branch. Open a draft PR. Do not merge, deploy or touch the trial. Stop after 25 turns or two failed fix
attempts and report the obstacle.
```
