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
- **Baseline (2026-09-30, at C2 close):**
  - `pnpm typecheck` clean; `pnpm verify` green, 70 files / 1355 tests (see current.md); port integrity OK, 54 files; G0 validator 1217 checks, 0 failures;
  - Python guards 63 OK, via `python -m unittest discover -s <dir> -p "test_*.py"` for each of `tests/unit`, `tests/integration/auth`, `tests/integration/db` and `tests/integration/security`, with `G0_PYTHON_LIBS=C:\Users\ethan\dev\happy-cookie-tools\python-libs-314`; SQL role suite 1783 cases/reset, 2 resets (`python scripts/test-db-security.py`, about 3 minutes);
  - `pnpm build:pages:spike`/`test:pages:spike`/`test:workers:spike` pass with or without `NEXT_PUBLIC_SUPABASE_URL`/`…PUBLISHABLE_KEY` (local stack values: `pnpm exec supabase status -o env`; the bare `supabase` binary is not on PATH);
  - `pnpm build` passes, and `pnpm test:e2e` gives 89 passed / 1 failed / 75 skipped with no Supabase variables set. The one failure is OFFLINE-01 on WebKit (Playwright's WebKit cannot reload offline with a service worker); desktop and phone pass;
  - `pnpm test:live:checkout`: 11 steps (needs `pnpm db:reset` first and the three local keys in the environment).
  - **Adding a migration touches more than SQL:** `tests/fixtures/mp08g-source-pins.json` (sha256, CRLF file), `tests/fixtures/function-authority.json` (a manifest entry per function and its body hash, regenerated from a reset local database), the function count in `tests/integration/security/test_function_authority.py`, `scripts/test-db-security.py` (suites, mutation maps, the asserted totals), `pnpm db:types`. A redefined function is mutated from its latest definition. The pre-commit hook runs `pnpm verify` and needs the pinned toolchain on PATH.
- **Codex only:** run `/status` once in the repo root to confirm the project `.codex/config.toml` loaded. Accept the trust prompt if asked. The project sandbox has no network, so `git push` will ask for approval.

## Next goal — E1: ledger and P&L

Drafted 2026-09-30 after C2 closed (finish-plan approved order: ... C1 → C2 → **E1** → F1–F4). The books exist on the database (`ledger_entries`: paid orders and
stall sales as revenue, receipts and event expenses as costs, event rent) but the P&L, Home profit and the records screens still read the engine's local ledger, so
they are empty in live mode. C2 made "cost when used" possible: `stock_movements` of kind `use` carry the quantity of each ingredient a batch, a dough mix, a pack
and a stall sale consumed, and a costed receipt gives the last price paid per item (`get_last_paid`). DP-04 (count cost when bought or when used) is the open
decision this slice must settle with Ethan before it builds the headline number.

### Session settings (set these before pasting the goal)

| Setting | Value | Why |
| --- | --- | --- |
| Conversation | **New**, started in the repo root (`C:/Users/ethan/dev/happy-cookie-ops-g0`) | One slice per conversation |
| Builder model · reasoning effort | **Sonnet 5 · high** | finish-plan section 6 row E1; section 8.2 |
| Plan mode | **On for the first turn**, then off | DP-04 and the expense categories are choices, not defaults to guess |
| Permission mode | **Auto mode on** | finish-plan 8.1 |
| Fast mode | Off | Not needed |
| Sign-off and review model | **Opus 5.5 · medium** as a subagent with `model: opus` | A different model reviews the money arithmetic: what counts as revenue, cost when used, refunds, voided sales |
| Port audit | `port-auditor` on **Sonnet**, first: which engine values the P&L, Home profit, records and expenses screens read (`ledger`, `bought`, `spoilage`, `variances`, revenue/cost helpers ~3177-3194), and whether the ledger can be fed from the database | Same method as C2 |
| Literal code search | Explore subagent (Haiku) or codebase-memory-mcp | Never read the 4,000-line engine whole |
| Browser QA | **Required.** Built-in browser pane, live-mode build, local test owner (`localhost` only); a paid order, a stall sale, a receipt and a bake, then the P&L before and after and the CSV | See the C2 checkpoint in `current.md` for the recipe |
| Stop budget | 2 failed fix attempts or 25 turns | Written in the goal |
| Environment | Docker Desktop running; pinned toolchain on PATH; `pnpm.cmd` in Git Bash | See "Before starting" |

**Before E1 (open from C2, silent under-deduction):** binned dough and binned baked cookies are recorded only on the screen, so the database still counts them (mix 6, bin 2, bake 6 takes no
ingredients for the 2). Fix first, as its own small slice: a record for dough and baked-cookie waste written by the engine's `logSpoilage` (flavour and kind), subtracted from both
balances; also decide whether leftover baked cookies carry into the next drop (the engine carries them; `get_production` scopes them per drop). See the C2 checkpoint in `current.md`.

**Read first:** finish-plan E1, DP-04 in `decision-register.md`, the C1 and C2 checkpoints in `current.md`, `20260101004600_stock_ledger.sql` and
`20260101004700_production.sql` (the `use` movements), the init migration's `ledger_entries`, and the engine's P&L helpers.

**The slice (design, each a default Cine can change):** (1) a read RPC for the owner's P&L over a period: revenue (paid orders, minus refunds, plus stall sales), cost
(by the owner's DP-04 choice: when bought, or when used = the quantity used times the last price paid), expenses by her categories including wages, a drill-down per line.
(2) The ported P&L, Home profit and expense screens read it in live mode through `OpsRuntime` (no protected markup edit). (3) A CSV download of the same numbers.
(4) A correcting entry for a mistyped receipt cost (the C1 carry-over: the books are append-only).

```text
/goal E1 (docs/state/finish-plan.md slice E1): the P&L, Home profit and the expense screens show the database's books in live mode: revenue (paid orders less refunds,
plus stall sales), cost by the rule Ethan settles for DP-04 (when bought, or when used from the stock `use` movements at the last price paid), expenses by Cine's
categories including wages, a drill-down to each line, and a CSV download of the same numbers; plus a correcting entry for a wrong receipt cost. New migration (owner-only
read/record RPCs, SECURITY DEFINER, search_path '', in-function role check, explicit grants, direct writes stay revoked), the ported screens fed from OpsRuntime with no
protected-markup or engine edit unless the port audit forces one (then its own record and exact reversals, and stop and ask Ethan first). SQL role suite with a deliberate
regression per new rule, unit tests with a mutation per new branch, a port audit (Sonnet) first, and one different-model review (Opus). All exit 0 in this session: pnpm
verify, Python guards, the G0 validator (revert evidence/*.json churn), port integrity, pnpm build, test:pages:spike, test:workers:spike, test:e2e (baseline in current.md),
test:live:checkout, python scripts/test-db-security.py, and a visual pass in the browser pane over every screen touched (screenshots looked at: the P&L, Home profit, an
expense, the CSV). Committed and pushed; current.md checkpoint and task-status updated; this block replaced by the next goal from finish-plan section 6 (F1). No deploy.
Stop after 2 failed fix attempts or 25 turns.
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
