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
- **Baseline (2026-09-30, at D4 close):**
  - `pnpm typecheck` clean; `pnpm verify` green, 62 files / 1150 tests (see current.md); port integrity OK, 54 files; G0 validator 1217 checks, 0 failures;
  - Python guards 63 OK, via `python -m unittest discover -s <dir> -p "test_*.py"` for each of `tests/unit`, `tests/integration/auth`, `tests/integration/db` and `tests/integration/security`, with `G0_PYTHON_LIBS=C:\Users\ethan\dev\happy-cookie-tools\python-libs-314`; SQL role suite 1387 cases/reset, 2 resets (`python scripts/test-db-security.py`, about 3 minutes);
  - `pnpm build:pages:spike`/`test:pages:spike`/`test:workers:spike` pass with or without `NEXT_PUBLIC_SUPABASE_URL`/`…PUBLISHABLE_KEY` (local stack values: `pnpm exec supabase status -o env`; the bare `supabase` binary is not on PATH);
  - `pnpm build` passes, and `pnpm test:e2e` gives 89 passed / 1 failed / 75 skipped with no Supabase variables set. The one failure is OFFLINE-01 on WebKit (Playwright's WebKit cannot reload offline with a service worker); desktop and phone pass;
  - `pnpm test:live:checkout`: 11 steps (needs `pnpm db:reset` first and the three local keys in the environment).
  - **Adding a migration touches more than SQL:** `tests/fixtures/mp08g-source-pins.json` (sha256, CRLF file), `tests/fixtures/function-authority.json` (a manifest entry per function and its body hash, regenerated from a reset local database), the function count in `tests/integration/security/test_function_authority.py`, `scripts/test-db-security.py` (suites, mutation maps, the asserted totals), `pnpm db:types`. A redefined function is mutated from its latest definition. The pre-commit hook runs `pnpm verify` and needs the pinned toolchain on PATH.
- **Codex only:** run `/status` once in the repo root to confirm the project `.codex/config.toml` loaded. Accept the trust prompt if asked. The project sandbox has no network, so `git push` will ask for approval.

## Next goal — A3: stock items and suppliers on the database (Cine's ingredients and packaging)

Drafted 2026-09-30 after D4 closed (finish-plan approved order: ... B4 → D4 → **A3** → A4 → C1 → C2 → E1 → F1–F4). Today the inventory,
grocery and suppliers screens read constants inside the protected engine (`INVENTORY` ~line 217, `SUPPLIERS` ~265, `PACK_SIZE`,
`BEST_BUY`, `OPTIONS_FOR`), so in live mode they are empty and Cine cannot enter her 73 ingredients (11 packaging) or 12 suppliers
(finish-plan section 2, "Ingredient Master" and "Suppliers"). This slice puts the items, the suppliers and their prices on the
database and on screen, with her one-time import written but run only at cutover (section 9).

### Session settings (set these before pasting the goal)

| Setting | Value | Why |
| --- | --- | --- |
| Conversation | **New**, started in the repo root (`C:/Users/ethan/dev/happy-cookie-ops-g0`) | One slice per conversation; hooks, agents and `.mcp.json` load only from the root |
| Builder model · reasoning effort | **Sonnet 5 · high** | finish-plan section 6 row A3; section 8.2 |
| Plan mode | **On for the first turn** (the engine-exception question below decides the size), then off | Turn it off once the plan is approved; inside an approved `/goal` the block is the approval, but an engine exception needs Ethan's record first |
| Permission mode | **Auto mode on** | finish-plan 8.1 |
| Fast mode | Off | Not needed |
| Sign-off and review model | **Opus 5.5 · medium** as a subagent with `model: opus` | A different model reviews SQL and money (lean plan rule 4): the migration, the RPCs, the price rules |
| Port audit | `port-auditor` on **Sonnet**, before any edit near protected markup or the engine | `INVENTORY`, `SUPPLIERS`, `PACK_SIZE`, `BEST_BUY` and `OPTIONS_FOR` are engine constants: prefer a runtime post-process; an engine edit needs a protected-exception record (`docs/state/protected-exception.md`) and Ethan's approval |
| Literal code search | Explore subagent (Haiku) or codebase-memory-mcp | Cheapest; never read the 4,000-line engine whole |
| Browser QA | **Required.** Built-in browser pane, live-mode build, local test owner (`localhost` only), same-origin database proxy if Chrome times out on port 54321 (recipe in the memory file). Look at the inventory, grocery and suppliers screens with real rows, the owner form, and a price change |
| Stop budget | 2 failed fix attempts or 25 turns | Written in the goal |
| Environment | Docker Desktop running; pinned toolchain on PATH; `pnpm.cmd` in Git Bash | See "Before starting" |

**Read first:** finish-plan A3, C1 rows and section 2 (Ingredient Master, Suppliers), section 9 (cutover import) and the decision
register rows the slice names; `supabase/migrations/20260101000000_init.sql` (`suppliers`, `inventory_items`) and grep the migrations for
`supplier_prices`; `src/store/engine/ops-engine.js` lines ~217-345 (`INVENTORY`, `SUPPLIERS`, `PACK_SIZE`, `BEST_BUY`, `OPTIONS_FOR`) and
the inventory, grocery and suppliers screens' vals in `src/view-models/vals.ts`; the B4a/D4 owner forms
(`src/components/live/order-extras-form.tsx`, `scheduled-events-form.tsx`) and their data modules as the pattern (strict parser, stale
stamp, exact keys, pesos on screen, centavos on the wire); the D4 database half as the pattern for a new table with owner-only RPCs.

**The slice (design, each a default Cine can change):** (1) items (name, unit, kind ingredient or packaging, pack size, par level,
active), suppliers (name, phone, notes, active) and supplier prices (supplier, item, pack, price in centavos, last seen) on the
database, owner-only get/save RPCs in the settings pattern (stale stamp, exact keys, `SECURITY DEFINER`, `search_path ''`, in-function
role check, explicit grants, idempotent); deactivate instead of delete. (2) A live-mode read that replaces the engine constants for the
screens (a post-process in `OpsRuntime`, no engine edit) or, if a screen cannot be fed that way, the smallest engine exception with its
record. (3) Owner forms on the live form host under All tools: items, suppliers with their prices. (4) The lowest-recent-price rule
(finding in section 2) computed from the supplier prices, not from a constant. (5) The one-time import from her workbook: a script under
`scripts/` that reads the exported CSVs from outside the repo and writes through the owner RPCs; not run here, never with real data
committed. (6) No stock movement, counts or receipts here: that is C1.

**Carry-overs:** the recorded D4 and B4b items in `current.md` (same-day across midnight, boxes for non-cookie sets, extras on the
status page, `docs/DATA.md` missing `scheduled_events` and `event_expenses`); a direct load of a staff URL lands on Home in live mode
(not investigated); helper access to pack and collect; wording for every sentence marked PLACEHOLDER.

```text
/goal A3 (docs/state/finish-plan.md slice A3): Cine's stock items (ingredients and packaging), suppliers and supplier prices live on
the database and on the inventory, grocery and suppliers screens in live mode, with owner forms to add and edit them and the lowest
recent price computed from the supplier prices. New migration (items, suppliers and supplier prices with owner get/save RPCs, stale-stamp
checks, SECURITY DEFINER, search_path '', in-function role check, explicit grants), the screens fed from an OpsRuntime post-process
with no protected-markup or engine edit unless the port audit forces one (then its own record and exact reversals, and stop and ask
Ethan first). A one-time import script that is written and tested against fixtures but not run. SQL role suite with a deliberate
regression per new rule, unit tests with a mutation per new branch, a port audit (Sonnet) before any edit near protected markup or the
engine, and one different-model review (Opus). All exit 0 in this session: pnpm verify, Python guards, the G0 validator (revert
evidence/*.json churn), port integrity, pnpm build, test:pages:spike, test:workers:spike, test:e2e (baseline in current.md),
test:live:checkout, python scripts/test-db-security.py, and a visual pass in the browser pane over every screen touched (screenshots
looked at: the three screens with rows, each form, a price change). Committed and pushed; current.md checkpoint and task-status updated;
this block replaced by the next goal from finish-plan section 6 (A4). No deploy. Stop after 2 failed fix attempts or 25 turns.
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
