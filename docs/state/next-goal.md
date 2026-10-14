# Next goal — release S3.1 (migration 69 and its build), on Ethan's word only

S3.1 is built and tested locally (14 October, `a18a9da`): migration 69 is `20260101006800_bazaar_hardening.sql`. **Nothing
is applied to the trial.** The trial is at 68 and runs build `1b6c876c`. 69 and its build ship together: the old build's
close and finalise are refused by 69, and the new build's are refused by 68 ([run sheet](bazaar-run-sheet.md) row 2a).

**Proved locally:** `pnpm verify`; the SQL role suite (3,294 cases on each of two resets, all 1,516 mutants caught); one
Opus review, with its two should-fix items (the trigger now takes the booking's lock; removing a fee again after the
finalise is answered) fixed. **Still to prove:** `pnpm test:e2e`, and the two new **Remove** buttons (fees on the event page,
losses in the day review) in the browser pane at phone width.

```
/goal Release S3.1 to the trial in C:\Users\ethan\dev\happy-cookie-ops-g0, only after Ethan says "apply 69". Read
AGENTS.md, docs/state/current.md, this file, bazaar-run-sheet.md row 2a. Pinned toolchain (Node 24.20.0, pnpm 9.12.3).
1 pnpm test:e2e, output to a file; fix or stop.
2 Browser-pane QA of the Remove buttons at 375 px.
3 Apply 20260101006800 from a scratch folder holding only that file (dry run first), compare the schema fingerprint with
  local, then push the branch so CI deploys the matching build; confirm the version on the trial.
4 Update the run sheet rows 1, 2 and 2a, and current.md. Then the phone rehearsal.
Stop and ask before any hosted write other than step 3.
```

Model Opus, effort high, a new conversation, plan mode off. Not in S3.1: an expense added at the till (`event_expenses`)
cannot be removed yet.
