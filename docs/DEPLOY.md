# Deploy

> **Deployment plan superseded:** Follow [MASTER-PLAN.md](../MASTER-PLAN.md) and [architecture](master-plan/04-architecture.md). Vercel Hobby is not the selected commercial host. The current build and production-readiness gates fail; the historical quick-deploy instructions below do not authorize launch.

> **First time, and you want to see it running today?** Jump to
> [Deploy in ten minutes, with no backend](#deploy-in-ten-minutes-with-no-backend). Read
> [`docs/FREE-TIER.md`](./FREE-TIER.md) first if cost matters — it has two conditions
> worth knowing before this becomes her only till.

## Deploy in ten minutes, with no backend

The app runs without a database. The books are still in `localStorage`
(`docs/TECH-DEBT.md` item 1), so **24 of the 25 screens work with nothing configured** —
which makes this the fastest way to get a real URL you can watch changes land on.

```bash
# 1. Get it onto GitHub
git init && git add -A && git commit -m "chore: initial import"
gh repo create happy-cookie-ops --private --source=. --push

# 2. Deploy
npx vercel            # link the project, accept the detected Next.js settings
npx vercel --prod
```

Set exactly one environment variable in the Vercel dashboard:

| Variable              | Value | Why                                                                                                                                     |
| --------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_HARNESS` | `1`   | Keeps the device and role pickers, so you can review all three layouts and all three roles from your phone. Set `0` before she uses it. |

**What works immediately:** all 25 screens, the full bake-plan and grocery derivations,
Bazaar Mode including offline sales queuing to IndexedDB, the P&L, and the installable
PWA. Everything the prototype did.

**What does not, and says so:** sign-in (there is no auth provider yet) and `/api/sync`
(nothing to sync to). `/api/health` reports `database: not-configured`, which is accurate.

**Why this works at all** — and it is worth knowing, because it did not: the middleware
runs on every route, and it used to build a Supabase client from `process.env.X!`. With no
env vars that threw, and because the matcher covers everything, **every page returned
500**. You would have pushed, seen a wall of server errors, and had no way to tell a
config mistake from a broken build. It now detects the absence and runs unauthenticated
(`src/lib/supabase/config.ts`).

### Watching changes land

Vercel builds every push. For the loop you described — agent works, you watch — use a
branch:

```bash
git checkout -b agent/claude/T-01-get-it-running
git push -u origin HEAD          # Vercel comments a preview URL on the PR
```

**Work on previews, not production.** Two reasons beyond the obvious: the uptime workflow
files a GitHub issue when production stops answering, so a half-configured production
deploy starts filing them; and a preview URL is the thing you can hand her to look at
without it being the live till.

Turn on Vercel's GitHub integration and each push comments its own URL on the PR. That is
the real-time view.

---

# Deploying

## Vercel (the intended path)

1. Import the repository. Framework preset: Next.js. Build: `pnpm build`.
2. Environment variables:
   | Name                                   | Scope                   | Value                                                           |
   | -------------------------------------- | ----------------------- | --------------------------------------------------------------- |
   | `NEXT_PUBLIC_SUPABASE_URL`             | all                     | from Supabase → Settings → API                                  |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | all                     | same page (the `sb_publishable_…` key, not the legacy anon JWT) |
   | `SUPABASE_SERVICE_ROLE_KEY`            | production, server only | same page — never in a `NEXT_PUBLIC_` name                      |
   | `NEXT_PUBLIC_HARNESS`                  | production              | `0` to hide the device/role harness                             |
3. In Supabase → Authentication → URL configuration, set the site URL to the deployment
   and add it to the redirect list.
4. Push `main`. CI must be green: `pnpm verify` and `pnpm test:e2e`.

## Docker (self-hosting)

```bash
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_… \
  -t happy-cookie-ops .
docker run -p 3000:3000 -e SUPABASE_SERVICE_ROLE_KEY=… happy-cookie-ops
```

The public variables are compiled into the client bundle, so they are build arguments,
not runtime environment. The image runs as a non-root user and contains no toolchain.

## Getting it onto the phone

Android/Chrome: open the site, menu → _Install app_.
iOS/Safari: Share → _Add to Home Screen_.

Installed, it runs standalone with no browser chrome, the manifest's shortcuts put
Bake plan, Orders and Bazaar Mode on long-press, and the service worker keeps it
openable with no signal. Check after installing: turn on aeroplane mode, open the app
from the home screen, take a sale in Bazaar Mode.

## Before a bazaar

A three-minute ritual worth keeping:

1. Open the app on the phone while still on wifi, so the shell and photography are cached.
2. Go to `/bazaar`, start the event, check the float.
3. Aeroplane mode on. Take one test sale. Check the queue badge shows it.
4. Aeroplane mode off. Check it syncs and the badge clears. Void the test sale.

## Backups

Supabase takes daily backups on paid plans. The books that still live in `localStorage`
are not backed up by anything — the Settings screen's export is the only copy.
That is the top item in `docs/TECH-DEBT.md`.
