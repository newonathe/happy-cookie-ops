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
- **Baseline (2026-09-29, at B3 close):**
  - `pnpm typecheck` clean; `pnpm verify` green (see current.md); port integrity OK, 54 files; G0 validator 1217 checks, 0 failures;
  - Python guards 63 OK, via `python -m unittest discover -s <dir> -p "test_*.py"` for each of `tests/unit`, `tests/integration/auth`, `tests/integration/db` and `tests/integration/security`, with `G0_PYTHON_LIBS=C:\Users\ethan\dev\happy-cookie-tools\python-libs-314`; SQL role suite 1175 cases/reset, 2 resets (`python scripts/test-db-security.py`, about 3 minutes);
  - `pnpm build:pages:spike`/`test:pages:spike`/`test:workers:spike` pass with or without `NEXT_PUBLIC_SUPABASE_URL`/`…PUBLISHABLE_KEY` (local stack values: `pnpm exec supabase status -o env`; the bare `supabase` binary is not on PATH);
  - `pnpm build` passes, and `pnpm test:e2e` gives 89 passed / 1 failed / 75 skipped with no Supabase variables set. The one failure is OFFLINE-01 on WebKit (Playwright's WebKit cannot reload offline with a service worker); desktop and phone pass;
  - `pnpm test:live:checkout`: 10 steps (needs `pnpm db:reset` first and the three local keys in the environment).
  - **Adding a migration touches more than SQL:** `tests/fixtures/mp08g-source-pins.json` (sha256, CRLF file), `tests/fixtures/function-authority.json` (a manifest entry per function and its body hash, regenerated from a reset local database), the function count in `tests/integration/security/test_function_authority.py`, `scripts/test-db-security.py` (suites, mutation maps, the asserted totals), `pnpm db:types`. A redefined function is mutated from its latest definition. The pre-commit hook runs `pnpm verify` and needs the pinned toolchain on PATH.
- **Codex only:** run `/status` once in the repo root to confirm the project `.codex/config.toml` loaded. Accept the trust prompt if asked. The project sandbox has no network, so `git push` will ask for approval.

## Next goal — B4 (MP-10 b): every September form feature

Drafted 2026-09-29 after B3 closed. The live checkout takes a name, Instagram, mobile, pickup date and time, a payment
method and flavours by the piece; `place_order` prices them from the menu. Cine's September form also has boxes, add-ons,
a sampler box and a same-day surcharge. This slice puts them on the server-priced order and on the live checkout, all
owner-configurable ("every form feature… configurable", 28 Sep).

**Read first:** the finish-plan.md B4 row, section 2 (the September form, page by page) and section 4 (findings 7 and 8:
conflicting packaging costs, the Nutella fries set of 4); `docs/state/protected-exception.md` (B2 checkout slot and B3
lookup slot: what is guarded, what is false and recorded); `supabase/migrations/20260101003800_shop_status.sql` (the
latest `place_order`, which this slice redefines: keep every rule tag, add new ones); `src/lib/data/orders.ts`,
`src/lib/data/order-flow.ts` and `src/components/live/live-checkout.tsx` (the live form is a live-only component; the
guarded slot in `checkout.tsx` already mounts it, so this slice should need no protected-markup edit); how B3 added
`staff_swap_item` (a swap keeps any part of the total that is not an item price: a surcharge must survive it).

**The slice:** (1) box sizes 6/8/12 with the fewer-than-6 bag rule and per-size prices, entered by the owner (finding 7:
nothing hard-coded); (2) add-ons: note card with a message, ribbon, stickers 1–4, sticker pack, each with an owner-set
price and an optional text (sticker number, note text, length-limited); (3) the sampler box as a bundle (quantity 1–3);
(4) same-day pickup at a percentage set by the owner (form: +40%), applied by the server; (5) all of it in server pricing
and in the capacity weights (a box takes its cookies' slots; the fries set of 4 already models `item_type = set`); (6) the
owner's screens show add-ons and the surcharge on an order (the mapper in `src/lib/data/staff-orders.ts` and the
message texts). Unresolved wording and prices are Cine's: use each default in finish-plan section 11, record placeholders.

**Carry-overs from B3:** helper access to pack and collect is an open decision (owner-only shipped); lapsed unpaid orders
still count on the bake list until cancelled (ask Cine); the overage sheet's "over by" mixes cookies and weighted slots;
no pickup code on the live status page; wording for every sentence `staff-copy.ts` and `copy.ts` mark PLACEHOLDER.

```text
/goal B4 (docs/state/finish-plan.md slice B4): every September form feature on the server-priced order. Box sizes 6/8/12
and bags, add-ons with sticker number and note text, the sampler bundle and the same-day percentage, all owner-configurable
(a new migration: tables or settings plus owner get/save RPCs with stale-stamp checks, SECURITY DEFINER, search_path '',
in-function role check, explicit grants), priced by the server in a redefined place_order (keep every rule tag; new rules
tagged; the harness picks the latest definition), capacity weights right, and the live checkout (live-only components; a
protected-markup edit needs its own record, exact reversals, port audit first) and the owner's order screens and messages
showing them; a swap or a surcharge never changes what a customer owes except the item difference. SQL role suite with a
deliberate regression per new rule, unit tests with a mutation per new branch, and one different-model review (Opus). All
exit 0 in this session: pnpm verify, Python guards, the G0 validator (revert evidence/*.json churn), port integrity, pnpm
build, test:pages:spike, test:workers:spike, test:e2e (baseline in current.md), test:live:checkout (extend it for one
add-on and the same-day surcharge), python scripts/test-db-security.py. Committed and pushed; current.md checkpoint and
task-status updated; this block replaced by the next goal from finish-plan section 6 (A3). No deploy. Stop after 2 failed
fix attempts or 25 turns.
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
