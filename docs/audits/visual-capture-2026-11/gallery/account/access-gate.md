# Session and access gate

**ACTUAL application.** [Back to account](README.md)

- Manifest id: `account/access-gate`
- Source: `src/components/app/live-gate.tsx`
- Role: owner
- Reference views: none (found in code)

## session-expired-redirect

getUser returns no user: the real gate redirects to sign-in, so this is the same image as Sign in, untouched. Group: failure. Fixture: `fail:auth=expired`. How it was reached: rpc-fixture.

**p390** 390×844 (pixel-identical to `account/sign-in/untouched@p390`)

![Session and access gate session-expired-redirect p390](../../screenshots/account/sign-in/untouched/p390.webp)

**d1440** 1440×900 (pixel-identical to `account/sign-in/untouched@d1440`)

![Session and access gate session-expired-redirect d1440](../../screenshots/account/sign-in/untouched/d1440.webp)

## idle-time-spent

Clock moved five and a half hours forward with no activity. The page did not change. Group: failure. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 (pixel-identical to `sell/orders/populated@p390`) · [full page](../../screenshots/sell/orders/populated/p390.full.webp)

![Session and access gate idle-time-spent p390](../../screenshots/sell/orders/populated/p390.webp)

**d1440** 1440×900 (pixel-identical to `sell/orders/populated@d1440`) · [full page](../../screenshots/sell/orders/populated/d1440.full.webp)

![Session and access gate idle-time-spent d1440](../../screenshots/sell/orders/populated/d1440.webp)

## inactive-profile

Lands on the sign-in page: the same image as Sign in, untouched. Group: failure. Fixture: `fail:profile=inactive`. How it was reached: rpc-fixture.

**p390** 390×844 (pixel-identical to `account/sign-in/untouched@p390`)

![Session and access gate inactive-profile p390](../../screenshots/account/sign-in/untouched/p390.webp)

**d1440** 1440×900 (pixel-identical to `account/sign-in/untouched@d1440`)

![Session and access gate inactive-profile d1440](../../screenshots/account/sign-in/untouched/d1440.webp)

## no-signal-first-open

First check cannot complete: notice instead of sign-out. Group: failure. Fixture: `fail:auth=network`. How it was reached: rpc-fixture.

**p390** 390×844

![Session and access gate no-signal-first-open p390](../../screenshots/account/access-gate/no-signal-first-open/p390.webp)

**d1440** 1440×900

![Session and access gate no-signal-first-open d1440](../../screenshots/account/access-gate/no-signal-first-open/d1440.webp)

## identity-check-pending

Before the first check answers the app draws nothing behind the gate. Group: failure. Fixture: `fail:auth=never`. How it was reached: rpc-fixture.

**p390** 390×844 (pixel-identical to `make/products/malformed-answer@p390`)

![Session and access gate identity-check-pending p390](../../screenshots/make/products/malformed-answer/p390.webp)

**d1440** 1440×900 (pixel-identical to `make/products/malformed-answer@d1440`)

![Session and access gate identity-check-pending d1440](../../screenshots/make/products/malformed-answer/d1440.webp)

## profile-read-failed

Group: failure. Fixture: `fail:profile=down`. How it was reached: rpc-fixture.

**p390** 390×844 (pixel-identical to `account/access-gate/no-signal-first-open@p390`)

![Session and access gate profile-read-failed p390](../../screenshots/account/access-gate/no-signal-first-open/p390.webp)

**d1440** 1440×900 (pixel-identical to `account/access-gate/no-signal-first-open@d1440`)

![Session and access gate profile-read-failed d1440](../../screenshots/account/access-gate/no-signal-first-open/d1440.webp)

## bazaar-only-offline-open

A day is held; reload with no signal opens Bazaar Mode alone. Group: failure. Fixture: `bazaar:planned`. How it was reached: ui-driven.

**p390** 390×844

![Session and access gate bazaar-only-offline-open p390](../../screenshots/account/access-gate/bazaar-only-offline-open/p390.webp)

**d1440** 1440×900

![Session and access gate bazaar-only-offline-open d1440](../../screenshots/account/access-gate/bazaar-only-offline-open/d1440.webp)

## other-screen-refused-offline

Group: failure. Fixture: `bazaar:planned`. How it was reached: ui-driven.

**p390** 390×844

![Session and access gate other-screen-refused-offline p390](../../screenshots/account/access-gate/other-screen-refused-offline/p390.webp)

**d1440** 1440×900 (pixel-identical to `account/access-gate/bazaar-only-offline-open@d1440`)

![Session and access gate other-screen-refused-offline d1440](../../screenshots/account/access-gate/bazaar-only-offline-open/d1440.webp)
