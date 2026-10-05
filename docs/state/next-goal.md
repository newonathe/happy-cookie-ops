# Next goals — A2 (offline open for the bazaar)

One goal per package, each in a fresh conversation opened in the repository root. Paste
one block. Where things stand: [current.md](current.md). The plan these come from:
[final-plan.md](final-plan.md), version 2, section 9, stage A. Earlier goals are in
[current-history.md](current-history.md).

A2 is approved: the plan on 5 October 2026, and Ethan's answers 2 and 3 in
[decision-register.md](decision-register.md). It is attended, not one of the
interface-only slices that may run unattended. A1 (the release check) is done.

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
