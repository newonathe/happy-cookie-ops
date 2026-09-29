# Next goal — shared by Claude Code and Codex

Paste **one** goal block into a **new conversation started in the repo root**.

- **Claude Code:** build on **Sonnet 5 · high**; plan, sign off and review SQL/money/offline on **Opus 5.5 · medium**
  (the other model from the builder). Pick the model once per conversation; auto mode on; `/goal …`.
  Why: [finish-plan.md](finish-plan.md) section 8.2.
- **Codex:** the default profile (`gpt-6-sol` high), `/goal …`.

When a goal finishes, the agent deletes its block here, leaves the next one on top, and commits. Rules: [lean plan](lean-plan.md). Architecture A: direct `supabase-js`, with RLS as the boundary. G1 goals and the hosted preview are done (see [current state](current.md)). **The forward plan is [finish-plan.md](finish-plan.md)** (approved 2026-09-28 with every default; decisions F1–F10 in its section 11). It replaces the order in G2-plan.md; take the top goal below.

## Before starting (once per conversation)

- Read only `AGENTS.md` (auto-loaded), `docs/state/current.md` (short status), this file, and the [finish-plan.md](finish-plan.md) sections the goal names. Open `docs/state/decision-register.md` only for the rows the goal names.
- Locate code with codebase-memory-mcp (`search_graph`, `get_code_snippet`, `trace_path`), not by reading whole files. Read SQL migrations directly.
- If files changed since the last index, re-index first: `index_repository`, repo path `C:/Users/ethan/dev/happy-cookie-ops-g0`.
- Pinned toolchain: prefix PATH with `C:\Users\ethan\dev\happy-cookie-tools\bin;C:\Users\ethan\dev\happy-cookie-tools\node-v24.20.0-win-x64`. In Git Bash call `pnpm.cmd`: a bare `pnpm` resolves to the global npm shim first (it warns that the `pnpm` field is ignored).
- Docker Desktop must be running for SQL work, and for one Python guard (`tests/integration/db`).
- **Baseline (2026-09-29, at B2 close):**
  - `pnpm typecheck` clean; `pnpm verify` green (see current.md); port integrity OK, 54 files; G0 validator 1211 checks, 0 failures;
  - Python guards 63 OK, via `python -m unittest discover -s <dir> -p "test_*.py"` for each of `tests/unit`, `tests/integration/auth`, `tests/integration/db` and `tests/integration/security`, with `G0_PYTHON_LIBS=C:\Users\ethan\dev\happy-cookie-tools\python-libs-314`; SQL role suite 1000 cases/reset, 2 resets (`python scripts/test-db-security.py`);
  - `pnpm build:pages:spike`/`test:pages:spike`/`test:workers:spike` pass with or without `NEXT_PUBLIC_SUPABASE_URL`/`…PUBLISHABLE_KEY` (local stack values: `supabase status -o env`);
  - `pnpm build` passes, and `pnpm test:e2e` gives 89 passed / 1 failed / 30 skipped. The one failure is OFFLINE-01 on WebKit (Playwright's WebKit cannot reload offline with a service worker); desktop and phone pass.
- **Codex only:** run `/status` once in the repo root to confirm the project `.codex/config.toml` loaded. Accept the trust prompt if asked. The project sandbox has no network, so `git push` will ask for approval.

## Next goal — B3 (MP-12/13/14 lean): orders on the owner side

Drafted 2026-09-29 after B2 closed. Customers can now place orders (`place_order`), see them (`order_status`), find them
and join the waiting list; nothing on the owner's side reads them yet, so the orders, payments, bake and pack screens are
empty in live mode. This slice puts the owner and staff in front of those orders.

**Read first:** the finish-plan.md B3 row and section 4; `docs/state/protected-exception.md` (the B2 section: what is
guarded, what is false and recorded); `supabase/migrations/20260101003500_place_order.sql` (the order columns, the D1
capacity predicate `order_holds_capacity`, `order_rules`); `src/lib/data/order-flow.ts` and `src/store/ops-runtime.tsx`
(how the customer side reads and writes, and the F3 live form host the owner forms plug into); how A1/A2 loaded owner
data (`FlavourSync`, `PaymentSync`).

**The slice:** staff read and transition RPCs for orders (idempotent, `updated_at` checks, owner and helper roles as the
ported screens allow): the paid tick (`pay_state`), status changes, the swap of an unavailable flavour, pack and collect,
and the messages Cine copies to customers (status link and copy-paste text; proof stays in the DMs, F5); the orders and
payments screens read the database in live mode; the bake list counts unpaid orders too (28 Sep). The engine's local
`orders` list stays demo-only.

**Carry-overs from B2 that land here or before cutover:**

1. **The shop's open state must come from the server** (blocker for cutover). An anonymous customer's engine uses the
   default schedule, so the shop banner and the add buttons ignore the owner's window, and the owner's "close now"
   (`shopOverride`) is not on the server, so it stops nothing. Add a public read of the ordering window and the override,
   persist the override as a setting, make `place_order` honour it (a migration that redefines the function; extend
   `scripts/test-db-security.py` for the new rule), and feed the customer engine from it.
2. **Owner form for the order rules** (`get_order_rules`/`save_order_rules`): hold hours, unpaid orders per number, pickup
   days, lead days, pickup hours, the campus slot. A `LiveFormHost` form in All tools, like A2's payment methods.
3. The status page has no pickup code in live mode (`showCode` is false); decide with Cine whether collection needs one.
4. Direct URL `/lookup` still shows the ported page (protected copy promising email lookup). Ask Ethan before adding a
   second guarded slot in `find-my-order.tsx`.
5. Wording: every customer sentence in `src/lib/orders/copy.ts` is a placeholder except the closed-drop sentence; list
   the ones the owner screens add here too.

```text
/goal B3 (docs/state/finish-plan.md slice B3): orders on the owner side. Staff read and transition RPCs for orders
(SECURITY DEFINER, search_path '', in-function role check, explicit grants, idempotent, updated_at checks): the paid tick,
status transitions, the flavour swap, pack and collect, and the customer message texts; the orders and payments screens
read the database in live mode (a LiveFormHost form or the ported screens fed from view-model data; any protected-markup
edit needs its own record and exact reversals, port audit first); the bake list counts unpaid orders (28 Sep). Then the
B2 carry-overs in this file: the shop's open state and the owner's close-now read from and enforced by the server, and
the owner form for the order rules. SQL role suite with a deliberate regression per new rule, unit tests with a mutation
per new branch, and one different-model review (Opus). All exit 0 in this session: pnpm verify, Python guards, the G0
validator (revert evidence/*.json churn), port integrity, pnpm build, test:pages:spike, test:workers:spike, test:e2e
(baseline in current.md), test:live:checkout, python scripts/test-db-security.py. Committed and pushed; current.md
checkpoint and task-status updated; this block replaced by the next goal from finish-plan section 6. No deploy. Stop
after 2 failed fix attempts or 25 turns.
```

## After these goals

1. **Hosted preview: live (2026-09-27, see [current state](current.md)).** The route/CSP/cache oracle, anonymous RLS/RPC probes, `connect-src` proof, default-privilege probe and catalog RLS guard pass on the hosted project. Still open:
   - the direct-parent refresh probe and the `auth.sessions` checks, with a test account Ethan creates and signs in with himself;
   - move the local stack to Postgres 17 and revoke the PG17 MAINTAIN privilege from API roles in a reviewed migration.
2. **Remaining slices: [finish-plan.md](finish-plan.md) section 6.** The approved order after D2 is [D3 if
   the pilot gate passes by 20 Oct] → A2 → B1–B4 → A3–A4 → C1–C2 → E1 → F1–F4. Each next block is written from there when the previous one lands. Carry-overs:
   - Rate limiting for anonymous checkout: key on phone number plus the weekly cap, never the client IP (the gateway's forwarded-IP header is caller-controlled; finish-plan section 10).
   3. **G4 (operations):**
   - Keep-alive: Supabase pauses Free projects after about 7 days of low activity; its docs allow keep-alive API calls.
   - Weekly encrypted `supabase db dump` (Free has no automatic backups; DP-10).
   - `prune_personal_data` set to the owner's 1 year.
   - Shop privacy notice (locked-UI exception).
   - Dev-dependency audit (14 findings, 6 high).
   - CI green on `main` (`format:check` and E2E are known red) before any merge.
