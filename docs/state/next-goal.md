# Next goal — shared by Claude Code and Codex

Paste **one** goal block into a **new conversation started in the repo root**.

- **Claude Code:** Opus or Sonnet, auto mode on, `/goal …`.
- **Codex:** the default profile (`gpt-6-sol` high), `/goal …`.

When a goal finishes, the agent deletes its block here, leaves the next one on top, and commits. Rules: [lean plan](lean-plan.md). Architecture A: direct `supabase-js`, with RLS as the boundary. G1 goals and the hosted preview are done (see [current state](current.md)). **G2 has started:** the order, principles and slices are in [G2-plan.md](G2-plan.md); take the top goal below.

## Before starting (once per conversation)

- Read only `AGENTS.md`, `docs/state/current.md`, this file, `docs/state/G2-plan.md` and `docs/state/decision-register.md` (the architecture-A rows).
- Locate code with codebase-memory-mcp (`search_graph`, `get_code_snippet`, `trace_path`), not by reading whole files. Read SQL migrations directly.
- If files changed since the last index, re-index first: `index_repository`, repo path `C:/Users/ethan/dev/happy-cookie-ops-g0`.
- Pinned toolchain: prefix PATH with `C:\Users\ethan\dev\happy-cookie-tools\bin;C:\Users\ethan\dev\happy-cookie-tools\node-v24.20.0-win-x64`.
- Docker Desktop must be running for SQL work.
- **Baseline (2026-09-28; `pnpm verify`, the SQL role suite and the Python guards re-run at MP-09 c1 close; the rest unchanged since the static-header goal):**
  - `pnpm verify` 42 files / 647 tests;
  - Python guards 63 OK, via `python -m unittest discover -s <dir> -p "test_*.py"` for each of `tests/unit`, `tests/integration/auth`, `tests/integration/db` and `tests/integration/security`, with `G0_PYTHON_LIBS=C:\Users\ethan\dev\happy-cookie-tools\python-libs-314`; SQL role suite 556 cases/reset, 2 resets;
  - `pnpm build:pages:spike`/`test:pages:spike`/`test:workers:spike` pass with or without `NEXT_PUBLIC_SUPABASE_URL`/`…PUBLISHABLE_KEY` (local stack values: `supabase status -o env`);
  - `pnpm build` passes, and `pnpm test:e2e` gives 87 passed / 3 failed / 30 skipped. The 3 failures are the same known OFFLINE-01 durable-queue test on phone, WebKit and desktop (G3).
- **Codex only:** run `/status` once in the repo root to confirm the project `.codex/config.toml` loaded. Accept the trust prompt if asked. The project sandbox has no network, so `git push` will ask for approval.

## Next goal — MP-09 c1b: flavour prices, publishing and the flavour editor (G2 slice 5, second part)

Drafted 2026-09-28 by the session that closed MP-09 c1 (see [current state](current.md)). c1 put the flavour
list on the database (`products` + `get_flavours`/`save_flavour`, migration 20260101003000) and applied the
engine exception for `PRODUCTS`/`ALLERGENS`; only the on-menu switch saves so far. **Not re-audited against the
code:** read `src/lib/data/flavours.ts`, `OpsRuntime.loadFlavours`, the engine's `setPrice`, the products screen
and the edit-price sheet first, and correct anything below the code contradicts.

```text
/goal MP-09 c1b (docs/state/order-form-audit.md, slice order item 2, rest): prices, publishing and a flavour
editor on the database. Price: capture the engine's setPrice and save the whole flavour through save_flavour
(pesos to centavos in src/lib/money.ts only; orders already placed keep their price, as the engine says);
conflict reloads with a toast, refusal or offline reverts. Publishing: an owner-only publish_flavours RPC in a
new migration (SECURITY DEFINER, search_path '', owner check first, explicit grants, role-suite cases) that
sets products.published, so the public shop's shop_products view shows the owner's menu; wire the live
customer shop to read shop_products through fetchShopFlavours (anon never reads products). Flavour editor:
name, short name, description, photo path, allergens, badge, permanent/rotating, cookie/set, capacity weight,
sort order, and adding a flavour, as a new owner form under the approved settings-edit-forms locked-UI
exception (Ethan confirmed 2026-09-28 that the editor falls under it; decision register. Record the exact UI
in protected-exception.md; no new colours or type). Unit tests for each save path and
the shop projection. All exit 0 in this session: pnpm verify, the SQL role suite, the Python guards, the G0
validator (revert evidence/*.json churn). Independent different-model review (SQL, public data). Committed and
pushed; status updated; block removed. No deploy. If it grows past ~400 lines, split the editor into c1c. Stop
after 2 failed fix attempts or 20 turns.
```

## After these goals

1. **Hosted preview: live (2026-09-27, see [current state](current.md)).** The route/CSP/cache oracle, anonymous RLS/RPC probes, `connect-src` proof, default-privilege probe and catalog RLS guard pass on the hosted project. Still open:
   - the direct-parent refresh probe and the `auth.sessions` checks, with a test account Ethan creates and signs in with himself;
   - move the local stack to Postgres 17 and revoke the PG17 MAINTAIN privilege from API roles in a reviewed migration.
2. **G2 (MP-09 → MP-17): started 2026-09-27**, see [G2-plan.md](G2-plan.md). Further goal blocks are written from that plan as each one finishes. Carry-overs:
   - Prove a trustworthy rate-limit caller key before anonymous checkout relies on `consume_rate_limit`.
   - Add the Supabase origin to `img-src` only when payment-proof images are displayed.
3. **G4 (operations):**
   - Keep-alive: Supabase pauses Free projects after about 7 days of low activity; its docs allow keep-alive API calls.
   - Weekly encrypted `supabase db dump` (Free has no automatic backups; DP-10).
   - `prune_personal_data` set to the owner's 1 year.
   - Shop privacy notice (locked-UI exception).
   - Dev-dependency audit (14 findings, 6 high).
   - CI green on `main` (`format:check` and E2E are known red) before any merge.
