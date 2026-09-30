# Next goal — shared by Claude Code and Codex

Paste **one** goal block into a **new conversation started in the repo root**.

- **Claude Code:** build on **Sonnet 5 · high**; plan, sign off and review SQL/money/offline on **Opus 5.5 · medium**
  (the other model from the builder). Pick the model once per conversation; auto mode on; plan mode off inside an approved `/goal`; `/goal …`. The exact values for each goal are in its Session settings table.
  Why: [finish-plan.md](finish-plan.md) section 8.2.
- **Codex:** the default profile (`gpt-6-sol` high), `/goal …`.

**Every goal block below starts with a "Session settings" table** (model, reasoning effort, plan mode on or off, permission mode, subagent models, review model, browser QA, stop budget). Whoever rewrites the block fills it in from [finish-plan.md](finish-plan.md) section 6 (the slice's "Model · effort" cell) and section 8.2, and updates the table whenever a goal changes. Do not leave a setting implied. Ethan asked for this on 2026-09-29.

When a goal finishes, the agent deletes its block here, leaves the next one on top, and commits. Rules: [lean plan](lean-plan.md). Architecture A: direct `supabase-js`, with RLS as the boundary. G1 goals and the hosted preview are done (see [current state](current.md)). **The forward plan is [finish-plan.md](finish-plan.md)** (approved 2026-09-28 with every default; decisions F1–F10 in its section 11). It replaces the order in G2-plan.md; take the top goal below.

## Before starting (once per conversation)

- Read only `AGENTS.md` (auto-loaded), `docs/state/current.md` (short status), this file, and the [finish-plan.md](finish-plan.md) sections the goal names. Open `docs/state/decision-register.md` only for the rows the goal names.
- Locate code with codebase-memory-mcp (`search_graph`, `get_code_snippet`, `trace_path`), not by reading whole files. Read SQL migrations directly.
- If files changed since the last index, re-index first: `index_repository`, repo path `C:/Users/ethan/dev/happy-cookie-ops-g0`.
- Pinned toolchain: prefix PATH with `C:\Users\ethan\dev\happy-cookie-tools\bin;C:\Users\ethan\dev\happy-cookie-tools\node-v24.20.0-win-x64`. In Git Bash call `pnpm.cmd`: a bare `pnpm` resolves to the global npm shim first (it warns that the `pnpm` field is ignored).
- Docker Desktop must be running for SQL work, and for one Python guard (`tests/integration/db`).
- **Baseline (2026-09-30, at C1 close):**
  - `pnpm typecheck` clean; `pnpm verify` green, 68 files / 1303 tests (see current.md); port integrity OK, 54 files; G0 validator 1217 checks, 0 failures;
  - Python guards 63 OK, via `python -m unittest discover -s <dir> -p "test_*.py"` for each of `tests/unit`, `tests/integration/auth`, `tests/integration/db` and `tests/integration/security`, with `G0_PYTHON_LIBS=C:\Users\ethan\dev\happy-cookie-tools\python-libs-314`; SQL role suite 1695 cases/reset, 2 resets (`python scripts/test-db-security.py`, about 3 minutes);
  - `pnpm build:pages:spike`/`test:pages:spike`/`test:workers:spike` pass with or without `NEXT_PUBLIC_SUPABASE_URL`/`…PUBLISHABLE_KEY` (local stack values: `pnpm exec supabase status -o env`; the bare `supabase` binary is not on PATH);
  - `pnpm build` passes, and `pnpm test:e2e` gives 89 passed / 1 failed / 75 skipped with no Supabase variables set. The one failure is OFFLINE-01 on WebKit (Playwright's WebKit cannot reload offline with a service worker); desktop and phone pass;
  - `pnpm test:live:checkout`: 11 steps (needs `pnpm db:reset` first and the three local keys in the environment).
  - **Adding a migration touches more than SQL:** `tests/fixtures/mp08g-source-pins.json` (sha256, CRLF file), `tests/fixtures/function-authority.json` (a manifest entry per function and its body hash, regenerated from a reset local database), the function count in `tests/integration/security/test_function_authority.py`, `scripts/test-db-security.py` (suites, mutation maps, the asserted totals), `pnpm db:types`. A redefined function is mutated from its latest definition. The pre-commit hook runs `pnpm verify` and needs the pinned toolchain on PATH.
- **Codex only:** run `/status` once in the repo root to confirm the project `.codex/config.toml` loaded. Accept the trust prompt if asked. The project sandbox has no network, so `git push` will ask for approval.

## Next goal — C2: production (baking, dough and packing use stock)

Drafted 2026-09-30 after C1 closed (finish-plan approved order: ... A3 → A4 → C1 → **C2** → E1 → F1–F4). C1 made the quantity of an item a ledger, but the
actions that use stock still change only the screen and are lost on a reload: mixing dough (`confirmDough` ~1330, `mixRows` ~1304), baking
(`confirmBatch` ~1419, `deductions` ~1400), packing an order (`packOrder` ~1255: boxes, pouches, stickers, cards) and the bazaar sale's packaging
(`recordSale` ~1716-1717). `bake_batches` exists in the database but nothing reads or writes it, so the recipes screen's "baked on this version"
counts and the Bake screen's history are empty in live mode.

### Session settings (set these before pasting the goal)

| Setting | Value | Why |
| --- | --- | --- |
| Conversation | **New**, started in the repo root (`C:/Users/ethan/dev/happy-cookie-ops-g0`) | One slice per conversation |
| Builder model · reasoning effort | **Sonnet 5 · high** | finish-plan section 6 row C2; section 8.2 |
| Plan mode | **On for the first turn**, then off | The design has real choices (below): a `use` movement kind, half and double batches, the offline bazaar sale |
| Permission mode | **Auto mode on** | finish-plan 8.1 |
| Fast mode | Off | Not needed |
| Sign-off and review model | **Opus 5.5 · medium** as a subagent with `model: opus` | A different model reviews SQL and stock arithmetic: the deduction, its idempotency, packaging use inside a sale |
| Port audit | `port-auditor` on **Sonnet**, first: which of `confirmDough`, `confirmBatch`, `packOrder`, `recordSale`, `voidSale` change `state.inv`, `dough`, `baked`, `batches`, and which vals the Bake, dough and orders screens read; whether `state.batches` can be fed from the database | Same method as A3, A4 and C1 |
| Literal code search | Explore subagent (Haiku) or codebase-memory-mcp | Never read the 4,000-line engine whole |
| Browser QA | **Required.** Built-in browser pane, live-mode build, local test owner (`localhost` only); restart the wrangler emulator after each rebuild. Mix dough, bake a batch, pack an order, and see the ingredient and packaging quantities and the recipe screen's batch counts survive a reload |
| Stop budget | 2 failed fix attempts or 25 turns | Written in the goal |
| Environment | Docker Desktop running; pinned toolchain on PATH; `pnpm.cmd` in Git Bash | See "Before starting" |

**Read first:** finish-plan C2, C1, A4 rows and section 2 (Production, Inventory-Out in the Apps Script audit); the C1 checkpoint in `current.md`;
`supabase/migrations/20260101004600_stock_ledger.sql` (the movement RPC, its idempotency and the `on_hand` rules), `20260101004400_recipes.sql` (the
version a batch is baked on) and the init migration's `bake_batches`; `src/store/ops-runtime.tsx` (the C1 wrappers: record first, then the engine's own
bookkeeping, then re-read); the offline queue (`src/lib/offline/`, `docs/OFFLINE.md`) if a bazaar sale's packaging use must work without signal.

**The slice (design, each a default Cine can change):** (1) a `use` movement kind (a negative quantity with a reason such as "Baked: Double Chocolate
Fudge, Version 3") written by the same owner RPC or a batch RPC that deducts every recipe line of a batch in one transaction, idempotent on the
batch's client id, never taking more than is there (the shortfall is recorded, as the engine's `shortfalls` does). (2) Batches and dough records on the
database (`bake_batches` and a dough record), read into `state.batches`, `dough` and `baked`, so the counts and the history are real. (3) The
ported confirm actions replaced from `OpsRuntime` in the C1 pattern. (4) Packaging used at packing and at a bazaar sale through the same movement.
(5) Half and double batches and the ± tolerance the finish-plan row names.

**Carry-overs:** the two P2 follow-ups from the B2 re-audit in `protected-exception.md` (a timeout on `place_order` and `join_waitlist`, and a `beforeunload` prompt while an order is unsettled) before real customers order; the recorded C1, A4, A3, D4 and B4b items in `current.md` (a mistyped receipt cost; mixed pack sizes; the item list needs a search box;
history is counts only; same-day across midnight; boxes for non-cookie sets; extras on the status page); a direct load of a staff URL lands on Home
in live mode (not investigated); helper access to pack and collect; wording for every sentence marked PLACEHOLDER.

```text
/goal C2 (docs/state/finish-plan.md slice C2): mixing dough, baking a batch and packing an order use stock on the database: each confirmed batch
deducts every recipe line of the version it was baked on (and the packaging per cookie) in one idempotent, owner-only transaction as stock
movements that never take more than is there, batches and dough records live on the database and feed the Bake, dough and recipes screens
(including "baked on this version"), and packing an order or a bazaar sale uses its packaging the same way; all surviving a reload. New
migration (batch and dough records, the use movement, owner get/record RPCs, SECURITY DEFINER, search_path '', in-function role check, explicit
grants, direct writes stay revoked), the ported confirm actions replaced from OpsRuntime with no protected-markup or engine edit unless the port
audit forces one (then its own record and exact reversals, and stop and ask Ethan first). SQL role suite with a deliberate regression per new
rule, unit tests with a mutation per new branch, a port audit (Sonnet) first, and one different-model review (Opus). All exit 0 in this
session: pnpm verify, Python guards, the G0 validator (revert evidence/*.json churn), port integrity, pnpm build, test:pages:spike,
test:workers:spike, test:e2e (baseline in current.md), test:live:checkout, python scripts/test-db-security.py, and a visual pass in the
browser pane over every screen touched (screenshots looked at: mixing dough, baking, packing, the inventory before and after, the recipe
screen's batch counts). Committed and pushed; current.md checkpoint and task-status updated; this block replaced by the next goal from
finish-plan section 6 (E1). No deploy. Stop after 2 failed fix attempts or 25 turns.
```

## After these goals

1. **Hosted preview: live (2026-09-27, see [current state](current.md)).** The route/CSP/cache oracle, anonymous RLS/RPC probes, `connect-src` proof, default-privilege probe and catalog RLS guard pass on the hosted project. Still open:
   - the direct-parent refresh probe and the `auth.sessions` checks, with a test account Ethan creates and signs in with himself;
   - move the local stack to Postgres 17 and revoke the PG17 MAINTAIN privilege from API roles in a reviewed migration.
2. **Remaining slices: [finish-plan.md](finish-plan.md) section 6.** The approved order after D2 is [D3 if
   the pilot gate passes by 20 Oct] → A2 → B1–B4 → [D4 is the top goal above] → A3–A4 → C1–C2 → E1 → F1–F4. Each next block is written from there when the previous one lands. Carry-overs:
   - Rate limiting for anonymous checkout: key on phone number plus the weekly cap, never the client IP (the gateway's forwarded-IP header is caller-controlled; finish-plan section 10).
4. **G4 (operations):**
   - Keep-alive: Supabase pauses Free projects after about 7 days of low activity; its docs allow keep-alive API calls.
   - Weekly encrypted `supabase db dump` (Free has no automatic backups; DP-10).
   - `prune_personal_data` set to the owner's 1 year.
   - Shop privacy notice (locked-UI exception).
   - Dev-dependency audit (14 findings, 6 high).
   - CI green on `main` (`format:check` and E2E are known red) before any merge.
