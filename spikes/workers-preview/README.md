# Hosted static preview (Workers static assets)

The MP-04 hosted preview under architecture A: the same `build/pages-spike/public` export, served by
Cloudflare Workers static assets with no Worker script, bindings or secrets. `_headers` supplies the
generated CSP and cache policy.

Build it against the synthetic `happy-cookie-preview` Supabase project (fake catalogue data only), swap the
payment QR images in the build output for "test preview, do not pay" placeholders, then deploy:

```bash
pnpm build:pages:spike            # with NEXT_PUBLIC_SUPABASE_URL / …PUBLISHABLE_KEY for the preview project
node scripts/preview-placeholder-qr.mjs
pnpm exec wrangler deploy --config spikes/workers-preview/wrangler.jsonc
node scripts/test-hosted-preview.mjs https://<worker>.<subdomain>.workers.dev
```

Never point this at a project holding real data, and never add a secret or service key here.
