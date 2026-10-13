# Next goal — S2, bazaar days (the plan, the start and the till)

One goal per package, each in a fresh conversation opened in the repository root. Paste
one block. Where things stand: [current.md](current.md). The design these come from:
[bazaar-days.md](bazaar-days.md), approved by Ethan on 13 October; it holds the S3 goal. Earlier goals are in
[current-history.md](current-history.md) and in Git (S1: `1723e77`, this file).

Ethan put the bazaar ahead of B6 on 13 October: the 24 to 25 October bazaar sells on the new flow, with no fallback, so
S1 to S3 must be deployed and rehearsed on the phone by 20 October. S1 (migration 68) is built and on the local
database only. The one-time set-up (S4, S5: [cine-set-up.md](cine-set-up.md)) follows, then B6 (New Recipes; its goal
is in Git at `3597c19`, this file).

## S2 — the data layer, the runtime and the screens up to selling

| Setting         | Value                                                                                |
| --------------- | ------------------------------------------------------------------------------------ |
| Model, effort   | Claude Sonnet, high to build (at most two workers); Opus, high for the sign-off only |
| Plan mode       | Off: the design is approved. Say what exists before building                         |
| Permission mode | Auto                                                                                 |
| Review          | `port-auditor` on the locked files; `security-reviewer` on the runtime diff          |
| Browser QA      | Required, at 320 px, on a local live build (the recipe is in the saved notes)        |
| Tools           | Node 24.20.0 and pnpm 9.12.3 from `happy-cookie-tools`; Docker and local Supabase    |
| Stop            | Evidence printed and pushed; 25 turns; two failed fix attempts                       |

```text
/goal Slice S2 of docs/state/bazaar-days.md for The Happy Cookie Ops in C:\Users\ethan\dev\happy-cookie-ops-g0: the
data layer, the runtime and the screens up to selling. S1 (migration 68) is built and on the local database; it reaches
the trial only on Ethan's word. Read first: AGENTS.md, docs/state/current.md, docs/state/bazaar-days.md ("S1 as built"
holds the real contracts: snake_case bodies, the client id on add_bazaar_day_stock, stamps, 40001 on a stale hash),
migration 20260101006700, src/components/live/stock/ (the pattern), src/store/ops-runtime.tsx (startLiveEvent,
liveBazaarEvents, liveScreenVals), src/lib/offline/bazaar-state.ts. Say what exists before building.
Tests first: the parser refuses a malformed answer; a started day lands in the engine's state with its own prices and
stock and survives a reload; a second start of the same day is the same event. Build src/lib/data/bazaar-days.ts, the
event list, event page, day plan and "Start this day", and the screen registration; the till is the ported component,
unchanged. Extend scripts/test-live-smoke.mjs: plan two days, start day 1 at its own prices, sell online and offline,
reload, each sale arrives once. No change to src/components/screens|sheets|shell, the engine, src/lib/offline,
src/lib/auth or public/sw.js. Sonnet builds, at most two workers; port-auditor confirms the locked files; security-
reviewer on the runtime diff. pnpm verify before every commit; browser QA at 320 px. Update current.md (five lines) and
task-status.json (one note). Do not merge or deploy. Stop after 25 turns or two failed fix attempts.
```
