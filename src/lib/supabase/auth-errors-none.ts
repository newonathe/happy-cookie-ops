/**
 * Demo builds without a backend (next.config.ts swaps this in for `auth-errors`): the sign-in gate never runs there, so
 * no Supabase error can reach this check (HCB-083: the SDK was ~860 KB of unused source on /bazaar).
 */
export function isAuthRetryableFetchError(error: unknown): boolean {
  void error;
  return false;
}
