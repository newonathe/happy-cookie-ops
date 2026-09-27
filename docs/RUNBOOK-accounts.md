# Runbook — staff accounts

Architecture A has no admin UI for this and no signup flow (`enable_signup = false` in
Supabase Auth, both locally and on the hosted project). Every account is created by hand
by the owner or Ethan, following this runbook. There is no self-service path, and that is
deliberate: `docs/state/decision-register.md` records that staff accounts are provisioned
by the owner, not self-served.

An account has two parts, and both are required:

1. **An Auth user** (`auth.users`) — the email/password Supabase actually checks at sign-in.
2. **A profile row** (`public.profiles`) — `role` and `active`. Nothing in this app looks at
   an Auth user alone: `current_role_name()` (`supabase/migrations/20260101000000_init.sql`,
   tightened by `20260101001100_active_profile_authority.sql`) returns a role only when a
   matching, **active** profile row exists. A user with no profile row, or `active = false`,
   is signed in but has no role — every RLS policy and `src/lib/auth/live-gate.ts` both
   treat that as "not staff".

## Who gets an account

From the decision register (helper list, DP-05):

| Person   | Role                       | Notes                                                                                             |
| -------- | -------------------------- | ------------------------------------------------------------------------------------------------- |
| Cine To  | `owner`                    | Everything, including P&L, costs and margins.                                                     |
| Kristian | `helper` **and** `support` | Two separate accounts, two separate emails — a person, not a role, is temporary or not.           |
| Ethan    | `helper`                   | Orders, sales, inventory, counts, bazaar. No costs, expenses or profit anywhere in the app.       |
| Cervo    | `helper`, time-boxed       | Revoke (step 4) at the end of the event it was created for — do not wait for someone to remember. |
| Misty    | `helper`, time-boxed       | Same as Cervo.                                                                                    |

`support` is KETH AI Support in the prototype's roster: system health, backups, error
logs, exports — no customer or financial browsing. It is a role, not a person; whoever
holds it gets the `support` profile, same as any other account.

## 1. Create the Auth user (owner-assisted, no email dependency)

Supabase dashboard → **Authentication → Users → Add user**. Enter the email, set a
temporary password yourself, and check **Auto Confirm User** (there is no SMTP configured,
so an unconfirmed user can never click a confirmation link). Hand the temporary password to
the person over a channel you already trust — Messenger, in person — not email.

Locally, the equivalent is the admin API (`SUPABASE_SERVICE_ROLE_KEY` / the local
`SECRET_KEY` from `supabase start`), never the public sign-up form:

```js
await adminClient.auth.admin.createUser({ email, password, email_confirm: true });
```

## 2. Create the profile row

In the SQL editor (dashboard) or `psql` (local), as the `postgres` role — this table has no
INSERT policy for `authenticated`, only `owner writes staff` (`is_owner()`), so this step
runs with elevated access, not through the app:

```sql
insert into public.profiles (id, role, display_name, active)
values ('<auth-user-uuid>', 'helper', 'Ethan', true);
```

`role` is one of `owner`, `helper`, `support` (`app_role`, `supabase/migrations/20260101000000_init.sql`).
Get `<auth-user-uuid>` from the Auth user you just created (dashboard: click the user; local:
the `id` the admin API returned).

## 3. First sign-in

Point them at `/sign-in` with the temporary password. `src/app/sign-in/sign-in-form.tsx`
calls `supabase.auth.signInWithPassword()` directly — no BFF, no invite link. Once signed
in, `src/components/app/live-gate.tsx` reads the profile row, calls `engine.setRole(role)`,
and routing follows the role automatically (`ROLES[role].home` in
`src/store/engine/ops-engine.js`). There is nothing further for the owner to configure per
account.

Have them change the temporary password on first login (dashboard → Users → that user →
**Send password recovery**, or set a new one directly the same way as step 1 — see below).

## 4. Revoking access

```sql
update public.profiles set active = false where id = '<auth-user-uuid>';
```

This takes effect on the server immediately, with no sign-out step and no waiting for the
JWT to expire: `current_role_name()` re-checks `active` on every call, so every RLS policy
denies that account's very next request. The account's Auth session itself is not revoked
by this — it stays technically valid until it next re-authenticates, and every request it
makes is simply denied.

The client UI is not that fast, and should not be assumed to be: `src/lib/auth/live-gate.ts`
only re-checks the profile on token refresh and on the tab regaining focus, so a screen
already open and idle can keep showing stale local state for a while (it holds no financial
or new data, because every actual read is already being denied above). If access must be
cut immediately and visibly — a phone lost, not just a shift ending — also sign that user
out from the dashboard (Authentication → Users → that user → **Sign out**), which revokes
the session outright rather than waiting for the next check.

The Auth user itself is left alone (do not delete it): if the same person needs access
again later, flipping `active` back to `true` is enough, and the account's own audit
history stays attached to one stable `id`. Delete the Auth user only when the person is
gone for good — Cervo and Misty after MoreSem, not on every off day.

## 5. Password recovery — through the dashboard, not email

There is no SMTP configured, so "forgot password" cannot be self-service. When someone is
locked out: dashboard → **Authentication → Users** → that user → **Send password recovery**
(if you later configure SMTP) or, with no SMTP, **Reset password** to set a new temporary
one directly, the same way as step 1. Hand it over the same trusted channel as before.

## 6. Session lifetime

Dashboard → **Authentication → Sessions** (not the JWT Keys page): set **Access token (JWT) expiry** to
**1800 seconds**, matching `supabase/config.toml`'s local `jwt_expiry = 1800`. Access tokens
are valid for the full 30 minutes regardless of what happens to the profile row in that
window — step 4's `active = false` is what actually revokes access, not the JWT expiry. The
30-minute window bounds how long a _not-yet-deactivated_ token stays useful if it leaks, and
how quickly a deactivation is guaranteed to be checked even if nothing else re-checks it
sooner (`src/components/app/live-gate.tsx` re-checks on `TOKEN_REFRESHED` and on the tab
regaining focus, which is normally much sooner than 30 minutes).

The client-side idle sign-out (`src/lib/auth/idle-signout.ts`) is separate and shorter for
owner/support than for helper — see the file's own comment and
`docs/state/decision-register.md` DP-15, which is still open. There is no absolute session
lifetime under this architecture to fall back on if it fails (that was a property of the
archived BFF), so it signs out carefully: `{ scope: 'local' }` only, so it never signs out
the owner's other devices; it force-clears the session's storage directly if the network
sign-out call itself fails, so a lock-out with no signal does not leave a live refresh token
behind for connectivity's return to silently revive (`src/lib/auth/live-gate.ts`); and it
never touches the offline sale queue (MASTER-PLAN invariant 2). A profile re-check that
merely can't reach the network — no signal, a timeout — is treated as inconclusive, not as a
denial, once a session has already been verified once: this is what lets Bazaar Mode keep
selling with no signal instead of getting signed out by its own connectivity re-checks.

## 7. Account MFA (Supabase, Cloudflare, GitHub)

These are the accounts that can create/delete staff accounts, redeploy the app, or push to
the private repository — not the staff accounts above. Turn on MFA (an authenticator app,
not SMS) for:

- The Supabase account that owns the project.
- The Cloudflare account (Workers static assets hosting).
- The GitHub account that owns the private repository.

For each, **download the offline recovery codes at setup time** and store them somewhere
that is not this repository and not the same device as the authenticator — a password
manager's secure notes, or printed and kept with other business paperwork. Losing both the
authenticator and the recovery codes for the Supabase account means losing the ability to
manage staff accounts at all until support intervenes.

## Rehearsed

Rehearsed once on the local Supabase stack (`pnpm db:start`, 28 migrations): created a
staff Auth user through the admin API, set its profile to `role: helper, active: true`,
signed in with `signInWithPassword` against the `sb_publishable_…` key, confirmed a
finance-only table (`ledger_entries`, owner-only per `supabase/migrations/20260101000000_init.sql`)
returns zero rows to a helper both before and after `refreshSession()` — restrictions hold
on refresh — then set `active: false` and confirmed the same account can still read its own
profile row (`active: false`, exactly what `live-gate.ts` depends on), still sees zero
finance rows, and `is_staff()` now returns `false`. The local stack needed one correction to
actually exercise this: `supabase/config.toml`'s `[auth.email]` had `enable_signup = false`,
which — for this provider section — disables the email/password provider entirely
(`GOTRUE_EXTERNAL_EMAIL_ENABLED`), not just self-serve signup; that is the top-level
`[auth].enable_signup = false` instead (`GOTRUE_DISABLE_SIGNUP`). Both are set correctly now.
Check the equivalent hosted-project dashboard toggles (Authentication → Providers → Email:
enabled; Authentication → Settings → Disable new user signups: on) when provisioning the
hosted project — this local file does not configure it.
