# Phase 02 — Identity

Until the app knows who is holding the phone, every other permission is decoration. The
prototype's role switcher decides what is *shown*; row-level security decides what can be
*read*. This phase connects the two.

---

## T-04 — Staff accounts and the real role gate

**Give it to** Claude Code · **Depends on** T-02 · ~1 session, split into two commits

**Context** `src/middleware.ts`, `src/app/sign-in/`, `src/store/ops-runtime.tsx`, `supabase/migrations/20260101000000_init.sql`, `docs/DATA.md`, `docs/CONTRACTS.md` (the `/api/staff/invite` section)

### The prompt

> Two commits. Do not start the second until I have approved the first.
>
> **Commit 1 — the invite endpoint.**
>
> Implement `POST /api/staff/invite` exactly as specified in `docs/CONTRACTS.md`.
> Requirements, all of them load-bearing:
> - Owner only. Check the caller's role by reading `profiles` with `auth.uid()`. **Never**
>   from the request body, never from engine state, never from a header. A role that
>   arrives from the client is an attacker's input.
> - Parse the body with Zod before touching it. Email a real email, role one of the three
>   enum values, display name 1–80 characters.
> - Use `SUPABASE_SERVICE_ROLE_KEY` for the invite itself, and confirm by grepping that
>   the module holding it is never imported from a `'use client'` file. If it is, that is
>   a full key disclosure and the task stops.
> - Insert the `profiles` row and the `auth` user in a way that cannot leave one without
>   the other. If that is not possible in one transaction, say so and describe the
>   cleanup path instead of pretending it is atomic.
> - Write an `audit_log` row for the invite and for every later role change.
> - Test: a helper's session gets `403`; a malformed body gets `400`; a valid owner
>   request creates exactly one user and one audit row.
>
> **Commit 2 — the role gate.**
>
> Make the app's role come from `profiles` instead of engine state:
> - the server reads the role once and passes it into `OpsApp`;
> - the engine's role continues to drive what is shown, so no ported screen changes;
> - the prototype's manual role switcher keeps working when `NEXT_PUBLIC_HARNESS=1`, and
>   has no effect on what the server will actually return when it is `0`.
> - extend `src/middleware.ts` so a signed-in non-owner is redirected away from the
>   money screens (`/pnl`, `/reconcile`) rather than shown an empty one.
>
> Then a staff-management panel inside the existing Settings screen. **Extend it; do not
> restyle it.** Use the style values already in that file — the same 44px controls, the
> same borders. If you cannot add the panel without changing existing markup, describe
> what you want to change and wait.
>
> Playwright test to finish: sign in as a helper, attempt `/pnl` and `/reconcile`, assert
> both redirect and that no money value ever appears in the DOM.

### Accept when

- `pnpm verify` and `pnpm test:e2e` green.
- A helper session cannot reach `/pnl` or `/reconcile`, proven by a test.
- `grep -rn "SUPABASE_SERVICE_ROLE_KEY" src/` appears only in server-only modules.
- The port-integrity check still passes — the Settings screen was extended, not restyled.
- Every role change produces an audit row.

### Stop if

- The service-role key turns out to be reachable from a client module. Fix that first,
  alone, as its own commit.
- Making the panel fit requires editing ported markup. That is a human decision.

---

## T-05 — Harden the sync endpoint

**Give it to** Claude Code · **Depends on** T-02 · ~half session

**Context** `docs/OFFLINE.md` (**read this first**), `src/app/api/sync/route.ts`, `src/lib/offline/`, `supabase/migrations/20260101000100_sync_sales.sql`, `docs/CONTRACTS.md`

### The prompt

> Read `docs/OFFLINE.md` before you write anything. Its five rules are not negotiable, and
> the most important one is that a sale leaves the device's queue **only** when the server
> has named its `clientId`.
>
> Add to `/api/sync`:
> 1. **Apply the existing rate limiter.** `src/lib/rate-limit.ts` is written and its
>    limits are already chosen and commented — `sync:post` is 30/minute, deliberately
>    generous because a bazaar phone catching up may post several batches. Call
>    `checkRateLimit('sync:post', callerId(request.headers, user.id))` and return
>    `tooManyRequests(result)` on refusal.
>
>    **Do not add Upstash or a second limiter.** The store is Postgres on purpose —
>    `docs/GAPS.md` §2.6 has the reasoning, and the short version is that a second paid
>    service for one baker is the wrong trade. It also **fails open, loudly**: a limiter
>    that rejects real customers because its counter table is unreachable has done more
>    damage than the abuse it was guarding against.
> 2. **A request size cap** before parsing, not after. The contract caps 200 sales; a
>    10 MB body should be rejected without being deserialised.
> 3. **Structured logging** of accepted and rejected **counts** and the device id. Never
>    log sale contents, customer names, phone numbers or payment references. Include the
>    duration — you will want it when someone says sync is slow.
> 4. **`GET /api/sync/status`** per `docs/CONTRACTS.md`: how many sales the server holds
>    for this device and when the last one arrived. Counts only, never contents. This is
>    what lets the person holding the phone believe the badge.
>
> Then the test that matters most: post the same batch **three times** and assert that
> exactly one `event_sales` row, one `ledger_entries` row and one `audit_log` row exist.
> Double-counted money is the worst bug this app can have, and idempotency is the only
> thing standing between it and a retry.
>
> Do not change the queue's clearing logic. If you believe it is wrong, say why and wait —
> that code is the reason a lost signal does not become a lost sale.

### Accept when

- Three identical posts produce exactly one sale, one ledger entry, one audit row.
- `GET /api/sync/status` returns counts and no sale contents.
- No log line contains a name, a phone number or a payment reference.
- `pnpm verify` green.

### Stop if

- You find a path where the device could clear a row the server did not acknowledge.
  That is a critical bug — report it, do not fix it inside this task.

---

## T-06 — Cross-model review of phase 02

**Give it to** Codex, read-only · **Depends on** T-04, T-05 · 30 min

```bash
codex --profile review
```

Run, in this order, from `07-review-library.md`:

1. **Security review** — this phase is auth, roles, keys and money. It is the highest-risk
   diff in the project.
2. **General diff review.**
3. **Port auditor** (in Claude Code, `> use the port-auditor subagent`) — the Settings
   screen was touched, so fidelity needs checking by something that reads the prototype.

Resolve every `critical` and `blocker` before merging. A `high` finding on an auth path
is a blocker whatever it is labelled — nobody is going to come back for it.

### Accept when

- The security reviewer's verdict is SAFE TO MERGE, explicitly.
- The port auditor reports no unexplained difference.
