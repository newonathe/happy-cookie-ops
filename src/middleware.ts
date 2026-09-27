import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { hasSupabaseConfig } from '@/lib/supabase/config';

/**
 * Refreshes the Supabase session on every request so a phone left open overnight is
 * still signed in, and keeps the staff screens off the public internet.
 *
 * The four customer screens are deliberately open: a customer ordering cookies does not
 * get an account.
 */
const PUBLIC_PATHS = ['/shop', '/checkout', '/status', '/lookup'];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // The quarantined endpoint returns only 503/no ACK and must never contact auth.
  if (request.nextUrl.pathname === '/api/sync') return response;

  /**
   * No backend configured — run the app anyway, unauthenticated.
   *
   * This branch is what makes the very first deploy work. Without it,
   * `createServerClient(undefined!, undefined!)` throws, and because this middleware's
   * matcher covers every route, EVERY page returns 500 — including the 24 screens that
   * need no database at all. You would push to Vercel, get a wall of server errors, and
   * have no way to tell a configuration mistake from a broken build.
   *
   * The books live in localStorage at this stage (docs/TECH-DEBT.md item 1), so the app
   * is genuinely usable like this. Sign-in and the sync endpoint are the only things that
   * need Supabase, and both fail with a message that names the missing variable.
   *
   * Remove this branch only once Supabase is required for the app to function at all —
   * which is after T-14, not before.
   */
  if (!hasSupabaseConfig()) return response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        }
      }
    }
  );

  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'));

  if (!data.user && !isPublic && path !== '/sign-in') {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|assets|sw.js|manifest.webmanifest|favicon.ico).*)']
};
