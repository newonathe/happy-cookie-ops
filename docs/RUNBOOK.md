# Runbook

> **Historical context (T-task era, before the 2026-09-08 master plan):** where this page conflicts with [MASTER-PLAN.md](../MASTER-PLAN.md), [docs/state/current.md](../docs/state/current.md) or the [decision register](../docs/state/decision-register.md), those win. Its protection rules still apply unless they say otherwise.

For the moment something is broken and a drop closes at noon. Operational only — no
architecture, no explanation you do not need at 6am.

**Read this line to her first, before anything else, if it is a bazaar or a sync problem:**

> Your sales are safe. They are saved on the phone. Nothing is lost. Keep taking orders —
> the app will send them when it can.

That is true, not reassurance. Bazaar sales are written to IndexedDB before anything else
and only leave the queue when the server names them (`docs/OFFLINE.md`).

> P-04 in `docs/prompts/06-production.md` expands this once the app is deployed and you
> know what actually goes wrong. This version covers what the uptime workflow points at.

---

## 1. Is it down?

Check in this order. Stop at the first that explains it.

> **The URLs are in [`docs/ENVIRONMENTS.md`](./ENVIRONMENTS.md).** Fill that in once and
> every command below is copy-paste.

| Check | Result | Means |
| --- | --- | --- |
| `curl https://<app>/api/health` | `{"status":"ok"}` | The app is fine. The problem is her device or her network. |
| | `{"status":"degraded","database":"unreachable"}` | App up, Supabase down → §2 |
| | `{"database":"not-configured"}` | No env vars. Expected before T-04; a misconfigured deploy after. |
| | timeout / 502 | The deploy is broken → §3 |
| Vercel dashboard → Deployments | latest is red | A bad deploy → §3 |
| Supabase dashboard → Project | **Paused** | Free-tier inactivity → §2 |

## 2. The database is unreachable

**First: is it paused?** Supabase free projects pause after 7 days idle, and her business
is weekly (`docs/FREE-TIER.md`). Resume it from the dashboard; it takes a minute or two.

If it is paused, also check that `.github/workflows/uptime.yml` is still running — that
hourly check is what keeps it awake, and disabling it to save Actions minutes is the usual
cause of a pause.

If it is not paused: Supabase status page, then the project's logs. **Nothing to do on her
phone.** The app opens offline, bazaar sales queue, and the orders screen reads from cache.
Tell her that and let her keep working.

## 3. A bad deploy

```bash
# Roll back — instant, no rebuild
npx vercel rollback
```

Or promote the last good deployment from the dashboard.

**Then wait before declaring it fixed.** A service worker cached on her phone can serve
the old shell for a few minutes. Have her close the app and reopen it. If it persists:
Settings → the app's own reload, or in the browser, Application → Service Workers →
Unregister.

**Never deploy during a drop or a bazaar.** A service worker updating mid-sale is the one
scenario nobody has tested.

## 4. Sync will not clear at a bazaar

1. Say the line at the top of this file. Mean it.
2. `GET /api/sync/status` — how many sales does the server actually hold for that device?
   Compare against the badge on her screen.
3. Aeroplane mode on, off. Then `/api/health`.
4. **Server down** → nothing to do. The queue is patient and Background Sync retries.
5. **Server up, queue will not clear** → the batch is being rejected. Check the server
   logs for the rejection reason (logged as a count and a reason, never contents).

**Do not, under any circumstances:** reinstall the app, clear site data, sign out, or
switch browsers. Any of those can destroy the queue. That is the day's takings.

## 5. An order is wrong

Correct it in the app — the state machine allows it. Two things to explain:

- The ledger will show **two rows**, not an edited one. It is append-only, so a correction
  is a new signed entry (`docs/DATA.md`). That is correct and it is what an auditor wants.
- A no-show is **not** a cancellation. She keeps the money and the cookies return to
  stock. If she picks the wrong one the P&L will be wrong by that box.

## 6. Someone cannot sign in

| Cause | Check |
| --- | --- |
| No auth configured yet | Expected before T-04 |
| Wrong password | Password reset from the sign-in screen |
| Redirect loop | Supabase → Authentication → URL Configuration. The deploy URL must be in the allowlist. This looks exactly like a code bug and is not. |
| Account never invited | `profiles` has no row → invite them (Settings, owner only) |
| Right password, wrong role | `profiles.role`. The UI hides money; RLS refuses it. Both need the role to be right. |

## 7. Restore from backup

1. Supabase → Database → Backups. Pick the point in time.
2. **Restore into a new project first, not over production.** Verify the data is there and
   the totals match what she expects.
3. Only then repoint `NEXT_PUBLIC_SUPABASE_URL` at the restored project.

An untested restore is a belief, not a backup. T-19 is where you test it before you need
it.

If Supabase backups are not enabled yet, her Settings export is the backup. Ask her for
the most recent file.

## 8. Who to call, and what to send

Send: the `/api/health` response, the Vercel deployment URL and its status, the Sentry
issue link if there is one, and **what she was doing when it broke** — that last one is
worth more than the other three.

Do not send: screenshots containing customer names or phone numbers. Crop them.

## Afterwards

Write it up in `docs/SESSIONS.md`. A real incident is the highest-quality bug report this
project will ever get, and the only one that comes from the person who actually uses it.
