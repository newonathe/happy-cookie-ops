# Next goals — A1 (release check), then A2 (offline open for the bazaar)

One goal per package, each in a fresh conversation opened in the repository root. Paste
one block. Where things stand: [current.md](current.md). The plan these come from:
[final-plan.md](final-plan.md), version 2, section 9, stage A. Earlier goals are in
[current-history.md](current-history.md).

Both slices are approved: the plan on 5 October 2026, and Ethan's answers 2 and 3 in
[decision-register.md](decision-register.md). Both are attended. Neither is one of the
interface-only slices that may run unattended.

## A1 — the release check accepts more than two addresses and a chosen session length

| Setting         | Value                                                                 |
| --------------- | --------------------------------------------------------------------- |
| Model, effort   | Claude Sonnet, high (build); Opus signs off                           |
| Plan mode       | Off: under 50 changed lines plus tests                                |
| Permission mode | Auto                                                                  |
| Review          | One independent review by a different model: it gates who may sign in |
| Browser QA      | None: no screen changes                                               |
| Tools           | Node 24.20.0 and pnpm 9.12.3 from `happy-cookie-tools`                |
| Stop            | Evidence printed and pushed; 25 turns; two failed fix attempts        |

```text
/goal Slice A1 of docs/state/final-plan.md (version 2) for The Happy Cookie Ops in
C:\Users\ethan\dev\happy-cookie-ops-g0: make the owner-trial release check accept
between two and six approved email addresses instead of exactly two, and one named,
allowed access-session length instead of a hard-coded '8h' (system-audit.md H11 and S3;
Ethan's answer 2 of 5 October in docs/state/decision-register.md).

Read first: AGENTS.md, docs/state/current.md, docs/state/final-plan.md sections 9 and
12, scripts/check-owner-trial-release.mjs, its tests, and
.github/workflows/owner-trial.yml. Read no other file unless one of these names it.

1. In scripts/check-owner-trial-release.mjs the Cloudflare Access policy must still be
   an allow policy with no exclude or require selectors, and every include selector
   must still be a single email selector. Change the count: the policy's addresses and
   the approved SHA-256 digests must each number from two to six, contain no duplicate,
   and match each other exactly as sets. Write the bounds once, as named constants,
   with a comment saying why.
2. Session length: replace the literal '8h' with one named constant holding the list
   of allowed values. Keep '8h' in it. Do NOT type the one-week value from memory:
   Cloudflare's documentation does not give the string its API returns. Leave a
   clearly marked second entry to be filled from what the policy itself reports after
   Ethan picks "1 week" in the dashboard, and make the check's failure message print
   the value it found (a duration is not a secret), so that step is one edit.
3. Tests first: two, three, four and six addresses pass; one and seven fail; a
   duplicate address fails; a digest list that differs from the policy by one address
   fails in each direction; a non-email selector still fails; an allowed session
   length passes and any other fails with the found value in the message. Run one
   mutation check (loosen a comparison and see a test fail), then restore it.
4. Touch no hosted system. Do not read, print or commit any email address or digest;
   tests use made-up addresses. Do not change the Access policy, the repository
   secrets or variables: those are Ethan's steps (final-plan.md section 12).
5. Update docs/state/current.md (five lines) and docs/state/task-status.json (one
   note), and remove this A1 block from next-goal.md, leaving A2.

Evidence to print: the new test names and results; the `pnpm verify` summary from the
pre-commit hook; the commit hash; the pushed branch; the GitHub run for the push with
the release job's result. State plainly that Cine's addresses are NOT yet added, and
that Ethan must change the Access policy and the approved-digest secret together, and
set the session length, or the next deploy fails.

No new resources, shop opening, real customers, production launch, merge or automatic
runner. Stop after 25 turns or two failed fix attempts and report the actual obstacle.
```

## A2 — the bazaar phone opens offline

| Setting         | Value                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------- |
| Model, effort   | Claude Opus, high: it changes the sign-in gate                                                |
| Plan mode       | On: state the design and the test before writing                                              |
| Permission mode | Auto                                                                                          |
| Review          | The `security-reviewer` agent on a different model, before commit; fix every P0 to P2 finding |
| Browser QA      | Yes: the live build against the local database, in the browser pane, offline and online       |
| Tools           | Node 24.20.0 and pnpm 9.12.3 from `happy-cookie-tools`; local Supabase                        |
| Stop            | Evidence printed and pushed; 25 turns; two failed fix attempts                                |

```text
/goal Slice A2 of docs/state/final-plan.md (version 2) for The Happy Cookie Ops in
C:\Users\ethan\dev\happy-cookie-ops-g0: let the bazaar phone open and reload offline
without being signed out. Ethan approved this on 5 October 2026 (decision register,
answer 2). The bazaar is 24 to 25 October; the phone rehearsal is by 20 October.

The defect, read but not run (final-plan.md section 5.3, N1 to N4): in live mode the
first identity check of a page load fails closed when it cannot reach the server
(src/components/app/live-gate.tsx:116-121), and the lock-out path signs out and sends
her to /sign-in, which she cannot use offline (src/lib/auth/live-gate.ts:115-123). The
idle timer takes the same path after 60 minutes (src/lib/auth/idle-signout.ts:19).
Queued sales and the running event survive; her ability to sell does not.

Read first: AGENTS.md, docs/state/current.md, docs/state/final-plan.md sections 5.3, 9
and 11.1, docs/OFFLINE.md, src/components/app/live-gate.tsx, src/lib/auth/live-gate.ts,
src/lib/auth/idle-signout.ts, src/lib/offline/bazaar-state.ts,
src/components/app/offline-bridge.tsx, public/sw.js, and their unit tests. Protected
files (screens, sheets, shell, engine) are not to be edited: if the fix seems to need
one, stop and say so.

1. Reproduce first. Write a test that runs the live gate (not the demo build) and
   fails today: verified online, event open, then offline, then a fresh page load must
   leave Bazaar Mode usable. Add the unit tests beside it.
2. The fix, inside these bounds and no wider:
   - only the bazaar screen may open on an unverified offline load; books, P&L,
     orders, stock and settings stay closed until a check passes;
   - only while this device holds an event the server opened (the saved bazaar state);
   - only within a set number of hours of the last successful online check on this
     device; the number is an owner setting with a labelled default, never a literal
     in the gate;
   - the remembered check holds a role and a time, never a token or a password;
   - on reconnect the full check runs at once; a definite denial locks out as today,
     and the sale queue is never touched by a lock-out;
   - the idle timer does not sign out while offline with an event open, and resumes
     when the device is online;
   - no redirect loop: an offline load must not bounce between /sign-in and the app.
3. Ask the browser for persistent storage when the selling device starts an event.
4. Review: run the security-reviewer agent on a different model before committing and
   fix every P0 to P2 finding. Say plainly in the report what an unlocked stolen phone
   could and could not do offline under this change.
5. Check it in the browser pane on the live build against the local database: sell,
   go offline, reload, sell again, wait past the idle time, reconnect, and confirm
   every sale arrives once.
6. Update docs/state/current.md (five lines), docs/state/task-status.json (one note),
   docs/OFFLINE.md (what now happens offline), and replace this block with slice A3.

Evidence to print: the failing test before the fix and passing after; the reviewer's
verdict; the `pnpm verify` summary; the browser check, step by step; the commit hash
and pushed branch. State what the physical-phone rehearsal still has to prove.

No new resources, shop opening, real customers, production launch, merge or automatic
runner. Stop after 25 turns or two failed fix attempts and report the actual obstacle.
```
