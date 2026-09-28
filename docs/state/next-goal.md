# Next goal — shared by Claude Code and Codex

Paste **one** goal block into a **new conversation started in the repo root**.

- **Claude Code:** Opus or Sonnet, auto mode on, `/goal …`.
- **Codex:** the default profile (`gpt-6-sol` high), `/goal …`.

When a goal finishes, the agent deletes its block here, leaves the next one on top, and commits. Rules: [lean plan](lean-plan.md). Architecture A: direct `supabase-js`, with RLS as the boundary. G1 goals and the hosted preview are done (see [current state](current.md)). **G2 has started:** the order, principles and slices are in [G2-plan.md](G2-plan.md); take the top goal below.

## Before starting (once per conversation)

- Read only `AGENTS.md`, `docs/state/current.md`, this file, `docs/state/G2-plan.md` and `docs/state/decision-register.md` (the architecture-A rows).
- Locate code with codebase-memory-mcp (`search_graph`, `get_code_snippet`, `trace_path`), not by reading whole files. Read SQL migrations directly.
- If files changed since the last index, re-index first: `index_repository`, repo path `C:/Users/ethan/dev/happy-cookie-ops-g0`.
- Pinned toolchain: prefix PATH with `C:\Users\ethan\dev\happy-cookie-tools\bin;C:\Users\ethan\dev\happy-cookie-tools\node-v24.20.0-win-x64`. In Git Bash call `pnpm.cmd`: a bare `pnpm` resolves to the global npm shim first (it warns that the `pnpm` field is ignored).
- Docker Desktop must be running for SQL work, and for one Python guard (`tests/integration/db`).
- **Baseline (2026-09-28; `pnpm verify`, the SQL role suite, the Python guards and the G0 validator re-run at MP-09 c1b close; the rest unchanged since the static-header goal):**
  - `pnpm verify` 43 files / 671 tests;
  - Python guards 63 OK, via `python -m unittest discover -s <dir> -p "test_*.py"` for each of `tests/unit`, `tests/integration/auth`, `tests/integration/db` and `tests/integration/security`, with `G0_PYTHON_LIBS=C:\Users\ethan\dev\happy-cookie-tools\python-libs-314`; SQL role suite 570 cases/reset, 2 resets; G0 validator 1198 checks, 0 failures;
  - `pnpm build:pages:spike`/`test:pages:spike`/`test:workers:spike` pass with or without `NEXT_PUBLIC_SUPABASE_URL`/`…PUBLISHABLE_KEY` (local stack values: `supabase status -o env`);
  - `pnpm build` passes, and `pnpm test:e2e` gives 87 passed / 3 failed / 30 skipped. The 3 failures are the same known OFFLINE-01 durable-queue test on phone, WebKit and desktop (G3).
- **Codex only:** run `/status` once in the repo root to confirm the project `.codex/config.toml` loaded. Accept the trust prompt if asked. The project sandbox has no network, so `git push` will ask for approval.

## Next goal — MP-09 c1c: the flavour editor and the "Publish menu" button (G2 slice 5, third part)

Drafted 2026-09-28 by the session that closed MP-09 c1b (see [current state](current.md)). c1b made prices save
through `save_flavour`, added `publish_flavours` (migration 20260101003100) and made the live customer shop
show only the published menu; **nothing in the app calls `publish_flavours` yet**, so the live shop shows no
flavours until this slice ships the button. Found in c1b, and why the editor was split out: the products screen
has no "edit flavour" or "add flavour" control, and every sheet is registered in the protected
`src/components/shell/app-frame.tsx`, so the editor needs guarded protected-markup insertions (live mode only),
exact reversals in `scripts/validate-g0.py`, `port-baseline.json --update` and an independent port audit.
Also found: the engine's render paths name the ported ids (`wcb`, `rvc`, `pbm`), so a flavour list without
them crashes every screen; products are never deleted, so staff always have them, but keep that in mind.
**Not re-audited against the code:** read `FlavourSync`, `OpsRuntime.loadShopMenu`, `products.tsx`,
`app-frame.tsx`'s sheet list and the `LIVE_FRAME_REVERSALS` pattern first.

```text
/goal MP-09 c1c (docs/state/order-form-audit.md, slice order item 2, last part): the owner's flavour editor
and "Publish menu" in live mode. Editor: name, short name, description, photo path, allergens, badge,
permanent/rotating, cookie/set, capacity weight, sort order and price, plus adding a flavour (new flavours are
drafts: unpublished until the next publish), saved whole through FlavourSync/save_flavour with the same
conflict/refusal/offline paths. Publish: a button that calls FlavourSync.publish() (every flavour) and says
what customers will now see. New owner-only UI under the approved settings-edit-forms locked-UI exception
(Ethan confirmed 2026-09-28 that the editor falls under it; decision register): the smallest guarded
insertions in protected markup (live owner only; demo, dev, CI and the visual baselines byte-identical),
recorded exactly in protected-exception.md, registered as exact reversals in scripts/validate-g0.py,
port-baseline.json only via --update in the same commit; new components from existing tokens only (no new
colours or type). Unit tests for each save path and the live-only rendering. All exit 0 in this session:
pnpm verify, the Python guards, the G0 validator (revert evidence/*.json churn); the SQL role suite only if
SQL changes. Independent port audit and a different-model review. Committed and pushed; status updated;
block removed. No deploy. Stop after 2 failed fix attempts or 20 turns.
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
