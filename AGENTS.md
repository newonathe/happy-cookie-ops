# AGENTS.md

> **Current planning authority (2026-10-07):** Read [current state](docs/state/current.md) first, then [the next goal](docs/state/next-goal.md). The approved plan is [final-plan.md](docs/state/final-plan.md), version 2 (5 October): open only the section a goal names. MASTER-PLAN.md, G1-plan.md, finish-plan.md and the MP-* files are history. The ported screens, sheets, shell and engine stay locked as the demo build; the live interface is rebuilt beside them. All protection and verification rules below remain in force.

Operating instructions for coding agents in this repository. This file is the single source
of rules: Codex and other tools read it directly, and `CLAUDE.md` imports it (`@AGENTS.md`)
and adds only Claude Code specifics. The "Current planning authority" and "Shared worker
policy" lines must stay byte-identical in both files (`scripts/validate-g0.py` checks this).

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
Run every `pnpm` command with the pinned toolchain from [docs/state/toolchain.md](docs/state/toolchain.md) (Node 24.20.0, pnpm 9.12.3). A global pnpm ≥10 silently ignores `pnpm.overrides`.

## Do not touch

These paths are enforced by `scripts/check-port-integrity.mjs`, which runs inside
`pnpm verify`. It fails the build on a changed copy string or a removed inline style.

| Path                                              | Rule                                                                                                                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/screens/**`                       | No restyling, no copy edits, no class names. Inline style objects are the spec.                                                                                           |
| `src/components/sheets/**`                        | Same.                                                                                                                                                                     |
| `src/components/shell/**`                         | Same.                                                                                                                                                                     |
| `src/store/engine/ops-engine.js`                  | Verbatim port. Four marked edits, plus the approved MP-09 c flavour exception (`docs/state/protected-exception.md`). Extend by subclassing (`src/store/ops-runtime.tsx`). |
| `supabase/migrations/*.sql` (applied)             | Never edit. Add a new migration.                                                                                                                                          |
| `scripts/port-baseline.json`                      | Only via `node scripts/check-port-integrity.mjs --update`, in the same commit as the change it approves.                                                                  |
| `supabase/seed.sql`                               | Generated. Change the engine's constants and run `pnpm db:seed:gen`; a hand-edited seed drifts from the design silently.                                                  |
| `src/lib/rules/capacity.ts` + `capacity_allows()` | One rule, two runtimes. Change both in the same commit — `tests/fixtures/capacity-cases.json` enforces it.                                                                |
| `src/lib/observability/scrub.ts`                  | Deny-by-default by design. Widen the allowlist one key at a time, with a test. Never loosen it wholesale.                                                                 |
| `tests/e2e/visual.spec.ts` baselines              | Only regenerate inside the Docker image (`docs/TESTING.md`); a laptop-rendered baseline fails CI forever.                                                                 |

If a task seems to require one of these, stop and say so before writing code.

## Where things go

- **Business rule:** `src/store/engine/ops-engine.js` or a subclass, plus a test in `tests/unit`
- **New screen:** `src/components/screens/` + a route + a key in `src/lib/screens.ts`
- **Shared control:** `src/components/ui/` with a Storybook story
- **Server behaviour:** Architecture A (2026-09-26): a Postgres RPC in a **new** migration (`SECURITY DEFINER`, `search_path=''`, in-function role check, explicit grants), called from the browser with `supabase-js`. RLS is the security boundary. The Pages BFF (`spikes/pages`, `spikes/cleanup-worker`, `src/lib/auth/session-*`, `persistent-session-authority`, `session-crypto`, `supabase-auth-transport`) is archived: do not extend it. `src/app/api/*` serves only the Vercel demo
- **Schema:** a new file in `supabase/migrations/`
- **Offline behaviour:** `src/lib/offline/` — read `docs/OFFLINE.md` first
- **Anything visual:** Check `docs/SCREENS.md` first — the screenshot is the answer key
- **Rate limit on a public RPC:** Inside the RPC: call `consume_rate_limit` (service_role-only; reachable from a `SECURITY DEFINER` function owned by `postgres`). `src/lib/rate-limit.ts` and `src/lib/idempotency.ts` are legacy with no production callers: they fail open and trust `X-Forwarded-For`. Do not extend them
- **A business rule the owner must decide:** [docs/state/decision-register.md](docs/state/decision-register.md). The prototype and specs are evidence, not decisions
- **Anything sent to a customer:** `src/lib/messaging/` — read `docs/MESSAGING.md`; it costs her money
- **Error reporting:** Already wired. Widen `scrub.ts` if a report lacks something, with a test

## Conventions

- TypeScript strict. No `any`, no `@ts-ignore`, no non-null assertion on environment variables.
- Every API input parsed with Zod at the boundary. Never trust a client-sent role or price.
- Money is centavos (`bigint`) in Postgres, pesos in the engine. Convert in one place.
- Never remove a queued sale that the server has not acknowledged by `clientId`.
- New UI composes from the tokens in `src/app/globals.css` `@theme`. No new hex values.
- Commits: `type(scope): summary` — `feat`, `fix`, `refactor`, `test`, `docs`, `chore`.
  One logical change per commit. Standing approval (Ethan, 2026-09-26): commit each accepted
  slice and push the working branch after a secret scan. Never merge to `main`, deploy or create
  hosted resources without asking.

## Working agreement

1. **Read before writing.** How we work: `docs/state/lean-plan.md`. What to do next:
   `docs/state/next-goal.md` (drawn from `docs/state/final-plan.md`). Status: `docs/state/current.md` (short) and `docs/state/task-status.json`.
   Find code with the codebase-memory-mcp tools (`search_graph`, `get_code_snippet`,
   `trace_path`) before opening whole files; read SQL migrations directly (partial parse). Planned scope: `docs/master-plan/tasks.json` and its generated
   prompts. `docs/TASKS.md`, `docs/prompts/` and `docs/WORKFLOW.md` are the historical T-task
   era. Read the files the slice names and no others — unbounded exploration is the largest
   avoidable cost here. Who does what: `docs/state/agent-orchestration.md`.
2. **Plan before coding.** For anything over ~50 lines, state the plan, the files you will
   touch and the test you will write. Inside an approved `/goal` from
   `docs/state/next-goal.md`, the goal is the approval, so proceed. Otherwise wait.
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
- The review harness is switched off by starving `renderVals()` (`NEXT_PUBLIC_HARNESS=0`
  makes `OpsRuntime.renderVals()` return empty `devices`/`roles`). Live mode additionally sets
  `bareFrame`, which the frame, shop and order-status markup read to drop the header row and
  owner-preview controls (owner-directed exception, `docs/state/protected-exception.md`).
- `src/view-models/vals.ts` is generated-shaped: it mirrors what `renderVals()` returns.
  Widen a type only alongside the engine change that produces it.

## Token efficiency

Every session pays for what it loads. Same quality, less reading:

1. **Load order:** `docs/state/current.md`, then `docs/state/next-goal.md`, then only the files the goal names.
   Never open `final-plan.md`, `decision-register.md` or `current-history.md` whole: search for the section.
2. **Search before reading:** codebase-memory-mcp or a bounded search first; read files over ~300 lines by range.
   Evidence receipts and the lockfile are left out of search by `.ignore`; open them by path only when a goal names them.
3. **Deterministic tools first:** tests, validators, `git`, hashes and search before a model call or a subagent.
4. **Delegate only bounded work:** pinned model (Haiku to search, Sonnet to build or review), a prompt that names
   the files, the question and the stop condition, and a result under ~200 words. At most two workers.
5. **Long output to a file:** run builds and suites with output redirected; print only the summary lines.
6. **Results live in the commit:** no new evidence files. When a slice closes, move its narrative from `current.md`
   to `current-history.md` the same day. `pnpm verify` enforces the budgets (`scripts/check-context-budget.mjs`).
7. **One conversation per slice,** `/clear` between slices.
8. **Every final report ends with "Token notes"** (what was loaded and not needed, what to skip next time)
   **and "Next":** the ready-to-paste prompt or `/goal` block for the next step, naming its model and the files to read.

## Authorization

Finish the product under [final-plan.md](docs/state/final-plan.md), version 2, one `/goal` per slice from
[next-goal.md](docs/state/next-goal.md). The automatic runner, production deployment, merging to `main` and any
hosted resource still need Ethan's explicit approval. Earlier authorizations (G0, the Vercel preview, the Windows
browser restriction lifted 29 September, MP-05.a) are in [rules-history.md](docs/state/rules-history.md).

Shared worker policy: read [docs/state/agent-orchestration.md](docs/state/agent-orchestration.md) before delegation. It governs the combined Codex/Claude limit, explicit models, bounded prompts and review rules for this conversation.
