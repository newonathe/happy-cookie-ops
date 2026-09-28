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
- **Baseline (2026-09-28; `pnpm typecheck`/`vitest`/port integrity/G0 validator re-run at MP-09 c1c (A1) close; the SQL role suite and Python guards unchanged since c1b — no migration in A1; the rest unchanged since the static-header goal):**
  - `pnpm typecheck` clean; `pnpm exec vitest run` 44 files / 688 tests; port integrity OK, 54 files; G0 validator 1201 checks, 0 failures;
  - Python guards 63 OK, via `python -m unittest discover -s <dir> -p "test_*.py"` for each of `tests/unit`, `tests/integration/auth`, `tests/integration/db` and `tests/integration/security`, with `G0_PYTHON_LIBS=C:\Users\ethan\dev\happy-cookie-tools\python-libs-314`; SQL role suite 570 cases/reset, 2 resets;
  - `pnpm build:pages:spike`/`test:pages:spike`/`test:workers:spike` pass with or without `NEXT_PUBLIC_SUPABASE_URL`/`…PUBLISHABLE_KEY` (local stack values: `supabase status -o env`);
  - `pnpm build` passes, and `pnpm test:e2e` gives 87 passed / 3 failed / 30 skipped. The 3 failures are the same known OFFLINE-01 durable-queue test on phone, WebKit and desktop (G3).
- **Codex only:** run `/status` once in the repo root to confirm the project `.codex/config.toml` loaded. Accept the trust prompt if asked. The project sandbox has no network, so `git push` will ask for approval.

## Next goal — D1 (MP-07 finish + MP-18/19 lean): bazaar sales, offline on one phone

Drafted 2026-09-28 after A1 closed (flavour editor + Publish menu, `docs/state/protected-exception.md`
"MP-09 c1c"). Finish-plan.md slice D1, sections 4 and 6; approved order puts D1 right after A1 so 24–25 Oct
stays reachable (section 6, F4).

**Current state (finding 14, finish-plan.md section 4):** the IndexedDB offline sale queue
(`src/lib/offline/queue.ts`) exists and `src/lib/offline/sync.ts` flushes it, but it posts to the archived BFF
route `/api/sync` (`src/app/api/sync/route.ts`), which architecture A no longer uses. `tests/e2e/bazaar-offline.spec.ts`
(OFFLINE-01) is the known-red test this slice must turn green — 3 failures across phone/WebKit/desktop per
[current state](current.md).

**Facts already decided:**

- One selling device at a time, any phone/tablet/laptop (decision register, decision 5); other devices stay
  online-only.
- Bazaar prices equal online prices (decision register DP-20) — an event price snapshot, not a live read, so a
  mid-event online price change never changes what a running bazaar charges.
- The bazaar date gate (finish-plan.md section 6, F4, approved): 24–25 Oct only if OFFLINE-01 and a real offline
  test on Cine's phone both pass by 20 Oct; otherwise she sells as today and 12–13 Dec is the pilot. This slice
  is what OFFLINE-01 gates on — it does not itself run the phone test or decide the gate.
- Needs A1: bazaar selling reads the flavour list A1's editor writes; it does not read payment accounts (A2).

**Not re-audited against the code.** Read these first: `src/lib/offline/queue.ts`, `src/lib/offline/sync.ts`,
`src/app/api/sync/route.ts` (what it is replacing), the bazaar screens and the `EventSale` type
(`src/store/engine/ops-engine.d.ts`), `OpsRuntime.runSync`/`syncNow` (`src/store/ops-runtime.tsx`), and
`tests/e2e/bazaar-offline.spec.ts` for what OFFLINE-01 actually asserts.

```text
/goal D1 (docs/state/finish-plan.md slice D1): bazaar sales, offline on one phone.
Events on the database (a new migration): one designated selling device per event (decision register, decision
5), an event price snapshot taken at event start so a later online price change never reaches a running event
(DP-20). Replace the archived /api/sync route with an idempotent record_event_sale RPC keyed on the sale's
client-generated id, callable while offline-queued and safely retried; wire OpsRuntime's existing IndexedDB
queue (src/lib/offline/queue.ts) and sync (src/lib/offline/sync.ts) to it instead of /api/sync. Void and
freebie sales, same idempotency. Never drop a queued sale the server has not acknowledged by clientId (AGENTS.md).
No protected-file edit expected; if one seems required, stop and say so first. Existing tokens only if any new
UI is needed. Unit tests for record_event_sale's idempotency (repeat delivery, out-of-order retry, void,
freebie) and the queue/sync rewiring, each with one mutation check. Must turn tests/e2e/bazaar-offline.spec.ts
(OFFLINE-01) green on at least the desktop project; report phone/WebKit results honestly, since the real
20-Oct gate also needs a physical-phone test this slice does not run. All exit 0 in this session: the
pre-commit pnpm verify, the Python guards, the G0 validator (revert evidence/*.json churn), the SQL role suite
(this slice adds a migration). Opus review (if this session is Sonnet, invoke it with model opus) for the new
RPC and the offline/idempotency logic. Committed and pushed; current.md checkpoint and task-status updated;
this block replaced by the next slice from finish-plan section 6 (D2, unless the OFFLINE-01 gate reopens D1).
No deploy. Stop after 2 failed fix attempts or 25 turns.
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
