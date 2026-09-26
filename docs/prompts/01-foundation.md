# Phase 01 — Foundation

> **Historical context (T-task era, before the 2026-09-08 master plan):** where this page conflicts with [MASTER-PLAN.md](../../MASTER-PLAN.md), [docs/state/current.md](../../docs/state/current.md) or the [decision register](../../docs/state/decision-register.md), those win. Its protection rules still apply unless they say otherwise.

Nothing else matters until this phase is green. `pnpm verify` is what will tell you, for
the rest of the project, that you have broken something. Until it runs, you are working
blind.

---

## T-01 — Get it running and prove the port

**Give it to** Claude Code · **Depends on** nothing · ~1 session

**Context** `README.md`, `AGENTS.md`, `package.json`, `docs/PORTING.md`, `scripts/check-port-integrity.mjs`

### The prompt

> This repository has never been installed. Nothing in it has been executed. Your job is
> to get it running and prove the port is intact — not to improve anything.
>
> Do these in order, and stop at the first thing that fails:
>
> 1. `chmod +x scripts/*.sh .claude/hooks/*.sh`
> 2. `pnpm install` — report any peer-dependency warning that names `react`, `next` or
>    `tailwindcss`; ignore the rest.
> 3. `node scripts/check-port-integrity.mjs` — this must pass before anything else. It
>    proves the 54 ported files match `scripts/port-baseline.json`.
> 4. `pnpm typecheck`. Expect errors: the ported engine is untyped JavaScript behind a
>    hand-written `.d.ts`, and the generated `OpsVals` contract has `unknown` in places.
>    Fix them **in the type layer only** — `src/store/engine/ops-engine.d.ts`,
>    `src/view-models/vals.ts` — never by changing ported markup or the engine.
> 5. `pnpm lint`.
> 6. `pnpm test`.
> 7. `pnpm dev`, then load all 25 routes: `/`, `/sales`, `/orders`, `/order`, `/lookup`,
>    `/reconcile`, `/bake`, `/batch`, `/inventory`, `/stocktake`, `/more`, `/grocery`,
>    `/bazaar`, `/pnl`, `/formqueue`, `/health`, `/products`, `/notifications`, `/shop`,
>    `/checkout`, `/status`, `/recipes`, `/drops`, `/suppliers`, `/settings`. Report every
>    console error with the route it came from.
> 8. `pnpm build` — a type error that only appears here is usually a route or a Suspense
>    boundary, not your change.
> 9. `pnpm test:e2e`.
>
> Rules for fixing:
> - A missing type, a wrong import path, a config key: fix it.
> - A ported screen that genuinely throws: **quote the stack trace, find the corresponding
>   region in `docs/reference/prototype.dc.html`, quote that too, and propose the minimal
>   fix. Wait for my approval before applying it.** A throwing screen usually means the
>   translation dropped something, and the prototype is the answer key.
> - Anything that tempts you to change a style value, a copy string or the engine: stop
>   and tell me.
>
> Report as a table: step, pass or fail, what you changed, and the file. Then paste the
> final `pnpm verify` output in full.

### Accept when

- `pnpm verify` green — port integrity, types, lint, unit tests.
- `pnpm build` green.
- `pnpm test:e2e` green (25 routes render with no console error; the offline sale survives a reload).
- All 25 routes load by hand.

### Stop if

- The port-integrity check fails on a file nobody edited — the baseline or the script is
  wrong, and that is a five-minute fix you want to make before anything is built on it.
- More than three ported screens throw. That is a systematic translation problem, not
  three bugs; bring it to me before fixing them one at a time.
- A fix requires editing ported markup. Every one of those needs a human decision.

---

## T-01b — Supabase local, and only then

**Give it to** Claude Code · **Depends on** T-01

**Context** `supabase/config.toml`, `supabase/migrations/`, `supabase/seed.sql`, `docs/DATA.md`

### The prompt

> The app runs without a database — the engine keeps its books in `localStorage`, which is
> how the prototype worked. Now stand up the local database so auth and the sync endpoint
> can be built on it.
>
> 1. `pnpm db:start` (needs Docker). Report the ports it publishes.
> 2. `pnpm db:reset` — applies both migrations and `supabase/seed.sql`.
> 3. Verify by querying, not by reading the SQL:
>    - all 15 tables exist;
>    - **every one has row-level security enabled** — list any that do not;
>    - the six seeded products are present with the prices in `supabase/seed.sql`;
>    - `lookup_order('HC-1042', '09171234567')` behaves (empty result is fine — it proves
>      the function exists and is callable by `anon`);
>    - `drop_remaining()` returns an integer for a seeded drop.
> 4. Copy `.env.example` to `.env.local` and fill in the local URL and anon key from
>    `pnpm db:start`'s output. Confirm `.env.local` is gitignored.
> 5. `pnpm db:types` and confirm `src/lib/types/database.ts` was written.
>
> If a migration fails, quote the exact SQL error. Do not edit the migration to make it
> apply — tell me what it says and wait. An applied migration is immutable; a broken one
> that has never applied can be fixed, and I need to know which case this is.

### Accept when

- `pnpm db:reset` completes clean.
- Every table reports RLS enabled.
- `src/lib/types/database.ts` exists and `pnpm typecheck` still passes.

### Stop if

- Any table has RLS disabled. That is a security hole in the schema, and it gets fixed in
  a new migration before anything reads from that table.
- A policy uses `using (true)` on a table that is not `products` or `drops` — those two
  are deliberately public because the shop is public. Anything else is a bug.

---

## T-02 — Generated types, and no more `any`

**Give it to** Codex · **Depends on** T-01b · ~30 min

**Context** `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/app/api/sync/route.ts`, `src/lib/types/database.ts`

### The prompt

> `src/lib/types/database.ts` now exists. Wire it through the Supabase layer so the
> compiler knows the schema.
>
> 1. Type both clients with the `Database` generic:
>    `createBrowserClient<Database>(…)`, `createServerClient<Database>(…)`.
> 2. Type the `rpc('sync_event_sale', …)` call in `src/app/api/sync/route.ts` against the
>    generated function signature. If the generated types do not include the function,
>    say so — that means `pnpm db:types` ran before the migration applied.
> 3. Replace every `process.env.X!` with a function that throws a message naming the
>    missing variable and telling the reader to copy `.env.example`. A crash that says
>    which variable is missing costs one minute; a `null` that propagates costs an hour.
> 4. `src/middleware.ts` has the same `!` assertions. Same treatment.
>
> Constraints: no `any`, no `@ts-ignore`, no non-null assertion on an environment
> variable. Do not change runtime behaviour — this is a typing task. If the types reveal
> an actual bug, report it separately rather than fixing it here.

### Accept when

- `pnpm verify` green.
- `grep -rn "process.env.*!" src/` returns nothing.
- `grep -rn ": any\|as any" src/lib src/app` returns nothing.

---

## T-03 — Pin the toolchain

**Give it to** you · 10 minutes

Not an agent task. Two commands, both of which prevent a class of confusing failure later.

```bash
git add pnpm-lock.yaml && git commit -m "chore: commit lockfile"
pnpm exec husky init   # if .husky/_ is missing
```

CI runs `pnpm install --frozen-lockfile`. Without a committed lockfile, every CI run
resolves dependencies fresh, and the first transitive break will look exactly like your
bug. This is ten minutes now or a lost afternoon later.

### Accept when

- `pnpm-lock.yaml` is committed.
- A test commit triggers the pre-commit hook and it runs `pnpm verify:port`.
- CI is green on the branch.
