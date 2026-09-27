/**
 * "demo" (the default) is every environment except the static export: local dev, Vercel,
 * Docker, CI. It keeps the localStorage/harness fixtures every existing test relies on.
 *
 * "live" is set only by the static-export build (`scripts/build-pages-spike.mjs`), the one
 * artifact meant for real Cloudflare Workers static-asset hosting. In live mode there is no
 * owner/demo bootstrap: staff routes require an actual Supabase session, and role/routing
 * come from the signed-in profile through RLS (`src/lib/auth/live-gate.ts`).
 *
 * Read as a literal `process.env.NEXT_PUBLIC_APP_MODE` member expression, not a variable
 * lookup — that is the exact pattern Next's client bundler inlines at build time. A
 * computed `process.env[name]` would come back `undefined` in the shipped browser bundle.
 */
export function isLiveMode(): boolean {
  return process.env.NEXT_PUBLIC_APP_MODE === 'live';
}
