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
- **Baseline (2026-09-29, at B1 close):**
  - `pnpm typecheck` clean; `pnpm verify` green (see current.md); port integrity OK, 54 files; G0 validator 1206 checks, 0 failures;
  - Python guards 63 OK, via `python -m unittest discover -s <dir> -p "test_*.py"` for each of `tests/unit`, `tests/integration/auth`, `tests/integration/db` and `tests/integration/security`, with `G0_PYTHON_LIBS=C:\Users\ethan\dev\happy-cookie-tools\python-libs-314`; SQL role suite 1000 cases/reset, 2 resets (`python scripts/test-db-security.py`);
  - `pnpm build:pages:spike`/`test:pages:spike`/`test:workers:spike` pass with or without `NEXT_PUBLIC_SUPABASE_URL`/`…PUBLISHABLE_KEY` (local stack values: `supabase status -o env`);
  - `pnpm build` passes, and `pnpm test:e2e` gives 89 passed / 1 failed / 30 skipped. The one failure is OFFLINE-01 on WebKit (Playwright's WebKit cannot reload offline with a service worker); desktop and phone pass.
- **Codex only:** run `/status` once in the repo root to confirm the project `.codex/config.toml` loaded. Accept the trust prompt if asked. The project sandbox has no network, so `git push` will ask for approval.

## Next goal — B2 (MP-10 a, app): the live checkout

Drafted 2026-09-29 after B1 closed. Finish-plan.md slice B2 (section 6): orders like her form, pay now or later.
B1 built the database half; B2 is the app half and needs one small migration of its own (carry-over 2).

**Read first:** the finish-plan.md B2 row and section 4; `docs/state/order-form-audit.md` (element inventory);
`docs/state/protected-exception.md` (D4: the checkout exception, and how A2 recorded its guarded edits);
`supabase/migrations/20260101003500_place_order.sql` (the contract: keys, SQLSTATEs, rules) and its checkpoint in
[current.md](current.md); `src/lib/data/payments.ts` (how A2 reads an anonymous RPC); `checkout.tsx` and `status.tsx`
under `src/components/screens/`.

**Carry-overs that land here:**

1. **Wording for refusals.** `place_order` refuses with ZC001 closed, ZC002 not enough room (DETAIL = slots left),
   ZC003 too many unpaid orders on the number, ZC004 pickup date or time, ZC005 method not offered, ZC006 waitlist
   limit, 22023 malformed, 23505 id reused. Only the closed-drop sentence is signed off (`DROP_CLOSED_MESSAGE`);
   the others need Cine's words, so show the honest placeholder pattern of `capacityRefusal()` and list them for her.
2. **Find my order by number and phone.** `lookup_order` is service_role-only; B1 issues the status link by token
   only. Add the small anonymous RPC B2 needs (order number + phone in, status out, no enumeration, no personal
   text back) in a new migration with its suite cases, or decide with Ethan that the link alone is enough.
3. **Phone form.** The database accepts `09XXXXXXXXX`, `+63…`, `63…` and `9XXXXXXXXX` (all normalised to `09…`).
   The checkout may send what the customer typed.
4. **One client id per attempt.** Generate a lowercase uuid when the checkout opens and reuse it on every retry:
   the server answers a repeat with the same order and token, and refuses the same id with a different body.
5. **Close-drop early is not on the server.** The engine's `shopOverride` is not saved to the database, so
   `place_order` cannot see it; persist it (a setting) before the live checkout ships, or the owner's "close now"
   button will not stop orders.
6. **"Invoice INV-…" wording** becomes "Order no." in live mode (F10), under the same guarded slot.
7. **Owner form for the order rules** (`get_order_rules`/`save_order_rules`): hold hours, unpaid orders per number,
   pickup days, lead days, pickup hours and the campus slot. No screen edits them yet; a `LiveFormHost` form in All
   tools, as A2 did for payment methods, is the natural place (this slice or B3).

```text
/goal B2 (docs/state/finish-plan.md slice B2): the live checkout, app half. In live mode only, one guarded slot in
checkout.tsx (D4, recorded in protected-exception.md with exact reversals in scripts/validate-g0.py and baselines
regenerated in the same commit): the fields of her form (name, Instagram, contact number, pickup date from the
owner's pickup days and lead time, pickup time or the campus slot, payment method from get_shop_payment_info, an
optional reference), no email and no address. A `custSubmit` override in OpsRuntime calls place_order with a client
id per attempt, maps the SQLSTATEs to messages, and shows the order number and status link; the status page reads
order_status(token); lookup by order number + phone and the waitlist (join_waitlist) as the audit lists them. Demo
mode is unchanged. Port audit, an E2E happy path against the local stack, unit tests with a deliberate mutation per
new branch, and one different-model review of the guarded edits. All exit 0 in this session: pnpm verify, Python
guards, the G0 validator (revert evidence/*.json churn), port integrity, pnpm build, test:pages:spike,
test:workers:spike, test:e2e (baseline: only OFFLINE-01 on WebKit red). Committed and pushed; current.md checkpoint
and task-status updated; this block replaced by B3 from finish-plan section 6. No deploy. Stop after 2 failed fix
attempts or 25 turns.
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
