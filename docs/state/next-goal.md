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
- **Baseline (2026-09-30, at B4b close):**
  - `pnpm typecheck` clean; `pnpm verify` green, 60 files / 1110 tests (see current.md); port integrity OK, 54 files; G0 validator 1217 checks, 0 failures;
  - Python guards 63 OK, via `python -m unittest discover -s <dir> -p "test_*.py"` for each of `tests/unit`, `tests/integration/auth`, `tests/integration/db` and `tests/integration/security`, with `G0_PYTHON_LIBS=C:\Users\ethan\dev\happy-cookie-tools\python-libs-314`; SQL role suite 1318 cases/reset, 2 resets (`python scripts/test-db-security.py`, about 3 minutes);
  - `pnpm build:pages:spike`/`test:pages:spike`/`test:workers:spike` pass with or without `NEXT_PUBLIC_SUPABASE_URL`/`…PUBLISHABLE_KEY` (local stack values: `pnpm exec supabase status -o env`; the bare `supabase` binary is not on PATH);
  - `pnpm build` passes, and `pnpm test:e2e` gives 89 passed / 1 failed / 75 skipped with no Supabase variables set. The one failure is OFFLINE-01 on WebKit (Playwright's WebKit cannot reload offline with a service worker); desktop and phone pass;
  - `pnpm test:live:checkout`: 11 steps (needs `pnpm db:reset` first and the three local keys in the environment).
  - **Adding a migration touches more than SQL:** `tests/fixtures/mp08g-source-pins.json` (sha256, CRLF file), `tests/fixtures/function-authority.json` (a manifest entry per function and its body hash, regenerated from a reset local database), the function count in `tests/integration/security/test_function_authority.py`, `scripts/test-db-security.py` (suites, mutation maps, the asserted totals), `pnpm db:types`. A redefined function is mutated from its latest definition. The pre-commit hook runs `pnpm verify` and needs the pinned toolchain on PATH.
- **Codex only:** run `/status` once in the repo root to confirm the project `.codex/config.toml` loaded. Accept the trust prompt if asked. The project sandbox has no network, so `git push` will ask for approval.

## Next goal — D4: the bazaar events list (Cine adds her real bookings)

Drafted 2026-09-30 after B4 closed; approved by Ethan on 2026-09-29 (finish-plan D4 row). Today the Bazaar screen's "Start an
event" list is two hard-coded prototype events inside the protected engine (`bazaarVals`, `events:`), with no way to add one, and
none of the fields she needs (place, rent). Her bookings are 24-25 Oct and 12-13 Dec, both accepted, with rent. D1 and D2 built
selling, close-out, event stock, expenses and event profit; this slice gives her the list to start them from. It runs before the
20 Oct pilot gate.

### Session settings (set these before pasting the goal)

| Setting | Value | Why |
| --- | --- | --- |
| Conversation | **New**, started in the repo root (`C:/Users/ethan/dev/happy-cookie-ops-g0`) | One slice per conversation; hooks, agents and `.mcp.json` load only from the root |
| Builder model · reasoning effort | **Sonnet 5 · high** | finish-plan section 6 row D4; section 8.2 |
| Plan mode | **Off** | The goal block is the approval (AGENTS.md "Working agreement" 2). Turn it on only if the port audit forces a protected-markup edit |
| Permission mode | **Auto mode on** | finish-plan 8.1 |
| Fast mode | Off | Not needed |
| Sign-off and review model | **Opus 5.5 · medium** as a subagent with `model: opus` on the invocation | A different model reviews SQL, money and offline (lean plan rule 4). This slice: the migration, the RPCs and the rent-to-expense path |
| Port audit | `port-auditor` on **Sonnet**, before any edit near protected markup | The Bazaar screen and the engine's `bazaarVals` are protected: the list must come from a runtime post-process (the B3/B4b pattern), not an edit |
| Literal code search | Explore subagent (Haiku) or codebase-memory-mcp | Cheapest; never read the 4,000-line engine whole |
| Browser QA | **Required.** Built-in browser pane (allowed by Ethan, 2026-09-29): live-mode build, local test owner (`localhost` only), same-origin database proxy if his Chrome times out on port 54321 (recipe in the B4b notes of `current.md` history and the memory file). Add an event in the form, see it on the Bazaar screen, start it, place a test sale, close it, see the rent as an event expense | Ethan asked for visual QA of everything |
| Stop budget | 2 failed fix attempts or 25 turns | Written in the goal |
| Environment | Docker Desktop running; pinned toolchain on PATH; `pnpm.cmd` in Git Bash | See "Before starting" |

**Read first:** finish-plan D4, D1, D2 rows and section 4 finding 15; the D1 and D2 checkpoints in `docs/state/current-history.md`;
`supabase/migrations/20260101003200_bazaar_events.sql` and `20260101003300_bazaar_closeout.sql` (the `events` table has `name`,
`starts_at`, `ends_at`, `float_cents`, `closed_at`; `start_event(text, text, bigint, uuid)`; the expense RPC `add_event_expense`);
`src/store/engine/ops-engine.js` `bazaarVals` (the hard-coded `events` value, ~line 3045) and `startEvent`; `src/store/ops-runtime.tsx`
(`startLiveEvent`, the bazaar wrappers, `renderVals` post-processing, the B4a "Boxes & add-ons" form as the pattern for an owner
form on the live form host); `src/lib/data/order-extras.ts` and `src/components/live/order-extras-form.tsx` (the pattern:
`get`/`save` with a stale stamp, exact keys, a strict parser, pesos on screen and centavos on the wire).

**The slice (design, each a default Cine can change):** (1) a `scheduled_events` table (name, start and end date, place, rent in
centavos, active, `updated_at`) with owner-only get/save RPCs in the settings pattern (stale stamp, exact keys, `SECURITY DEFINER`,
`search_path ''`, in-function role check, explicit grants, idempotent); deactivate instead of delete. (2) An "Add event" form on the
live form host under All tools (name, start and end date, place, rent), no protected markup. (3) In live mode `OpsRuntime` replaces the
`events` value of the Bazaar vals with her active upcoming events (name, "date · place", and a `go` that starts it), engine untouched.
(4) Starting one passes its id to `start_event` (a new optional parameter, or a new function) so the event row carries the schedule's
dates; the rent becomes an event expense at close-out (or when the event starts) through the existing expense path, category
"Bazaar rent" (the engine already uses that category name). (5) Past events drop off the list; an event already started is not offered
twice. (6) The 24-25 Oct and 12-13 Dec bookings are entered by Cine in the app, never seeded.

**Carry-overs:** the recorded B4b items in `current.md` (same-day across midnight, boxes for non-cookie sets, extras on the status
page); a direct load of a staff URL lands on Home in live mode (not investigated); helper access to pack and collect; wording for
every sentence marked PLACEHOLDER.

```text
/goal D4 (docs/state/finish-plan.md slice D4): Cine adds her real bazaar bookings (name, start and end date, place, rent) in an owner
form, and the Bazaar screen lists them in live mode instead of the two hard-coded prototype events; starting one opens the event with
its dates, and its rent becomes an event expense. New migration (a scheduled-events table and owner get/save RPCs with stale-stamp
checks, SECURITY DEFINER, search_path '', in-function role check, explicit grants), the list from an OpsRuntime post-process with no
protected-markup or engine edit unless the port audit forces one (then its own record and exact reversals). SQL role suite with a
deliberate regression per new rule, unit tests with a mutation per new branch, a port audit (Sonnet) before any edit near protected
markup, and one different-model review (Opus). All exit 0 in this session: pnpm verify, Python guards, the G0 validator (revert
evidence/*.json churn), port integrity, pnpm build, test:pages:spike, test:workers:spike, test:e2e (baseline in current.md),
test:live:checkout, python scripts/test-db-security.py, and a visual pass in the browser pane over every screen touched
(screenshots looked at: the form, the Bazaar list, starting an event, a test sale, the close-out with the rent). Committed and pushed;
current.md checkpoint and task-status updated; this block replaced by the next goal from finish-plan section 6 (A3). No deploy. Stop
after 2 failed fix attempts or 25 turns.
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
