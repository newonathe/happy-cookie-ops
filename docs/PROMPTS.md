# Claude Code prompt sequence

> **Current prompt system:** Use [MASTER-PLAN.md](../MASTER-PLAN.md), [generated MP/AR prompts](master-plan/prompts/README.md) and [agent operating design](master-plan/09-agent-operating-system.md). The historical T-task sequence below is superseded. Runner implementation/activation remains later work.

> **Use `docs/TASKS.md` for day-to-day work.** It holds the same work broken into
> agent-sized tasks with dependencies, acceptance criteria and an explicit file list, and
> `/task T-XX` loads one with the right context. This file is the narrative version: the
> prompts as prose, useful for a session where you want to paste one whole thing, and for
> understanding _why_ the sequence is ordered as it is. The task ids map onto the groups
> below.

The prompts are written to be pasted whole into a fresh session: each one states its own
context, so none depends on the conversation that produced the last.

**Before any of them**, in every session:

> Read `CLAUDE.md` and `docs/PORTING.md` before making any change. This repository is a
> port of a signed-off prototype: do not restyle ported screens, do not rewrite copy, do
> not refactor `src/store/engine/ops-engine.js`. Tell me if what I have asked for
> conflicts with those rules before you start.

Each prompt ends the same way, and that ending is not decoration — it is what keeps the
work honest:

> Before you write code: list what could go wrong with this change, what in the existing
> code you are unsure about, and anything in my request that is ambiguous or wrong. Do
> not agree with me by default. Then implement, run `pnpm verify`, and show me the diff.

---

## Group 0 — Orientation (run once)

> Read `README.md`, `CLAUDE.md`, `docs/ARCHITECTURE.md` and `docs/PORTING.md`, then read
> `src/view-models/vals.ts`, `src/components/shell/app-frame.tsx` and
> `src/store/ops-runtime.tsx`. Then, without changing any code, tell me: (a) how a click
> in a screen reaches the engine and comes back as new values; (b) which files I would
> touch to add a new screen; (c) three places where this codebase would surprise a
> developer who had not read the docs. Keep it under 400 words.

## Group 1 — Get it running and prove the port

> Install dependencies, start Supabase locally, apply migrations and seed, then run
> `pnpm verify` and `pnpm test:e2e`. Fix any failure without changing ported markup,
> ported copy or the engine. If a test fails because a ported screen genuinely throws,
> quote the stack, name the exact line in `docs/reference/prototype.dc.html` it came from,
> and propose the minimal fix before applying it. Report what you changed and why.

## Group 2 — Generate the database types and remove the casts

> Run `pnpm db:types` to generate `src/lib/types/database.ts`. Then type the Supabase
> clients in `src/lib/supabase/client.ts` and `server.ts` with that `Database` generic,
> and type the `rpc('sync_event_sale')` call in `src/app/api/sync/route.ts` against it.
> No `any`, no non-null assertions on environment variables — throw a clear error instead.
> Do not touch anything else.

## Group 3 — Staff accounts and the role gate

> Add owner-only staff management: a screen at `/settings` (extend the existing ported
> Settings screen; do not restyle it) that lists `profiles` and lets the owner invite a
> helper or support account and change a role. Use a route handler with the service-role
> key for the invite, validate with Zod, and write an `audit_log` row for every role
> change. Then make the app's role come from `profiles` rather than engine state, keeping
> the prototype's manual role switcher working when `NEXT_PUBLIC_HARNESS=1`. Add a
> Playwright test proving a helper cannot reach `/pnl` or `/reconcile`.

## Group 4 — Move the books to Postgres (the big one, in five parts)

This is item 1 in `docs/TECH-DEBT.md`. Do it one table at a time; the app must work after
every part.

**4a — Catalogue and prices**

> Replace the engine's product and price constants with data from Supabase. Load the
> catalogue in a server component and pass it into `OpsApp` as an initial prop; keep the
> constants as the fallback when Supabase is not configured, so `pnpm dev` still works
> with no database. Prices are centavos in Postgres and pesos in the engine — convert at
> the boundary, in one function, with a unit test.

**4b — Orders**

> Move orders and order items to Postgres. Reads through a server component, writes
> through route handlers validated with Zod. Enforce capacity with `drop_remaining()` and
> return `DROP_CLOSED_MESSAGE` from `src/lib/rules/capacity.ts` when a drop is full — and
> note that the partial-capacity refusal has no prototype wording and needs the owner's,
> so leave its placeholder alone. The engine keeps its
> order shape; only where it loads and saves changes. Keep the local copy as an offline
> read cache. Add tests for the capacity race: two concurrent checkouts on the last box.

**4c — Ledger and expenses**

> Move `ledger_entries` to Postgres. Append-only: a correction is a new signed row, never
> an update or a delete. Every write records who and when. Verify with a test that a
> non-owner cannot read the ledger through the API even with a forged role in the client.

**4d — Stock, recipes and the grocery list**

> Move inventory, recipes and suppliers to Postgres. The grocery list stays a derived
> view — do not persist it. Preserve the prototype's par-level logic and its exact
> quantity phrasing (`amt` / `amtExact`).

**4e — Retire the localStorage store**

> Remove the `localStorage` persistence path, keeping the Settings export as a manual
> backup. Write a one-time migration that reads an existing `localStorage` payload and
> posts it to an import endpoint, so the owner's live books move without retyping. Test
> it against a real exported payload before you delete anything.

## Group 5 — Harden the sync endpoint

> Add to `/api/sync`: per-user rate limiting, a request size cap, structured logging of
> accepted/rejected counts (never sale contents), and a `GET /api/sync/status` that
> reports how many sales the server holds for this device. Then write a test that posts
> the same batch three times and asserts exactly one sale, one ledger entry and one audit
> row exist. Read `docs/OFFLINE.md` first; the rules in it are not negotiable.

## Group 6 — Real-time for two devices

> When the owner and a helper both have the app open, an order marked ready on one phone
> should appear on the other within a second. Use Supabase Realtime on `orders` and
> `bake_batches` only. Reconcile into engine state without clobbering local edits in
> progress, and never re-fire a toast for a change this device made.

## Group 7 — Accessibility pass

> Item 5 in `docs/TECH-DEBT.md`. Make every interactive element in the ported screens
> keyboard-reachable and screen-reader labelled, then remove the two `jsx-a11y`
> exceptions from `eslint.config.mjs`. Constraint: no visual change. Convert
> `<div onClick>` to `<button>` with the same style object, add `alt` text, add
> `aria-live` to the toast and focus management to the sheets. Show me before/after
> screenshots of three screens to prove nothing moved.

## Group 8 — Fill in the engine tests

> Item 3 in `docs/TECH-DEBT.md`. Using `docs/reference/spec/03-business-rules.md` as the
> specification, write unit tests for the engine methods that have none: spoilage, the
> stock count reconciliation, refunds, no-shows, overage, the closeout and the drop state
> machine. Test observable behaviour through `renderVals()`, not internals. Do not change
> the engine; if a test reveals a genuine bug, report it and wait.

## Group 9 — Production readiness

> Review the repository for production: secrets handling, the security headers in
> `next.config.ts`, and service-worker cache scope. Error boundaries and `/api/health`
> already exist — wire a real error reporter into `ScreenBoundary.componentDidCatch` and
> `src/app/error.tsx` rather than adding new ones. Then run
> a Lighthouse pass on `/` and `/shop` on a throttled mobile profile and report the
> numbers. Propose fixes in priority order; implement only what I approve.

---

## Prompts to avoid

Learned from the port. Each of these produces work you will have to undo:

- _"Clean up the inline styles"_ — deletes the signed-off design.
- _"Refactor the engine into hooks"_ — destroys diffability against the prototype and
  risks every business rule at once.
- _"Improve the copy"_ — the copy is the product.
- _"Add a component library"_ — the components exist; they are the prototype's.
- _"Make it look more modern"_ — it looks the way the owner approved.
