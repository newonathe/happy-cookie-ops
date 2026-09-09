# The Happy Cookie Ops

> **Build planning:** [MASTER-PLAN.md](MASTER-PLAN.md) is the current central plan. It contains the source/UI audit, free-host architecture, security and offline contracts, ordered tasks, evidence and Codex/Claude templates. This repository is an audited prototype port, not yet a verified production product.

Production, ordering and bookkeeping for a one-person cookie business, built for a phone
held in one hand in a kitchen.

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind v4 · Supabase · installable PWA

---

> **Taking this over?** Read [`HANDOFF.md`](./HANDOFF.md), then paste the prompt in
> [`START-HERE.md`](./START-HERE.md).
>
> **Want the sequence and what is left?** [`NEXT.md`](./NEXT.md) — one page, in order.

## Start here

```bash
pnpm install
cp .env.example .env.local     # fill in the two NEXT_PUBLIC_ values
pnpm db:start                  # local Postgres + auth on :54321 (needs Docker)
pnpm db:reset                  # applies migrations and seeds the catalogue
pnpm dev                       # http://localhost:3000
```

The app runs without Supabase too — the engine keeps its books in `localStorage`, which
is how the prototype worked and how the owner is using it today. Sign-in and the sale
sync endpoint are the only parts that need the database.

## Layout

| Path | What lives there |
| --- | --- |
| `src/app` | One route per screen. Each page mounts the same client app with a different `initialScreen`. |
| `src/store/engine/ops-engine.js` | The domain engine, ported verbatim from the prototype. Every business rule is here. |
| `src/store/ops-runtime.tsx` | The engine with bazaar sync replaced by the real IndexedDB queue. |
| `src/view-models/vals.ts` | The typed contract between the engine and the UI. 1,278 lines, and worth reading. |
| `src/components/shell/app-frame.tsx` | The frame: device harness, header, dock, toast. |
| `src/components/screens` | 24 screen components. |
| `src/components/sheets` | 29 bottom sheets. |
| `src/lib/offline` | The sale queue, its IndexedDB store and the flush. |
| `src/components/app` | Routing sync, the offline bridge and the per-screen error boundary. |
| `supabase/migrations` | Schema, row-level security and the idempotent sale intake. |
| `docs` | Everything below, plus the prototype itself and the original spec. |
| `.claude/` | Hooks that block edits to ported files, plus `/task`, `/review`, `/verify`, `/handoff` and three subagents. |
| `.codex/` | The same guardrails for Codex: a read-only review profile and the shared hooks. |
| `scripts/` | The port-integrity gate and its baseline. |

## Documents

| Read this | When |
| --- | --- |
| [`AGENTS.md`](./AGENTS.md) | **First.** Binding rules and commands for any coding agent — Claude Code, Codex, anything. |
| [`docs/WORKFLOW.md`](./docs/WORKFLOW.md) | How you, Claude Code and Codex divide the work without stepping on each other. |
| [`docs/prompts/`](./docs/prompts/README.md) | **Every prompt, start to finish.** Paste from here. |
| [`docs/TASKS.md`](./docs/TASKS.md) | The remaining work, decomposed into agent-sized tasks with acceptance criteria. |
| [`docs/CONTRACTS.md`](./docs/CONTRACTS.md) | API contracts, so two agents can build both sides at once. |
| [`CLAUDE.md`](./CLAUDE.md) | Claude Code's copy of the rules in AGENTS.md. |
| [`docs/CODEX.md`](./docs/CODEX.md) | Running Codex here — the review profile, and working alongside Claude Code. |
| [`docs/PORTING.md`](./docs/PORTING.md) | Before you touch anything under `screens`, `sheets` or the engine. |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | To understand why the app is shaped like this. |
| [`docs/OFFLINE.md`](./docs/OFFLINE.md) | Before changing bazaar mode or the sync. |
| [`docs/DATA.md`](./docs/DATA.md) | Schema, roles and what each policy protects. |
| [`docs/PROMPTS.md`](./docs/PROMPTS.md) | The sequenced Claude Code prompts for the remaining work. |
| [`docs/BUILD-LOG.md`](./docs/BUILD-LOG.md) | What was decided during the port, and what was found out the hard way. |
| [`docs/ENVIRONMENTS.md`](./docs/ENVIRONMENTS.md) | Real URLs, project refs, who has access. Fill in as you deploy. |
| [`docs/RUNBOOK.md`](./docs/RUNBOOK.md) | Incident response. Read the first line to her before anything else. |
| [`docs/SCREENS.md`](./docs/SCREENS.md) | 91 screenshots of every screen, state and role. Look here before changing a screen. |
| [`docs/FREE-TIER.md`](./docs/FREE-TIER.md) | Zero-cost hosting, the Actions budget, and what not to switch on. |
| [`docs/TESTING.md`](./docs/TESTING.md) | The seven test layers, and the sharp edges in visual and parity testing. |
| [`docs/OBSERVABILITY.md`](./docs/OBSERVABILITY.md) | Error reporting, the scrubber, and three Sentry defaults we inverted. |
| [`docs/STAGING.md`](./docs/STAGING.md) | The second environment, and the deploy order. |
| [`docs/MESSAGING.md`](./docs/MESSAGING.md) | The one SMS template, and what the owner must agree to. |
| [`docs/GAPS.md`](./docs/GAPS.md) | What the system lacks beyond design, what each gap costs, and what not to build. |
| [`docs/TECH-DEBT.md`](./docs/TECH-DEBT.md) | The known compromises, each with the cost of leaving it. |
| [`docs/DEPLOY.md`](./docs/DEPLOY.md) | Getting it onto a phone and into production. |

## Commands

```bash
pnpm dev          pnpm build        pnpm start
pnpm typecheck    pnpm lint         pnpm format
pnpm test         pnpm test:e2e     pnpm storybook
pnpm verify       # port integrity + typecheck + lint + unit — the gate CI runs
pnpm verify:port  # proves the ported markup and copy are unchanged
pnpm verify:engine # proves the repo's claims about the engine are true
pnpm test:visual  # layout regression — the hole verify:port cannot see
pnpm db:reset     pnpm db:types
```

## The one rule

The prototype in `docs/reference/prototype.dc.html` is the specification. Its copy, its
numbers, its spacing and its wording were reviewed against how the business actually
runs. This codebase reproduces it exactly. If something looks like it could be tidier,
read `docs/PORTING.md` before tidying it.
