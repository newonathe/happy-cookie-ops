# Environments

**Fill this in as you deploy.** It is the one place the real URLs, project references and
dashboard links live, so no other document has to guess at them.

Why it exists: several documents need a value that cannot be known until you deploy — the
production URL, the Supabase project ref, the Vercel team slug. Inventing them would be a
fabrication; leaving `<app>` in a runbook means that at 6am, mid-drop, the first
instruction requires information you have to go and find. This file is the answer to both.

Commit it. There are no secrets here — every credential is an environment variable, and
this holds only the addresses.

---

## Production

| | Value |
| --- | --- |
| App URL | `https://________________` |
| Vercel project | `________________` |
| Vercel team slug | `________________` |
| Supabase project ref | `________________` |
| Supabase region | `________________` |
| Sentry project | `________________` |
| Health check | `https://________________/api/health` |

Dashboards:

- Vercel deployments — `https://vercel.com/________/________`
- Supabase — `https://supabase.com/dashboard/project/________`
- Sentry issues — `https://________.sentry.io/issues/`

**GitHub repository variable to set** (Settings → Secrets and variables → Actions →
Variables): `PRODUCTION_URL` = the app URL above. The uptime workflow reads it, and
without it the health check silently passes against nothing.

## Staging

Set up per `docs/STAGING.md`. **Required before T-14.**

| | Value |
| --- | --- |
| Preview URL pattern | `https://________________-________.vercel.app` |
| Supabase project ref | `________________` |

Redirect allowlist to add in the staging Supabase project (Authentication → URL
Configuration) — get this wrong and every preview deploy shows a sign-in loop that looks
exactly like a code bug:

```
https://*-________________.vercel.app/**
```

## Local

| | Value |
| --- | --- |
| App | `http://127.0.0.1:3000` |
| Supabase API | `http://127.0.0.1:54321` |
| Supabase Studio | `http://127.0.0.1:54323` |
| Database | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

Those are Supabase's defaults; `pnpm db:start` prints the real ones, and the anon key with
them.

## The current drop, for load testing

`tests/load/drop-open.js` needs a real drop id and **must run against staging** — it
places real orders.

```bash
# get one:
psql "$STAGING_DB_URL" -c "select id, opens_at from drops order by opens_at desc limit 1;"
```

| | Value |
| --- | --- |
| Staging drop id | `________________` |

## Who has access

Fill in so nobody has to guess who to ask.

| Service | Account holder |
| --- | --- |
| Vercel | `________________` |
| Supabase | `________________` |
| Sentry | `________________` |
| GitHub | `________________` |
| Domain, if any | `________________` |

## When this changes

Update it in the same commit as the change. A stale address here is worse than a blank
one — a blank tells you to go and look, a wrong one sends you to the wrong dashboard while
a drop is open.
