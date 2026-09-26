# MP-08p — staff sign-in through the BFF

Status: **proposed, awaiting Ethan's approval** (2026-09-26, Claude). Nothing below is implemented.

## Why

The exported `/sign-in` still signs in from the browser with `createClient().auth.signInWithPassword` (`src/app/sign-in/sign-in-form.tsx` L25). That call goes straight to `NEXT_PUBLIC_SUPABASE_URL`.
- On a hosted Pages/Workers deployment, the generated CSP (`connect-src` falls back to `'self'`) blocks it.
- It also bypasses the BFF session design: an HttpOnly `__Host-hc-session` cookie, with provider tokens kept server-side.

The BFF login route already exists and is tested: `POST /api/v1/session/login` in `src/lib/auth/session-handler.ts`.
- Headers: `x-hc-request: 1`, same origin.
- Strict body: `{ email, password }`.
- Responses: 200 with the session and cookie, 401 `unauthenticated`, 429 with `Retry-After`, 503 otherwise.

## Bounded change (about 100 lines)

1. A new `src/lib/auth/bff-client.ts` with `signInThroughBff(email, password)`:
   - `fetch('/api/v1/session/login', { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error' })` with `x-hc-request: 1`.
   - It maps 200 / 401 / 429 / other to a typed result. It never logs or stores the password or response body.
2. `src/app/sign-in/sign-in-form.tsx`: only `submit()` changes. The markup, copy and inline styles stay identical.
   - Path choice: the BFF path is used when the build sets `NEXT_PUBLIC_AUTH_MODE=bff`, which `scripts/build-pages-spike.mjs` will set for the static export. The Vercel demo keeps its current path until its retirement is decided.
   - 401 keeps the existing message. 429 and 503 get one short message each.
3. Tests:
   - A unit test for `bff-client` covering status mapping, headers, and no body leakage in errors.
   - Extend the existing Pages spike oracle so `/sign-in` in the export contains no direct Supabase auth call.
   - The real lifecycle proof reuses the MP-08n.3 Workerd → private provider fixture.

## Acceptance

- Pinned `pnpm verify` passes.
- `pnpm build:pages:spike`, `pnpm test:pages:spike` and `pnpm test:workers:spike` pass.
- Port integrity is unchanged.
- A Sonnet-high review, then Opus sign-off. The Codex review is queued before commit.

## Out of scope

Session bootstrap after sign-in (GET `/api/v1/session` → role routing) is MP-07 real bootstrap. The DP-15 idle timeout waits on Ethan's decision. Provisioning waits on DP-05. There is no hosted deployment.
