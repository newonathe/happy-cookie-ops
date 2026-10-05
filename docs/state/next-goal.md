# Next goal — A1, the release check accepts more than two addresses

One goal per package, in a fresh conversation opened in the repository root. Paste the
block below. Where things stand: [current.md](current.md). The plan this comes from:
[final-plan.md](final-plan.md) section 8, stage 0. Earlier goals are in
[current-history.md](current-history.md).

**Before running it:** the plan is a proposal until Ethan says yes to its section 12.
This slice itself was already approved on 5 October as part of S13
([sot-consolidation.md](sot-consolidation.md) section 8), so it may run first; nothing
after it runs without the yes.

| Setting         | Value                                                                            |
| --------------- | -------------------------------------------------------------------------------- |
| Model, effort   | Claude Sonnet, high (build); Opus signs off                                      |
| Plan mode       | Off: the slice is under 50 changed lines plus tests                              |
| Permission mode | Auto                                                                             |
| Review          | One independent review by a different model: it is the gate on who may sign in   |
| Browser QA      | None: no screen changes                                                          |
| Tools           | Node 24.20.0 and pnpm 9.12.3 from `happy-cookie-tools`                           |
| Stop            | When the evidence below is printed and pushed; 25 turns; two failed fix attempts |

```text
/goal Slice A1 of docs/state/final-plan.md for The Happy Cookie Ops in
C:\Users\ethan\dev\happy-cookie-ops-g0: make the owner-trial release check accept
between two and six approved email addresses instead of exactly two (system-audit.md
H11 and S3), so Ethan can add Cine's two addresses without breaking the deploy.

Read first: AGENTS.md, docs/state/current.md, docs/state/final-plan.md sections 8 and
12 ("What only you can do"), scripts/check-owner-trial-release.mjs, its tests, and
.github/workflows/owner-trial.yml. Read no other file unless one of these names it.

1. In scripts/check-owner-trial-release.mjs the Cloudflare Access policy must still be
   an 8-hour allow policy with no exclude or require selectors, and every include
   selector must still be a single email selector. Change only the count: the policy's
   addresses and the approved SHA-256 digests must each number from two to six, contain
   no duplicate, and match each other exactly as sets. Keep every other check as it is.
   Write the bounds once, as named constants, with a comment saying why.
2. Tests first: two, three, four and six addresses pass; one and seven fail; a
   duplicate address fails; a digest list that differs from the policy by one address
   fails in each direction; a non-email selector still fails. Run one mutation check
   (loosen the comparison and see a test fail), then restore it.
3. Touch no hosted system. Do not read, print or commit any email address or digest;
   tests use made-up addresses. Do not change the Access policy, the repository
   secrets or variables: those are Ethan's steps, listed in final-plan.md.
4. Update docs/state/current.md (five lines), docs/state/task-status.json (one note),
   and replace this block with slice A2 (the framework patch release) and its settings
   table.

Evidence to print: the new test names and results; `pnpm verify` summary from the
pre-commit hook; the commit hash; the pushed branch; the GitHub run for the push with
the release job's result. State plainly that Cine's addresses are NOT yet added and
that Ethan must add them to both the Access policy and the approved-digest secret
together, or the next deploy fails.

No new resources, shop opening, real customers, production launch, merge or automatic
runner. Stop after 25 turns or two failed fix attempts and report the actual obstacle.
```
