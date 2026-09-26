# Phase 04 — Move the books to Postgres

> **Historical context (T-task era, before the 2026-09-08 master plan):** where this page conflicts with [MASTER-PLAN.md](../../MASTER-PLAN.md), [docs/state/current.md](../../docs/state/current.md) or the [decision register](../../docs/state/decision-register.md), those win. Its protection rules still apply unless they say otherwise.

Tech-debt item 1, and the largest piece of work left. The books — orders, ledger, stock,
drops — still live in one `localStorage` object, as they did in the prototype. One device,
no backup, one cleared cache away from losing a year.

**Read this before starting the phase.** Five rules govern all of it:

1. **One table per task.** The app must work after every task, not just at the end.
2. **The local store stays a read cache** until T-14. Postgres becomes the source of
   truth table by table; the engine keeps its shape throughout.
3. **The engine's structure does not change.** Only where it loads and saves changes. This
   is what keeps the port diffable and the screens untouched.
4. **Every task ends with the test net green** (phase 03). If a rule test breaks, the
   migration broke a rule — stop and read the test.
5. **T-14 can destroy the owner's real books.** It is supervised. Do not let an agent run
   it unattended.

---

## T-10 — Catalogue and prices

**Give it to** Claude Code · **Depends on** T-02, T-07 · ~1 session

**Context** `src/store/engine/ops-engine.js` (`PRODUCTS`, `SEED_PRICES` — read only), `supabase/seed.sql`, `src/components/app/ops-app.tsx`, `src/lib/supabase/server.ts`, `src/app/page.tsx`

### The prompt

> Make the catalogue come from Postgres instead of the engine's constants. This is the
> smallest table, which is why it goes first — it establishes the pattern the next four
> tasks follow.
>
> 1. Load the catalogue in a **server component** and pass it into `OpsApp` as an initial
>    prop. The engine reads it from props where it currently reads the constant.
> 2. **Keep the constants as a fallback** when Supabase is not configured, so `pnpm dev`
>    works with no database and `pnpm test` needs no fixture. State clearly in a comment
>    which is authoritative when both exist.
> 3. **Conversion already exists** — `src/lib/money.ts`, tested in
>    `tests/unit/money-conversion.test.ts`. Use `pesosToCentavos`, `centavosToPesos` and
>    `centavosFromDb` (Postgres returns a `bigint` column as a *string*, and that function
>    is the boundary for it).
>
>    Do not write a second conversion. The rounding is the load-bearing part: `38.44` is
>    the packaging fee, and `38.44 * 100` in IEEE-754 is 3843.9999999999995 — a truncating
>    conversion loses a centavo on every box, forever.
> 4. Product images: the engine's `RES()` resolves `/assets/…`. Postgres stores
>    `image_path`. Make them agree without changing `RES()`.
>
> Verification, and this is the part that matters: **the screens must be pixel-identical**.
> Run `node scripts/check-port-integrity.mjs` and confirm the six products render with the
> same names, prices and images as before. If a price now formats differently — `₱150`
> becoming `₱150.00` — you have introduced a conversion bug, not a formatting improvement.

### Accept when

- Prices come from Postgres; the screens are unchanged.
- `pnpm dev` still works with no `.env.local`.
- Conversion lives in exactly one tested function.
- `pnpm verify` and `pnpm test:e2e` green.

---

## T-11 — Orders and order items

**Give it to** Claude Code · **Depends on** T-10 · ~2 sessions, split as below

**Context** `docs/CONTRACTS.md` (the three order endpoints), `docs/DATA.md`, `supabase/migrations/20260101000000_init.sql`, the engine's order methods, `docs/reference/spec/03-business-rules.md`

### The prompt — session 1, reads and the public order

> Orders are the heart of the app. Two sessions; this is the first.
>
> 1. **Reads.** Staff order lists come from Postgres via a server component. Preserve the
>    prototype's ordering, grouping and empty states exactly — those are in the ported
>    markup, so if you find yourself wanting to change a screen, the query is wrong.
> 2. **`POST /api/orders`** per `docs/CONTRACTS.md`. Three invariants, all of which have
>    been got wrong by competent people:
>    - **Prices come from `products`, never from the request.** A client-sent price is
>      ignored, not validated. There is no legitimate reason for the browser to tell the
>      server what a cookie costs.
>    - **Capacity is checked inside the same transaction as the insert**, using
>      `drop_remaining()`. Checking before inserting is a race, and the race is two
>      customers taking the last box.
>    - **The 409 body.** Use `DROP_CLOSED_MESSAGE` from `src/lib/rules/capacity.ts` for a
>      closed or sold-out drop — that is the prototype's own string. For the partial case
>      there is **no prototype wording**: its shop clamps the quantity picker so a customer
>      never sees that refusal, and `capacityRefusal()` returns a marked placeholder. Tell
>      me it needs the owner's sentence and leave the placeholder. Do not write one, and do
>      not present an invention as approved copy.
> 3. **`POST /api/orders/lookup`** — both order id and phone required, via
>    `lookup_order()`. A wrong phone returns the **same** 404 as a nonexistent order, so
>    the endpoint cannot confirm that an order number exists. Rate-limit per IP.
>
> The concurrency test is the deliverable I care most about: fire two checkouts for the
> last box simultaneously and assert exactly one order exists and exactly one honest
> refusal was returned. If you cannot make that test fail against a naive
> check-then-insert implementation, the test is not testing what you think.

### The prompt — session 2, writes and the state machine

> Continue T-11. Now the staff write path.
>
> 1. **`PATCH /api/orders/:id`** per `docs/CONTRACTS.md`. Legal transitions are the
>    prototype's state machine, which T-08 tested — reuse that table rather than writing a
>    second one. An illegal transition is `422` with a message naming the current and
>    attempted states. Never a silent no-op: the owner tapping a button and nothing
>    happening is the worst possible outcome.
> 2. Every payment-state change writes an `audit_log` row with the actor.
> 3. The engine's order methods now call the API instead of mutating local state, and keep
>    the local copy as an **offline read cache** so the orders screen still opens with no
>    signal.
> 4. Optimistic update where the prototype was instant — but **roll back visibly** on
>    failure, with the prototype's own error copy. Silently reverting is how people lose
>    trust in a tool they rely on.
>
> Run the full test net from phase 03 at the end. Any rule test that now fails means this
> migration changed a business rule. Report it; do not adjust the test.

### Accept when

- Two concurrent checkouts on the last box → one order, one refusal, proven by a test.
- An illegal state transition returns 422 and changes nothing.
- The orders screen opens offline from cache.
- Phase 03's tests all still pass.
- Port integrity green.

### Stop if

- A rule test from T-08 fails. That is the test net doing its job. Read it before touching
  anything.

---

## T-12 — Ledger and expenses

**Give it to** Claude Code · **Depends on** T-11 · ~1 session

**Context** `docs/DATA.md`, `supabase/migrations/20260101000000_init.sql`, the engine's ledger methods, `src/lib/money.ts`

### The prompt

> Move `ledger_entries` to Postgres. This is the owner's bookkeeping; treat it accordingly.
>
> 1. **Append-only.** A correction is a new signed row referencing the original, never an
>    update, never a delete. There is no `update` or `delete` policy on the table, and the
>    application must not want one.
> 2. Every write records **who** and **when** — `created_by` from `auth.uid()`, not from
>    the client.
> 3. Money in centavos, through `src/lib/money.ts`. **No float arithmetic anywhere in a
>    ledger path.** Grep the diff for `* 100`, `/ 100`, `toFixed` and `parseFloat` before
>    you finish, and justify every hit.
> 4. P&L and the payments screen read from Postgres. The numbers must match what the
>    prototype shows for the same seeded data — compare them, do not assume.
>
> The test I want: a non-owner cannot read the ledger through the API **even with a forged
> role in the client payload**. Write it as an attack: sign in as a helper, post a request
> claiming to be the owner, assert 403 and that no ledger data appears in the response
> body. Then the same for `GET`.
>
> Also assert that a correction produces two rows summing to the corrected value, and that
> the original row is byte-identical afterwards.

### Accept when

- The forged-role test passes (403, no data).
- A correction is two rows; the original is untouched.
- P&L matches the prototype for identical data.
- No float arithmetic in any ledger path.

---

## T-13 — Stock, recipes, suppliers, grocery list

**Give it to** Codex · **Depends on** T-10 · ~1 session

**Context** the engine's inventory methods, `supabase/seed.sql`, `docs/DATA.md`, `docs/reference/spec/03-business-rules.md`

### The prompt

> Move `inventory_items`, `recipes`, `recipe_ingredients` and `suppliers` to Postgres.
>
> 1. Reads through a server component; writes through route handlers with Zod.
> 2. **The grocery list stays derived.** Do not persist it. It is a function of par levels,
>    on-hand quantities and the bake plan, and a stored copy will be wrong the moment
>    anything changes.
> 3. Preserve the par-level logic exactly, and the phrasing from `amt()` and `amtExact()`.
>    Quantities are how the owner shops: `2.5 kg` and `2.5kg` and `2.500 kg` are three
>    different shopping lists.
> 4. Stock quantities are `numeric(12,3)` in Postgres. Do not round them into integers on
>    the way through — half a kilo of butter is a real quantity.
>
> Verification: with the seeded stock, the grocery list must be **byte-identical** to the
> prototype's. Diff them as strings. If they differ by a single space, find out why before
> declaring this done — a difference means the derivation changed.

### Accept when

- The grocery list is byte-identical to the prototype's for seeded stock.
- Par-level triggers fire at the same thresholds.
- Nothing persists the derived list.

---

## T-14 — Retire localStorage, migrate the live books

**Give it to** Claude Code **with you supervising** · **Depends on** T-11, T-12, T-13 · ~1 session

**Context** the engine's `persist` and `loadState`, the Settings export, `docs/TECH-DEBT.md`, `docs/CONTRACTS.md` (`/api/import/books`)

> **This task can lose a year of the owner's bookkeeping. Read all of it before starting,
> and do not run the import against the real device until the dry run has been reviewed by
> a human.**

### The prompt

> Final step of the migration. Three commits, and I approve each one before the next.
>
> **Commit 1 — the import endpoint, dry-run only.**
>
> `POST /api/import/books` per `docs/CONTRACTS.md`, with **`dryRun` defaulting to true**.
> A dry run reads the payload, validates it, reports exactly what it *would* write —
> counts per table, and every row it would skip with the reason — and writes nothing.
> Owner only. There is no way to run the destructive path by accident: no default, no
> falsy check, an explicit `dryRun: false`.
>
> **Commit 2 — the real import.**
>
> Idempotent: running it twice must not double the books. Refuse to run if the target
> tables already hold rows for the same period, and say what it found. Every imported row
> carries its provenance in `audit_log` so a wrong import can be identified later.
>
> **Commit 3 — retire the local store.**
>
> Remove the `localStorage` persistence path. **Keep the Settings export** — it is the
> owner's only manual backup and it is not up for removal. Confirm the app still opens
> offline, reading from the caches built in T-11 and T-13.
>
> Before commit 3: I will give you a **real exported payload** from the owner's phone. Run
> the dry run against it and show me the report. We compare its counts against what the
> owner believes she has. If a single order is missing, we stop.

### Accept when

- Dry run against the **real payload** reviewed by a human and reconciled against the
  owner's own count.
- Import is idempotent — proven by running it twice in a test.
- The Settings export still works.
- The app still opens offline.
- The owner's live books are in Postgres and she has confirmed the totals.

### Stop, always

- If the dry-run counts disagree with the owner's expectation by any amount.
- If the payload has a shape the validator does not recognise. An unrecognised key may be
  a year of expenses.
- Before deleting anything, ever, on the real device.
