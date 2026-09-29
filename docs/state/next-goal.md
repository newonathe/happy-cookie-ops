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
- **Baseline (2026-09-29, at A2 close):**
  - `pnpm typecheck` clean; `pnpm verify` green (see current.md); port integrity OK, 54 files; G0 validator 1201 checks, 0 failures;
  - Python guards 63 OK, via `python -m unittest discover -s <dir> -p "test_*.py"` for each of `tests/unit`, `tests/integration/auth`, `tests/integration/db` and `tests/integration/security`, with `G0_PYTHON_LIBS=C:\Users\ethan\dev\happy-cookie-tools\python-libs-314`; SQL role suite 825 cases/reset, 2 resets (`python scripts/test-db-security.py`);
  - `pnpm build:pages:spike`/`test:pages:spike`/`test:workers:spike` pass with or without `NEXT_PUBLIC_SUPABASE_URL`/`…PUBLISHABLE_KEY` (local stack values: `supabase status -o env`);
  - `pnpm build` passes, and `pnpm test:e2e` gives 89 passed / 1 failed / 30 skipped. The one failure is OFFLINE-01 on WebKit (Playwright's WebKit cannot reload offline with a service worker); desktop and phone pass.
- **Codex only:** run `/status` once in the repo root to confirm the project `.codex/config.toml` loaded. Accept the trust prompt if asked. The project sandbox has no network, so `git push` will ask for approval.

## Next goal — B1 (MP-10 a, database): the order command

Drafted 2026-09-29 after A2 closed. Finish-plan.md slice B1 (section 6). D3 (the early production project) is
skipped unless Ethan confirms the pilot gate passes. B1 is database-only: B2 (live checkout) is the next app slice.

**Read first:** the finish-plan.md B1 row and section 4 (the order-form audit findings); `docs/state/order-form-audit.md`;
`docs/state/decision-register.md` rows for capacity (D1, D9), the pickup rules and the per-phone unpaid limit; the
existing capacity rule in `src/lib/rules/capacity.ts`, `capacity_allows()` and `tests/fixtures/capacity-cases.json`
(one rule, two runtimes: change all three in the same commit); the orders/order_items tables and `lookup_order`
in the migrations; and `supabase/migrations/20260101003400_payment_methods_shop_texts.sql` for the house style.

**Carry-overs that land here:**

1. `place_order` must check that the chosen payment method is one the owner currently offers
   (`payment_methods.active`, by label): the customer's page can be stale after the owner turns one off (A2 review).
2. The order's confirmation number is shown as "Invoice INV-…" by protected copy; F10 says "Order no." in live mode
   (a later guarded label, B2/B3): B1 only issues the number and never calls it an invoice.
3. No IP-based limit (the forwarded-IP header is caller-controlled): key on phone number plus the weekly cap.

```text
/goal B1 (docs/state/finish-plan.md slice B1): the order command, database half. `place_order` (anon may execute;
SECURITY DEFINER, search_path '', server-priced from the products table, never a client price or role; capacity by
the D1 rule with `capacity.ts`, `capacity_allows()` and `tests/fixtures/capacity-cases.json` changed together;
pickup date and window rules; the per-phone unpaid-order limit; a chosen payment method must be one the owner
offers; idempotent on a client id; returns the order number and an unguessable status token), `order_status(token)`,
and `join_waitlist`. No IP-keyed limits. New migration, explicit grants, in-function checks, RLS as the boundary.
A SQL role-suite file with a mutation check per rule; capacity parity green; DB types regenerated; the function
manifest, migration pin and harness counts updated. All exit 0 in this session: the pre-commit pnpm verify, the
Python guards, the G0 validator (revert evidence/*.json churn), the SQL role suite, port integrity. Opus review
(model opus) of the migration before commit. Committed and pushed; current.md checkpoint and task-status updated;
this block replaced by B2 from finish-plan section 6. No deploy. Stop after 2 failed fix attempts or 25 turns.
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
