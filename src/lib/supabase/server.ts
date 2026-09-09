import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { requireEnv } from './config';

/**
 * Server client for route handlers and server components.
 *
 * Reads the session from cookies, so RLS sees the real user. Route handlers may write
 * cookies; server components may not, hence the try/catch Supabase's own guidance uses.
 */
export async function createClient() {
  const store = await cookies();
  return createServerClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            /* called from a server component; the middleware refresh covers it */
          }
        }
      }
    }
  );
}
