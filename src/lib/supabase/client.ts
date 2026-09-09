'use client';

import { createBrowserClient } from '@supabase/ssr';

/** Browser client. Carries the anon key only; every read is filtered by RLS. */
export function createClient() {
  return createBrowserClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  );
}

function requireEnv(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY'): string {
  const value = process.env[name];
  if (!value) throw new Error(name + ' is not set. Copy .env.example to .env.local.');
  return value;
}
