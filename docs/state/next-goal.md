# Next goal — the bazaar days release (on Ethan's word only)

One goal per package, each in a fresh conversation opened in the repository root. Paste
one block. Where things stand: [current.md](current.md). The design and what was built:
[bazaar-days.md](bazaar-days.md). Earlier goals are in [current-history.md](current-history.md) and in Git (S2: `fbae1e0`,
this file).

S1 to S3 are built on branch `claude/bazaar-days-s3`, local only. The bazaar sells on the new flow on 24 to 25 October,
with no fallback, so it must reach the trial and pass the phone rehearsal by 20 October. Every step below changes the
hosted trial: run it only after Ethan says so in that conversation. The one-time set-up (S4, S5:
[cine-set-up.md](cine-set-up.md)) follows, then B6 (New Recipes; its goal is in Git at `3597c19`, this file).

## The release — migration 68, merge, deploy

| Setting         | Value                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------ |
| Model, effort   | Claude Opus, high (hosted database and a release: no workers)                                    |
| Plan mode       | On: state each hosted step and wait for Ethan's word                                             |
| Permission mode | Default: every hosted write asks                                                                 |
| Review          | None new: S3's reviews are in its commits                                                        |
| Browser QA      | The trial at 320 px after the deploy: the event list, a plan, the review of a test day           |
| Tools           | Node 24.20.0 and pnpm 9.12.3 from `happy-cookie-tools`; Docker, local Supabase, the Supabase MCP |
| Stop            | The trial at 68 of 68 with an equal fingerprint, deployed; 25 turns; two failed fix attempts     |

```text
/goal Release the bazaar days (S1 to S3 of docs/state/bazaar-days.md) to the trial for The Happy Cookie Ops in
C:\Users\ethan\dev\happy-cookie-ops-g0, on Ethan's word only. Read first: AGENTS.md, docs/state/current.md,
docs/state/bazaar-run-sheet.md (rows 1 and 2), the saved notes on the trial upgrade. Ask Ethan before each hosted step.
1. From a scratch folder (never the repository folder): copy the trial's schema to a scratch local database, apply
   migration 20260101006700 there, run the bazaar-days role suite. 2. With his word: apply it to the trial, read the
   migration list (68 of 68) and compare the schema fingerprint with local. 3. Free the Actions artifact storage or
   wait for it, open a PR from claude/bazaar-days-s3, and with his word merge and let CI deploy. 4. Open the trial at
   320 px: the event list, a plan, a review. Set RELEASE_HOLD only after the phone rehearsal passes. Update current.md
   and the run sheet's go/no-go table. Stop after 25 turns or two failed fix attempts.
```
