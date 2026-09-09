# Handoff

> **Current handoff:** Read [MASTER-PLAN.md](MASTER-PLAN.md), [audit evidence](docs/master-plan/00-audit-evidence.md) and [generated task prompts](docs/master-plan/prompts/README.md). The older readiness claims below must be checked against that audit. Product build is currently blocked; runner work is deferred.

Everything you need to take this over. Read this page, then run the starter prompt in
[`START-HERE.md`](./START-HERE.md).

---

## What you are receiving

A production frontend for **The Happy Cookie** — production, ordering and bookkeeping for
a one-person cookie business, built for a phone held in one hand in a kitchen.

It was **ported, not written**. A fully interactive prototype was reviewed screen by
screen against how the business actually runs; this repository reproduces it exactly. The
prototype is in the repo at `docs/reference/prototype.dc.html` and is the answer key for
every question about behaviour, copy or layout.

| | |
| --- | --- |
| Stack | Next.js 16 App Router · React 19 · TypeScript strict · Tailwind v4 · Supabase · installable PWA |
| Size | ~325 files · 25 routes · 24 screens · 29 sheets · a 1,278-line typed contract |
| Domain logic | `src/store/engine/ops-engine.js` — 4,099 lines, ported verbatim |
| Database | 8 migrations · 19 tables · 18 functions · default-deny RLS · idempotent sale intake |
| Offline | IndexedDB queue → `/api/sync` → Background Sync, built for real |
| Tests | 10 unit files · 4 Playwright suites · visual regression · a k6 load test · two build gates |
| Guardrails | Sentry with a deny-by-default PII scrubber, Postgres rate limiting, capacity parity between runtimes |
| Visual reference | 91 screenshots — 25 screens × mobile/tablet/desktop, plus 16 sheets, roles and the offline state |
| Cost | Zero infrastructure. `docs/FREE-TIER.md` has the arithmetic and the two catches |
| Never executed | `pnpm install` has not run. Everything is verified statically only. |

## The one thing that matters

**This is a port. Do not improve it.**

Its inline styles, its copy, its numbers and its spacing were approved by the person who
uses it. A change that looks like tidying is a change to a signed-off design.

This is not a request. Two scripts enforce it, both inside `pnpm verify`, pre-commit and
CI, and both **fail the build**:

- `check-port-integrity.mjs` fingerprints all 175 copy strings and 1,518 inline style
  objects across the 54 ported files.
- `check-engine-contract.mjs` verifies that everything the repository *claims* about the
  engine is true — including that any string described as "verbatim from the prototype"
  actually appears in it.

A `PreToolUse` hook additionally blocks an agent from writing to the ported files at all
unless `HC_ALLOW_PORTED_EDITS=1` is set deliberately.

The second script exists because five audit passes found five fabrications — invented
seed data, an invented order-state enum, and finally invented customer-facing copy under a
comment falsely claiming the owner had approved it. All five were plausible, which is why
a person reading carefully accepted them and a machine had to be built instead.
`docs/BUILD-LOG.md` has each one.

Three corollaries:
- Do not convert the ported inline styles to Tailwind classes.
- Do not rewrite user-visible copy.
- Do not refactor the engine. Extend it by subclassing — `src/store/ops-runtime.tsx` is
  the existing example.

## Read in this order

| # | File | Why |
| --- | --- | --- |
| 1 | [`START-HERE.md`](./START-HERE.md) | The first prompt. Paste it and go. |
| 2 | [`NEXT.md`](./NEXT.md) | Every remaining task in order, and what is still genuinely missing. |
| 2 | [`AGENTS.md`](./AGENTS.md) | Binding rules. Codex reads it automatically; `CLAUDE.md` is Claude Code's copy. |
| 3 | [`docs/WORKFLOW.md`](./docs/WORKFLOW.md) | How you, Claude Code and Codex divide the work. |
| 4 | [`docs/prompts/`](./docs/prompts/README.md) | Every prompt, start to finish. 11 files. |
| 5 | [`docs/TASKS.md`](./docs/TASKS.md) | The board: 20 tasks, dependencies, status. |
| 6 | [`docs/PORTING.md`](./docs/PORTING.md) | Before you touch any screen, sheet or the engine. |
| 7 | [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Why the app is shaped like this. |
| 8 | [`docs/OFFLINE.md`](./docs/OFFLINE.md) | Before you touch bazaar mode. Its rules are not negotiable. |
| 9 | [`docs/DATA.md`](./docs/DATA.md) | Schema, roles, and what each policy protects. |
| 10 | [`docs/BUILD-LOG.md`](./docs/BUILD-LOG.md) | Decisions, and what was learned the hard way. Read the traps. |
| 11 | [`docs/TECH-DEBT.md`](./docs/TECH-DEBT.md) | Six known compromises, each with the cost of leaving it. |
| 12 | [`docs/GAPS.md`](./docs/GAPS.md) | What the system lacks beyond design — and the list of things not to build. |
| — | [`docs/TESTING.md`](./docs/TESTING.md) | Read before touching a test. Visual baselines and parity fixtures both have sharp edges. |
| — | [`docs/OBSERVABILITY.md`](./docs/OBSERVABILITY.md) | Read before touching the scrubber. |
| — | [`docs/ENVIRONMENTS.md`](./docs/ENVIRONMENTS.md) | **Fill in as you deploy.** The one home for real URLs and project refs. |
| — | [`docs/RUNBOOK.md`](./docs/RUNBOOK.md) | **When it is broken and a drop closes at noon.** Operational only. |
| — | [`docs/SCREENS.md`](./docs/SCREENS.md) | **91 screenshots of every screen, state and role.** The visual answer key. |
| — | [`docs/FREE-TIER.md`](./docs/FREE-TIER.md) | Running this at zero infrastructure cost, and the two conditions attached to "free". |
| — | [`docs/STAGING.md`](./docs/STAGING.md), [`docs/MESSAGING.md`](./docs/MESSAGING.md) | Read when you need them. |
| 13 | [`docs/CODEX.md`](./docs/CODEX.md) | Running Codex here, and alongside Claude Code. |

## The two tools

They are not interchangeable, and using the wrong one is the commonest waste.

| Work | Tool |
| --- | --- |
| Understanding an unfamiliar area; planning a migration; multi-file changes | **Claude Code** |
| Tests around existing behaviour; type work; filling a module from a contract | **Codex** |
| Reviewing the other one's diff | **the opposite model**, read-only |
| Product decisions, merges, anything about the bakery | **you** |

Cross-review is the highest-leverage habit in this repository. A model reviewing its own
work agrees with its own reasoning. Claude implements → Codex reviews (`codex --profile
review`, which is read-only so it cannot quietly fix what it should report), and the
reverse.

Both tools are pre-configured: `.claude/` has hooks, four slash commands (`/task`,
`/review`, `/verify`, `/handoff`) and three subagents; `.codex/` has a matching config,
the shared hooks, and a read-only review profile.

## The gate

```bash
pnpm verify        # port integrity → engine contract → typecheck → lint → unit tests
pnpm test:e2e      # 25 routes render, and an offline sale survives a reload
pnpm test:visual   # layout regression — the one thing verify:port cannot see
```

`pnpm verify` is the definition of "it works". A task is not done without its output
pasted — not summarised.

## What is genuinely unfinished

Honestly, in priority order. Full detail in `docs/TECH-DEBT.md`.

1. **The books still live in `localStorage`.** Orders, ledger, stock and drops are in one
   browser object, as in the prototype. Postgres currently holds auth, the catalogue and
   synced bazaar sales. One device, no backup, one cleared cache from losing a year.
   Sequenced table by table as T-10 → T-14.
2. **`pnpm install` has never run.** Every defect found so far was found by reading, and
   five passes have exhausted what reading can find. T-01 exists to find the rest — the
   next defect should come from a machine or from the toolchain, not another read-through.
3. **~80 engine methods have no unit test.** They are covered only by a render test that
   proves they do not throw. T-07 and T-08.
4. **Accessibility is at the prototype's level.** Two `jsx-a11y` rules are relaxed for the
   ported markup. T-15, and it is the only task allowed to edit ported files.
5. **No server rendering of screen content.** Deliberate — the content is private books
   and one client tree is what keeps mid-task state alive across the dock.

`docs/GAPS.md` is the fuller inventory: what is missing beyond design, what each absence
costs, and — as important — the eight things that will look like good ideas and are not.
Its five-item priority list is the honest answer to "what next".

## The dangerous task

**T-14** migrates the owner's real books out of `localStorage`. It can destroy a year of
bookkeeping. It is a three-commit sequence with a mandatory dry run against her actual
exported payload, reviewed by a human, before anything is deleted. Do not let an agent run
it unattended, and do not let it run at all until T-11, T-12 and T-13 are green.

## Things that will surprise you

From `AGENTS.md`, repeated because each one has already cost somebody an hour:

- `localStorage` in a field initialiser breaks hydration. State restores in
  `componentDidMount`. Do not move it back.
- Navigation uses `history.replaceState`, not the router. A router navigation remounts the
  tree and closes whatever sheet is open mid-task.
- `stocktake` is a screen key with no screen file; it renders inside inventory.
- `useSearchParams()` needs a Suspense boundary or the build fails.
- The review harness is switched off by starving `renderVals()`, not by editing markup.
- `supabase/seed.sql` is **generated** from the engine's constants (`pnpm db:seed:gen`).
  A hand-edited seed drifts from the design silently.

## First hour

```bash
pnpm install
cp .env.example .env.local
chmod +x scripts/*.sh .claude/hooks/*.sh
pnpm verify:port          # should pass immediately — 54 files against the baseline
```

Then open `START-HERE.md` and paste the prompt.
