/**
 * Whether a failed `supabase.rpc(...)` means "this database has no such function yet": PostgREST's PGRST202 (not in the schema
 * cache), Postgres's 42883 (undefined function) or, when the caller passes it, an HTTP 404. The hosted trial runs newer code before a migration is applied,
 * and a reader that sees this answers "missing" (the older behaviour), never "failed" (a real error to report).
 */
export function isMissingFunction(
  error: { code?: string | null } | null | undefined,
  status?: number | null
): boolean {
  const code = error?.code;
  return code === 'PGRST202' || code === '42883' || status === 404;
}
