# Next goals — A4 (backup, restore drill, retention and keep-alive schedule, written and off)

One goal per package, each in a fresh conversation opened in the repository root. Paste
one block. Where things stand: [current.md](current.md). The plan these come from:
[final-plan.md](final-plan.md), version 2, section 9, stage A. Earlier goals are in
[current-history.md](current-history.md).

A1 (the release check), A2 (the bazaar phone opens offline) and A3 (sign-out warning, release
hold, framework patch) are done. A4 is approved with the plan on 5 October 2026. It writes
jobs that stay off and runs them only against the local database, so it needs no hosted
resource; switching them on is Ethan's (backup custody, secrets, the variable). It touches
secret handling, so it is attended, not one of the interface-only slices that may run
unattended.

## A4 — the maintenance jobs, written and off, with a local dry run

| Setting         | Value                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------- |
| Model, effort   | Claude Sonnet, high: small and specified. Opus signs off the review                           |
| Plan mode       | On: three short parts, state the files and the test for each                                  |
| Permission mode | Auto                                                                                          |
| Review          | The `security-reviewer` agent on a different model, before commit; fix every P0 to P2 finding |
| Browser QA      | No: no interface changes                                                                      |
| Tools           | Node 24.20.0 and pnpm 9.12.3 from `happy-cookie-tools`; local Supabase; Docker                |
| Stop            | Evidence printed and pushed; 25 turns; two failed fix attempts                                |

```text
/goal Slice A4 of docs/state/final-plan.md (version 2) for The Happy Cookie Ops in
C:\Users\ethan\dev\happy-cookie-ops-g0. Three small parts, one commit each. The phone
rehearsal is by 20 October; the bazaar is 24 to 25 October; the trial database holds real
bazaar sales from then, with no backup until these jobs are on (final-plan.md section 14).

Read first: AGENTS.md, docs/state/current.md, docs/state/final-plan.md sections 9 (A4),
12 and 14, docs/state/F1-operations.md, docs/state/F1-schedule.example.json,
scripts/f1-backup.mjs, scripts/f1-operations.mjs, their tests (scripts/test-f1-backup.mjs
and the unit tests that name them), .github/workflows/uptime.yml and
.github/workflows/owner-trial.yml (the release hold, A3, is the model for "off"). Protected
files are not to be edited: if a part seems to need one, stop and say so.

1. The schedule, written and off. One workflow, .github/workflows/ops-jobs.yml, with the
   three jobs of F1-schedule.example.json: weekly backup, daily keep-alive, daily retention.
   Every job is gated on one repository variable (OPS_JOBS_ENABLED) that is not set, and
   reads no secret and calls no hosted API when it is off; the run says why in one line.
   The backup job names no destination (custody is undecided): it must fail closed with a
   clear message until Ethan names one, never write to a default. Hosted calls keep the
   --hosted-approved flag. Write the tests first: off means no job step runs and no secret
   is read, proven from the workflow text as the release-hold test does.
2. A local dry run against the local database only: backup, verify, the isolated restore
   drill (the disposable container the F1 doc requires), keep-alive and retention, with the
   counts and hashes recorded in docs/state/evidence. Use throwaway keys generated for the
   run and never print them. Nothing hosted, no --hosted-approved.
3. Say what Ethan does to switch them on, in docs/state/F1-operations.md and current.md:
   where the encrypted archive lives, who can restore it, the secrets to add, the
   variable to set, and what a failed job looks like. Do not set the variable.

Review: run the security-reviewer agent on a different model before committing part 1 and
again before part 2; fix every P0 to P2 finding (key handling, logs, the fail-closed
default, anything that could reach a hosted project).

Update docs/state/current.md (five lines) and docs/state/task-status.json (one note, by
string insertion), and replace this block with slice B1.

Evidence to print: each failing test before and passing after; the reviewers' verdicts; the
pnpm verify summary in a clean shell; the dry run, step by step, with counts; the commit
hashes and the pushed branch.

No new resources, hosted calls, shop opening, real customers, production launch, merge or
automatic runner. Do not set the variable. Stop after 25 turns or two failed fix attempts
and report the actual obstacle.
```
