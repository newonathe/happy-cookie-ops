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
- **Baseline (2026-09-30, at A4 close):**
  - `pnpm typecheck` clean; `pnpm verify` green, 66 files / 1259 tests (see current.md); port integrity OK, 54 files; G0 validator 1217 checks, 0 failures;
  - Python guards 63 OK, via `python -m unittest discover -s <dir> -p "test_*.py"` for each of `tests/unit`, `tests/integration/auth`, `tests/integration/db` and `tests/integration/security`, with `G0_PYTHON_LIBS=C:\Users\ethan\dev\happy-cookie-tools\python-libs-314`; SQL role suite 1608 cases/reset, 2 resets (`python scripts/test-db-security.py`, about 3 minutes);
  - `pnpm build:pages:spike`/`test:pages:spike`/`test:workers:spike` pass with or without `NEXT_PUBLIC_SUPABASE_URL`/`…PUBLISHABLE_KEY` (local stack values: `pnpm exec supabase status -o env`; the bare `supabase` binary is not on PATH);
  - `pnpm build` passes, and `pnpm test:e2e` gives 89 passed / 1 failed / 75 skipped with no Supabase variables set. The one failure is OFFLINE-01 on WebKit (Playwright's WebKit cannot reload offline with a service worker); desktop and phone pass;
  - `pnpm test:live:checkout`: 11 steps (needs `pnpm db:reset` first and the three local keys in the environment).
  - **Adding a migration touches more than SQL:** `tests/fixtures/mp08g-source-pins.json` (sha256, CRLF file), `tests/fixtures/function-authority.json` (a manifest entry per function and its body hash, regenerated from a reset local database), the function count in `tests/integration/security/test_function_authority.py`, `scripts/test-db-security.py` (suites, mutation maps, the asserted totals), `pnpm db:types`. A redefined function is mutated from its latest definition. The pre-commit hook runs `pnpm verify` and needs the pinned toolchain on PATH.
- **Codex only:** run `/status` once in the repo root to confirm the project `.codex/config.toml` loaded. Accept the trust prompt if asked. The project sandbox has no network, so `git push` will ask for approval.

## Next goal — C1: the stock ledger (quantities on hand come from receipts, counts and waste)

Drafted 2026-09-30 after A4 closed (finish-plan approved order: ... D4 → A3 → A4 → **C1** → C2 → E1 → F1–F4). Today the quantity on hand is 0 for every
item (A3 reads `inventory_items.on_hand` but nothing writes it), and the ported actions that change quantities change only the screen: receive
(`ops-engine.js` ~1629), waste (~1542, `writeOff` ~1516-1529), bake use (`deductions` ~1405, `mixRows` ~1305), bazaar packaging (~1717) and the
stocktake (~2092); an A3 override says "not kept" for a plain count. This slice makes the quantity a ledger: every receipt, count, waste and
use is a movement on the database, and `on_hand` is its sum. It is what lets the grocery list, low-stock alerts and cost of goods be true.

### Session settings (set these before pasting the goal)

| Setting                          | Value                                                                                                                                                                                                                                                                  | Why                                                                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Conversation                     | **New**, started in the repo root (`C:/Users/ethan/dev/happy-cookie-ops-g0`)                                                                                                                                                                                           | One slice per conversation; hooks, agents and `.mcp.json` load only from the root                                          |
| Builder model · reasoning effort | **Sonnet 5 · high**                                                                                                                                                                                                                                                    | finish-plan section 6 row C1; section 8.2                                                                                  |
| Plan mode                        | **On for the first turn**, then off                                                                                                                                                                                                                                    | The design has real choices (below); get the plan right, then build inside the approved goal                               |
| Permission mode                  | **Auto mode on**                                                                                                                                                                                                                                                       | finish-plan 8.1                                                                                                            |
| Fast mode                        | Off                                                                                                                                                                                                                                                                    | Not needed                                                                                                                 |
| Sign-off and review model        | **Opus 5.5 · medium** as a subagent with `model: opus`                                                                                                                                                                                                                 | A different model reviews SQL and money (lean plan rule 4): the movement rules, idempotency, receipt cost to expense       |
| Port audit                       | `port-auditor` on **Sonnet**, first: every engine action that changes `state.inv` (receive, waste, stocktake, deductions, packaging use, add/remove) and which vals they feed                                                                                          | Same method as A3 and A4: state-based reads can be fed by `setState`; the actions are instance arrows the runtime replaces |
| Literal code search              | Explore subagent (Haiku) or codebase-memory-mcp                                                                                                                                                                                                                        | Cheapest; never read the 4,000-line engine whole                                                                           |
| Browser QA                       | **Required.** Built-in browser pane, live-mode build, local test owner (`localhost` only); restart the wrangler emulator after each rebuild. Receive a delivery, count, write off, and see the inventory, grocery list and low-stock alert change and survive a reload |
| Stop budget                      | 2 failed fix attempts or 25 turns                                                                                                                                                                                                                                      | Written in the goal                                                                                                        |
| Environment                      | Docker Desktop running; pinned toolchain on PATH; `pnpm.cmd` in Git Bash                                                                                                                                                                                               | See "Before starting"                                                                                                      |

**Read first:** finish-plan C1, C2, A3 rows and section 2 (Inventory-In/Out, the Apps Script inventory sidebars in
`docs/state/apps-script-audit.md`); the A3 and A4 checkpoints in `current.md`; `src/lib/data/stock-catalogue.ts` and `engine-catalogue.ts`
(the catalogue and how the runtime feeds `state.inv`); `supabase/migrations/20260101004300_stock_catalogue.sql` (the RPC pattern, the
direct-write revoke, `on_hand` is never written there) and `20260101003300_bazaar_closeout.sql` (`add_event_expense`: how a cost reaches
`ledger_entries`); the offline queue in `src/lib/offline/` and `docs/OFFLINE.md` if a movement must work without signal (decide first:
receiving and counting happen in the kitchen or at the shop, probably online, but a bazaar packaging use is offline).

**The slice (design, each a default Cine can change):** (1) a `stock_movements` table (item, kind receipt / count / waste / use / opening,
signed quantity in the item's unit, cost in centavos for a receipt, note, client id, at) that only an owner RPC writes, with `on_hand`
recomputed from it (a trigger or the RPC, never a client value); idempotent on the client id. (2) A receipt with a cost also writes the
expense (the ledger cost the grocery "I bought this" flow already means); a count writes the variance as a movement; waste is a movement
with a reason. (3) The ported actions are replaced in live mode by ones that call the RPCs and then re-read `on_hand` into `state.inv`
(the A3 "keep local quantities" rule then goes away). (4) The opening count is one movement per item. (5) Bake and packing deduction is
C2, not here. (6) Fix the A3 caveat that a supplier price carries no pack size, before real prices are entered.

**Carry-overs:** the recorded A4, A3, D4 and B4b items in `current.md` (mixed pack sizes; the item list needs a search box; recipes' batch counts
show nothing until batches load; same-day across midnight; boxes for non-cookie sets; extras on the status page; `docs/DATA.md` missing
`scheduled_events`, `event_expenses`, the stock catalogue and recipe versions); a direct load of a staff URL lands on Home in live mode
(not investigated); helper access to pack and collect; wording for every sentence marked PLACEHOLDER.

```text
/goal C1 (docs/state/finish-plan.md slice C1): the quantity of every stock item is a ledger on the database: receipts (with their cost
and the expense it makes), counts (with the variance), waste and the opening count are movements written by owner-only, idempotent RPCs,
and `on_hand` is their sum; in live mode the inventory, receive, waste and stocktake screens call them and show what the database holds,
so the grocery list and low-stock alerts are true and survive a reload. New migration (movements table, owner get/record RPCs with
idempotent client ids, SECURITY DEFINER, search_path '', in-function role check, explicit grants, direct writes stay revoked), the
ported actions replaced from OpsRuntime with no protected-markup or engine edit unless the port audit forces one (then its own record
and exact reversals, and stop and ask Ethan first). SQL role suite with a deliberate regression per new rule, unit tests with a mutation
per new branch, a port audit (Sonnet) first, and one different-model review (Opus). All exit 0 in this session: pnpm verify, Python
guards, the G0 validator (revert evidence/*.json churn), port integrity, pnpm build, test:pages:spike, test:workers:spike, test:e2e
(baseline in current.md), test:live:checkout, python scripts/test-db-security.py, and a visual pass in the browser pane over every screen
touched (screenshots looked at: inventory, a receipt, a count, waste, the grocery list, the low-stock alert). Committed and pushed;
current.md checkpoint and task-status updated; this block replaced by the next goal from finish-plan section 6 (C2). No deploy. Stop after
2 failed fix attempts or 25 turns.
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
