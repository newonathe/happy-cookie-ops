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
- **Baseline (2026-09-29, at B4a close):**
  - `pnpm typecheck` clean; `pnpm verify` green, 57 files / 1052 tests (see current.md); port integrity OK, 54 files; G0 validator 1217 checks, 0 failures;
  - Python guards 63 OK, via `python -m unittest discover -s <dir> -p "test_*.py"` for each of `tests/unit`, `tests/integration/auth`, `tests/integration/db` and `tests/integration/security`, with `G0_PYTHON_LIBS=C:\Users\ethan\dev\happy-cookie-tools\python-libs-314`; SQL role suite 1318 cases/reset, 2 resets (`python scripts/test-db-security.py`, about 3 minutes);
  - `pnpm build:pages:spike`/`test:pages:spike`/`test:workers:spike` pass with or without `NEXT_PUBLIC_SUPABASE_URL`/`…PUBLISHABLE_KEY` (local stack values: `pnpm exec supabase status -o env`; the bare `supabase` binary is not on PATH);
  - `pnpm build` passes, and `pnpm test:e2e` gives 89 passed / 1 failed / 75 skipped with no Supabase variables set. The one failure is OFFLINE-01 on WebKit (Playwright's WebKit cannot reload offline with a service worker); desktop and phone pass;
  - `pnpm test:live:checkout`: 10 steps (needs `pnpm db:reset` first and the three local keys in the environment).
  - **Adding a migration touches more than SQL:** `tests/fixtures/mp08g-source-pins.json` (sha256, CRLF file), `tests/fixtures/function-authority.json` (a manifest entry per function and its body hash, regenerated from a reset local database), the function count in `tests/integration/security/test_function_authority.py`, `scripts/test-db-security.py` (suites, mutation maps, the asserted totals), `pnpm db:types`. A redefined function is mutated from its latest definition. The pre-commit hook runs `pnpm verify` and needs the pinned toolchain on PATH.
- **Codex only:** run `/status` once in the repo root to confirm the project `.codex/config.toml` loaded. Accept the trust prompt if asked. The project sandbox has no network, so `git push` will ask for approval.

## Next goal — B4b (MP-10 b): boxes, add-ons, the sampler and same-day on the live checkout and the owner's order screens

Drafted 2026-09-29 after B4a closed. B4a put the September form's extras on the database: `place_order` prices boxes,
add-ons, the sampler cap and the same-day surcharge from the owner's configuration (`order_extras`, migration
`20260101004000_order_extras.sql`), `order_status` and `get_staff_orders` return the add-ons, boxes and surcharge, and the
owner edits it all in "Boxes & add-ons" (All tools). Customers cannot use any of it yet: the live checkout sends no `add_ons`
or `boxes`, offers no same-day date, and the owner's order screens show only the items. This slice closes that.

**Read first:** the B4a checkpoint in `docs/state/current.md`; the header comment and the `place_order` body of
`supabase/migrations/20260101004000_order_extras.sql` (the payload shape and every refusal: `ZC007` = a box size or add-on
that is no longer offered, `ZC004` also covers same-day off and a time already past, `22023` the rest); `src/lib/data/order-extras.ts`
(the owner side; the customer read `get_shop_extras()` has no parser yet: write `parseShopExtras` beside it, like
`parseShopOrderRules` in `src/lib/orders/pickup.ts`); `src/components/live/live-checkout.tsx`, `src/lib/data/orders.ts`,
`src/lib/data/order-flow.ts`, `src/lib/orders/pickup.ts`, `src/lib/orders/copy.ts`; `src/lib/data/staff-orders.ts`
(`toEngineOrder`), `src/lib/orders/messages.ts`, `src/components/live/order-messages.tsx`; `docs/state/protected-exception.md`.

**Decisions already taken (finish-plan B4 plan; each is a default Cine can change):**

1. **No protected-markup edit.** Owner totals: `toEngineOrder` puts the non-item part of the total (add-ons + boxes + surcharge,
   pesos) in a reserved key of `priced` (`__extras`; grep every reader of `o.priced` keys first). `boxTotal` is a class-field
   arrow in the engine: override it as an **instance field in the `OpsRuntime` constructor** (as for `custSubmit`), and in live
   mode do **not** call the base (it applies `priceMode`, `packagingFee`, `flatBox`, which the server never uses): live formula
   = Σ `priceOf(k, priced) × qty` + `priced.__extras`. Demo mode and the customer cart call (`boxTotal(c.box, s.prices)`) keep the base.
2. **Order detail and orders list**: append `lines` rows in the B3 post-process (`liveOrderDetail`, and the list): one per add-on
   ("Sticker no. 2"), per box ("Box of 6") and "Same-day pickup (+40%)", with a neutral swatch `imgStyle`, `inStock: true`,
   `out: false`, `flagLabel: 'Extra'` and a no-op `flag`. `orders.tsx` shows name, qty, line only; `order-detail.tsx` also renders the
   flag button. Neither markup file changes. Port audit first; if a row shape cannot render, stop and ask Ethan for a
   protected-exception record.
3. The note text, sticker numbers and boxes also show in the live-only "Customer messages" sheet and the customer message text.
4. **The ported "Your order" card shows an items-only total.** No client price estimate (it would need a TS/SQL pricing parity
   fixture). The live checkout shows each add-on's and box's price and the same-day percent as labels, and a PLACEHOLDER line
   under the ported card: add-ons, box charges and the same-day amount are added by the shop. The placed card shows the
   server total and the add-ons chosen.
5. Customer wording is PLACEHOLDER (`src/lib/orders/copy.ts`): `ZC007` ("that add-on is not offered any more, reload"), same-day off,
   time passed, box and add-on limits.
6. **Same-day is off by default** (the owner switches it on in Boxes & add-ons): the checkout offers today only when `get_shop_extras` says it is on.
7. **Add-on limits count all lines of one add-on together** (the server refuses otherwise): mirror that in the form.
8. **Same-day tests must not depend on the wall clock**: seed the rules (all seven pickup days, hours 0-24) and use `23:59`
   to accept, `00:00` for "already past".

**The slice:** `parseShopExtras` + a customer read of `get_shop_extras` in `OrderFlow`; the checkout's Boxes card (shown once the
cookie count reaches the smallest box), Add-ons card (variant select, note field with its length), the same-day date (today,
labelled with the percent, only when same-day is on and today is a pickup day: `pickupDates` gains an extras argument) and
notice, sent as `add_ons` and `boxes` in `place_order`, with the same checks the server makes; refusal wording; owner side per
decisions 1-3; `scripts/test-live-checkout.mjs` extended for one add-on (a sticker with a number) and a same-day order, asserting
the row's total, its `order_add_ons` row and its surcharge.

**Carry-overs:** the sampler is an ordinary flavour of kind `set` (the owner makes it under Menu & flavours and names it in
Boxes & add-ons), so the bake list shows "Sampler box x N" without expanding it to flavours (D10 contents are open); helper access
to pack and collect (owner-only shipped); lapsed unpaid orders still count on the bake list until cancelled (ask Cine); the overage
sheet's "over by" mixes cookies and weighted slots; no pickup code on the live status page; wording for every sentence
`staff-copy.ts` and `copy.ts` mark PLACEHOLDER; Cine's real box charges and add-on prices (C5) are entered in the app, not code.

```text
/goal B4b (docs/state/finish-plan.md slice B4, second half): the September form's boxes, add-ons, sampler and same-day extra on the
live checkout and the owner's order screens and messages, per the decisions above (no protected-markup edit unless the port audit
forces one, with its own record and exact reversals). Customers pick boxes (only sizes the owner offers), add-ons with a sticker
number or a note message, the sampler (its cap) and same-day pickup (surcharge shown as a percent; the server prices it); a
swap or a surcharge never changes what a customer owes except the item difference. Unit tests with a mutation per new branch, a
port audit (Sonnet) before any edit near protected markup, and one different-model review (Opus) of the app half. All exit 0 in
this session: pnpm verify, Python guards, the G0 validator (revert evidence/*.json churn), port integrity, pnpm build,
test:pages:spike, test:workers:spike, test:e2e (baseline in current.md), test:live:checkout (extended for one add-on and a
same-day order), python scripts/test-db-security.py. Committed and pushed; current.md checkpoint and task-status updated; this
block replaced by the next goal from finish-plan section 6 (A3). No deploy. Stop after 2 failed fix attempts or 25 turns.
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
