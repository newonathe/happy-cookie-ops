# Running this for free

> **Current cost/eligibility research:** See [master architecture](master-plan/04-architecture.md) and [dated sources](master-plan/10-decisions-and-sources.md). Earlier provider assumptions below are historical; commercial eligibility, backups, SMTP and account quotas require the new gates.

The plan is zero infrastructure cost — Claude Code and Codex are the only paid line items.
That is achievable, and this file is the honest version: what fits, what nearly does not,
and the two places where "free" has a condition attached that matters for a real business.

## What the app needs

| Service         | Plan         | Fits?          | The catch                                |
| --------------- | ------------ | -------------- | ---------------------------------------- |
| Vercel          | Hobby        | yes            | Commercial-use clause — see below        |
| Supabase        | Free         | yes            | **Pauses after 7 days idle** — see below |
| GitHub Actions  | Free         | yes, with care | Billed per minute; the budget is real    |
| Sentry          | Developer    | yes            | 5k errors/month, one project             |
| Lighthouse CI   | free storage | yes            | Reports expire; fine, they are advisory  |
| Dependabot      | free         | yes            | —                                        |
| SMS (Semaphore) | **paid**     | **no**         | The one thing to leave switched off      |

## The two catches worth knowing before you deploy

### Supabase free projects pause after 7 days of inactivity

This is the one that will bite. A free project with no API requests for a week is paused,
and the first request after that fails while it wakes.

For most side projects that is a nuisance. For this one it is a specific hazard: **her
business is weekly.** A drop opens Monday, closes, and there may be genuinely quiet
stretches — a holiday, a month off, a bad season. The app comes back from a week's silence
at exactly the moment she needs it, which is when a customer is trying to order.

Three ways to handle it, in order of preference:

1. **Leave the books in `localStorage` until she is actually using the app weekly.** The
   app already works this way — 24 of 25 screens need no database. Do not rush T-14.
2. **Let the hourly uptime check keep it warm.** `/api/health` queries the database, so
   the workflow in `.github/workflows/uptime.yml` counts as activity. This is a real
   benefit of that workflow beyond monitoring, and a reason not to replace it entirely
   with an external monitor.
3. **Pay the $25 when the business justifies it.** Not before.

Note the interaction: **option 2 only works while the workflow runs.** If you disable the
cron to save Actions minutes, you also lose the thing keeping the database awake.

### Vercel Hobby prohibits commercial use

The Hobby plan is for non-commercial personal projects. This app runs a business that
takes money from customers — a public shop, a checkout, a ledger.

I am not a lawyer and cannot tell you where the line falls for a one-person home bakery
at forty orders a week. What I can tell you is that the clause exists, that it is Vercel's
to enforce, and that discovering it after the app is load-bearing for her income would be
the bad version of finding out.

Two honest options: read the current terms and decide deliberately, or self-host. This
repository has a `Dockerfile` precisely so the second option stays open — Next.js in
standalone mode runs on any small VPS, and `docs/DEPLOY.md` does not depend on Vercel
except for the deploy step itself.

**Deploy on Hobby now to watch it work.** Make the call before it is her only till.

## The Actions budget, with the actual arithmetic

2,000 minutes a month on a private repository. GitHub bills whole minutes with a
one-minute minimum per run, which is what catches people:

|                                   | Runs/month     | Billed minutes      |
| --------------------------------- | -------------- | ------------------- |
| Hourly uptime check               | 720            | ~720                |
| CI on main + PRs (~8 min a run)   | ~100           | ~800                |
| Visual regression (containerised) | included above | —                   |
| **Total**                         |                | **~1,520 of 2,000** |

Comfortable. The version originally written here was not: a 15-minute cron is 2,880
billed minutes on its own, which exhausts the allowance around day 20 — **and then CI
stops running too.** Losing the gate is much worse than an hour's detection delay, which
is why the cron is hourly and CI does not run on every branch push.

Two ways to buy headroom if you need it:

- **Make the repository public.** Actions minutes are unlimited on public repositories.
  There are no secrets in this codebase — every key is an environment variable — so the
  only question is whether her business logic and prices being public is acceptable. That
  is her decision, not a technical one.
- **Run `pnpm verify` locally instead of pushing to see CI.** Same gate, instant, free.

## What to switch off, and what not to

**Leave off:** SMS. It is the only paid dependency, the code ships with an honest stub
(`docs/MESSAGING.md`), and she has to agree to a recurring bill first.

**Turn on, it is free and worth it:** Sentry. 5,000 errors a month is far more than this
app will produce, and `docs/OBSERVABILITY.md` explains why the scrubbing configuration
matters more than the plan.

**Do not skip because it looks optional:** the staging Supabase project. The free tier
allows two projects, and staging + production is exactly two. It fits, and T-14 — the
migration that can destroy a year of her bookkeeping — needs somewhere to fail safely
(`docs/STAGING.md`).

## Cost if the business grows

Not a recommendation, just the shape of it: Supabase Pro is the first thing that becomes
necessary, because of the pausing and the backups. Vercel Pro is second, and it is the
commercial-use question rather than a limit. SMS is per message and scales with orders.
Nothing here is architecturally coupled to a paid plan — the Dockerfile is the exit.
