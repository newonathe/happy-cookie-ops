# Task board

> **Current board:** [Master build backlog](master-plan/07-build-backlog.md), [task catalog](master-plan/tasks.json) and [prompts](master-plan/prompts/README.md). The old T-task mapping below is reconciled in the master backlog; do not execute it independently.

Every remaining piece of work, decomposed to a size one agent can finish in one session
without running out of context. Start a task with `/task T-XX` in Claude Code, or paste
its block into Codex.

**The full prompt for each task is in [`docs/prompts/`](./prompts/README.md)** — this
board is the map (ids, dependencies, status), that directory is the script. Read
[`docs/prompts/00-session-protocol.md`](./prompts/00-session-protocol.md) once before your
first task.

**Each task's _Context_ line is the complete file list.** It is there so the agent does not
explore the repository — that is the single biggest cost in agentic development. Do not add
files to it out of curiosity.

**Owner** is a recommendation, not a rule: **C** = Claude Code (reasoning, multi-file),
**X** = Codex (throughput, tests, mechanical), **H** = you.

Status: `○` not started · `◐` in progress · `●` done

---

## Phase 0 — Make the gate work (do this first, in order)

### T-01 ○ Get it running and prove the port · **C** · ~1 session

**Depends on** nothing.
**Context** `README.md`, `AGENTS.md`, `docs/PORTING.md`, `package.json`.
**Do** `pnpm install`; `pnpm db:start`; `pnpm db:reset`; `pnpm verify`; `pnpm test:e2e`.
Fix failures without touching ported markup or the engine. `chmod +x scripts/*.sh .claude/hooks/*.sh`.
**Done when** `pnpm verify` and `pnpm test:e2e` are both green and you can load all 25 routes.
**Watch for** a genuinely throwing ported screen — quote the stack and name the prototype
line it came from before changing anything.

### T-01b ○ Stand up Supabase locally · **C** · ~half session

**Depends on** T-01.
**Context** `supabase/config.toml`, `supabase/migrations/`, `supabase/seed.sql`, `docs/DATA.md`.
**Do** `pnpm db:start`, `pnpm db:reset`. Then verify **by querying, not by reading the SQL**:
all 15 tables exist, every one has RLS enabled, the six seeded products carry the
prototype's prices (₱130/140/145/80/150/200), `lookup_order()` is callable by `anon`, and
`drop_remaining()` returns an integer. Fill in `.env.local`, then `pnpm db:types`.
**Done when** `pnpm db:reset` is clean, every table reports RLS enabled, and
`src/lib/types/database.ts` exists with `pnpm typecheck` still green.
**Stop if** any table has RLS disabled, or a policy uses `using (true)` on anything other
than `products` or `drops` — those two are public because the shop is public; anything
else is a hole.

### T-02 ○ Generated database types · **X** · ~30 min

**Depends on** T-01b.
**Context** `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/app/api/sync/route.ts`, `supabase/migrations/`.
**Do** `pnpm db:types`, then type both clients with the `Database` generic and the
`rpc('sync_event_sale')` call against it. Replace the `!` on env vars with a thrown error.
**Done when** no `any`, no `!` on `process.env`, `pnpm verify` green.

### T-03 ○ Commit the lockfile and pin CI · **H** · 10 min

**Do** commit `pnpm-lock.yaml`. CI uses `--frozen-lockfile`; without it every run resolves
fresh and a transitive break will look like your bug.

---

## Phase 1 — Identity, then money can move

### T-04 ○ Staff accounts and the real role gate · **C** · ~1 session

**Depends on** T-02.
**Context** `src/middleware.ts`, `src/app/sign-in/`, `supabase/migrations/20260101000000_init.sql`, `docs/DATA.md`, `src/store/ops-runtime.tsx`.
**Do** Owner-only staff management: list `profiles`, invite a helper or support account,
change a role. Invite through a route handler using the service-role key, body parsed with
Zod, an `audit_log` row for every role change. Then make the app's role come from
`profiles`, keeping the prototype's manual switcher working when `NEXT_PUBLIC_HARNESS=1`.
**Done when** a helper session cannot load `/pnl` or `/reconcile`, proven by a Playwright test.
**Do not** restyle the Settings screen to fit the new panel. Extend it.

### T-05 ◐ Harden /api/sync · **C** · ~half session

**Partly built.** The limiter exists (`src/lib/rate-limit.ts`, limits already chosen). The
size cap, the structured logging and `GET /api/sync/status` do not.
**Depends on** T-02. **Read `docs/OFFLINE.md` first — its rules are not negotiable.**
**Context** `src/app/api/sync/route.ts`, `src/lib/offline/`, `supabase/migrations/20260101000100_sync_sales.sql`, `docs/OFFLINE.md`.
**Do** Apply the **existing** limiter — `checkRateLimit('sync:post', callerId(...))` from
`src/lib/rate-limit.ts`, whose limits are already chosen and commented. Then a request size
cap **before** parsing (a 10 MB body should be rejected without being deserialised),
structured logging of accepted/rejected **counts only** (never sale contents or phone
numbers), and `GET /api/sync/status`.
**Do not** add Upstash or a second limiter. The store is Postgres deliberately —
`docs/GAPS.md` §2.6 has the reasoning — and it is swappable if traffic ever justifies it.
**Done when** a test posts the same batch three times and exactly one sale, one ledger
entry and one audit row exist.

### T-06 ○ Cross-model review of Phase 1 · **X** · 30 min

**Depends on** T-04, T-05.
**Do** In Codex, with only the diff in context, run the `/review` checklist from
`.claude/commands/review.md` and the `security-reviewer` checks. Resolve every blocker.

---

## Phase 2 — Tests before the migration (this is what makes the migration safe)

### T-07 ○ Money and rounding · **X** · ~half session

**Depends on** T-01.
**Context** `tests/unit/money.test.ts`, `src/store/engine/ops-engine.js` (read only), `docs/reference/spec/03-business-rules.md`.
**Do** Extend the money tests: box pricing, the packaging fee, discounts, refunds,
change due, and the peso↔centavo boundary. Test through the engine's public surface.
**Done when** every money path named in the business-rules spec has a test.

### T-08 ○ Engine rules that have no tests · **X** · ~2 sessions, split by rule

**Depends on** T-07.
**Context** `docs/reference/spec/03-business-rules.md`, `src/store/engine/ops-engine.js` (read only), `tests/unit/`.
**Do** Tests for spoilage, the stock-count reconciliation, no-shows, overage, the closeout,
and the drop state machine. One commit per rule.
**Done when** each rule in the spec has at least one test asserting observable behaviour
through `renderVals()`.
**Do not** change the engine. If a test reveals a bug, report it and stop — that is a
finding, not a task.

### T-09 ○ Offline queue under real failure · **C** · ~half session

**Depends on** T-05.
**Context** `src/lib/offline/`, `tests/e2e/bazaar-offline.spec.ts`, `public/sw.js`, `docs/OFFLINE.md`.
**Do** e2e coverage for: sale while offline then reload; server accepts some and rejects
one; server returns 500; two sales with the same `clientId`; tab closed and reopened.
**Done when** no path removes a sale the server did not acknowledge by `clientId`.

---

## Phase 3 — Move the books to Postgres (tech debt item 1, the big one)

One table at a time. **The app must work after every task.** Keep the local store as a
read cache until T-14.

### T-10 ○ Catalogue and prices · **C** · ~1 session

**Depends on** T-02, T-07.
**Context** `src/store/engine/ops-engine.js` (PRODUCTS, SEED_PRICES), `supabase/seed.sql`, `src/components/app/ops-app.tsx`, `src/lib/supabase/server.ts`.
**Do** Load the catalogue in a server component, pass it into `OpsApp` as an initial prop.
Keep the constants as a fallback so `pnpm dev` works with no database. Centavo↔peso
conversion in one tested function.
**Use, do not rebuild** `src/lib/money.ts` — peso↔centavo conversion, already written and
tested (`tests/unit/money-conversion.test.ts`). Postgres returns `bigint` as a string, and
`centavosFromDb()` is the boundary for that. A second conversion is how the rounding drifts:
`38.44 * 100` is 3843.9999999999995, so truncating loses a centavo on every box.

**Done when** prices come from Postgres, the screens are pixel-identical, port integrity green.

### T-11 ○ Orders and order items · **C** · ~2 sessions

**Depends on** T-10.
**Context** `docs/CONTRACTS.md`, `docs/DATA.md`, `supabase/migrations/20260101000000_init.sql`, the engine's order methods.
**Do** Reads via server components, writes via route handlers with Zod. Enforce capacity
with `drop_remaining()`.

**The refusal copy is half-missing, and this is the one place not to improvise.**
`DROP_CLOSED_MESSAGE` in `src/lib/rules/capacity.ts` is the real prototype string for a
closed or sold-out drop — use it verbatim. The **partial**-capacity case has no prototype
wording at all: the prototype's shop clamps the quantity picker, so a customer never sees
that refusal. The API does need one. Ask the owner for the sentence; do not write one and
do not delete the placeholder comment until she has given it to you.
**Also** two things `docs/GAPS.md` flags that belong here, not in a later task:

- **an idempotency key on `POST /api/orders`** (§1.3) — `orderKey()` in
  `src/lib/idempotency.ts` is written and tested; wire it as the unique constraint.
- **a shared capacity fixture** (§4.2) — one test asserting `drop_remaining()` and the
  engine's capacity check agree. From T-11 onward that rule exists in two places and
  nothing else keeps them honest.
- **optimistic concurrency** (§4.4) — call `update_order_state()` (already in
  `20260101000600_concurrency.sql`) and answer **409** when it returns no row. Do not
  retry, and do not return the current row.
- **rate limiting** — `checkRateLimit('orders:create' | 'orders:lookup', …)` from
  `src/lib/rate-limit.ts`. The limits are already chosen and commented.

**Done when** two concurrent checkouts on the last box produce one order and one honest
refusal, proven by a test; a repeated checkout request creates one order; and the capacity
fixture passes against both implementations.

### T-12 ○ Ledger and expenses · **C** · ~1 session

**Depends on** T-11.
**Context** `docs/DATA.md`, `supabase/migrations/20260101000000_init.sql`, the engine's ledger methods.
**Do** Append-only: a correction is a new signed row, never an update or delete. Every
write records who and when.
**Done when** a test proves a non-owner cannot read the ledger through the API even with a
forged role in the client payload.

### T-13 ○ Stock, recipes, suppliers, grocery list · **X** · ~1 session

**Depends on** T-10.
**Context** the engine's inventory methods, `supabase/seed.sql`, `docs/DATA.md`.
**Do** Move inventory, recipes and suppliers to Postgres. The grocery list stays derived —
do not persist it. Preserve par-level logic and the exact `amt` / `amtExact` phrasing.
**Done when** the grocery list is byte-identical to the prototype's for the seeded stock.

### T-14 ○ Retire localStorage, migrate the live books · **C** + **H** · ~1 session

**Depends on** T-11, T-12, T-13.
**Context** the engine's `persist` / `loadState`, the Settings export, `docs/TECH-DEBT.md`.
**Do** Remove the `localStorage` persistence path, keep the Settings export as a manual
backup, and write a one-time import endpoint that accepts an exported payload so the
owner's real books move without retyping.
**Done when** it has been tested against a **real exported payload** before anything is
deleted. **H must run this one against the owner's actual device.**
**This task can lose a year of bookkeeping. Do not let an agent run it unsupervised.**

---

## Phase 4 — Quality, then polish

### T-15 ○ Accessibility pass · **C** · ~1 session · needs `HC_ALLOW_PORTED_EDITS=1`

**Depends on** T-01. Tech debt item 5.
**Context** `eslint.config.mjs`, `src/components/screens/`, `src/components/sheets/`.
**Do** Every interactive element keyboard-reachable and labelled; `<div onClick>` becomes
`<button>` **with the same style object**; `alt` text; `aria-live` on the toast; focus
management in the sheets. Then remove the two `jsx-a11y` exceptions.
**Done when** no visual change — prove it with before/after screenshots of three screens —
and `node scripts/check-port-integrity.mjs --update` is committed with an explanation.
**Constraint** No layout, spacing, colour or copy change. Semantics only.

### T-16 ○ Two devices at once · **C** · ~1 session

**Depends on** T-11.
**Context** `src/components/app/offline-bridge.tsx`, `src/store/ops-runtime.tsx`, `docs/ARCHITECTURE.md`.
**Do** Supabase Realtime on `orders` and `bake_batches` only. Reconcile into engine state
without clobbering a local edit in progress; never re-fire a toast for this device's own change.
**Done when** an order marked ready on one phone appears on the other within a second, and
a half-typed order survives an incoming change.

### T-16b ◐ Observability — switch it on · **H** · 15 min

**Depends on** T-01. `docs/GAPS.md` §2.3.
**Already built.** Sentry across all three runtimes, the PII scrubber with tests, and the
uptime cron. Read `docs/OBSERVABILITY.md` before changing any of it — three Sentry
defaults are inverted on purpose.
**Do** Create the Sentry project. Set `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`,
`SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, and the `PRODUCTION_URL` repository variable.
**Done when** a deliberate throw appears in Sentry with **no** customer data in the
payload, and stopping the app opens a GitHub issue within fifteen minutes.
**Do not** add new error boundaries or a second reporter. Both exist.

### T-17 ◐ Error reporting — verify it, do not build it · **X** · ~20 min

**Depends on** T-16b (the DSN). `docs/OBSERVABILITY.md` first.
**Already built.** Sentry across all three runtimes (`instrumentation-client.ts`,
`sentry.server.config.ts`, `sentry.edge.config.ts`) plus `onRequestError` for server
components, which never reach a React boundary. The scrubber is
`src/lib/observability/scrub.ts` with `tests/unit/scrub.test.ts`.
**Do** Throw deliberately from a screen and from a route handler. Confirm exactly one
report each, and that the payload contains no customer name, phone number, sale contents
or payment reference.
**Do not** add a boundary, a second reporter, or a second scrubber — all three exist, and a
duplicate boundary swallows the error twice. If a report lacks something you needed, widen
the allowlist in `scrub.ts` by one key, with a test. Never loosen it wholesale.
**Note** Three of Sentry's own recommended defaults are inverted on purpose
(`sendDefaultPii`, session replay, tunnelling). `docs/OBSERVABILITY.md` says why. Do not
"fix" them back.

### T-18 ○ Performance on the real device · **X** · ~half session

**Depends on** T-11.
**Context** `docs/ARCHITECTURE.md` (rendering section), `next.config.ts`.
**Do** Lighthouse on `/` and `/shop` on a throttled mobile profile. Report the numbers
before proposing anything.
**Done when** the numbers are written into `docs/ARCHITECTURE.md` as a baseline. Optimise
only what the numbers justify — the rendering section explains why memoising was rejected.

### T-18b ◐ Visual regression — generate the baselines · **X** · ~30 min

**Depends on** T-01. `docs/GAPS.md` §3.4.
**Already built.** `tests/e2e/visual.spec.ts`, the `visual` Playwright project, and the
containerised CI job. The clock is frozen rather than masked, for a reason the file states.
**Do** Run the Docker command in `docs/TESTING.md` to render the baselines, and commit the
`.png` files. Never generate them on a laptop — a laptop-rendered baseline diffs against
the CI runner on font hinting alone, every run, forever.
**Done when** changing a container's `flexDirection` in a ported screen fails CI, and the
unmodified tree passes.

### T-18c ○ Provision staging · **H** · 20 min

**Depends on** T-01. Blocks T-14.
**Already written.** `docs/STAGING.md` is the full checklist, including the RLS query to
run against the remote project specifically and the five-minute smoke test.
**Do** Create the second Supabase project, `supabase db push`, and set the Vercel
**Preview**-scoped variables so a preview deploy can never reach production.
**Done when** a preview deploy reads the staging database and `pg_tables` reports RLS on
every table in the staging project.
**Why before T-14** That migration can destroy a year of bookkeeping and currently has
nowhere to fail safely.

### T-19 ○ Backups and the pre-bazaar ritual · **H** · 1 hour

**Depends on** T-14. Do the backup half **before** T-14, not after — the migration is when
data is most at risk (`docs/GAPS.md` §2.4, §3.1).
**Context** `docs/DEPLOY.md`.
**Do** Turn on Supabase backups. Walk the pre-bazaar checklist on the owner's actual phone,
in aeroplane mode, with a real test sale. Write down what was wrong.

---

## Not tasks

Things that will look like good ideas and are not. Each destroys value that is already paid for.

| Idea                                                 | Why not                                                                                                    |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Convert the ported inline styles to Tailwind classes | Deletes a signed-off design, one judgement call at a time. `docs/PORTING.md`.                              |
| Refactor `ops-engine.js` into hooks                  | Risks every business rule at once and ends diffability against the prototype.                              |
| Improve the copy                                     | The copy is the product. It was written for one person to read with dough on her hands.                    |
| Add a component library                              | The components exist. They are the prototype's.                                                            |
| Regenerate the screens from the prototype            | The hand work since the port — `Pressable`, the split files, `RouteSync`, `OfflineBridge` — would be lost. |
| Server-render the screens                            | Deliberate. `docs/ARCHITECTURE.md` explains the trade.                                                     |
