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
- **Baseline (2026-09-28; `pnpm verify`, the SQL role suite, the Python guards and the G0 validator re-run at MP-09 c1b close; the rest unchanged since the static-header goal):**
  - `pnpm verify` 43 files / 671 tests;
  - Python guards 63 OK, via `python -m unittest discover -s <dir> -p "test_*.py"` for each of `tests/unit`, `tests/integration/auth`, `tests/integration/db` and `tests/integration/security`, with `G0_PYTHON_LIBS=C:\Users\ethan\dev\happy-cookie-tools\python-libs-314`; SQL role suite 570 cases/reset, 2 resets; G0 validator 1198 checks, 0 failures;
  - `pnpm build:pages:spike`/`test:pages:spike`/`test:workers:spike` pass with or without `NEXT_PUBLIC_SUPABASE_URL`/`…PUBLISHABLE_KEY` (local stack values: `supabase status -o env`);
  - `pnpm build` passes, and `pnpm test:e2e` gives 87 passed / 3 failed / 30 skipped. The 3 failures are the same known OFFLINE-01 durable-queue test on phone, WebKit and desktop (G3).
- **Codex only:** run `/status` once in the repo root to confirm the project `.codex/config.toml` loaded. Accept the trust prompt if asked. The project sandbox has no network, so `git push` will ask for approval.

## Next goal — A1 (MP-09 c1c): the flavour editor and the "Publish menu" button

Drafted 2026-09-28; re-planned the same day in [finish-plan.md](finish-plan.md) (slice A1, sections 4 and 6).
**Current state:**
- c1b made prices save through `save_flavour` and added `publish_flavours` (migration 20260101003100).
- The live customer shop shows only the published menu.
- **Nothing in the app calls `publish_flavours` yet**, so the live shop is empty until this slice ships the button.

**Facts found in c1b and in the 2026-09-28 audit:**
- The products screen has no "edit flavour" or "add flavour" control.
- Every sheet body is registered in the protected `src/components/shell/app-frame.tsx`.
- "All tools" is built from view-model data (`toolGroups`), so new entry points need no markup edit.
- The engine's render paths name the ported ids (`wcb`, `rvc`, `pbm`). Products are never deleted, so keep that.
- New October flavours need photos. Until owner uploads arrive (A2), their images are static files Ethan adds
  under the existing assets folder.

**Decision F3 is approved (2026-09-28):** build one reviewed, live-only form host in `app-frame.tsx` that later
owner forms plug into. Its record in protected-exception.md must say it covers the later owner forms, each still
listed there as it lands.

**Not re-audited against the code.** Read these first: `FlavourSync`, `OpsRuntime.loadShopMenu` and `renderVals`,
`products.tsx`, the sheet list in `app-frame.tsx`, and the `LIVE_FRAME_REVERSALS` pattern.

```text
/goal A1 (docs/state/finish-plan.md slice A1): the owner's flavour editor and "Publish menu" in live mode.
Editor: name, short name, description, photo path, allergens, badge, permanent/rotating, cookie/set, capacity
weight, sort order and price, plus adding a flavour (new flavours are drafts: unpublished until the next
publish), saved whole through FlavourSync/save_flavour with the same conflict/refusal/offline paths. Publish:
a button that calls FlavourSync.publish() (every flavour) and says what customers will now see. Entry points:
a "Menu & flavours" item added to toolGroups in OpsRuntime.renderVals (no markup edit), and the products
screen's "Edit price" opening the editor in live mode. Form container: the approved live form host (F3), live owner only, with demo, dev, CI and the visual
baselines byte-identical; recorded exactly in protected-exception.md; exact reversals in scripts/validate-g0.py;
port-baseline.json only via --update in the same commit; existing tokens only (no new colours or type). Unit
tests for each save path, the publish refresh and the live-only rendering, each with one mutation check. All
exit 0 in this session: the pre-commit pnpm verify, the Python guards, the G0 validator (revert
evidence/*.json churn); the SQL role suite only if SQL changes. Independent port audit and a different-model
review (if this session is Sonnet, invoke the reviewers with model opus). Committed and pushed; current.md
checkpoint and task-status updated; this block replaced by the next
slice from finish-plan section 6. No deploy. Stop after 2 failed fix attempts or 25 turns.
```

## After these goals

1. **Hosted preview: live (2026-09-27, see [current state](current.md)).** The route/CSP/cache oracle, anonymous RLS/RPC probes, `connect-src` proof, default-privilege probe and catalog RLS guard pass on the hosted project. Still open:
   - the direct-parent refresh probe and the `auth.sessions` checks, with a test account Ethan creates and signs in with himself;
   - move the local stack to Postgres 17 and revoke the PG17 MAINTAIN privilege from API roles in a reviewed migration.
2. **Remaining slices: [finish-plan.md](finish-plan.md) section 6.** The approved order after A1 is D1 → D2 → [D3 if
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
