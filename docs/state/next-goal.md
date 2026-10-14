# Next goal — the phone rehearsal (run sheet row 7), then the release hold

S3.1 is on the trial (14 October): migration 69 (`20260101006800_bazaar_hardening.sql`) applied from a scratch folder, 69 of
69, and its build deployed by PR #24 (merge `3cf4a36`, version `2eda3738`). Rows 1, 2 and 2a of the
[run sheet](bazaar-run-sheet.md) are done. The repository is public since 14 October (GitHub's free minutes for private
repositories had run out): nothing secret may be committed, and the secret scan runs before every push.

**The rehearsal is Ethan's, on the selling iPhone** ([run sheet](bazaar-run-sheet.md), "The rehearsal", steps 1 to 11). An
agent cannot run it: it needs the phone, aeroplane mode, the Home Screen app and the owner's sign-in. Nothing is deployed and
nothing is written to the database between the rehearsal and 26 October (row 8).

```
/goal Record the bazaar phone rehearsal in C:\Users\ethan\dev\happy-cookie-ops-g0. Read AGENTS.md, docs/state/current.md,
this file, bazaar-run-sheet.md ("Go / no-go", "The rehearsal"). Ethan pastes each step's result (pass, or what he saw).
1 For each failed step: find the cause in code (read only the files the step's row in "What proves each step" names),
  say whether it blocks 24 October, and propose the smallest fix. Build nothing until Ethan says which to fix.
2 When all 11 pass: update row 7 and the go/no-go paragraph, current.md, and this file (next: RELEASE_HOLD, row 8).
Stop and ask before any hosted write; setting RELEASE_HOLD is Ethan's.
```

Model Sonnet, effort medium, a new conversation, plan mode off. Not in S3.1: an expense added at the till
(`event_expenses`) cannot be removed yet.
