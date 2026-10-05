# The Happy Cookie Ops

Production, ordering and bookkeeping for a one-person cookie business, built for a phone
held in one hand in a kitchen.

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind v4 · Supabase · installable PWA

## Start here

| You want to know                    | Open                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| Where the project stands today      | [`docs/state/current.md`](./docs/state/current.md)                             |
| What to work on next                | [`docs/state/next-goal.md`](./docs/state/next-goal.md)                         |
| The rules for changing anything     | [`AGENTS.md`](./AGENTS.md) (Claude Code also reads [`CLAUDE.md`](./CLAUDE.md)) |
| What Cine does in her trial week    | [`docs/state/F2-owner-trial.md`](./docs/state/F2-owner-trial.md)               |
| What the screens look like          | [`docs/SCREENS.md`](./docs/SCREENS.md)                                         |
| Why the app is shaped the way it is | [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)                               |

Those six pages are enough to get oriented. Everything else is reference or history.

## The one rule

The prototype in `docs/reference/prototype.dc.html` is the specification. Its copy, numbers
and spacing were reviewed against how the business actually runs, and the screens reproduce
it exactly. Changing how a screen looks or reads is a decision for the owner, recorded in
[`docs/state/protected-exception.md`](./docs/state/protected-exception.md). Read
[`docs/PORTING.md`](./docs/PORTING.md) before touching a screen.

## Run it

Use the pinned Node 24.20.0 and pnpm 9.12.3 ([`docs/state/toolchain.md`](./docs/state/toolchain.md)).

```bash
pnpm install
cp .env.example .env.local     # fill in the two NEXT_PUBLIC_ values
pnpm db:start                  # local Postgres and auth on :54321 (needs Docker)
pnpm db:reset                  # applies migrations and seeds the catalogue
pnpm dev                       # http://localhost:3000
```

Without the two Supabase values the app runs as the demo, with its books in the browser.

```bash
pnpm verify        # the gate: port integrity, engine contract, types, lint, unit tests
pnpm format:check  # formatting; also runs in CI
pnpm test:e2e      # browser flows
pnpm test:visual   # layout regression (Docker only, see docs/TESTING.md)
pnpm build
```

## Map of the repository

| Path                             | What lives there                                                                          |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/app`                        | One route per screen, the global stylesheet and the bundled fonts.                        |
| `src/components/screens`         | The 24 screens, ported from the prototype. Protected.                                     |
| `src/components/sheets`          | The 29 bottom sheets. Protected.                                                          |
| `src/components/shell`           | The frame around every screen: top bar, sidebar, dock, toast. Protected.                  |
| `src/components/live`            | Forms that exist only in the real app: checkout, flavour editor, books, recipe drafts.    |
| `src/store/engine/ops-engine.js` | The business rules, ported verbatim from the prototype. Protected.                        |
| `src/store/ops-runtime.tsx`      | The live layer on top of the engine: real data, sign-in, offline queue.                   |
| `src/view-models/vals.ts`        | The typed contract between the engine and the screens.                                    |
| `src/lib`                        | Data access, offline queue, auth, rules, messaging, error reporting.                      |
| `supabase/migrations`            | The database: schema, row-level security and server functions. Never edit an applied one. |
| `tests`                          | Unit, browser, visual, database and release checks.                                       |
| `scripts`                        | The gates (`check-port-integrity`, `validate-g0`), builds and release checks.             |
| `spikes`                         | Hosting configuration for the Cloudflare trial and earlier experiments.                   |
| `.github/workflows`              | CI, and the release of the private trial.                                                 |
| `docs`                           | Guides (below), the prototype, and the project record under `docs/state`.                 |

## Guides

| Read this                                          | When                                                   |
| -------------------------------------------------- | ------------------------------------------------------ |
| [`docs/PORTING.md`](./docs/PORTING.md)             | Before touching a screen, a sheet or the engine.       |
| [`docs/OFFLINE.md`](./docs/OFFLINE.md)             | Before changing bazaar mode or the sync.               |
| [`docs/DATA.md`](./docs/DATA.md)                   | Schema, roles and what each policy protects.           |
| [`docs/CONTRACTS.md`](./docs/CONTRACTS.md)         | API contracts.                                         |
| [`docs/TESTING.md`](./docs/TESTING.md)             | The test layers and the sharp edges in visual testing. |
| [`docs/ENVIRONMENTS.md`](./docs/ENVIRONMENTS.md)   | URLs, project references and who has access.           |
| [`docs/RUNBOOK.md`](./docs/RUNBOOK.md)             | Incident response.                                     |
| [`docs/OBSERVABILITY.md`](./docs/OBSERVABILITY.md) | Error reporting and the scrubber.                      |
| [`docs/MESSAGING.md`](./docs/MESSAGING.md)         | Anything sent to a customer.                           |
| [`docs/FREE-TIER.md`](./docs/FREE-TIER.md)         | Zero-cost hosting and the Actions budget.              |
| [`docs/GAPS.md`](./docs/GAPS.md)                   | What the system lacks, and what not to build.          |
| [`docs/TECH-DEBT.md`](./docs/TECH-DEBT.md)         | The known compromises and the cost of leaving each.    |

## The project record

`docs/state` holds the plans, decisions and evidence. Day to day you need three pages:
`current.md`, `next-goal.md` and `decision-register.md`. The rest is kept as a record:

- `current-history.md`: every earlier checkpoint.
- `F1-*`, `F2-*`, `G1-*`, `MP-*`: plans and logs for each package.
- `evidence/`: receipts written by tools. They are hash-indexed, so never reformat them.

## Planning background and history

[`MASTER-PLAN.md`](./MASTER-PLAN.md) is the audited plan and task catalogue from September 2026. `AGENTS.md` still names it as the authority wherever an older document disagrees with
it. Day-to-day work follows `docs/state/final-plan.md` (the approved plan, version 2), `lean-plan.md` (how we work) and `next-goal.md`.

These pages describe how the project was first handed over. They are kept because other
records link to them, and they are not needed for current work:
[`START-HERE.md`](./START-HERE.md), [`HANDOFF.md`](./HANDOFF.md), [`NEXT.md`](./NEXT.md),
[`docs/TASKS.md`](./docs/TASKS.md), [`docs/WORKFLOW.md`](./docs/WORKFLOW.md),
[`docs/PROMPTS.md`](./docs/PROMPTS.md), [`docs/prompts/`](./docs/prompts/README.md),
[`docs/BUILD-LOG.md`](./docs/BUILD-LOG.md), [`docs/CODEX.md`](./docs/CODEX.md),
[`docs/STAGING.md`](./docs/STAGING.md) and [`docs/DEPLOY.md`](./docs/DEPLOY.md).
