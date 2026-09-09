# Working in this repository

> **Current planning authority (2026-09-08):** Read [MASTER-PLAN.md](MASTER-PLAN.md) first. Its audited findings, task catalog and decision gates supersede conflicting readiness claims and old T-task ordering. UI/UX remains locked; current records are demo fixtures; launch has one offline sales device. The 2026-09-08 user request authorizes local G0 implementation (MP-00 through MP-03). Read [current state](docs/state/current.md) for actual progress; later product packages and the automatic runner remain deferred. All protection and verification rules below remain in force.

Read this before your first change. `AGENTS.md` says the same things for every other
tool — if you change one, change both.

Then read `docs/WORKFLOW.md` for the loop, `docs/TASKS.md` for the work already decomposed
into tasks, and `docs/prompts/` for the prompt that goes with each. Start with
`/task T-01`, or paste the T-01 prompt from `docs/prompts/01-foundation.md`.

The rules below are not advisory. `scripts/check-port-integrity.mjs` runs inside
`pnpm verify`, in CI and pre-commit, and fails the build on a changed copy string or a
removed inline style. A `PreToolUse` hook blocks writes to ported files outright.

## What this codebase is

A production frontend for The Happy Cookie's operations, ported from a fully specified
interactive prototype. The prototype lives at `docs/reference/prototype.dc.html` and is
the source of truth for behaviour, copy and layout. The owner reviewed it screen by
screen against how she actually bakes and sells.

**This is a port, not a rewrite.** Nothing was redesigned on the way in.

## Hard rules

1. **Do not restyle the ported screens.** Everything under `src/components/screens`,
   `src/components/sheets` and `src/components/shell` uses inline style objects. Those
   are the prototype's exact values. Do not convert them to Tailwind classes, do not
   round a padding, do not "extract a card component". The token layer in
   `src/app/globals.css` exists for *new* UI.
2. **Do not rewrite copy.** Every toast, label, empty state and confirmation sentence was
   written for a specific person to read while her hands are covered in dough. Fix a typo
   if you find one; change nothing else.
3. **Do not refactor `src/store/engine/ops-engine.js`.** It is a deliberate verbatim copy.
   The four edits that were needed to run it outside the prototype are marked in comments.
   Behaviour changes belong in a subclass — see `src/store/ops-runtime.tsx` for the one
   that already exists.
4. **Never drop a queued sale.** `src/lib/offline` handles money that has already changed
   hands. A row leaves the queue only when the server has named its `clientId`. Read
   `docs/OFFLINE.md` before touching it.
5. **Money is centavos in Postgres.** `bigint`, never `float`, never `numeric` in
   application code. The engine still works in pesos as the prototype did; conversion
   happens at the boundary.

## Where to put a change

| Change | Goes in |
| --- | --- |
| New business rule | `src/store/engine/ops-engine.js` (or a subclass), plus a test in `tests/unit` |
| New screen | A component in `src/components/screens` + a route + a key in `src/lib/screens.ts` |
| New shared control | `src/components/ui`, with a story |
| Server behaviour | A route handler under `src/app/api`, validated with Zod |
| Schema change | A new file in `supabase/migrations`. Never edit an applied migration. |

## Before you say you are done

```bash
pnpm verify        # typecheck, lint, unit tests
pnpm test:e2e      # 25 routes render + the offline sale survives a reload
```

Both must pass. `pnpm test:e2e` is the one that catches a broken port.

Then have Codex review the diff with fresh context (`docs/WORKFLOW.md` §2). Same-model
review agrees with its own reasoning and is worth much less.

## Things that will surprise you

- **The engine restores state after mount, not before.** There is no `localStorage` on
  the server, and the first client paint has to match the server's. `componentDidMount`
  calls `loadState()`. Do not move it back into the field initialiser.
- **Navigation uses `history.replaceState`, not the router.** The whole app is one client
  tree; a router navigation would remount it and close whatever sheet is open. See
  `src/components/app/route-sync.tsx`.
- **`stocktake` is a screen key with no screen file.** It renders inside the inventory
  screen. The route exists so the URL works.
- **The review harness is switched off by starving it, not by editing markup.**
  `NEXT_PUBLIC_HARNESS=0` makes `OpsRuntime.renderVals()` return empty `devices` and
  `roles` lists, so the ported branches render nothing. Do not delete the markup.
- **`src/view-models/vals.ts` is generated-shaped, not hand-written.** It mirrors what
  `renderVals()` returns. Widen a type only alongside the engine change that produces it.

## Current G0 execution and preview authorization

The owner's later 2026-09-08 message also authorizes publishing this work to a private GitHub repository and preparing a Vercel development preview so they can follow progress. This is demo-only development visibility; no production credentials, real transactions, paid plan upgrade, or runner activation is authorized. See docs/state/current.md for evidence and remaining limits. Record implementation status in docs/state/task-status.json; generated historical tasks.json and prompts retain planned status.

On this Windows installation, use headless command-line Playwright only. Never invoke the in-app Browser or Chrome-control plugins until the owner confirms the Codex GPU crash has been fixed.

Shared worker policy: read [docs/state/agent-orchestration.md](docs/state/agent-orchestration.md) before delegation. It governs the combined Codex/Claude limit, explicit models, bounded prompts and review rules for this conversation.
