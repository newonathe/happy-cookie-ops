'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/types/database';

/**
 * Browser client. Carries the publishable key only; every read is filtered by RLS.
 *
 * Both values are read as literal `process.env.NEXT_PUBLIC_…` member expressions —
 * not a variable lookup — because that is the exact pattern Next's client bundler
 * inlines at build time. A computed `process.env[name]` would survive typechecking
 * and tests but come back `undefined` in the shipped browser bundle.
 */
export function createClient() {
  return createBrowserClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
    requireEnv(
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    )
  );
}

function requireEnv(name: string, value: string | undefined): string {
  if (!value) throw new Error(name + ' is not set. Copy .env.example to .env.local.');
  return value;
}
