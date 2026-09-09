# Staging

One environment is the gap that matters most before T-14. That task migrates a year of the
owner's real bookkeeping out of `localStorage`, and right now a migration that behaves
differently against real data has nowhere to fail safely.

Staging is nearly free here: a second Supabase project and Vercel's own preview deploys.

## Setting it up

**1. A second Supabase project.** Name it `happy-cookie-staging`. Free tier is enough —
staging holds fake orders.

```bash
supabase link --project-ref <staging-ref>   # record it in docs/ENVIRONMENTS.md
supabase db push          # applies every migration in order
psql "$STAGING_DB_URL" -f supabase/seed.sql
```

**2. Verify RLS in the staging database specifically.** A local check proves nothing about
a remote project — the migrations are the same, but a failed one leaves a table without
policies and `db push` will tell you it succeeded.

```sql
select tablename, rowsecurity from pg_tables
 where schemaname = 'public' and rowsecurity = false;
-- must return no rows
```

**3. Vercel preview environment.** Set these on the **Preview** scope only, so a preview
deploy can never reach the production database:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | the staging project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the staging anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | the staging service-role key |
| `NEXT_PUBLIC_ENVIRONMENT` | `staging` |
| `NEXT_PUBLIC_HARNESS` | `1` — the review harness is useful here |

**4. Supabase auth redirect URLs.** Add `https://*-<your-team>.vercel.app/**` to the
staging project's redirect allowlist, or every preview deploy produces a sign-in loop that
looks like a code bug.

## What staging is for

| Use it for | Why |
| --- | --- |
| Every migration, before production | The whole reason it exists |
| The T-14 dry run | Against a copy of her real export, before touching her device |
| Load tests | `pnpm test:load` places real orders — never at production |
| A helper's first sign-in | Get the role gate wrong somewhere harmless |
| Anything involving the service-role key | A leaked staging key costs nothing |

## What it is not for

**Not a rehearsal for the real migration.** Staging tells you the migration *runs*. It
cannot tell you her books came across correctly, because staging does not have her books.
That is what the T-14 dry run against her actual exported payload is for, and it is
reviewed by a human.

**Not permanently seeded with real data.** Never copy production into staging. It is a
second copy of her customer list with weaker access control and more people touching it.
If you need realistic volume, generate it.

## The deploy order, every time

```
migration on staging  →  app on staging  →  smoke test  →  migration on production  →  app on production
```

The migration goes first in both, and it must be backwards compatible with the currently
deployed app — otherwise the gap between the two steps is an outage. A change that cannot
be backwards compatible is a two-deploy change: expand, deploy, migrate, contract.
`docs/prompts/09-maintenance.md` M-04 has the checklist.

## Smoke test

Before promoting anything, on staging:

1. All 25 routes load.
2. Place an order through `/shop`; confirm it appears in `/orders`.
3. `/bazaar`: take a sale offline, restore signal, watch it sync.
4. `/api/health` returns `ok`.
5. Sign in as a helper; confirm `/pnl` and `/reconcile` are refused.

Five minutes. It has caught every deploy problem worth catching.
