import 'server-only';

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { requireEnv } from './config';

/**
 * The service-role client. Bypasses row-level security entirely.
 *
 * `import 'server-only'` is the guard that matters: it makes the build fail if any
 * module reachable from a `'use client'` file imports this, rather than leaving the
 * mistake to a code review. A leaked service-role key is total disclosure of the books.
 *
 * Use it only where RLS cannot express the rule: the rate-limit counter (a caller must
 * increment a bucket it may not read), staff invites, and the one-time books import.
 * Everywhere else, use the request-scoped client in server.ts so RLS still applies.
 */
export function createServiceClient() {
  return createClient<Database>(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
