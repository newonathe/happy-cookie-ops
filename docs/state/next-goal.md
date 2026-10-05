# Next goals — A3 (sign-out warning, release hold, framework patch)

One goal per package, each in a fresh conversation opened in the repository root. Paste
one block. Where things stand: [current.md](current.md). The plan these come from:
[final-plan.md](final-plan.md), version 2, section 9, stage A. Earlier goals are in
[current-history.md](current-history.md).

A1 (the release check) and A2 (the bazaar phone opens offline) are done. A3 is approved
with the plan on 5 October 2026. It touches sign-out and the release workflow, so it is
attended, not one of the interface-only slices that may run unattended.

## A3 — warn before sign-out with sales queued; a release hold; the framework patch

| Setting         | Value                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------- |
| Model, effort   | Claude Sonnet, high: small and specified. Opus signs off the review                           |
| Plan mode       | On: three short parts, state the files and the test for each                                  |
| Permission mode | Auto                                                                                          |
| Review          | The `security-reviewer` agent on a different model, before commit; fix every P0 to P2 finding |
| Browser QA      | Yes for part 1: the live build against the local database, in the browser pane                |
| Tools           | Node 24.20.0 and pnpm 9.12.3 from `happy-cookie-tools`; local Supabase                        |
| Stop            | Evidence printed and pushed; 25 turns; two failed fix attempts                                |

```text
/goal Slice A3 of docs/state/final-plan.md (version 2) for The Happy Cookie Ops in
C:\Users\ethan\dev\happy-cookie-ops-g0. Three small parts, one commit each. The phone
rehearsal is by 20 October; the bazaar is 24 to 25 October.

Read first: AGENTS.md, docs/state/current.md, docs/state/final-plan.md sections 5.3 (N3),
9, 11.1 and 14, docs/OFFLINE.md (the A2 section), src/components/app/live-gate.tsx,
src/lib/auth/live-gate.ts, src/lib/offline/queue.ts, .github/workflows/owner-trial.yml,
scripts/check-owner-trial-release.mjs and their tests. Protected files (screens, sheets,
shell, engine) are not to be edited: if a part seems to need one, stop and say so.

1. Sign-out warns when sales are queued (N3). Find every way a person signs out on
   purpose in the live app. Before it signs out, count the rows the phone still holds
   (pendingSales). If there are any, say how many and offer "Send now" and "Sign out
   anyway"; never block sign-out and never touch the queue. The automatic paths (a
   denial, idle) stay as A2 left them. Write the test first. Rehearsal step 7 depends on it.
2. Release hold switch. One repository variable, read by the owner-trial workflow before
   the deploy step: when it is on, a green push builds and tests but does not deploy, and
   the run says why in one line. Unit test the decision; "hold on means no deploy" is the
   proof. Ethan sets and lifts it; do not set it.
3. Framework patch. Move Next.js to the newest 16.3.x patch only (no minor or major),
   read its release notes for anything touching the static export or the service worker,
   run pnpm verify and pnpm test:e2e, and rebuild the live export once.

The persistent-storage request named in the plan's A3 row was built in A2: leave it out.

Review: run the security-reviewer agent on a different model before committing part 1 and
fix every P0 to P2 finding. Check part 1 in the browser pane on the live build against
the local database: sell with the database proxy stopped, try to sign out, see the count,
send, sign out.

Update docs/state/current.md (five lines) and docs/state/task-status.json (one note, by
string insertion), and replace this block with slice A4.

Evidence to print: each failing test before and passing after; the reviewer's verdict; the
pnpm verify summary in a clean shell; the browser check, step by step; the three commit
hashes and the pushed branch.

No new resources, shop opening, real customers, production launch, merge or automatic
runner. Do not set the release hold. Stop after 25 turns or two failed fix attempts and
report the actual obstacle.
```
