# Phase 06 — Production

Getting it onto the phone that will actually use it, and off your machine.

---

## P-01 — Pre-deploy audit

**Give it to** Claude Code · **Depends on** phase 05 · ~1 session

**Context** `next.config.ts`, `src/middleware.ts`, `public/sw.js`, `.env.example`, `docs/DEPLOY.md`, `supabase/migrations/`

### The prompt

> Audit this repository for production. Report findings before fixing anything, ranked by
> what they cost the owner if they go wrong — not by how interesting they are.
>
> 1. **Secrets.** Every environment variable in use, where it is read, and whether it is
>    correctly server-only. `grep` for the service-role key across the whole `src` tree and
>    trace every import chain that reaches it. Confirm `.env.local` is gitignored and that
>    no secret has ever been committed (`git log -p -- .env*`).
> 2. **Security headers** in `next.config.ts`. Is a Content-Security-Policy missing, and
>    what would it need to allow — the Supabase origin, the font host, inline styles
>    (which this app uses everywhere by design)? Propose one that does not break the app,
>    and say what it would block.
> 3. **Service worker cache scope.** Confirm no order, ledger or customer response is
>    cacheable. Read `public/sw.js` against `docs/OFFLINE.md` and say whether the cache
>    version strategy actually evicts an old shell on deploy.
> 4. **RLS coverage.** Every table, its policies, and any table a migration added without
>    them. Cross-check against `docs/DATA.md` — a table in the schema but not in the doc
>    is a table nobody reviewed.
> 5. **Rate limits.** Every public endpoint: `/api/orders`, `/api/orders/lookup`,
>    `/api/sync`, `/api/health`. An unlimited public endpoint on a hobby-tier database is
>    a denial-of-service waiting to happen.
> 6. **Error paths.** What the owner sees when Supabase is down, when the network drops
>    mid-write, and when a deploy happens while she has the app open.
> 7. **The install.** Manifest correctness, icon sizes, `start_url`, and whether the
>    shortcuts work.
>
> Output: a table of findings — severity, file, what breaks, the fix, and the effort. Then
> stop. I will pick what gets fixed.

### Accept when

- Every finding has a severity, a file and a proposed fix.
- The service-role key's import chain is traced, not assumed.
- No secret in git history.

---

## P-02 — Deploy

**Give it to** you, with Claude Code reading `docs/DEPLOY.md` alongside · 1 hour

Follow `docs/DEPLOY.md`. The order matters:

1. **Supabase production project.** Apply migrations with `supabase db push` against it —
   never against production from an agent session. Verify RLS is enabled on all 15 tables
   in the production database specifically. A local check proves nothing about production.
2. **Create the owner's account.** One `owner` profile. Sign in as her and confirm she can
   see money.
3. **Vercel.** Environment variables per `docs/DEPLOY.md`, including
   `NEXT_PUBLIC_HARNESS=0`. Confirm the harness is actually gone from the deployed build,
   in the browser, not in theory.
4. **Auth URLs.** Site URL and redirect list in Supabase. Getting this wrong produces a
   sign-in loop that looks like a code bug.
5. **Smoke test the deployment** before telling anyone it exists: all 25 routes, a real
   order through `/shop`, a bazaar sale offline and its sync, and the health endpoint.

### Accept when

- All 25 routes load in production.
- The harness is invisible in the deployed build.
- A real order placed through the public shop appears in the owner's orders screen.
- `/api/health` returns `ok`.

---

## P-03 — Install on the owner's phone

**Give it to** you · 30 minutes, with the owner present

The moment the project is real. Do it with her, not for her.

1. Install from the home screen — Chrome: menu → Install app. Safari: Share → Add to Home Screen.
2. Confirm it opens standalone, with no browser chrome.
3. Long-press the icon: Bake plan, Orders, Bazaar Mode should be there.
4. Aeroplane mode. Open it from the icon. It must open.
5. Take a test sale in Bazaar Mode with no signal. Restore signal. Watch it sync.
6. Void the test sale together, so she has seen a mistake being undone.
7. Show her the Settings export and where the file goes. **This is the most important
   thing she learns today** — it is her backup.

### Accept when

- She has installed it herself, on her own phone.
- She has taken and voided a sale offline without help.
- She knows how to export her books.

---

## P-04 — Handover

**Give it to** Claude Code · ~half session

**Context** `README.md`, `docs/DEPLOY.md`, `docs/TECH-DEBT.md`, `docs/SESSIONS.md`

### The prompt

> Write `docs/RUNBOOK.md` — the document someone reads at 6am when the app is broken and
> a drop closes at noon. Not a summary of the architecture. Operational only.
>
> Sections:
> 1. **Is it down?** `/api/health`, the Vercel dashboard, the Supabase dashboard — in the
>    order to check them, with what each result means.
> 2. **Sync is not working at a bazaar.** The exact steps for the person holding the
>    phone. Lead with the reassurance that the sales are safe on the device, because that
>    is true and it is what she needs to hear first.
> 3. **An order is wrong.** How to correct it, and why the ledger shows two rows afterwards.
> 4. **Someone cannot sign in.** Every cause, from a wrong password to a misconfigured
>    redirect URL.
> 5. **Restore from backup.** Step by step, including how to verify the restore before
>    trusting it.
> 6. **Roll back a deploy.** Including what happens to a service worker cached on a phone
>    mid-deploy.
> 7. **Who to call, and what to send them.** Which logs, which screenshots.
>
> Write it for the owner where she can act, and for a developer where she cannot. Say
> which is which. Every step is a command or a click, never "investigate the issue".

### Accept when

- Every section ends in an action, not a diagnosis.
- The bazaar section is readable by the owner alone, under pressure.
- Rollback and restore are both step-by-step and both mention verification.
