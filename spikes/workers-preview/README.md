# Hosted static preview (Workers static assets)

The MP-04 hosted preview under architecture A: the same `build/pages-spike/public` export, served by
Cloudflare Workers static assets with no Worker script, bindings or secrets. `_headers` supplies the
generated CSP and cache policy.

Always deploy with `scripts/deploy-preview.mjs`: it builds against the synthetic `happy-cookie-preview` Supabase
project (fake catalogue data only), swaps the payment QR images for "test preview, do not pay" placeholders,
refuses to continue if a real QR is still in the output, then deploys. A plain build puts the real QR codes back.

```bash
node scripts/deploy-preview.mjs    # with NEXT_PUBLIC_SUPABASE_URL / …PUBLISHABLE_KEY for the preview project
node scripts/test-hosted-preview.mjs https://happy-cookie-preview.admin-kethai.workers.dev
```

Never point this at a project holding real data, and never add a secret or service key here.
