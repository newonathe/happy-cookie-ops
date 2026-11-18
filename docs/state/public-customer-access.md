# Public customer Access cutover

Proposed, not provisioned. This requires approval for **one new Access application and one new policy**. Do not change the existing owner application `fe0eb039-b3b5-4acc-b533-d33868810e89`, its policy, identity provider, or approved-email secrets. Local Wrangler authentication is unavailable; do not paste credentials into chat.

Print the exact definition with pinned Node/pnpm:

```text
node scripts/check-owner-trial-release.mjs --manifest
```

The new application is **Happy Cookie public customer pages**, type **Self-hosted**. Its seven public destinations are on `happy-cookie-owner-trial.admin-kethai.workers.dev`:

- `/shop`
- `/checkout`
- `/status`
- `/lookup`
- `/_next/static/*`
- `/assets/*.png`
- `/manifest.webmanifest`

Create one policy named **Public customer pages**, action **Bypass**, Include **Everyone**, with no Require or Exclude rules. Do not add the bare hostname, `/*`, `/assets/*`, owner pages, or another identity policy. The manifest has the exact API field values.

In the account containing the existing owner app, open **Zero Trust → Access controls → Applications → Create new application → Self-hosted and private**. Use **Add public hostname** for each destination; use **Switch to custom input** if necessary for the Workers hostname. Check every path against the manifest before saving. [Current setup instructions](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/).

**Saving the bypass app makes these paths public immediately.** First finish source verification and independent review; cut over while the app is safe to release. Send only the new application ID. Configure that ID as repository variable `TRIAL_PUBLIC_CUSTOMER_ACCESS_APP_ID`; leave `TRIAL_ACCESS_EMAIL_SHA256` in Secrets. Never replace the owner app ID with this ID.

Run anonymous CLI checks before claiming availability: all four customer routes, with/without trailing slash, must load without Access/OTP; required HTML/assets must match the emitted bytes and MIME. Root, Money, Orders, Products, Settings, Bazaar, sign-in, service worker and lookalike paths must remain Access-denied. Check customer rendering at 390px and desktop without placing an order. A status page without its private token must disclose no order details. Then release through the deploy PR and verify the exact merge's schema/Access/post-deploy jobs and Worker version.

The current Workers documentation confirms hostname/path rules take precedence over Worker-level Access. This does not require changing the owner fallback. [Access hierarchy](https://developers.cloudflare.com/workers/configuration/cloudflare-access/).

Rollback removes **only the new public app/policy**, then verifies customer paths and owner paths return to the private Access barrier. Keep the owner app/provider/allow policy intact. If owner protection cannot be verified, use the established fail-closed Worker-domain disable procedure; do not broaden a bypass to make a check pass.
