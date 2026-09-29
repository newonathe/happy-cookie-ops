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
- **Baseline (2026-09-30, at A3 close):**
  - `pnpm typecheck` clean; `pnpm verify` green, 64 files / 1222 tests (see current.md); port integrity OK, 54 files; G0 validator 1217 checks, 0 failures;
  - Python guards 63 OK, via `python -m unittest discover -s <dir> -p "test_*.py"` for each of `tests/unit`, `tests/integration/auth`, `tests/integration/db` and `tests/integration/security`, with `G0_PYTHON_LIBS=C:\Users\ethan\dev\happy-cookie-tools\python-libs-314`; SQL role suite 1525 cases/reset, 2 resets (`python scripts/test-db-security.py`, about 3 minutes);
  - `pnpm build:pages:spike`/`test:pages:spike`/`test:workers:spike` pass with or without `NEXT_PUBLIC_SUPABASE_URL`/`…PUBLISHABLE_KEY` (local stack values: `pnpm exec supabase status -o env`; the bare `supabase` binary is not on PATH);
  - `pnpm build` passes, and `pnpm test:e2e` gives 89 passed / 1 failed / 75 skipped with no Supabase variables set. The one failure is OFFLINE-01 on WebKit (Playwright's WebKit cannot reload offline with a service worker); desktop and phone pass;
  - `pnpm test:live:checkout`: 11 steps (needs `pnpm db:reset` first and the three local keys in the environment).
  - **Adding a migration touches more than SQL:** `tests/fixtures/mp08g-source-pins.json` (sha256, CRLF file), `tests/fixtures/function-authority.json` (a manifest entry per function and its body hash, regenerated from a reset local database), the function count in `tests/integration/security/test_function_authority.py`, `scripts/test-db-security.py` (suites, mutation maps, the asserted totals), `pnpm db:types`. A redefined function is mutated from its latest definition. The pre-commit hook runs `pnpm verify` and needs the pinned toolchain on PATH.
- **Codex only:** run `/status` once in the repo root to confirm the project `.codex/config.toml` loaded. Accept the trust prompt if asked. The project sandbox has no network, so `git push` will ask for approval.

## Next goal — A4: recipes with versions on the database (Cine's recipes, yields, packaging per cookie)

Drafted 2026-09-30 after A3 closed (finish-plan approved order: ... B4 → D4 → A3 → **A4** → C1 → C2 → E1 → F1–F4). Today the recipes are the
engine's `RECIPES` constant, copied into `state.recipes` at start (`recipes:` ~line 490, `recipeVer` and `recipeDirty` ~499), with edit
actions at ~lines 940-970 that change only the screen; `recipes` and `recipe_ingredients` exist in the database (owner-only reads, no API
writes yet) but nothing reads or writes them. In live mode the recipes screen shows the prototype's six recipes and Cine cannot enter
her own (finish-plan section 2: 337 recipe lines, 24 flavours, per batch, packaging included per cookie, yields in the Costing Dashboard).
This slice puts her recipes, yields and versions on the database and on the recipes and cost screens. Stock items now exist (A3), so a
recipe line names a real item.

### Session settings (set these before pasting the goal)

| Setting | Value | Why |
| --- | --- | --- |
| Conversation | **New**, started in the repo root (`C:/Users/ethan/dev/happy-cookie-ops-g0`) | One slice per conversation; hooks, agents and `.mcp.json` load only from the root |
| Builder model · reasoning effort | **Sonnet 5 · high** | finish-plan section 6 row A4; section 8.2 |
| Plan mode | **Off** | `state.recipes` is state, so a runtime `setState` (as A3 did for `inv`) should reach the screens; turn plan mode on only if the port audit finds a direct constant read that needs an engine exception |
| Permission mode | **Auto mode on** | finish-plan 8.1 |
| Fast mode | Off | Not needed |
| Sign-off and review model | **Opus 5.5 · medium** as a subagent with `model: opus` | A different model reviews SQL and money (lean plan rule 4): the migration, the version rule, the cost path |
| Port audit | `port-auditor` on **Sonnet**, first: which reads of `RECIPES`, `recipeVer` and the recipe actions are state-based and which are direct constant reads | A3 needed the in-place refill of engine constants for suppliers; find out first whether recipes do |
| Literal code search | Explore subagent (Haiku) or codebase-memory-mcp | Cheapest; never read the 4,000-line engine whole |
| Browser QA | **Required.** Built-in browser pane, live-mode build, local test owner (`localhost` only); restart the wrangler emulator after each rebuild (it caches the CSP headers). Look at the recipes screen with real rows, an edit that bumps the version, and the cost per cookie |
| Stop budget | 2 failed fix attempts or 25 turns | Written in the goal |
| Environment | Docker Desktop running; pinned toolchain on PATH; `pnpm.cmd` in Git Bash | See "Before starting" |

**Read first:** finish-plan A4, C2 rows and section 2 (Recipes, Costing Dashboard, Box costing); the A3 checkpoint in `current.md` and
`src/lib/data/engine-catalogue.ts` (how A3 reached engine constants), `src/lib/data/stock-catalogue.ts` and the A3 forms as the
pattern (owner form on the live form host, strict parser, stale stamp, exact keys, pesos on screen and centavos on the wire);
`supabase/migrations/20260101000000_init.sql` (`recipes`, `recipe_ingredients`) and `20260101004300_stock_catalogue.sql` (the RPC pattern and
the direct-write grant revoke); `src/store/engine/ops-engine.js` lines ~485-500 and ~935-975 (recipe state and edit actions), and the recipe and
cost screens' vals in `src/view-models/vals.ts`.

**The slice (design, each a default Cine can change):** (1) recipe versions on the database: a recipe (per flavour, yield in cookies) with
a version number and its lines (item name, quantity in the item's unit, exact, never rounded), a new version on save (the old one is kept for
history), owner-only get/save RPCs in the A3 pattern (stale stamp, exact keys, `SECURITY DEFINER`, `search_path ''`, in-function role check,
explicit grants, idempotent); a line's item must be an existing active stock item (the A3 rename rule already protects it); direct writes
stay revoked. (2) Live mode feeds `state.recipes` and `recipeVer` from the database (a runtime post-process or `setState`), with the
engine's edit actions replaced by ones that save; the demo recipes are never shown. (3) Cost per cookie comes from the recipe lines and the
A3 best-buy prices (the engine's own `costPerUnit`); packaging is a recipe line like any other. (4) An owner form only if the ported recipe
editor cannot do the job. (5) The import for the current menu is a script under `scripts/` that reads her exported CSV from outside the repo
and writes through the owner RPCs, confirmed by Cine before it runs; written and tested against fixtures, not run here.

**Carry-overs:** the recorded A3, D4 and B4b items in `current.md` (mixed pack sizes for one item; quantities are 0 until C1; the item list needs
a search box; same-day across midnight; boxes for non-cookie sets; extras on the status page; `docs/DATA.md` missing `scheduled_events`,
`event_expenses` and the A3 columns); a direct load of a staff URL lands on Home in live mode (not investigated); helper access to pack and
collect; wording for every sentence marked PLACEHOLDER.

```text
/goal A4 (docs/state/finish-plan.md slice A4): Cine's recipes (per flavour, yield in cookies, lines of stock item and exact quantity,
packaging included) live on the database with a version that changes on every save, and on the recipes and cost screens in live mode
instead of the six prototype recipes, with the cost per cookie worked out from the recipe lines and the supplier prices. New migration
(recipe versions and owner get/save RPCs with stale-stamp checks, SECURITY DEFINER, search_path '', in-function role check, explicit
grants, direct writes stay revoked), state fed from an OpsRuntime post-process or setState with no protected-markup or engine edit unless
the port audit forces one (then its own record and exact reversals, and stop and ask Ethan first). An import script for the current menu
that is written and tested against fixtures but not run. SQL role suite with a deliberate regression per new rule, unit tests with a
mutation per new branch, a port audit (Sonnet) before any edit near protected markup or the engine, and one different-model review
(Opus). All exit 0 in this session: pnpm verify, Python guards, the G0 validator (revert evidence/*.json churn), port integrity, pnpm
build, test:pages:spike, test:workers:spike, test:e2e (baseline in current.md), test:live:checkout, python scripts/test-db-security.py, and
a visual pass in the browser pane over every screen touched (screenshots looked at: the recipes screen with rows, an edit that bumps the
version, the cost per cookie). Committed and pushed; current.md checkpoint and task-status updated; this block replaced by the next goal
from finish-plan section 6 (C1). No deploy. Stop after 2 failed fix attempts or 25 turns.
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
