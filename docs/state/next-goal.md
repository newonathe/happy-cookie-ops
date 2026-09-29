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
- **Baseline (2026-09-29, at D1 close):**
  - `pnpm typecheck` clean; `pnpm verify` 46 files / 714 tests; port integrity OK, 54 files; G0 validator 1201 checks, 0 failures;
  - Python guards 63 OK, via `python -m unittest discover -s <dir> -p "test_*.py"` for each of `tests/unit`, `tests/integration/auth`, `tests/integration/db` and `tests/integration/security`, with `G0_PYTHON_LIBS=C:\Users\ethan\dev\happy-cookie-tools\python-libs-314`; SQL role suite 657 cases/reset, 2 resets (`python scripts/test-db-security.py`);
  - `pnpm build:pages:spike`/`test:pages:spike`/`test:workers:spike` pass with or without `NEXT_PUBLIC_SUPABASE_URL`/`…PUBLISHABLE_KEY` (local stack values: `supabase status -o env`);
  - `pnpm build` passes, and `pnpm test:e2e` gives 89 passed / 1 failed / 30 skipped. The one failure is OFFLINE-01 on WebKit (Playwright's WebKit cannot reload offline with a service worker); desktop and phone pass.
- **Codex only:** run `/status` once in the repo root to confirm the project `.codex/config.toml` loaded. Accept the trust prompt if asked. The project sandbox has no network, so `git push` will ask for approval.

## Next goal — D2 (MP-20 lean): bazaar close-out

Drafted 2026-09-29 after D1 closed (`docs/state/current.md`, D1 checkpoint). Finish-plan.md slice D2, sections 4 and 6:
event stock, expenses, cash count and event profit. D3 follows only if the 24–25 Oct gate passes.

**Already in place from D1:** events on the database with a price snapshot and one selling device
(`start_event`, `set_event_device`), idempotent `record_event_sale` / `void_event_sale`, `events.closed_at` (sales made
before it are still accepted late; later ones are refused, 55000), `events.float_cents`, and the phone-side
`OpsRuntime` wrappers and `hc-live-bazaar` state. Read `supabase/migrations/20260101003200_bazaar_events.sql` first.

**Carry-overs from D1 review that this slice should close:**

- A flavour that was inactive when the event started is still on the sell grid; its sales are refused and stay queued
  as failed. Stock loading here must only offer flavours in the event's `price_snapshot`.
- E1's revenue must skip `event_sales` rows with `voided_at`.
- Helper access to selling waits for DP-18 (owner-only today).
- Surface a permanently refused sale (22023/23505/42501) as such, not as a network failure.

```text
/goal D2 (docs/state/finish-plan.md slice D2): bazaar close-out — event stock, expenses, cash count and event profit.
On top of D1's events: stock loaded onto the table and returned at close, event expenses (rent and the categories
Cine sets, decision register) posted as ledger costs against the event, a cash count against float plus cash sales
(voided sales excluded), and an idempotent owner-only close_event RPC that sets closed_at (D1 already refuses later
sales), stores the counts, and returns event profit. New migration, SECURITY DEFINER, search_path '', explicit grants,
in-function role check, a SQL role-suite file with a mutation check per rule. Wire the bazaar close-out through
OpsRuntime wrappers over the existing engine actions; no protected-file edit expected, and if one seems required, stop
and say so first. Existing tokens only. Unit tests for the new client code, each with one mutation check. Also close the
D1 carry-overs above. All exit 0 in this session: the pre-commit pnpm verify, the Python guards, the G0 validator
(revert evidence/*.json churn), the SQL role suite. Opus review (if this session is Sonnet, invoke it with model opus)
for the new RPC and money logic. Committed and pushed; current.md checkpoint and task-status updated; this block
replaced by the next slice from finish-plan section 6 (D3 only if the pilot gate passes, otherwise A2). No deploy.
Stop after 2 failed fix attempts or 25 turns.
```

## After these goals

1. **Hosted preview: live (2026-09-27, see [current state](current.md)).** The route/CSP/cache oracle, anonymous RLS/RPC probes, `connect-src` proof, default-privilege probe and catalog RLS guard pass on the hosted project. Still open:
   - the direct-parent refresh probe and the `auth.sessions` checks, with a test account Ethan creates and signs in with himself;
   - move the local stack to Postgres 17 and revoke the PG17 MAINTAIN privilege from API roles in a reviewed migration.
2. **Remaining slices: [finish-plan.md](finish-plan.md) section 6.** The approved order after D1 is D2 → [D3 if
   the pilot gate passes by 20 Oct] → A2 → B1–B4 → A3–A4 → C1–C2 → E1 → F1–F4. Each next block is written from there when the previous one lands. Carry-overs:
   - Rate limiting for anonymous checkout: key on phone number plus the weekly cap, never the client IP (the gateway's forwarded-IP header is caller-controlled; finish-plan section 10).
   - Add the Supabase origin to `img-src` when owner-uploaded images (A2: QR codes, flavour photos) are first displayed.
3. **G4 (operations):**
   - Keep-alive: Supabase pauses Free projects after about 7 days of low activity; its docs allow keep-alive API calls.
   - Weekly encrypted `supabase db dump` (Free has no automatic backups; DP-10).
   - `prune_personal_data` set to the owner's 1 year.
   - Shop privacy notice (locked-UI exception).
   - Dev-dependency audit (14 findings, 6 high).
   - CI green on `main` (`format:check` and E2E are known red) before any merge.
