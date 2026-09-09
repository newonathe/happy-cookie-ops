# AGENTS.md

> **Current planning authority (2026-09-08):** Read [MASTER-PLAN.md](MASTER-PLAN.md) first. Its audited findings, task catalog and decision gates supersede conflicting readiness claims and old T-task ordering. UI/UX remains locked; current records are demo fixtures; launch has one offline sales device. The 2026-09-08 user request authorizes local G0 implementation (MP-00 through MP-03). Read [current state](docs/state/current.md) for actual progress; later product packages and the automatic runner remain deferred. All protection and verification rules below remain in force.

Operating instructions for coding agents in this repository. Claude Code also reads
`CLAUDE.md`; Codex and other tools read this file. They say the same thing — if you
change one, change both.

## What this project is

A production frontend for The Happy Cookie's operations. It was **ported, not written**,
from a fully specified interactive prototype at `docs/reference/prototype.dc.html`. The
prototype's screens, copy, numbers and spacing were reviewed against how the business
actually runs. Reproducing it exactly is the requirement.

Next.js 16 App Router · React 19 · TypeScript strict · Tailwind v4 · Supabase · PWA.

## Commands

```bash
pnpm install
pnpm dev                  # http://localhost:3000
pnpm verify               # port integrity + typecheck + lint + unit — run before every commit
pnpm verify:port          # the 1:1 gate: proves ported copy and styles are unchanged
pnpm verify:engine        # proves the repo's claims about the engine and schema are true
pnpm test:e2e             # 25 routes render, offline sale survives reload — before every PR
pnpm test:visual          # layout regression on ten screens (regenerate baselines in Docker)
pnpm test:load            # drop-open under concurrency, needs k6 — point it at STAGING
pnpm db:start             # local Supabase (Docker)
pnpm db:reset             # migrations + seed
pnpm db:types             # regenerate src/lib/types/database.ts after a schema change
pnpm db:seed:gen          # regenerate supabase/seed.sql from the engine's constants
```

`pnpm verify` is the definition of "it works". Do not report a task complete without it.

## Do not touch

These paths are enforced by `scripts/check-port-integrity.mjs`, which runs inside
`pnpm verify`. It fails the build on a changed copy string or a removed inline style.

| Path | Rule |
| --- | --- |
| `src/components/screens/**` | No restyling, no copy edits, no class names. Inline style objects are the spec. |
| `src/components/sheets/**` | Same. |
| `src/components/shell/**` | Same. |
| `src/store/engine/ops-engine.js` | Verbatim port. Four marked edits only. Extend by subclassing (`src/store/ops-runtime.tsx`). |
| `supabase/migrations/*.sql` (applied) | Never edit. Add a new migration. |
| `scripts/port-baseline.json` | Only via `node scripts/check-port-integrity.mjs --update`, in the same commit as the change it approves. |
| `supabase/seed.sql` | Generated. Change the engine's constants and run `pnpm db:seed:gen`; a hand-edited seed drifts from the design silently. |
| `src/lib/rules/capacity.ts` + `capacity_allows()` | One rule, two runtimes. Change both in the same commit — `tests/fixtures/capacity-cases.json` enforces it. |
| `src/lib/observability/scrub.ts` | Deny-by-default by design. Widen the allowlist one key at a time, with a test. Never loosen it wholesale. |
| `tests/e2e/visual.spec.ts` baselines | Only regenerate inside the Docker image (`docs/TESTING.md`); a laptop-rendered baseline fails CI forever. |

If a task seems to require one of these, stop and say so before writing code.

## Where things go

| Change | File |
| --- | --- |
| Business rule | `src/store/engine/ops-engine.js` or a subclass, plus a test in `tests/unit` |
| New screen | `src/components/screens/` + a route + a key in `src/lib/screens.ts` |
| Shared control | `src/components/ui/` with a Storybook story |
| Server behaviour | `src/app/api/*/route.ts`, input validated with Zod |
| Schema | a new file in `supabase/migrations/` |
| Offline behaviour | `src/lib/offline/` — read `docs/OFFLINE.md` first |
| Anything visual | Check `docs/SCREENS.md` first — the screenshot is the answer key |
| Rate limit on a new route | `RATE_LIMITS` in `src/lib/rate-limit.ts`, then apply it in the handler |
| Anything sent to a customer | `src/lib/messaging/` — read `docs/MESSAGING.md`; it costs her money |
| Error reporting | Already wired. Widen `scrub.ts` if a report lacks something, with a test |

## Conventions

- TypeScript strict. No `any`, no `@ts-ignore`, no non-null assertion on environment variables.
- Every API input parsed with Zod at the boundary. Never trust a client-sent role or price.
- Money is centavos (`bigint`) in Postgres, pesos in the engine. Convert in one place.
- Never remove a queued sale that the server has not acknowledged by `clientId`.
- New UI composes from the tokens in `src/app/globals.css` `@theme`. No new hex values.
- Commits: `type(scope): summary` — `feat`, `fix`, `refactor`, `test`, `docs`, `chore`.
  One logical change per commit.

## Working agreement

1. **Read before writing.** `docs/WORKFLOW.md` has the loop; `docs/TASKS.md` has the work,
   already decomposed into agent-sized tasks with acceptance criteria and an explicit file
   list, and `docs/prompts/` has the prompt for each one. Read the files the task's *Context*
   line names and no others — unbounded exploration is the largest avoidable cost here.
   Codex specifics are in `docs/CODEX.md`.
2. **Plan before coding.** For anything over ~50 lines, state the plan, the files you will
   touch and the test you will write, and wait.
3. **Check whether it already exists.** Several tasks describe work that has since been
   built — the board says so where it knows, but `docs/GAPS.md` is the current truth and
   `ls src/lib` is faster than either. Building a second rate limiter, scrubber, error
   boundary or money conversion is worse than doing nothing: two implementations of one
   rule is the bug `src/lib/rules/capacity.ts` exists to prevent.
4. **Disagree before implementing.** If the request conflicts with a rule above, or is
   ambiguous, or is simply wrong, say so first. Do not agree by default.
5. **Small diffs.** One task, one branch, one PR. If a task grows past ~400 changed lines,
   stop and split it.
6. **Finish with evidence.** Paste the `pnpm verify` output. "Should work" is not a result.

## Known traps

- `localStorage` in a field initialiser breaks hydration. State restores in
  `componentDidMount`. Do not move it.
- Navigation uses `history.replaceState`, not the router. A router navigation remounts the
  tree and closes the open sheet.
- `stocktake` is a screen key with no screen file; it renders inside inventory.
- `useSearchParams()` needs a Suspense boundary or the build fails.
- The review harness is switched off by starving `renderVals()`, not by editing markup.

## Current G0 execution and preview authorization

The owner's later 2026-09-08 message also authorizes publishing this work to a private GitHub repository and preparing a Vercel development preview so they can follow progress. This is demo-only development visibility; no production credentials, real transactions, paid plan upgrade, or runner activation is authorized. See docs/state/current.md for evidence and remaining limits. Record implementation status in docs/state/task-status.json; generated historical tasks.json and prompts retain planned status.

On this Windows installation, use headless command-line Playwright only. Never invoke the in-app Browser or Chrome-control plugins until the owner confirms the Codex GPU crash has been fixed.

Shared worker policy: read [docs/state/agent-orchestration.md](docs/state/agent-orchestration.md) before delegation. It governs the combined Codex/Claude limit, explicit models, bounded prompts and review rules for this conversation.
