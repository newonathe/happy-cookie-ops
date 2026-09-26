import { SCREEN_KEYS, pathForScreen } from '@/lib/screens';

/** Canonical route paths a sign-in redirect is allowed to land on. */
const ALLOWED_RETURN_PATHS: Set<string> = new Set(SCREEN_KEYS.map(pathForScreen));

/**
 * Validates an untrusted post-login destination. Only an exact, unmodified member of
 * the canonical screen path set survives; everything else — including malformed,
 * oversized, non-string or non-canonical values — falls back to '/'. No decoding,
 * trimming or normalization is performed here: URLSearchParams already decodes once
 * at its own boundary, and re-processing the value would reopen the bypasses this
 * guard exists to close.
 */
export function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string') return '/';
  if (value.length > 128) return '/';
  return ALLOWED_RETURN_PATHS.has(value) ? value : '/';
}

/**
 * Reads the `next` query parameter set from a search-params-like object. A duplicated
 * `next` parameter is treated as untrusted and falls back to '/'; exactly one value is
 * required before it is validated by safeReturnPath.
 */
export function returnPathFromSearch(params: Pick<URLSearchParams, 'getAll'>): string {
  const values = params.getAll('next');
  return values.length === 1 ? safeReturnPath(values[0]) : '/';
}
