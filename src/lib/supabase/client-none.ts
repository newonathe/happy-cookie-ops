/**
 * Demo builds without a backend (next.config.ts swaps this in for `client`). Every caller checks `hasSupabaseConfig()`
 * or live mode first, so this is never reached; if it ever is, it fails loudly instead of shipping the SDK (HCB-083).
 */
export function createClient(): never {
  throw new Error(
    'This build has no Supabase backend (demo build without NEXT_PUBLIC_SUPABASE_URL).'
  );
}
